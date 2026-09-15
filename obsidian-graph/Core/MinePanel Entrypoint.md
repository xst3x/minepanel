---
title: "MinePanel Entrypoint"
type: "entrypoint"
layer: "backend"
source: "src/minepanel.ts"
tags:
  - minepanel
  - backend
  - entrypoint
---

# MinePanel Entrypoint

**Source**: `src/minepanel.ts`

`MinePanel Entrypoint` is the central application file of the MinePanel backend. It initializes Express, configures security headers, starts the database, hooks up WebSocket connections, mounts REST routers, starts background services (FTP, Discord, Update Scheduler, Autostart), and registers crash/port recovery listeners.

## Execution Flow on Boot
1. Loads environment variables via `dotenv` and sanitizes secrets.
2. If running without supervisor, starts launcher process wrapper to enable port-migration rollback.
3. Configures Express app: CORS, CSP, X-Frame-Options, JSON body parser, and request logger.
4. Mounts raw TCP sniffer socket (dispatches TLS byte 22 to HTTPS, plaintext to HTTP redirect).
5. Mounts WebSocket server on `/ws` for console and status streaming.
6. Calls `initDb()` to sync Sequelize models and execute migrations.
7. Launches background daemons: `statsCollector`, `versionManager`, `initFtpServer`, `discordManager`, and `UpdateScheduler`.
8. Scans database for servers marked `autostart = 1` and boots them.

## Relationships
- Belongs to: [[Subsystem - Core Backend and Web Server]]
- Supervised by: [[Launcher Supervisor]]
- Initializes: [[Database Access Layer]], [[Proxy Process Manager]], [[SFTP Server]], [[Discord Manager]], [[Automation Engine]], [[Update Scheduler]]
- Mounts: [[WebSocket Console Server]], [[Server Lifecycle Routes]], [[Server Management Routes]], [[File Routes]], [[Auth Routes]]
