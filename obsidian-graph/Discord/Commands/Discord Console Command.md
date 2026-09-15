---
title: "Discord Console Command"
type: "command"
layer: "discord"
source: "src/core/discord/commands/console.ts"
tags:
  - minepanel
  - discord
  - command
---

# Discord Console Command

**Source**: `src/core/discord/commands/console.ts`

Handles `/mcs console <server> <command>` from Discord. Checks sender permissions against authorized Discord roles, validates command sanitization, and sends input directly to the Minecraft console via [[Process Manager Wrapper]].

## Relationships
- Belongs to: [[Subsystem - Discord Bot Integration]]
- Part of: [[Discord Slash Commands]]
- Uses: [[Process Manager Wrapper]]
