---
title: "Server Helper"
type: "utility"
layer: "backend"
source: "src/core/serverHelper.ts"
tags:
  - minepanel
  - backend
  - utility
---

# Server Helper

**Source**: `src/core/serverHelper.ts`

`Server Helper` provides centralized filesystem and configuration utilities for Minecraft server instances. It enforces strict directory sandboxing, manages `server.properties`, generates zip backups, and migrates server directory layouts across versions.

## Key Functions
- `getServer(serverId)`: Retrieves server record from database with caching.
- `getServerDir(server)`: Computes the absolute filesystem directory for a server.
- `createBackup(serverId, note)`: Compresses the server folder into a timestamped zip archive.
- `migrateServerDirectories()`: Normalizes legacy server directory structures to `servers/<id>/`.

## Relationships
- Belongs to: [[Subsystem - Core Backend and Web Server]]
- Uses: [[Database Access Layer]], [[Model - Server]]
- Used by: [[MinePanel Entrypoint]], [[Server Lifecycle Routes]], [[Server Management Routes]], [[Backup Routes]], [[Update Manager]]
