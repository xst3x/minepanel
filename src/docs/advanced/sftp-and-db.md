---
type: doc
title: Per-Server SFTP & Database Schema
category: advanced
order: 3
---

# Per-Server SFTP & Database Schema

## Per-Server SFTP

Each server runs its own **SFTP daemon** (SSH File Transfer Protocol, not plain FTP) built on the **ssh2** library. Each daemon binds to a dedicated port and restricts access to the server's working directory.

### Key Details

- **Protocol**: SFTP over SSH2 (not FTP/FTPS)
- **Auth method**: Username + password (bcrypt-verified)
- **Root directory**: Server working directory — `servers/<name>/`
- **Host key**: RSA 2048-bit PKCS1 PEM, persisted to `data/sftp_host_key`

### Connecting with an SFTP Client

Use any SFTP-capable client. In **FileZilla**: Site Manager → Protocol: *SFTP – SSH File Transfer Protocol* → Host: panel IP → Port: configured SFTP port → Logon type: Normal → enter username & password.

## Database Schema

| Table | Purpose |
|---|---|
| `users` | id, username, password (bcrypt), role, disabled, rank_id, global_permissions (JSON) |
| `servers` | id, uuid, name, software, version, ram_mb, port, owner_id, directory_name, java_path, ftp_* columns |
| `user_server_permissions` | user_id × server_id × permission — individual grants |
| `ranks` | id, name, color, permissions (JSON map serverId→perm[]), global_permissions (JSON) |
| `account_creation_tokens` | token (hashed), rank_id, expires_at |
| `settings` | key/value store for panel-level config and per-user accent colors |
