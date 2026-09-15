---
title: "Subsystem - Discord Bot Integration"
type: "subsystem"
layer: "discord"
source: "src/core/discord/discordManager.ts"
tags:
  - minepanel
  - discord
  - subsystem
---

# Subsystem: Discord Bot Integration

The **Discord Bot Integration** subsystem enables complete remote control and bidirectional console streaming between Minecraft servers and Discord guilds. It supports multiple bots, automatic guild channel provisioning, role-based command restrictions, and rich embeds.

## Key Responsibilities
1. **Multi-Bot Management**: Manages simultaneous `discord.js` client instances linked to different Minecraft servers.
2. **Auto-Provisioning**: Creates dedicated categories, console streaming channels, and status channels per server on Discord.
3. **Live Console Bridge**: Buffers and batches Minecraft console output to Discord text channels with zero-spam notifications.
4. **Slash Commands**: Registers and handles commands (`/mcs start`, `/mcs stop`, `/mcs restart`, `/mcs status`, `/mcs console`, `/mcs players`).

## Connected Architectural Nodes
- [[Discord Manager]]: Facade coordinating all bot clients, provisioning, and events.
- [[Discord Event Bridge]]: Real-time stdio stream forwarder to Discord channels.
- [[Discord Client Lifecycle]]: Connection, token decryption, error handling, and graceful teardown.
- [[Discord Provisioner]]: Category and channel creator with self-healing capabilities.
- [[Discord Slash Commands]]: Interactive command registry and interaction dispatcher.
- [[Model - DiscordBot]]: Database model storing encrypted tokens and guild mappings.

## Modular Discord Sub-Modules
- [[Discord Bot Queries]]
- [[Discord Command Registrar]]
- [[Discord CRUD Operations]]
- [[Discord Interactions Handler]]
- [[Discord Legacy API]]
- [[Discord Live Session Manager]]
- [[Discord Shared State]]
- [[Discord Routes]]
- [[Discord Bots Routes]]
