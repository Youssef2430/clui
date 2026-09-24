import type { PillWebSource } from '../../../orchestrator/packages/shared/src/gluiPill'
import { webSourceUrl } from '../../../orchestrator/packages/shared/src/webSearchSources'

const PREFIX = '#glui-cite-'
const CITATION = /\uE200cite\uE202([^\uE201]*)\uE201/g
export function citationRefs(href?: string): string[] | undefined {
  if (!href?.startsWith(PREFIX)) return undefined
  try { return decodeURIComponent(href.slice(PREFIX.length)).split(',').filter(ref => /^turn\d+[\w-]+$/.test(ref)) } catch { return [] }
}

type MarkdownNode = { type: string; value?: string; url?: string; children?: MarkdownNode[] }

/** Work on text nodes so fenced/inline code and existing links remain literal. */
export function remarkWebCitations() {
  return (tree: MarkdownNode) => {
    const visit = (node: MarkdownNode) => {
      if (!node.children || ['link', 'linkReference', 'code', 'inlineCode', 'html'].includes(node.type)) return
      node.children = node.children.flatMap(child => {
        if (child.type !== 'text' || !child.value) { visit(child); return [child] }
        const nodes: MarkdownNode[] = []
        let cursor = 0
        for (const match of child.value.matchAll(CITATION)) {
          nodes.push({ type: 'text', value: child.value.slice(cursor, match.index) })
          const refs = [...new Set(match[1].split('\uE202').filter(ref => /^turn\d+[\w-]+$/.test(ref)))]
          nodes.push({ type: 'link', url: `${PREFIX}${encodeURIComponent(refs.join(','))}`, children: [{ type: 'text', value: 'Sources' }] })
          cursor = match.index! + match[0].length
        }
        // An incomplete marker is held back while tokens are streaming.
        nodes.push({ type: 'text', value: child.value.slice(cursor).replace(/\uE200(?:c(?:i(?:t(?:e)?)?)?(?:\uE202[^\uE201]*)?)?$/, '') })
        return nodes
      })
    }
    visit(tree)
  }
}

export function citationSource(ref: string, sources: readonly PillWebSource[]): PillWebSource | undefined {
  const matches = sources.filter(source => source.citationId === ref && webSourceUrl(source.url))
  // Never guess when a provider reuses an ID for different destinations.
  return new Set(matches.map(source => source.url)).size === 1 ? matches[0] : undefined
}

export function copyWithWebCitations(text: string, sources: readonly PillWebSource[] = []): string {
  // Code examples may deliberately contain citation syntax; leave them untouched.
  return text.replace(/(`+|~{3,})[\s\S]*?\1|\uE200cite\uE202([^\uE201]*)\uE201/g, (match, code: string | undefined, ids: string | undefined) => {
    if (code || ids === undefined) return match
    const refs = [...new Set(ids.split('\uE202'))]
    const links = refs.map(ref => citationSource(ref, sources)).filter((source): source is PillWebSource => !!source)
    const rendered = links.map(source => `[${(source.title || new URL(source.url).hostname).replace(/[\[\]\\]/g, '\\$&')}](<${source.url.replace(/>/g, '%3E')}>)`)
    if (links.length < refs.length) rendered.push('[Source link not provided]')
    return ` ${rendered.join(' ')}`
  })
}
