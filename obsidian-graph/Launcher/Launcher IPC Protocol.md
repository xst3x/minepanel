---
title: Launcher IPC Protocol
type: launcher
source_file: src/launcher/protocol.ts
tags:
  - #launcher
  - #protocols
---

# Launcher IPC Protocol

Message schema and serialization protocol governing inter-process communication between the launcher and the MinePanel application server.

## Message Types
- `LAUNCHER_PING` / `LAUNCHER_PONG`: Health check heartbeat.
- `LAUNCHER_RESTART_REQUEST`: Application requested self-restart (e.g. after update).
- `LAUNCHER_STATUS_REPORT`: CPU/RAM usage of child processes.

## Related Architecture
- Subsystem: [[Subsystem - Supervisor and Launcher]]
- Manager: [[Launcher Process Manager]]
