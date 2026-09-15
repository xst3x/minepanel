---
title: Embedded FTP Server Subsystem
type: subsystem
source_file: src/core/ftpServer.ts
tags:
  - #subsystem
  - #backend
  - #security
---

# Embedded FTP Server Subsystem

In-process FTP server allowing users and automated tooling to securely upload and download server files (plugins, worlds, configs) over standard FTP/FTPS.

## Architectural Architecture
- File: \`src/core/ftpServer.ts\`
- Integrates with: [[Database Access Layer]] for user credential verification
- Enforces root jail per server: users can only access their allocated \`servers/:serverId/\` directory.
- Restricts passive port ranges configured in [[Config Module]].

## Security & Path Traversal Guards
- Authenticates against [[Model - User]] credentials.
- Checks user permissions via [[Permissions System]] before granting write or delete privileges.
- Prevents symlink breakout and path traversal attacks outside the server root directory.

## Related Architecture
- Subsystem: [[Subsystem - File and Backup Management]]
- UI Interface: [[Frontend Overview View]]
- HTTP Alternative: [[File Routes]]
