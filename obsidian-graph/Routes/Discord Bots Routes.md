---
title: Discord Bots Routes
type: route
source_file: src/routes/discordBotsRoutes.ts
tags:
  - #route
  - #discord
---

# Discord Bots Routes

CRUD endpoints for managing multiple independent Discord bot entities within MinePanel.

## Endpoints
- `GET /api/discord-bots`: List all registered bots.
- `POST /api/discord-bots`: Register new bot token and application ID.
- `PUT /api/discord-bots/:id`: Update bot configuration and permissions.
- `DELETE /api/discord-bots/:id`: Terminate and remove bot client.

## Related Architecture
- Business logic: [[Discord CRUD Operations]]
- Security: [[Permissions System]]
