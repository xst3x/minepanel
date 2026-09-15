---
title: "IPC Protocol - Worker to API Events"
type: "protocol"
layer: "worker"
source: "src/worker.ts"
tags:
  - minepanel
  - worker
  - protocol
---

# IPC Protocol: Worker to API Events

Defines the messages and events pushed from [[Worker Process]] back to [[Proxy Process Manager]] via `process.send()`.

## Message Formats
1. **`log`** (Console stdout/stderr line):
   ```json
   { "type": "log", "serverId": "1", "data": "[12:00:00] [Server thread/INFO]: Done (2.4s)!" }
   ```
2. **`status`** (Lifecycle state change):
   ```json
   { "type": "status", "serverId": "1", "status": "online", "pid": 14208 }
   ```
3. **`stats`** (500ms metric tick):
   ```json
   { "type": "stats", "serverId": "1", "stats": { "cpu": 12.5, "ram": 2048 } }
   ```
4. **`crash`** (Unexpected termination):
   ```json
   { "type": "crash", "serverId": "1", "info": { "code": 1, "signal": null } }
   ```
5. **Request Responses** (`<type>-response`):
   ```json
   { "type": "start-server-response", "requestId": "req_1", "serverId": "1", "result": { "success": true } }
   ```

## Relationships
- Emitted by: [[Worker Process]]
- Handled by: [[Proxy Process Manager]]
- Broadcast to: [[WebSocket Console Server]]
