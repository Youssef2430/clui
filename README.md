# GLUI — Glue UI

Claude Code, Codex, and OpenCode in a floating macOS pill. GLUI combines streaming conversations, approvals, attachments, local voice input, and a shared skills directory with a persistent Orchestrator V2 runtime.

GLUI builds on [Clui CC](https://github.com/lcoutodemos/clui-cc) by Lucas Couto and [T3 Code](https://github.com/pingdotgg/t3code) by T3 Tools Inc. and its contributors. These two projects provide the foundations for GLUI's floating interface and orchestration runtime. See [credits and license](#credits-and-license).

The floating pill is the interface. Its slim composer shelf holds the folder, agent/model, reasoning, access level, and current Git branch. **Liquid Glass** is the default theme: native macOS glass with black (`#0A0A0A`) and white (`#FDFDFD`) tints and Burgundy, rose, cream, and ivory accents. The rounded input keeps its small settings bar attached underneath. macOS 26+ uses Liquid Glass; older macOS versions use native frosted material. Drag the top-right resize handle to adjust the panel; double-click it to reset. **Burgundy** and **Tidal** complete the three-theme collection. All three support light, dark, and system appearance.

## Conversations

- Choose Claude Code, Codex, or OpenCode beneath the input. Changing agents continues the conversation using a context handoff.
- Branch a conversation with the branch button. The branch retains the source history.
- Model and reasoning options come from the agent's live catalog. Access choices include **Ask first**, **Auto**, and **Full access**, with **Allow edits** where supported. Codex and Claude use native automatic review; OpenCode Auto allows edits and asks before other actions.
- History includes durable GLUI conversations and native CLI sessions. “Open in CLI” resumes the matching native conversation.
- Conversations, queued prompts, and execution state persist across restarts. The runtime stays connected while the pill is hidden.
- `⌥ Space` toggles the pill (fallback `⌘⇧K`). Voice transcription stays local.

GLUI exposes Claude Code, Codex, and OpenCode through the pill. See the [feature map](docs/orchestrator-v2-audit.md).

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
| `npm run smoke:pill-ui` | Pill context/activity UI checks with screenshots and video |
| `npm run dist:local` | Build an ad-hoc signed local `GLUI.app` |
| `npm run dist:dmg` | Build a local DMG and update ZIP |
| `npm run dist:release` | Sign and notarize both Mac architectures, with a combined update feed |
| `npm run build --prefix web` | Build the marketing website |

Release packaging requires Developer ID and Apple notarization credentials. Building does not publish a GitHub release.

Releases are built and published locally with `bash scripts/release_build.sh`. Before building both Mac architectures, install their Rust targets with `rustup target add aarch64-apple-darwin x86_64-apple-darwin`. The Homebrew workflow updates the tap after a release is published.

## Migration

GLUI continues this fork of [Lucas Couto's Clui CC](https://github.com/lcoutodemos/clui-cc). The existing bundle identifier and release repository remain stable. Existing appearance preferences are preserved; Burgundy is the default for a fresh profile. CLI histories and credentials remain in their original locations. New orchestration state lives in `~/.glui`, separately from T3 Code.

See [architecture](docs/ARCHITECTURE.md) and [verification](docs/glui-transition.md).

## Credits and license

GLUI is made possible by two upstream projects:

- **[Clui CC](https://github.com/lcoutodemos/clui-cc)** by **[Lucas Couto](https://github.com/lcoutodemos)** supplies the original macOS floating overlay, Claude Code interface, and desktop interaction foundation. GLUI continues this fork of Clui CC. Original code: Copyright (c) 2025-2026 Lucas Couto, under the [MIT license](https://github.com/lcoutodemos/clui-cc/blob/main/LICENSE).
- **[T3 Code](https://github.com/pingdotgg/t3code)** by **T3 Tools Inc. and contributors** supplies the [Orchestrator V2](https://github.com/pingdotgg/t3code/pull/2829) runtime, including provider adapters, durable conversations, context handoffs, branching, and persistence. The bundled source lives in [`orchestrator/`](orchestrator/), with its pinned revision recorded in [`UPSTREAM.json`](orchestrator/UPSTREAM.json). Original code: Copyright (c) 2026 T3 Tools Inc., with its original [MIT license](orchestrator/LICENSE) preserved.

GLUI's integration and additional changes are maintained by Youssef Chouay. GLUI is distributed under the [MIT license](LICENSE), which retains both upstream copyright notices alongside the existing notice for this fork.
