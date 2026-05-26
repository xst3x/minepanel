# Users & Permissions

## Roles

| Role | Access |
|---|---|
| `admin` | Full access. Implicit wildcard `*`. Cannot be restricted by permission entries. |
| `user` | Access is entirely determined by the permission system. |

> Admins can disable accounts without deleting them. Disabled users are rejected at login.

## Permission Resolution Order

| Priority | Source |
|---|---|
| 1 | Role is `admin` → wildcard `*` |
| 2 | User's own `global_permissions` JSON column |
| 3 | Global permissions from the assigned rank |
| 4 | Per-server permissions from the assigned rank |
| 5 | Individual per-server entries in `user_server_permissions` |

No deny mechanic — a user has a permission if **any** source grants it. Computed on every request (no cache).

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
| `server.players.read` | Players | View list + inventory modal |
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
| `server.ftp.manage` | FTP | Configure and toggle FTP |
| `account.manage` | Global | Manage users, generate invite tokens |
| `panel.settings` | Global | Edit panel-level settings |

## Invite Tokens

Go to **Users → Generate Token**. The token is single-use, stored hashed, and shown in plaintext exactly once. Expired tokens are reaped hourly.

## Changing Passwords

Users change their own password from the Users view. Admins can reset any user's password. Passwords are bcrypt-hashed (10 rounds).

### Emergency Admin Reset

```bash
node -e "
const bcrypt = require('bcryptjs');
const { dbRun } = require('./src/db/database');
const hash = bcrypt.hashSync('newpassword', 10);
dbRun('UPDATE users SET password=? WHERE username=?', [hash, 'admin']);
"
```

Or use `python setup.py` → **2 · Reset user password**.
