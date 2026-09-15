---
title: "Model - Server"
type: "model"
layer: "database"
source: "src/db/models/Server.ts"
tags:
  - minepanel
  - database
  - model
---

# Model: Server

**Source**: `src/db/models/Server.ts`

Represents an individual Minecraft server instance managed by MinePanel.

## Fields & Relations
- `id`: Primary key
- `name`: Display name
- `software`: Engine (`paper`, `purpur`, `forge`, `bedrock`, `pocketmine`, etc.)
- `version`: Minecraft release version
- `port`: Game port (e.g. 25565, 19132)
- `ram_mb`: Allocated memory limit
- `autostart`: Auto-boot with panel flag
- `autostart_on_crash`: Auto-restart on unexpected exit flag
- `java_path`: Custom path to JRE
- `owner_id`: Foreign key to [[Model - User]]
- **Has Many**: [[Model - ServerStats]]
- **Belongs To Many**: [[Model - DiscordBot]]

## Relationships
- Belongs to: [[Subsystem - Database and Persistence]]
- Part of: [[Database Access Layer]]
