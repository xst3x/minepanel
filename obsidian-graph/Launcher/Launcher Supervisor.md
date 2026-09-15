---
title: "Launcher Supervisor"
type: "manager"
layer: "launcher"
source: "src/launcher/index.ts"
tags:
  - minepanel
  - launcher
  - manager
---

# Launcher Supervisor

**Source**: `src/launcher/index.ts`

The `Launcher Supervisor` is the primary bootstrapper and process monitor for MinePanel. It launches before the backend server, generates an in-memory supervisor token, starts the internal protocol server, and manages child process crashes with intelligent backoff logic.

## Key Functions & Logic
- `bootstrap()`: Generates random crypto token and calls `protocol.startProtocolServer()`.
- `registerEvents()`: Subscribes to events like `backend-crashed`, `backend-ready`, and `shutdown-requested`.
- `handleBackendCrash()`: Detects repeated crash loops (>5 crashes in 60 seconds) and enters a 30-second recovery backoff.

## Relationships
- Belongs to: [[Subsystem - Supervisor and Launcher]]
- Uses: [[Launcher Watchdog]], [[Launcher Protocol Server]], [[Launcher Backend Monitor]]
- Controls: [[MinePanel Entrypoint]]
