---
title: "Hotspot - MinePanel Entrypoint"
type: "hotspot"
layer: "backend"
source: "src/minepanel.ts"
tags:
  - minepanel
  - backend
  - hotspot
---

# Architectural Hotspot: MinePanel Entrypoint

**Fan-Out: Very High (20+ dependencies)**

`src/minepanel.ts` is the primary architectural gravity well of the application. It coordinates network listeners, database initializations, background timers, process proxying, WebSocket subscriptions, autostart sequences, and crash restarts.

## Key Recommendations
- Keep routing logic strictly delegated to `src/routes/`.
- Keep process logic strictly delegated to `src/core/processManager.ts`.
