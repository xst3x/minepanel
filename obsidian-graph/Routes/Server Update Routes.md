---
title: "Server Update Routes"
type: "route"
layer: "backend"
source: "src/routes/modules/serverUpdateRoutes.ts"
tags:
  - minepanel
  - backend
  - route
---

# Server Update Routes

**Source**: `src/routes/modules/serverUpdateRoutes.ts`

Sub-router mounted in `/api/servers` managing software updates:
- `GET /api/servers/:serverId/update/check`: Checks for new builds via [[Update Manager]].
- `POST /api/servers/:serverId/update/run`: Initiates automated update with pre-update backup.
- `POST /api/servers/:serverId/update/rollback`: Restores pre-update backup.

## Relationships
- Belongs to: [[Subsystem - Software Resolvers and Updates]]
- Uses: [[Update Manager]], [[Permissions System]]
