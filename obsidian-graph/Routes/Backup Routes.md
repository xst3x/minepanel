---
title: "Backup Routes"
type: "route"
layer: "backend"
source: "src/routes/backupRoutes.ts"
tags:
  - minepanel
  - backend
  - route
---

# Backup Routes

**Source**: `src/routes/backupRoutes.ts`

Handles manual and scheduled backup operations:
- `GET /api/servers/:serverId/backups`
- `POST /api/servers/:serverId/backups` (triggers zip backup creation)
- `POST /api/servers/:serverId/backups/:filename/restore` (restores backup while server is offline)
- `DELETE /api/servers/:serverId/backups/:filename`

## Relationships
- Belongs to: [[Subsystem - File and Backup Management]]
- Uses: [[Server Helper]], [[Permissions System]]
