---
title: "WebSocket Console Server"
type: "service"
layer: "backend"
source: "src/minepanel.ts"
tags:
  - minepanel
  - backend
  - service
---

# WebSocket Console Server

**Source**: Mounted inside `src/minepanel.ts` on path `/ws`

`WebSocket Console Server` powers the live interactive console in MinePanel. It establishes authenticated, low-latency WebSocket connections with browser clients, streams live server stdout/stderr logs, broadcasts status changes and resource stats, and accepts console commands.

## Connection Protocol
1. Client connects to `/ws?serverId=<id>`.
2. 5-second authentication window: client must send `{ type: 'auth', token: '<JWT>' }`.
3. Server verifies token and checks `server.console.read` permission via [[Permissions System]].
4. On success: sends in-memory console backlog (`history`), subscribes client to process events.
5. Periodic stats payload (every 500ms) with CPU%, RAM, and host timezone.
6. Incoming `command` messages require `server.console.write` permission; `chat` messages execute safely via `/say <text>`.

## Relationships
- Belongs to: [[Subsystem - Core Backend and Web Server]]
- Part of: [[MinePanel Entrypoint]]
- Uses: [[Process Manager Wrapper]], [[Execution Manager]], [[Permissions System]], [[Automation Engine]]
- Consumed by: [[Frontend Console View]]
