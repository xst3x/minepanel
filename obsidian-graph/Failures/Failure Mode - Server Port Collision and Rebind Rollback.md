---
title: "Failure Mode - Server Port Collision and Rebind Rollback"
type: "failure"
layer: "safety"
source: "src/minepanel.ts"
tags:
  - minepanel
  - safety
  - failure
---

# Failure Mode: Server Port Collision and Rebind Rollback

## Trigger
A user attempts to change the panel HTTP/HTTPS port via Settings to an occupied or restricted port (e.g. `EADDRINUSE` or `EACCES`).

## Detection
In [[MinePanel Entrypoint]], the `server.on('error')` listener traps `EADDRINUSE` and exits with code `101`.

## Recovery Flow
1. [[Launcher Supervisor]] receives exit code `101`.
2. Supervisor recognizes bind failure and rolls back `PORT` in `.env` to `lastKnownGoodPort` using [[Environment Helper]].
3. Supervisor re-spawns the backend server on the safe port automatically, preventing the panel from becoming unreachable.
