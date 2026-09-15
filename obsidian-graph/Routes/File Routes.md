---
title: "File Routes"
type: "route"
layer: "backend"
source: "src/routes/fileRoutes.ts"
tags:
  - minepanel
  - backend
  - route
---

# File Routes

**Source**: `src/routes/fileRoutes.ts`

Provides sandboxed file management APIs for server directories:
- `GET /api/servers/:serverId/files/list`
- `GET /api/servers/:serverId/files/content`
- `POST /api/servers/:serverId/files/save`
- `POST /api/servers/:serverId/files/upload` (Multer file upload)
- `DELETE /api/servers/:serverId/files/delete`
- `GET /api/servers/:serverId/files/download`
- `POST /api/servers/:serverId/files/download-token` (Generates one-time download tokens)

## Relationships
- Belongs to: [[Subsystem - File and Backup Management]]
- Uses: [[Server Helper]], [[Permissions System]]
