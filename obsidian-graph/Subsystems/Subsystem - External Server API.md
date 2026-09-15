---
title: "Subsystem - External Server API"
type: "subsystem"
layer: "core"
source: "src/routes/serverApiRoutes.ts"
tags:
  - minepanel
  - core
  - subsystem
---

# Subsystem: External Server API

The **External Server API** subsystem exposes an authenticated, programmatically accessible REST and WebSocket API for external bots, websites, and community tools to interact with MinePanel.

## Key Responsibilities
1. **API Key Authentication**: Generates scoped API keys (hashed with Argon2 in database); supports IP allowlisting and expiration dates.
2. **Granular Scopes**: Requires explicit permissions for every action (e.g. `server.read`, `server.power`, `server.console.write`, `server.files.read`).
3. **Dedicated WebSocket Channel**: Connects external clients to `/ws/serverapi` for subscribing to event streams (status, console, metrics, player joins).
4. **Audit Trails**: Records external API operations directly to the audit log.

## Connected Architectural Nodes
- [[External Server API Routes]]: Complete REST interface for external clients.
- [[Server API WebSocket]]: Authenticated WebSocket gateway for streaming real-time server events.
- [[API Key Authentication]]: Middleware enforcing key validity, scopes, and IP restrictions.
- [[Model - ServerApiKey]]: Database storage for API keys and permitted capabilities.
- [[Execution Manager]]: Backend service fulfilling power actions and status queries.
- [[Audit Logger]]: Records all external administrative actions.
