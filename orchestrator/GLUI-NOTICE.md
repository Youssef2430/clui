# GLUI orchestration workspace

This directory vendors the T3 Code Orchestrator V2 implementation at the revision recorded in [UPSTREAM.json](UPSTREAM.json). The original MIT license and copyright notice are preserved in [LICENSE](LICENSE). GLUI branding and integration changes are maintained here. Internal `@t3tools` package names and protocol identifiers intentionally remain compatible with the pinned implementation.

The desktop, web client, server, execution graph, provider adapters, scheduler, persistence and tests are included together. This is GLUI’s primary workspace runtime. It uses `~/.glui` and never adopts an existing T3 Code database. Set `GLUI_HOME` for an isolated workspace profile.
