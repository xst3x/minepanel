---
title: "Server Lifecycle Routes"
type: "route"
layer: "backend"
source: "src/routes/modules/serverLifecycleRoutes.ts"
tags:
  - minepanel
  - backend
  - route
---

# Server Lifecycle Routes

**Source**: `src/routes/modules/serverLifecycleRoutes.ts`

Provides HTTP endpoints governing server power operations:
- `POST /api/servers/:serverId/start`
- `POST /api/servers/:serverId/stop`
- `POST /api/servers/:serverId/restart`
- `POST /api/servers/:serverId/kill`
- `POST /api/servers/:serverId/graceful-stop`

Each route verifies required permissions (e.g. `server.start`, `server.stop`) and acquires a server lock before dispatching commands to [[Process Manager Wrapper]].

## Relationships
- Belongs to: [[Subsystem - Server Lifecycle and Adapters]]
- Uses: [[Process Manager Wrapper]], [[Execution Manager]], [[Permissions System]], [[Audit Logger]]
