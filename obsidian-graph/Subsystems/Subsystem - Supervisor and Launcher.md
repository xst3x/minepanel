---
title: "Subsystem - Supervisor and Launcher"
type: "subsystem"
layer: "launcher"
source: "src/launcher/index.ts"
tags:
  - minepanel
  - launcher
  - subsystem
---

# Subsystem: Supervisor and Launcher

The **Supervisor and Launcher** subsystem provides outer-process management and high availability for the MinePanel backend. It wraps the entire Node.js server in an automated supervisor loop that catches fatal crashes, monitors responsiveness via HTTP health probes, and orchestrates port migration rollbacks.

## Key Responsibilities
1. **Zero-Downtime Supervision**: Boots the main server process as a monitored child process.
2. **Watchdog Health Checking**: Probes `/health` periodically and terminates hanging processes.
3. **Crash Recovery & Backoff**: Handles exit codes (such as code 100 for restart, 101 for port bind failure).
4. **Command Protocol**: Hosts an authenticated protocol server for control signals from the panel.

## Connected Architectural Nodes
- [[Launcher Supervisor]]: Root entrypoint initializing IPC tokens and startup sequences.
- [[Launcher Watchdog]]: Health-probe loop monitoring backend responsiveness.
- [[Launcher Protocol Server]]: Internal HTTP server for supervisor administrative commands.
- [[Launcher Backend Monitor]]: Child process spawning, exit code trapping, and logging.
- [[MinePanel Entrypoint]]: Target backend service spawned and supervised.

## Deep Launcher Modules
- [[Launcher Watchdog]]
- [[Launcher Updater]]
- [[Launcher Process Manager]]
- [[Launcher IPC Protocol]]
