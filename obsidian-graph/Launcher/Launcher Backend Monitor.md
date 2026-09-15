---
title: "Launcher Backend Monitor"
type: "manager"
layer: "launcher"
source: "src/launcher/processManager.ts"
tags:
  - minepanel
  - launcher
  - manager
---

# Launcher Backend Monitor

**Source**: `src/launcher/processManager.ts`

The `Launcher Backend Monitor` handles low-level process spawning for the backend server (`minepanel_main.ts` / `minepanel.ts`). It sets environment variables, connects stdio pipelines, traps exit signals, and notifies the supervisor.

## Key Functions
- `startBackend(port, token)`: Spawns the child Node.js process with `LAUNCHER_PORT` and `LAUNCHER_TOKEN`.
- `killBackend(signal)`: Forcibly terminates the child process using platform-appropriate signals.

## Relationships
- Belongs to: [[Subsystem - Supervisor and Launcher]]
- Used by: [[Launcher Supervisor]]
- Spawns: [[MinePanel Entrypoint]]
