---
title: "Stats Routes"
type: "route"
layer: "backend"
source: "src/routes/statsRoutes.ts"
tags:
  - minepanel
  - backend
  - route
---

# Stats Routes

**Source**: `src/routes/statsRoutes.ts`

Provides historical performance metrics for frontend charts:
- `GET /api/servers/:serverId/stats/history`
- `GET /api/stats/config`

## Relationships
- Belongs to: [[Subsystem - Resource Monitoring and Safety]]
- Uses: [[Database Access Layer]], [[Model - ServerStats]]
