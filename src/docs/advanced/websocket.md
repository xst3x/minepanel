---
type: doc
title: WebSocket Protocol
category: advanced
order: 2
---

# WebSocket Protocol

One WebSocket connection per server tab at `wss://<host>/ws?serverId=<id>`. Authentication is handled in the first message frame — the connection is closed with a 4-series code if auth fails or times out after 5 s.

## Message Types

| Type | Direction | Payload |
|---|---|---|
| `auth` | client → server | `{token: jwt}` |
| `command` | client → server | `{data: cmd}` |
| `history` | server → client | Array of buffered console lines on connect |
| `console` | server → client | Raw stdout/stderr chunk |
| `status` | server → client | `"online" | "offline" | "starting"` |
| `stats` | server → client | `{cpu, ram}` — sent every 2 s |
| `clear_console` | server → client | Instructs client to flush console |

## Process Manager

`src/core/processManager.js` is a singleton EventEmitter that owns every spawned Java process. It tracks PIDs, buffers console lines, and emits events consumed by WebSockets.

| Method | Notes |
|---|---|
| `start(id, dir, ...)` | Spawns the process, attaches stdout/stderr listeners |
| `gracefulStop(id, timeout)` | Writes `/stop\n`, resolves when process exits or timeout elapses |
| `kill(id)` | SIGKILL the tracked PID |
| `acquireLock(id)` | Returns false if already locked — caller should respond 409 |
| `getHistory(id)` | Returns the in-memory console buffer (shown to new WS clients) |
