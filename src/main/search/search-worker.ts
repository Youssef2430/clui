/**
 * Search Worker — runs in a Node.js worker_threads Worker.
 *
 * Handles embedding generation via @huggingface/transformers and
 * performs hybrid search (semantic cosine similarity + keyword boost).
 * All heavy computation stays off the main Electron process.
 */

import { parentPort } from 'worker_threads'
import { join, dirname } from 'path'
import { homedir } from 'os'
import { existsSync, readdirSync, statSync, readFileSync, writeFileSync, mkdirSync, createReadStream } from 'fs'
import { createInterface } from 'readline'
import type { SearchResult, SearchIndexStatus } from '../../shared/types'

// ─── Types ───

interface IndexEntry {
  embedding: number[]
  text: string
  firstMessage: string | null
  lastTimestamp: string
  slug: string | null
  projectPath: string
  indexedAt: string
}

interface IndexFile {
  version: number
  entries: Record<string, IndexEntry>
}

type InMessage =
  | { type: 'build-index' }
  | { type: 'search'; query: string; topK: number; requestId: number }
  | { type: 'shutdown' }

// ─── State ───

let pipeline: any = null
let index: IndexFile = { version: 1, entries: {} }
let indexReady = false

const INDEX_PATH = join(homedir(), '.claude', 'search-index.json')
const PROJECTS_ROOT = join(homedir(), '.claude', 'projects')
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_TEXT_CHARS = 2000

// ─── Helpers ───

function postStatus(status: SearchIndexStatus): void {
  parentPort?.postMessage({ type: 'index-status', status })
}

function postResults(results: SearchResult[], requestId: number): void {
  parentPort?.postMessage({ type: 'search-results', results, requestId })
}

/** L2-normalize a vector in-place and return it. */
function normalize(vec: number[]): number[] {
  let norm = 0
  for (let i = 0; i < vec.length; i++) norm += vec[i] * vec[i]
  norm = Math.sqrt(norm)
  if (norm > 0) {
    for (let i = 0; i < vec.length; i++) vec[i] /= norm
  }
  return vec
}

/** Cosine similarity between two L2-normalized vectors (= dot product). */
function cosineSim(a: number[], b: number[]): number {
  let dot = 0
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i]
  return dot
}

/** Keyword match score: fraction of query words found in text. */
function keywordScore(queryWords: string[], text: string): number {
  if (queryWords.length === 0) return 0
  const lowerText = text.toLowerCase()
  let matches = 0
  for (const word of queryWords) {
    if (lowerText.includes(word)) matches++
  }
  return matches / queryWords.length
}

/** Extract a ~200 char snippet centered on the first matching query word. */
function extractSnippet(text: string, queryWords: string[]): string {
  const lowerText = text.toLowerCase()
  let bestIdx = -1

  for (const word of queryWords) {
    const idx = lowerText.indexOf(word)
    if (idx !== -1) {
      bestIdx = idx
      break
    }
  }

  if (bestIdx === -1) {
    // No keyword match — use start of text
    return text.substring(0, 200).trim()
  }

  const start = Math.max(0, bestIdx - 80)
  const end = Math.min(text.length, start + 200)
  let snippet = text.substring(start, end).trim()
  if (start > 0) snippet = '...' + snippet
  if (end < text.length) snippet += '...'
  return snippet
}

/** Read a session JSONL and extract user message text + metadata. */
async function readSessionJSONL(filePath: string): Promise<{
  text: string
  firstMessage: string | null
  lastTimestamp: string | null
  slug: string | null
  projectPath: string | null
}> {
  return new Promise((resolve) => {
    const parts: string[] = []
    let totalChars = 0
    let firstMessage: string | null = null
    let lastTimestamp: string | null = null
    let slug: string | null = null
    let projectPath: string | null = null

    const rl = createInterface({ input: createReadStream(filePath) })

    rl.on('line', (line: string) => {
      try {
        const obj = JSON.parse(line)
        if (obj.timestamp) lastTimestamp = obj.timestamp
        if (obj.slug && !slug) slug = obj.slug
        if (obj.cwd && !projectPath) projectPath = obj.cwd

        if (obj.type === 'user') {
          let content: string | null = null
          if (typeof obj.message?.content === 'string') {
            content = obj.message.content
          } else if (Array.isArray(obj.message?.content)) {
            const textPart = obj.message.content.find((p: any) => p.type === 'text')
            content = textPart?.text || null
          }

          if (content) {
            if (!firstMessage) firstMessage = content.substring(0, 100)
            if (totalChars < MAX_TEXT_CHARS) {
              const remaining = MAX_TEXT_CHARS - totalChars
              const chunk = content.substring(0, remaining)
              parts.push(chunk)
              totalChars += chunk.length
            }
          }
        }
      } catch { /* skip malformed lines */ }
    })

    rl.on('close', () => {
      resolve({
        text: parts.join(' '),
        firstMessage,
        lastTimestamp,
        slug,
        projectPath,
      })
    })

    rl.on('error', () => {
      resolve({ text: '', firstMessage: null, lastTimestamp: null, slug: null, projectPath: null })
    })
  })
}

// ─── Pipeline ───

async function ensurePipeline(): Promise<void> {
  if (pipeline) return

  // Dynamic import — @huggingface/transformers is externalized by electron-vite
  const { pipeline: createPipeline, env } = await import('@huggingface/transformers')

  // Redirect model cache to a real filesystem path outside app.asar.
  // The library will download the model on first use (~90 MB).
  env.cacheDir = join(homedir(), '.clui', 'models')

  // Track loaded/total bytes per file to compute true aggregate progress.
  // Per-file `progress` percentage is misleading because small files hit 100%
  // instantly before the large model.onnx even starts.
  const fileProgress: Record<string, { loaded: number; total: number }> = {}
  pipeline = await createPipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
    quantized: true,
    progress_callback: (info: any) => {
      if (info.status === 'progress' && info.file) {
        fileProgress[info.file] = { loaded: info.loaded ?? 0, total: info.total ?? 0 }
        const loaded = Object.values(fileProgress).reduce((s, f) => s + f.loaded, 0)
        const total = Object.values(fileProgress).reduce((s, f) => s + f.total, 0)
        const p = total > 0 ? Math.round((loaded / total) * 100) : 0
        postStatus({ state: 'downloading', progress: p })
      }
    },
  })
}

async function embed(text: string): Promise<number[]> {
  await ensurePipeline()
  const result = await pipeline(text, { pooling: 'mean', normalize: true })
  // result.data is a Float32Array; convert to plain array
  const vec = Array.from(result.data as Float32Array)
  return normalize(vec)
}

// ─── Index Management ───

function loadCachedIndex(): void {
  try {
    if (existsSync(INDEX_PATH)) {
      const raw = readFileSync(INDEX_PATH, 'utf-8')
      const parsed = JSON.parse(raw) as IndexFile
      if (parsed.version === 1 && parsed.entries) {
        index = parsed
      }
    }
  } catch {
    // Corrupted index — start fresh
    index = { version: 1, entries: {} }
  }
}

function saveCachedIndex(): void {
  try {
    mkdirSync(dirname(INDEX_PATH), { recursive: true })
    writeFileSync(INDEX_PATH, JSON.stringify(index), 'utf-8')
  } catch { /* disk full or permission error — continue without cache */ }
}

async function buildIndex(): Promise<void> {
  postStatus({ state: 'indexing', indexed: 0, total: 0 })

  loadCachedIndex()

  if (!existsSync(PROJECTS_ROOT)) {
    index = { version: 1, entries: {} }
    saveCachedIndex()
    postStatus({ state: 'ready' })
    indexReady = true
    return
  }

  // Collect all session files
  const sessionFiles: Array<{ sessionId: string; filePath: string; mtime: string; encodedDir: string }> = []

  try {
    const projectDirs = readdirSync(PROJECTS_ROOT).filter((d: string) => {
      try {
        if (d.includes('clui-btw-')) return false
        return statSync(join(PROJECTS_ROOT, d)).isDirectory()
      } catch { return false }
    })

    for (const dir of projectDirs) {
      const sessionsDir = join(PROJECTS_ROOT, dir)
      let files: string[]
      try { files = readdirSync(sessionsDir).filter((f: string) => f.endsWith('.jsonl')) } catch { continue }

      for (const file of files) {
        const sessionId = file.replace(/\.jsonl$/, '')
        if (!UUID_RE.test(sessionId)) continue

        const filePath = join(sessionsDir, file)
        let stat: ReturnType<typeof statSync>
        try { stat = statSync(filePath) } catch { continue }
        if (stat.size < 100) continue

        sessionFiles.push({
          sessionId,
          filePath,
          mtime: stat.mtime.toISOString(),
          encodedDir: dir,
        })
      }
    }
  } catch {
    postStatus({ state: 'error', error: 'Failed to read sessions directory' })
    return
  }

  // Prune orphaned entries
  const validIds = new Set(sessionFiles.map((s) => s.sessionId))
  for (const id of Object.keys(index.entries)) {
    if (!validIds.has(id)) {
      delete index.entries[id]
    }
  }

  // Determine which sessions need (re)indexing
  const toIndex = sessionFiles.filter((s) => {
    const cached = index.entries[s.sessionId]
    if (!cached) return true
    // Re-index if file was modified after last index time
    return new Date(s.mtime).getTime() > new Date(cached.indexedAt).getTime()
  })

  const total = toIndex.length
  postStatus({ state: 'indexing', indexed: 0, total })

  if (total === 0) {
    // All cached, nothing to embed
    saveCachedIndex()
    postStatus({ state: 'ready' })
    indexReady = true
    return
  }

  // Load the model
  try {
    await ensurePipeline()
  } catch (err) {
    postStatus({ state: 'error', error: `Failed to load embedding model: ${err}` })
    return
  }

  // Embed sessions
  for (let i = 0; i < toIndex.length; i++) {
    const session = toIndex[i]
    try {
      const meta = await readSessionJSONL(session.filePath)
      if (!meta.text || meta.text.trim().length < 10) {
        // Too little text to embed meaningfully — skip
        continue
      }

      const embedding = await embed(meta.text)

      index.entries[session.sessionId] = {
        embedding,
        text: meta.text,
        firstMessage: meta.firstMessage,
        lastTimestamp: meta.lastTimestamp || session.mtime,
        slug: meta.slug,
        projectPath: meta.projectPath || session.encodedDir,
        indexedAt: session.mtime,
      }

      if ((i + 1) % 5 === 0 || i === toIndex.length - 1) {
        postStatus({ state: 'indexing', indexed: i + 1, total })
      }
    } catch {
      // Skip individual session failures
    }
  }

  saveCachedIndex()
  postStatus({ state: 'ready' })
  indexReady = true
}

async function search(query: string, topK: number): Promise<SearchResult[]> {
  if (!indexReady || Object.keys(index.entries).length === 0) {
    return []
  }

  let queryEmbedding: number[]
  try {
    queryEmbedding = await embed(query)
  } catch {
    return []
  }

  const queryWords = query.toLowerCase().split(/\s+/).filter((w) => w.length > 1)
  const entries = Object.entries(index.entries)

  const scored = entries.map(([sessionId, entry]) => {
    const semantic = cosineSim(queryEmbedding, entry.embedding)
    const keyword = keywordScore(queryWords, entry.text)
    // Semantic-dominant, keyword-boosted
    const combined = 0.7 * semantic + 0.3 * keyword

    return {
      sessionId,
      projectPath: entry.projectPath,
      score: combined,
      snippet: extractSnippet(entry.text, queryWords),
      firstMessage: entry.firstMessage,
      lastTimestamp: entry.lastTimestamp,
      slug: entry.slug,
    } satisfies SearchResult
  })

  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, topK)
}

// ─── Message handler ───

// Serialize all async message processing to prevent out-of-order responses
let messageQueue: Promise<void> = Promise.resolve()

function enqueueMessageTask(task: () => Promise<void>): void {
  messageQueue = messageQueue
    .catch(() => {
      // Keep the queue alive after a previous task failure.
    })
    .then(task)
}

parentPort?.on('message', (msg: InMessage) => {
  switch (msg.type) {
    case 'build-index':
      enqueueMessageTask(async () => {
        try {
          await buildIndex()
        } catch (err) {
          postStatus({ state: 'error', error: `Index build failed: ${err}` })
        }
      })
      break

    case 'search':
      enqueueMessageTask(async () => {
        try {
          const results = await search(msg.query, msg.topK)
          postResults(results, msg.requestId)
        } catch {
          postResults([], msg.requestId)
        }
      })
      break

    case 'shutdown':
      enqueueMessageTask(async () => {
        pipeline = null
        process.exit(0)
      })
      break
  }
})

// Signal ready
parentPort?.postMessage({ type: 'ready' })
