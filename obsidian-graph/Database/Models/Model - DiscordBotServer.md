---
title: "Model - DiscordBotServer"
type: "model"
layer: "database"
source: "src/db/models/DiscordBotServer.ts"
tags:
  - minepanel
  - database
  - model
---

# Model: DiscordBotServer

**Source**: `src/db/models/DiscordBotServer.ts`

Many-to-many join table linking registered Discord bot integrations to individual Minecraft servers.

## Relationships
- Part of: [[Database Access Layer]]
- Connects: [[Model - DiscordBot]] to [[Model - Server]]
