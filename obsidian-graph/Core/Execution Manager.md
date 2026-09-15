---
title: "Execution Manager"
type: "service"
layer: "backend"
source: "src/core/executionManager.ts"
tags:
  - minepanel
  - backend
  - service
---

# Execution Manager

**Source**: `src/core/executionManager.ts`

The `Execution Manager` acts as a clean, decoupled abstraction layer over the process manager. Route handlers and WebSocket managers call Execution Manager to obtain server statuses and performance metrics without needing to know whether the server is running locally or proxied through a worker process.

## Key Functions
- `getStatus(serverId)`: Returns current server status (`'online'`, `'offline'`, `'starting'`, `'stopping'`).
- `getStats(serverId)`: Returns CPU percentage and RAM usage (MB) for a server.

## Relationships
- Belongs to: [[Subsystem - Core Backend and Web Server]]
- Delegates to: [[Process Manager Wrapper]]
- Used by: [[MinePanel Entrypoint]], [[WebSocket Console Server]], [[External Server API Routes]]
