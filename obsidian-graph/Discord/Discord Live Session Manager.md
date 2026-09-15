---
title: Discord Live Session Manager
type: discord
source_file: src/core/discord/liveSessionManager.ts
tags:
  - #discord
  - #process
---

# Discord Live Session Manager

Maintains live Discord Gateway WebSocket connections, handling heartbeat intervals, reconnect backoffs, and presence rotation.

## Key Responsibilities
- Tracks active `Client` instances per bot token.
- Handles disconnects and session resumption without dropping command availability.
- Updates Discord rich presence (player counts, server status).

## Related Architecture
- Subsystem: [[Subsystem - Discord Bot Integration]]
- Lifecycle: [[Discord Client Lifecycle]]
- State: [[Discord Shared State]]
