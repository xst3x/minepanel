---
title: Discord Bot Queries
type: discord
source_file: src/core/discord/bot-queries.ts
tags:
  - #discord
  - #database
---

# Discord Bot Queries

Database query abstractions for Discord bots, guild registrations, and server-channel mappings.

## Key Functions
- `getActiveBots()`: Retrieves all enabled Discord bot tokens and configurations.
- `getGuildMappings(botId)`: Maps Discord guilds and channels to specific MinePanel server instances.
- `updateBotStatus(botId, status)`: Persists connection health and presence status.

## Related Architecture
- Invoked by: [[Discord Provisioner]], [[Subsystem - Discord Bot Integration]]
- Interacts with: [[Subsystem - Database and Persistence]]
