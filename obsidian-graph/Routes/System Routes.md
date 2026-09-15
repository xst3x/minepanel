---
title: "System Routes"
type: "route"
layer: "backend"
source: "src/routes/systemRoutes.ts"
tags:
  - minepanel
  - backend
  - route
---

# System Routes

**Source**: `src/routes/systemRoutes.ts`

Provides panel-wide administrative and host management endpoints:
- `GET /api/system/info`: CPU model, memory totals, OS platform, and node uptime.
- `POST /api/system/restart`: Triggers panel restart via [[Launcher Protocol Server]].
- `POST /api/system/port`: Modifies HTTP/HTTPS bind port and restarts server.
- `GET /api/system/logs`: Reads MinePanel system log files.

## Relationships
- Belongs to: [[Subsystem - Core Backend and Web Server]]
- Uses: [[Permissions System]], [[Launcher Protocol Server]]
