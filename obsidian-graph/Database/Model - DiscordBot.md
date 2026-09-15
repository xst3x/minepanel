---
title: "Model - DiscordBot"
type: "model"
layer: "database"
source: "src/db/models/DiscordBot.ts"
tags:
  - minepanel
  - database
  - model
---

# Model: DiscordBot

**Source**: `src/db/models/DiscordBot.ts`

Represents a Discord bot integration registered in the panel.

## Fields
- `id`: Primary key
- `name`: Bot display label
- `token`: Encrypted bot application token (AES-256-GCM)
- `guild_id`: Discord server/guild snowflake
- `enabled`: Active status flag
- **Belongs To Many**: [[Model - Server]]

## Relationships
- Belongs to: [[Subsystem - Database and Persistence]]
- Part of: [[Database Access Layer]]
