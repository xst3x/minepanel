---
type: doc
title: Roles & Permissions
category: users
order: 1
---

# Roles & Permissions

## Roles

There are two built-in roles, stored in the `users.role` column.

| Role | Access |
|---|---|
| `admin` | Full access to everything. Implicit wildcard permission `*`. Cannot be restricted by individual permission entries. |
| `user` | Access is entirely determined by the permission system — the role alone grants nothing. |

> Admins can disable accounts without deleting them. Disabled users are rejected at login regardless of credentials.

## Permission Resolution

Permissions are resolved in the following order. A user has a permission if *any* source grants it — there is no deny mechanic.

| Priority | Source |
|---|---|
| 1 | Role is `admin` → wildcard `*`, skip all other checks |
| 2 | User's own `global_permissions` JSON column |
| 3 | Global permissions from the assigned rank |
| 4 | Per-server permissions from the assigned rank for the current server |
| 5 | Individual per-server entries in `user_server_permissions` table |

## Invite Tokens

Registration is closed by default. An admin generates a token (Users → Generate Token), optionally pre-assigns a rank, and shares the 32-char hex string out-of-band.

The token is single-use. Expired tokens are reaped from the database every hour.

> Tokens are stored hashed. The plaintext is shown exactly once after generation — if you close the modal it cannot be recovered.

## Changing Passwords

Users can change their own password from the Users view. Admins can reset any user's password. Passwords are hashed with bcrypt (10 rounds).

If the admin account password is lost and no other admin exists, reset it directly on the host using Node:

```bash
node -e "
const bcrypt = require('bcryptjs');
const { dbRun } = require('./src/db/database');
const hash = bcrypt.hashSync('newpassword', 10);
dbRun('UPDATE users SET password=? WHERE username=?', [hash, 'admin']);
"
```

## Full Permission Reference

| Key | Group | Notes |
|---|---|---|
| `server.start` | Lifecycle | |
| `server.stop` | Lifecycle | |
| `server.restart` | Lifecycle | |
| `server.kill` | Lifecycle | Force-kill the OS process |
| `server.console.read` | Console | Receive WebSocket console output |
| `server.console.write` | Console | Send commands via WebSocket |
| `server.files.read` | Files | List, read, download |
| `server.files.write` | Files | Create, edit, upload |
| `server.files.delete` | Files | |
| `server.players.read` | Players | View player list + inventory modal |
| `server.players.kick` | Players | |
| `server.players.ban` | Players | |
| `server.players.op` | Players | OP / DeOP |
| `server.players.manage` | Players | All player commands via console |
| `server.plugins.read` | Plugins | List plugins/mods |
| `server.plugins.manage` | Plugins | Enable, disable, delete, upload |
| `server.backups.read` | Backups | List + download |
| `server.backups.create` | Backups | Manual + auto-backup config |
| `server.backups.restore` | Backups | |
| `server.backups.delete` | Backups | |
| `server.properties.read` | Settings | View server.properties |
| `server.properties.write` | Settings | Edit properties, change version/software |
| `server.logs.read` | Logs | View log files |
| `server.ftp.access` | FTP | View FTP credentials |
| `server.ftp.manage` | FTP | Configure and toggle FTP server |
| `account.manage` | Global | Manage users, generate invite tokens |
| `panel.settings` | Global | Edit panel-level settings |
