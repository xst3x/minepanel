---
title: "SFTP Server"
type: "service"
layer: "backend"
source: "src/core/ftpServer.ts"
tags:
  - minepanel
  - backend
  - service
---

# SFTP Server

**Source**: `src/core/ftpServer.ts`

The `SFTP Server` module provides embedded SFTP (SSH File Transfer Protocol) daemon instances for each Minecraft server using the `ssh2` library. Users can connect with FileZilla, Cyberduck, or WinSCP to manage files over an encrypted SSH connection.

## Key Characteristics
- **Dedicated Port per Server**: Each Minecraft server can have its own configured SFTP port (or global panel SFTP port).
- **Hashed Credentials**: Passwords are saved with bcrypt hashes in the database.
- **Sandboxed Virtual Filesystem**: Restricts SFTP client operations strictly to the designated `servers/<id>/` folder.
- **Auto-Generated Host Keys**: Generates and persists RSA host keys to prevent client certificate warnings.

## Relationships
- Belongs to: [[Subsystem - Core Backend and Web Server]]
- Uses: [[Database Access Layer]], [[Server Helper]], [[Model - Server]]
- Initialized by: [[MinePanel Entrypoint]]
