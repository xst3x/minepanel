---
title: Launcher Process Manager
type: launcher
source_file: src/launcher/processManager.ts
tags:
  - #launcher
  - #process
---

# Launcher Process Manager

Low-level process supervisor in the launcher responsible for spawning, detaching, and piping stdio for the MinePanel Node.js server.

## Key Responsibilities
- Spawns `src/minepanel.ts` with optimal V8 heap memory settings.
- Multiplexes stdout/stderr into unified timestamped launcher log files.
- Handles clean shutdown signals (SIGINT, SIGTERM).

## Related Architecture
- Uses: [[Launcher IPC Protocol]]
- Guarded by: [[Launcher Watchdog]]
- Subsystem: [[Subsystem - Supervisor and Launcher]]
