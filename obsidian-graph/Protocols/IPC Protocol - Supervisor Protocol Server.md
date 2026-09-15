---
title: "IPC Protocol - Supervisor Protocol Server"
type: "protocol"
layer: "launcher"
source: "src/launcher/protocol.ts"
tags:
  - minepanel
  - launcher
  - protocol
---

# IPC Protocol: Supervisor Protocol Server

Defines the local HTTP protocol used between the backend API server and the outer [[Launcher Supervisor]] process.

## Endpoints
- **`POST /api/supervisor/restart`**: Initiates graceful restart of the supervised backend process. Authenticated via header:
  `Authorization: Bearer <LAUNCHER_TOKEN>`
- **`POST /api/supervisor/shutdown`**: Orders clean supervisor termination.
- **`GET /api/supervisor/status`**: Returns supervisor PID, uptime, and crash restart count.

## Relationships
- Implemented in: [[Launcher Protocol Server]]
- Called by: [[System Routes]]
