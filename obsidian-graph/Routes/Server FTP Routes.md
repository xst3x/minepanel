---
title: "Server FTP Routes"
type: "route"
layer: "backend"
source: "src/routes/modules/serverFtpRoutes.ts"
tags:
  - minepanel
  - backend
  - route
---

# Server FTP Routes

**Source**: `src/routes/modules/serverFtpRoutes.ts`

Sub-router mounted in `/api/servers` governing per-server SFTP configuration:
- `GET /api/servers/:serverId/ftp`: Returns FTP port, status, and username.
- `POST /api/servers/:serverId/ftp/toggle`: Enables or stops SFTP service.
- `POST /api/servers/:serverId/ftp/credentials`: Updates and hashes SFTP credentials.
- `GET /api/servers/:serverId/ftp/password`: Returns cached plaintext password for session inspection.

## Relationships
- Belongs to: [[Subsystem - Core Backend and Web Server]]
- Uses: [[SFTP Server]], [[Permissions System]], [[Database Access Layer]]
