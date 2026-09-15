---
title: "Real Process Manager"
type: "manager"
layer: "worker"
source: "src/core/process-real-manager.ts"
tags:
  - minepanel
  - worker
  - manager
---

# Real Process Manager

**Source**: `src/core/process-real-manager.ts`

`Real Process Manager` is the concrete implementation that manages native operating system processes. Running exclusively within the worker process or test environment, it executes child processes, pipes stdio streams, tracks CPU/RAM usage, and executes shutdown sequences.

## Key Responsibilities
- `start(serverId, serverDir, javaArgs, jarFile, ...)`: Spawns child process using `child_process.spawn()`.
- `stop(serverId)`: Sends `stop` to stdin, waiting for graceful termination.
- `gracefulStop(serverId, timeoutMs)`: Progressive stop with timeout fallback to `SIGTERM` and `SIGKILL`.
- `getStats(serverId)`: Collects live process CPU and memory via `pidusage`.
- Maintains circular console history buffers in memory (up to 1,000 lines per server).

## Relationships
- Belongs to: [[Subsystem - Process Management and Workers]]
- Used by: [[Worker Process]]
- Uses: [[Process Persistence]], [[Process Output Parser]]
