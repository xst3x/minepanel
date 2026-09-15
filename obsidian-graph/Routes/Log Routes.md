---
title: "Log Routes"
type: "route"
layer: "backend"
source: "src/routes/logRoutes.ts"
tags:
  - minepanel
  - backend
  - route
---

# Log Routes

**Source**: `src/routes/logRoutes.ts`

Manages server log archives:
- `GET /api/servers/:serverId/logs`: Lists log files in `logs/` (including `latest.log` and `.log.gz` archives).
- `GET /api/servers/:serverId/logs/:filename`: Reads or decompresses historical log files for inspection in the UI.

## Relationships
- Belongs to: [[Subsystem - Core Backend and Web Server]]
- Uses: [[Server Helper]], [[Permissions System]]
