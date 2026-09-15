---
title: "Player Routes"
type: "route"
layer: "backend"
source: "src/routes/playerRoutes.ts"
tags:
  - minepanel
  - backend
  - route
---

# Player Routes

**Source**: `src/routes/playerRoutes.ts`

Manages Minecraft players, operator ranks, whitelists, and bans:
- `GET /api/servers/:serverId/players`
- `POST /api/servers/:serverId/players/kick`
- `POST /api/servers/:serverId/players/ban`
- `POST /api/servers/:serverId/players/pardon`
- `POST /api/servers/:serverId/players/op`
- `POST /api/servers/:serverId/players/deop`
- `GET /api/servers/:serverId/players/whitelist`

Dispatches commands directly to the running server via [[Process Manager Wrapper]] and synchronizes with `ops.json`, `whitelist.json`, and `banned-players.json`.

## Relationships
- Belongs to: [[Subsystem - Core Backend and Web Server]]
- Uses: [[Process Manager Wrapper]], [[Permissions System]], [[Server Helper]]
