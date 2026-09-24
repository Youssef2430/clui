# GLUI architecture

GLUI keeps its floating Electron pill as its only user interface. The pill owns hotkeys, window positioning, local voice input, attachments, the skills directory, and desktop notifications. Its conversations use the bundled Orchestrator V2 runtime in `orchestrator/`.

```text
Floating pill → isolated preload → WorkspaceControlPlane
                                    ↓ private parent/child IPC
                               Owned workspace process
                                    ↓ typed RPC / atom commands
                               Orchestrator V2 server
                                    ↓ provider adapters
                           Claude Code / Codex / OpenCode
```

The workspace process starts with the pill and stays hidden. The pill has no action or IPC endpoint to reveal the full desktop workspace. Quitting GLUI stops the owned runtime. Its durable conversation, handoff, branching, and recovery services power the pill.

Native glass lives in a noninteractive AppKit child panel ordered behind the foreground Electron window. Putting `NSGlassEffectView` inside Chromium's compositor causes it to sample and obscure text, even when the native view is inserted below Chromium's views. Keep these rendering surfaces separate. The backing follows the parent position and visibility; only the foreground handles input. The native addon must be unpacked from ASAR when packaging.

The renderer applies the black/white base tint once through a compound SVG path, so overlapping pill, shelf, header, and action surfaces do not accumulate dark bands. The thread body shares that surface rather than painting a second fill. Popovers also need their own Chromium background and backdrop blur to occlude lower foreground text; native glass alone cannot occlude content in the separate foreground window. Composer menus clear the closed header (or the input when a thread is expanded) and reposition when the panel resizes.

## Identity and persistence

Pill tabs are views of durable V2 threads. `glui:<thread-id>` identifies a canonical conversation; native provider IDs are resolved separately for terminal continuation. Provider selection changes the existing thread's model selection and uses V2 context handoff on the next turn. Branching uses a source run and preserves inherited history.

V2 owns SQLite persistence, command receipts, execution attempts, the effect outbox, checkpoint history, queued turns, pending interactions, and restart recovery. The old `agents/control-plane.ts` and transport helpers remain for native history compatibility and focused protocol tests; they no longer dispatch pill prompts.

The original Electron preference directory remains intact. The runtime defaults to `~/.glui`, with `GLUI_HOME` as an override. `GLUI_USER_DATA_DIR` isolates the pill profile and its child workspace for testing. Neither process adopts the host T3 application's data directory. CLI authentication remains owned by each provider.

## Process boundary

The pill starts the workspace executable with an inherited Node IPC channel. A launch flag alone cannot activate this bridge: it also requires `process.send`. Workspace preload replies are accepted only from the application's own top-level `glui://app` renderer. The pill receives plain JSON projections and never needs the workspace's auth tokens. Renderer code has no Node access.

`orchestrator/packages/shared/src/gluiPill.ts` defines this private boundary. The workspace bridge uses the same typed commands and projections as its own UI. Streamed snapshots are coalesced before IPC; unchanged message objects retain their identity in the pill so memoized markdown avoids repeated work.

## Skills directory

The store downloads a complete skill folder at the catalog's source revision into GLUI's canonical skills directory, then creates relative symlinks into detected compatible agents. The installer serializes mutations, validates source paths and skill metadata, refuses collisions with existing files, rolls back failed updates, and removes only links that still target its own managed copy. New compatible agents receive links during reconciliation. Tests use fake homes; UI smoke profiles isolate actual installations.

The directory supports portable `SKILL.md` packages. Agent-specific plugin hooks, authentication, and MCP configuration are not treated as portable skills.

## Upstream

The MIT-licensed implementation is pinned in `orchestrator/UPSTREAM.json`. Internal package and protocol names remain compatible. Keep provider-shaped logic in its adapters and durable execution logic in V2; avoid creating a second pill-only orchestration implementation.
