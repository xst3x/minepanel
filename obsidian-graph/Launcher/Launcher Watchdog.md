---
title: Launcher Watchdog
type: launcher
source_file: src/launcher/watchdog.ts
tags:
  - #launcher
  - #process
---

# Launcher Watchdog

Supervisor process monitoring the main MinePanel backend and worker threads for crashes and freezes.

## Key Responsibilities
- Heartbeat polling to ensure the HTTP server and worker processes respond.
- Auto-restart mechanism with exponential backoff to prevent fast crash loops.
- Crash dump recording in launcher logs.

## Related Architecture
- Subsystem: [[Subsystem - Supervisor and Launcher]]
- Supervisor: [[Launcher Process Manager]]
- Entry: [[Launcher Supervisor]]
