---
title: "Subsystem - Core Backend and Web Server"
type: "subsystem"
layer: "backend"
source: "src/minepanel.ts"
tags:
  - minepanel
  - backend
  - subsystem
---

# Subsystem: Core Backend and Web Server

The **Core Backend and Web Server** subsystem is the central orchestration hub of MinePanel. Powered by Express 4 and native Node.js HTTP/HTTPS/net servers, it binds the database, file management, realtime WebSockets, SFTP services, and API controllers together.

## Key Responsibilities
1. **Network Sniffing**: Uses a raw TCP server to sniff incoming packets, seamlessly dispatching TLS connections to HTTPS and plaintext connections to HTTP redirect.
2. **Real-time Console Hub**: Embeds the primary `/ws` WebSocket server connecting browser terminals to Minecraft process stdio streams.
3. **Service Orchestration**: Initializes SQLite database, starts the SFTP daemon, hooks up Discord bots, and triggers server autostart routines on boot.
4. **Security Middleware**: Sets HTTP security headers (CSP, HSTS, frame-ancestors), CORS policies, and global rate limiting.

## Connected Architectural Nodes
- [[MinePanel Entrypoint]]: Main backend file coordinating routers, websockets, and lifecycle hooks.
- [[Execution Manager]]: High-level interface querying server status and stats across process boundaries.
- [[Server Helper]]: Path resolution, configuration extraction, and directory migration utilities.
- [[SFTP Server]]: Dedicated per-server SFTP daemons allowing file access over SSH.
- [[WebSocket Console Server]]: Live console broadcasting and command execution pipe.
- [[Stats Collector]]: Aggregator pulling CPU/RAM usage and pushing to database history.
- [[Audit Logger]]: Security auditing service logging admin actions.

## Error Handling & Middleware Layer
- [[Application Errors Framework]]
- [[Application Error Codes]]
- [[API Key Auth Middleware]]
- [[Request Logger Middleware]]
- [[Input Validators Middleware]]
- [[Documentation Routes]]
- [[Server API Documentation Routes]]
- [[Server API Key Management Routes]]
- [[User Management Routes]]
- [[Rank Management Routes]]
