---
title: "Subsystem - Process Management and Workers"
type: "subsystem"
layer: "worker"
source: "src/core/processManager.ts"
tags:
  - minepanel
  - worker
  - subsystem
---

# Subsystem: Process Management and Workers

The **Process Management and Workers** subsystem decouples web server API requests from native Minecraft process execution. To prevent high CPU loads or blocking tasks in the API server, Minecraft processes run under a dedicated worker process controlled via Node.js IPC.

## Architecture
- **In the API Server**: [[Proxy Process Manager]] is loaded. It communicates over IPC with the worker process, managing per-server operation locks and caching stdout/stderr streams.
- **In the Worker Process**: [[Real Process Manager]] is loaded. It directly invokes `child_process.spawn()`, attaches stdio listeners, monitors PIDs via `pidusage`, and handles graceful shutdown sequences.

## Connected Architectural Nodes
- [[Process Manager Wrapper]]: Context-aware switch returning either Proxy or Real manager based on process environment.
- [[Real Process Manager]]: Actual execution engine spawning Java, Bedrock, and PocketMine instances.
- [[Proxy Process Manager]]: API-side coordinator delegating operations to the worker process via IPC.
- [[Worker Process]]: Standalone background Node process executing Minecraft servers.
- [[Process Persistence]]: Disk-backed PID registry facilitating state recovery after panel restarts.
- [[Process Output Parser]]: Log parser analyzing stdout/stderr for server lifecycle events.
