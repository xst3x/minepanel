---
title: "Server API WebSocket"
type: "service"
layer: "backend"
source: "src/core/serverApiWebSocket.ts"
tags:
  - minepanel
  - backend
  - service
---

# Server API WebSocket

**Source**: `src/core/serverApiWebSocket.ts`

The `Server API WebSocket` is an authenticated WebSocket gateway mounted at `/ws/serverapi` designed for external bots, custom launchers, and mobile apps. Unlike the internal UI console WebSocket which relies on user JWT cookies, this endpoint authenticates via persistent API keys.

## Features
- **API Key Authentication**: Authenticates with token and secret checked against Argon2 hashes in the database.
- **Topic Subscriptions**: Clients subscribe/unsubscribe to discrete topics: `console`, `status`, `stats`, `playerJoin`, `playerLeave`, `tps_update`.
- **Scoped Console Writing**: Requires the `server.console.write` API key permission.

## Relationships
- Belongs to: [[Subsystem - External Server API]]
- Uses: [[API Key Authentication]], [[Process Manager Wrapper]], [[Execution Manager]], [[Audit Logger]]
