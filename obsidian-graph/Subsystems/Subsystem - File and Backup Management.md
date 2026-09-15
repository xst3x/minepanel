---
title: "Subsystem - File and Backup Management"
type: "subsystem"
layer: "core"
source: "src/routes/fileRoutes.ts"
tags:
  - minepanel
  - core
  - subsystem
---

# Subsystem: File and Backup Management

The **File and Backup Management** subsystem provides secure, sandboxed file operations and disaster recovery for Minecraft server directories.

## Key Responsibilities
1. **Path Traversal Sandboxing**: Resolves all relative paths against the server root, rejecting any attempts to escape via `..` or symlinks.
2. **Streaming Archiving**: Creates and extracts `.zip` archives on the fly using `archiver` and `adm-zip`.
3. **One-Time Download Tokens**: Issues secure, time-limited (5-minute) tokens for large folder downloads.
4. **Full Server Backups**: Creates point-in-time zip archives of server worlds and configs; supports instant single-click restoration while server is offline.
5. **SFTP Access**: Runs an embedded SSH SFTP server per Minecraft server for standard FTP client connectivity.

## Connected Architectural Nodes
- [[File Routes]]: REST endpoints for file browsing, reading, saving, uploading, and deleting.
- [[Backup Routes]]: Backup creation, scheduling, listing, and restoration endpoints.
- [[SFTP Server]]: Per-server SFTP daemon using `ssh2` with bcrypt authentication.
- [[Server Helper]]: Filesystem path resolver and zip archiver implementation.
- [[Frontend File Manager View]]: Web-based file explorer and code editor.
