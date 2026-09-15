---
title: "Worker Process"
type: "worker"
layer: "worker"
source: "src/worker.ts"
tags:
  - minepanel
  - worker
  - worker
---

# Worker Process

**Source**: `src/worker.ts`

`Worker Process` is an independent background Node.js process spawned by [[Proxy Process Manager]]. It runs with `MINEPANEL_PROCESS=worker` and is dedicated exclusively to managing game server child processes without interference from web server garbage collection or HTTP load.

## Operation
- Periodically gathers CPU/RAM statistics for all active servers (500ms interval) and sends them to parent process.
- Listens for IPC commands: `start-server`, `stop-server`, `graceful-stop`, `restart-graceful`, `kill-server`, `send-command`, `ping`.
- Forwards console lines and status transitions back to the main API process via `process.send()`.

## Relationships
- Belongs to: [[Subsystem - Process Management and Workers]]
- Executes: [[Real Process Manager]]
- Managed by: [[Proxy Process Manager]]
