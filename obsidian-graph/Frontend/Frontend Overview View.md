---
title: "Frontend Overview View"
type: "page"
layer: "frontend"
source: "src/frontend/src/pages/server/Overview.tsx"
tags:
  - minepanel
  - frontend
  - page
---

# Frontend Overview View

**Source**: `src/frontend/src/pages/server/Overview.tsx`

Server dashboard displaying real-time state:
- Live CPU percentage gauge and RAM utilization bar chart.
- Server timezone clock, uptime counter, and active game port.
- Quick action power controls (Start, Graceful Stop, Restart, Kill).
- Player count summary and recent audit events.

## Relationships
- Belongs to: [[Subsystem - Frontend React Architecture]]
- Receives live updates from: [[WebSocket Console Server]]
- Fetches historical metrics from: [[Stats Routes]]
