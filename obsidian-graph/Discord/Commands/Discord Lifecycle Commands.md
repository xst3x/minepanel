---
title: "Discord Lifecycle Commands"
type: "command"
layer: "discord"
source: "src/core/discord/commands/start.ts"
tags:
  - minepanel
  - discord
  - command
---

# Discord Lifecycle Commands

**Source**: `src/core/discord/commands/start.ts`, `stop.ts`, `restart.ts`

Implements `/mcs start`, `/mcs stop`, and `/mcs restart` slash commands on Discord with interactive button confirmations and rich embedded status updates.

## Relationships
- Belongs to: [[Subsystem - Discord Bot Integration]]
- Part of: [[Discord Slash Commands]]
- Uses: [[Process Manager Wrapper]], [[Execution Manager]]
