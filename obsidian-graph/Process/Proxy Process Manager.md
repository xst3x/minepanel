---
title: "Proxy Process Manager"
type: "manager"
layer: "backend"
source: "src/core/process-proxy-manager.ts"
tags:
  - minepanel
  - backend
  - manager
---

# Proxy Process Manager

**Source**: `src/core/process-proxy-manager.ts`

`Proxy Process Manager` runs inside the primary Express API server. Instead of managing operating system processes directly, it forks [[Worker Process]] and communicates via bidirectional Node.js IPC messages.

## Key Responsibilities
- **Worker Process Supervision**: Automatically forks `worker.js` and re-spawns it if it crashes.
- **Server Locks**: Acquires and auto-releases mutex locks per server to prevent concurrent start/stop operations.
- **IPC Message Dispatch**: Translates calls like `start()`, `gracefulStop()`, and `sendCommand()` into IPC request messages and awaits matched response IDs.
- **Event Forwarding**: Re-emits `console`, `status`, `crash`, and `stats` events received from the worker to the Express backend.

## Relationships
- Belongs to: [[Subsystem - Process Management and Workers]]
- Communicates with: [[Worker Process]]
- Used by: [[MinePanel Entrypoint]], [[Execution Manager]]
