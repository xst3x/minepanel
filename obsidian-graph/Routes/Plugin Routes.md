---
title: "Plugin Routes"
type: "route"
layer: "backend"
source: "src/routes/pluginRoutes.ts"
tags:
  - minepanel
  - backend
  - route
---

# Plugin Routes

**Source**: `src/routes/pluginRoutes.ts`

Manages Bukkit/Spigot/Paper plugins and Fabric/Forge mods:
- `GET /api/servers/:serverId/plugins` (scans `plugins/` or `mods/`)
- `POST /api/servers/:serverId/plugins/toggle` (renames `.jar` ↔ `.jar.disabled`)
- `DELETE /api/servers/:serverId/plugins/:filename`
- `GET /api/servers/:serverId/plugins/search` (searches Modrinth API)
- `POST /api/servers/:serverId/plugins/install`

## Relationships
- Belongs to: [[Subsystem - Software Resolvers and Updates]]
- Uses: [[Server Helper]], [[Permissions System]]
