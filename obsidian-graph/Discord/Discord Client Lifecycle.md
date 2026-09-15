---
title: "Discord Client Lifecycle"
type: "service"
layer: "discord"
source: "src/core/discord/client-lifecycle.ts"
tags:
  - minepanel
  - discord
  - service
---

# Discord Client Lifecycle

**Source**: `src/core/discord/client-lifecycle.ts`

Handles connecting, authenticating, and safely destroying `discord.js` Client instances. It decrypts stored bot tokens using [[Encryption Utility]], registers event handlers, and implements automatic reconnection on Discord API disconnects.

## Relationships
- Belongs to: [[Subsystem - Discord Bot Integration]]
- Uses: [[Encryption Utility]]
- Used by: [[Discord Manager]]
