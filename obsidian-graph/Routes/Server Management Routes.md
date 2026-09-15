---
title: "Server Management Routes"
type: "route"
layer: "backend"
source: "src/routes/modules/serverManagementRoutes.ts"
tags:
  - minepanel
  - backend
  - route
---

# Server Management Routes

**Source**: `src/routes/modules/serverManagementRoutes.ts`

Handles CRUD operations and administration for Minecraft server configurations:
- `GET /api/servers`
- `POST /api/servers` (create new server)
- `DELETE /api/servers/:serverId`
- `POST /api/servers/import` (import existing server from `.zip`)
- `POST /api/servers/:serverId/upload-jar`
- `POST /api/servers/:serverId/icon`

## Relationships
- Belongs to: [[Subsystem - Server Lifecycle and Adapters]]
- Uses: [[Database Access Layer]], [[Server Helper]], [[Permissions System]], [[Model - Server]]
