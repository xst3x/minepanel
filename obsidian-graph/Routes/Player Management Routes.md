---
title: Player Management Routes
type: route
source_file: src/routes/playerRoutes.ts
tags:
  - #route
  - #backend
---

# Player Management Routes

API endpoints for inspecting active players, operators, whitelists, and ban lists on Minecraft servers.

## Endpoints
- \`GET /api/servers/:id/players\`: Lists currently connected players with ping and UUID.
- \`POST /api/servers/:id/players/kick\`: Sends kick command to server console.
- \`GET /api/servers/:id/whitelist\`: Reads \`whitelist.json\`.
- \`POST /api/servers/:id/whitelist\`: Modifies whitelist entries and triggers in-game reload.
- \`GET /api/servers/:id/ops\`: Reads and edits \`ops.json\`.
- \`GET /api/servers/:id/bans\`: Reads \`banned-players.json\` and \`banned-ips.json\`.

## Related Architecture
- Subsystem: [[Subsystem - Server Lifecycle and Adapters]]
- Console dispatch: [[Execution Manager]]
- UI View: [[Frontend Overview View]]
