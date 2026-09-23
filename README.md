# GLUI — Glue UI

Claude Code, Codex, and OpenCode in a floating macOS pill. GLUI combines streaming conversations, approvals, attachments, local voice input, and a shared skills directory with the full Orchestrator V2 workspace.

The pill stays the main interface. Its slim composer shelf holds the folder, agent/model, reasoning, access level, and current Git branch. **Liquid Glass** is the default theme: native macOS glass with black (`#0A0A0A`) and white (`#FDFDFD`) tints and Burgundy, rose, cream, and ivory accents. The rounded input keeps its small settings bar attached underneath. macOS 26+ uses Liquid Glass; older macOS versions use native frosted material. Drag the top-right resize handle to adjust the panel; double-click it to reset. **Burgundy** and **Tidal** complete the three-theme collection. All three support light, dark, and system appearance.

## Conversations and workspace

- Choose Claude Code, Codex, or OpenCode beneath the input. Changing agents continues the conversation using a context handoff.
- Branch a conversation with the branch button. The branch retains the source history.
- Open the workspace for merge-back, worktrees, source control, scheduling, delegation, plan mode, checkpoints, and detailed run controls. It shares the pill's conversations and opens only when requested.
- Model and reasoning options come from the agent's live catalog. Access choices include **Ask first**, **Auto**, and **Full access**, with **Allow edits** where supported. Codex and Claude use native automatic review; OpenCode Auto allows edits and asks before other actions.
- History includes durable GLUI conversations and native CLI sessions. “Open in CLI” resumes the matching native conversation.
- Queues, execution state, checkpoints, and schedules are persisted. Schedules run while GLUI is open, including when the pill and workspace windows are hidden.
- `⌥ Space` toggles the pill (fallback `⌘⇧K`). Voice transcription stays local.

The workspace bundles [T3 Code Orchestrator V2](https://github.com/pingdotgg/t3code/pull/2829) at the revision in [UPSTREAM.json](orchestrator/UPSTREAM.json), under its original MIT license. Additional upstream drivers are available in workspace provider settings. See the [feature map](docs/orchestrator-v2-audit.md).

## Skills

The skills.sh-inspired directory offers searchable skills from public repositories. **Add** installs a full skill folder once and links it into available compatible agents. Installed rows show the linked providers; **Remove** removes only GLUI-managed links and files. Existing skills are preserved. Native provider plugins and hooks retain their own configuration.

## Run locally

Requires macOS 13+, Node.js 24.13.1+, Rust 1.95+ for the bundled native workspace component, Xcode Command Line Tools, and at least one authenticated agent CLI.

```sh
git clone https://github.com/Youssef2430/clui.git
cd clui
npm install
npm run setup
npm run dev
```

| Agent | Install | Authenticate |
| --- | --- | --- |
| Claude Code | `npm install -g @anthropic-ai/claude-code` | `claude` |
| Codex | `npm install -g @openai/codex` | `codex login` |
| OpenCode | `npm install -g opencode-ai` | `opencode auth login` |

GLUI uses existing CLI authentication. Models remain subject to the connected account's availability and usage limits.

| Command | Purpose |
| --- | --- |
| `npm run build` | Build the runtime and floating pill |
| `npm start` | Start the built pill and its runtime |
| `npm run typecheck && npm test` | Check the pill and integration logic |
| `npm run test:workspace` | V2, scheduling, recovery, and orchestration MCP tests |
| `npm run smoke:electron` | Isolated desktop API smoke check |
| `npm run dist:local` | Build an ad-hoc signed local `GLUI.app` |
| `npm run dist:dmg` | Build a local DMG and update ZIP |
| `npm run dist:release` | Sign and notarize both Mac architectures, with a combined update feed |
| `npm run build --prefix web` | Build the marketing website |

Release packaging requires Developer ID and Apple notarization credentials. Building does not publish a GitHub release.

## Migration

GLUI continues this fork of [Lucas Couto's Clui CC](https://github.com/lcoutodemos/clui-cc). The existing bundle identifier and release repository remain stable. Existing appearance preferences are preserved; Burgundy is the default for a fresh profile. CLI histories and credentials remain in their original locations. New orchestration state lives in `~/.glui`, separately from T3 Code.

See [architecture](docs/ARCHITECTURE.md) and [verification](docs/glui-transition.md).
