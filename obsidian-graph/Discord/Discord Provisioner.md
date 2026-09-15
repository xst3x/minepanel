---
title: "Discord Provisioner"
type: "service"
layer: "discord"
source: "src/core/discord/discordProvisioner.ts"
tags:
  - minepanel
  - discord
  - service
---

# Discord Provisioner

**Source**: `src/core/discord/discordProvisioner.ts`

`Discord Provisioner` automatically configures Discord guilds for Minecraft management. When a bot is linked to a server, the provisioner creates a parent category, a private `#console` channel with restricted permissions, and an `#alerts` channel. It also features self-healing: if an admin accidentally deletes a channel on Discord, the provisioner recreates it automatically.

## Relationships
- Belongs to: [[Subsystem - Discord Bot Integration]]
- Used by: [[Discord Manager]]
