---
title: "Threshold Routes"
type: "route"
layer: "backend"
source: "src/routes/thresholdRoutes.ts"
tags:
  - minepanel
  - backend
  - route
---

# Threshold Routes

**Source**: `src/routes/thresholdRoutes.ts`

Manages multi-threshold safety ladders for CPU temperature and RAM usage:
- `GET /api/servers/:serverId/thresholds`: Returns current threshold rules.
- `PUT /api/servers/:serverId/thresholds`: Validates and saves ordered escalation rules (`log`, `notify`, `alert`, `throttle`, `restart`, `stop`).

## Relationships
- Belongs to: [[Subsystem - Resource Monitoring and Safety]]
- Uses: [[Threshold Manager]], [[Permissions System]]
