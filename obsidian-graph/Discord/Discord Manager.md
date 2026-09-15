---
title: "Discord Manager"
type: "manager"
layer: "discord"
source: "src/core/discord/discordManager.ts"
tags:
  - minepanel
  - discord
  - manager
---

# Discord Manager

**Source**: `src/core/discord/discordManager.ts`

`Discord Manager` is the unified facade coordinating Discord bot services. It manages bot instances, links bots to game servers, registers slash commands, and exposes lifecycle management methods (`startAll`, `destroyAll`, `createBot`, `deleteBot`).

## Relationships
- Belongs to: [[Subsystem - Discord Bot Integration]]
- Orchestrates: [[Discord Client Lifecycle]], [[Discord Event Bridge]], [[Discord Provisioner]], [[Discord Slash Commands]]
- Uses: [[Model - DiscordBot]]
