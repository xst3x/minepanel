---
title: "ADR - Dedicated Worker Process and IPC Separation"
type: "decision"
layer: "architecture"
source: "src/core/processManager.ts"
tags:
  - minepanel
  - architecture
  - decision
---

# Architectural Decision: Dedicated Worker Process and IPC Separation

## Context
Running game servers involves spawning long-running native child processes with heavy CPU usage, frequent stdio streams, and periodic `pidusage` polling. In earlier designs, executing child processes directly in the primary Express API process caused event-loop lag during heavy console streaming or file uploads, degrading HTTP API responsiveness and WebSocket stability.

## Decision
Decouple game process execution from the Express web server into a standalone [[Worker Process]] (`src/worker.ts`) running under `MINEPANEL_PROCESS=worker`.
- The main web API process uses [[Proxy Process Manager]] to dispatch commands over Node.js IPC.
- The worker process runs [[Real Process Manager]], handling direct `child_process.spawn()`, signal traps, and circular console buffers.

## Consequences
- **Benefits**: Complete fault isolation. If the worker process restarts or crashes, the API process remains operational, clears pending promises, and auto-respawns the worker within 2 seconds. Game processes are preserved across restarts via [[Process Persistence]].
- **Trade-offs**: Introduces IPC latency (~1-3ms) and requires serializable message payloads between processes.

## Relationships
- Governs: [[Worker Process]], [[Proxy Process Manager]], [[Real Process Manager]]
- Part of: [[Subsystem - Process Management and Workers]]
