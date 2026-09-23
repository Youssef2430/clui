# Orchestrator V2 feature map

GLUI now bundles the implementation of [T3 Code PR #2829](https://github.com/pingdotgg/t3code/pull/2829), pinned to [`5ccb2a5268f68a018b172f1eb672cdb74499a5dd`](https://github.com/pingdotgg/t3code/tree/5ccb2a5268f68a018b172f1eb672cdb74499a5dd). Its floating pill dispatches into that same runtime. The reference is a specific revision of an open PR, not future changes to the branch.

| Feature | GLUI entry point | Implementation |
| --- | --- | --- |
| Claude Code, Codex, OpenCode | Composer agent/model menu | V2 native provider adapters |
| Conversation branching | Pill branch button | Source-run fork, native/fallback continuation, inherited history |
| Cross-provider handoff | Choose another agent in the same conversation | ProviderSwitchService and ContextHandoffService |
| Merge-back | Runtime only; no pill control | V2 merge-back execution and checkpoint integration |
| Scheduling | Runtime only; no pill control | Persisted interval/fixed-time schedules, weekdays, run-now, history and enable/disable |
| Delegation and native subagents | Orchestration tools | Orchestrator MCP toolkit, child execution graphs, pending interactions |
| Durable commands and execution | Background runtime | SQLite event store, command receipts, effect outbox, runs/attempts/nodes |
| Queues and steering | Pill queues | Persisted run queue and native/restart steering |
| Recovery | Runtime startup | Reconciliation of interrupted work, interactions, limits, and effects |
| Checkpoints and rollback | Runtime only; no pill control | Workspace checkpoints, provider rollback, context invalidation |
| Plans and background work | Pill messages | Shared V2 activity, plan, and execution projections |
| Provider capabilities | Live model menu | Driver capabilities, native/fallback strategies, additional upstream drivers |

The floating pill is the only user interface. The bundled desktop host stays hidden; advanced upstream workspace controls are not exposed in GLUI. The table distinguishes available pill controls from services retained in the background runtime. GLUI includes the desktop/server/web runtime; it does not ship T3's separately distributed mobile application or hosted relay service.

## Verification

- V2, scheduling, and orchestration MCP suite: **1,331 passed, 6 skipped**, across 99 passing test files. The skipped cases remain skipped; they are not claimed as live validation.
- Settings and Codex/OpenCode access-policy tests: **110 passed**.
- Claude executable resolution and adapter tests: **125 passed** after the fresh-profile launch fix.
- Client projection regression tests: **9 passed**, including native continuation identity and queued placeholders.
- Pill lifecycle, native protocol, and skill-store tests: **23 passed**.
- Real provider checks verified Codex continuation and branching, Claude handoff with inherited context, and packaged OpenCode-to-Codex handoff in Auto mode.

Provider availability, authentication, model entitlement, remote connection services, and platform-specific capabilities retain their upstream constraints. The deterministic suite is broader than live-account verification; it does not imply every provider/model combination has been exercised against a live account.
