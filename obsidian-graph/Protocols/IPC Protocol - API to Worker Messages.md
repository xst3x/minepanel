---
title: "IPC Protocol - API to Worker Messages"
type: "protocol"
layer: "worker"
source: "src/core/process-proxy-manager.ts"
tags:
  - minepanel
  - worker
  - protocol
---

# IPC Protocol: API to Worker Messages

Defines the message contract sent from [[Proxy Process Manager]] (API process) to [[Worker Process]] over standard Node.js IPC (`child.send()`).

## Message Formats
1. **`start-server`**:
   ```json
   {
     "type": "start-server",
     "requestId": "req_1",
     "serverId": "1",
     "serverDir": "servers/1",
     "javaArgs": [],
     "jarFile": "servers/1/server.jar",
     "ramMb": 4096,
     "javaPath": "java",
     "mode": "java"
   }
   ```
2. **`stop-server`**: `{ "type": "stop-server", "requestId": "req_2", "serverId": "1" }`
3. **`graceful-stop`**: `{ "type": "graceful-stop", "requestId": "req_3", "serverId": "1", "timeoutMs": 15000 }`
4. **`restart-graceful`**: Combines graceful stop followed by launch sequence.
5. **`kill-server`**: `{ "type": "kill-server", "requestId": "req_4", "serverId": "1" }`
6. **`send-command`**: `{ "type": "send-command", "serverId": "1", "command": "say Hello" }`
7. **`clear-history`**: Clears circular console backlog in worker memory.
8. **`ping`**: Heartbeat probe expecting `pong` response.

## Relationships
- Sent by: [[Proxy Process Manager]]
- Received by: [[Worker Process]]
