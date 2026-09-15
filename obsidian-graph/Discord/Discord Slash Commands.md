---
title: "Discord Slash Commands"
type: "service"
layer: "discord"
source: "src/core/discord/commands/index.ts"
tags:
  - minepanel
  - discord
  - service
---

# Discord Slash Commands

**Source**: `src/core/discord/commands/index.ts`

Registers and handles Discord slash commands (`/mcs`) via the Discord REST API:
- `/mcs start [server]`
- `/mcs stop [server]`
- `/mcs restart [server]`
- `/mcs status [server]`
- `/mcs stats [server]`
- `/mcs players [server]`
- `/mcs console [server] [command]`

Commands check user Discord roles against configured administrative role IDs before executing.

## Relationships
- Belongs to: [[Subsystem - Discord Bot Integration]]
- Registered by: [[Discord Manager]]
- Uses: [[Process Manager Wrapper]], [[Execution Manager]]
