---
title: "Discord Stats Command"
type: "command"
layer: "discord"
source: "src/core/discord/commands/stats.ts"
tags:
  - minepanel
  - discord
  - command
---

# Discord Stats Command

**Source**: `src/core/discord/commands/stats.ts`

Implements `/mcs stats <server>`. Queries [[Execution Manager]] and formats CPU percentage, RAM allocation, uptime, and player counts into a Discord embed.

## Relationships
- Belongs to: [[Subsystem - Discord Bot Integration]]
- Part of: [[Discord Slash Commands]]
- Uses: [[Execution Manager]]
