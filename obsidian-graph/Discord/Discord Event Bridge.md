---
title: "Discord Event Bridge"
type: "service"
layer: "discord"
source: "src/core/discord/discordEventBridge.ts"
tags:
  - minepanel
  - discord
  - service
---

# Discord Event Bridge

**Source**: `src/core/discord/discordEventBridge.ts`

`Discord Event Bridge` streams console output bidirectionally between Minecraft and Discord. It captures server stdout, batches console lines into Discord message chunks to avoid rate limits, and sends messages without triggering audible push notifications.

## Relationships
- Belongs to: [[Subsystem - Discord Bot Integration]]
- Connects: [[Process Manager Wrapper]] to Discord channels
- Managed by: [[Discord Manager]]
