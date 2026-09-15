---
title: Discord Routes
type: route
source_file: src/routes/discordRoutes.ts
tags:
  - #route
  - #discord
---

# Discord Routes

Express router handling Discord bot general configuration, guild list discovery, and channel links.

## Endpoints
- `GET /api/discord/status`: Returns running bot instances and Discord Gateway status.
- `POST /api/discord/test`: Sends test message to configured channel.
- `POST /api/discord/sync`: Forces slash command registration with Discord API.

## Related Architecture
- Subsystem: [[Subsystem - Discord Bot Integration]]
- Controller: [[Discord Command Registrar]], [[Discord Live Session Manager]]
