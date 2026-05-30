<div align="center">

<img src="assets/logo.png" alt="MinePanel Logo" width="120" />

# MinePanel

**A self-hosted Minecraft server management panel**

[![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org)
[![SQLite](https://img.shields.io/badge/SQLite-3-003B57?style=flat-square&logo=sqlite&logoColor=white)](https://sqlite.org)
[![WebSocket](https://img.shields.io/badge/WebSocket-live-4A90E2?style=flat-square)](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket)
[![License](https://img.shields.io/badge/license-GPL%203.0-blue?style=flat-square)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20Linux%20%7C%20macOS-lightgrey?style=flat-square)](https://github.com)

Multi-server · Real-time console · Role-based access · No external services

</div>

---

MinePanel is a lightweight, self-hosted web panel for managing Minecraft servers. Built on Node.js + Express with a real-time WebSocket console, it gives you full control over your servers from any browser — no Docker, no cloud account, no monthly fees.

> Designed for homelabs, small communities, and server networks that want a clean interface without the bloat.

---

## Features

<details>
<summary><strong>Server Management</strong></summary>

- **Multi-server support** — create, start, stop, restart, and kill any number of servers
- **Software support** — Vanilla, Paper, Purpur, Fabric, Forge, Quilt, Magma — any JAR-based server via Import
- **Version management** — change Minecraft version or switch server software with one click
- **Forge installer** — full automated Forge installation for modern (1.17+) and legacy (≤1.16) formats
- **Server import** — import existing servers from `.zip` archives
- **Auto-backup before risky operations** — rollback backup always created before version/software switches

</details>

<details>
<summary><strong>Real-Time Console</strong></summary>

- **Live WebSocket console** — stream server stdout/stderr directly in the browser
- **Command input** — send commands to the server from the panel (permission-gated)
- **Console history** — buffered per-server in memory, replayed to new connections on join

</details>

<details>
<summary><strong>File Manager</strong></summary>

- **Full file browser** — browse, create, rename, delete files and folders
- **In-browser editor** — CodeMirror 5 with syntax highlighting for `.yml`, `.json`, `.properties`, `.sh`, and more
- **Upload & download** — upload single files (up to 100 MB); download files or entire folders as `.zip`
- **One-time download tokens** — secure temporary links for folder downloads (auto-expire in 5 min)
- **Path traversal protection** — all paths are sandboxed to the server directory

</details>

<details>
<summary><strong>Plugin & Mod Management</strong></summary>

- **Modrinth integration** — search and install plugins/mods directly from the panel
- **Enable / disable** — toggle plugins/mods by renaming `.jar` ↔ `.jar.disabled`
- **Upload** — drop JARs directly into the plugin/mod folder from the panel

</details>

<details>
<summary><strong>Backup System</strong></summary>

- **Manual backups** — create a backup at any time
- **Scheduled backups** — configure per-server backup intervals (checked hourly)
- **Restore** — restore any backup with one click (server must be offline)
- **Auto-backup on change** — rollback backup created automatically before version/software switches

</details>

<details>
<summary><strong>User & Permission System</strong></summary>

- **Role-based access** — `admin` role has full access; `user` role is governed by the permission system
- **Granular permissions** — 25+ permission keys covering every panel action, assigned per-user per-server
- **Rank system** — define reusable permission bundles; rank edits propagate instantly to all users
- **Invite tokens** — one-time registration tokens with pre-assigned ranks
- **Account disable** — suspend users without deleting their data

</details>

<details>
<summary><strong>FTP Access</strong></summary>

- **Per-server FTP** — enable a dedicated FTP server per Minecraft server with custom credentials and port
- **Toggle on/off** — start/stop FTP access per server from the panel

</details>

<details>
<summary><strong>Discord Bot Integration</strong></summary>

- **Multi-bot system** — link multiple Discord bots to manage different sets of servers
- **Live console bridge** — bidirectional console streaming between Minecraft and Discord
- **Remote control** — run slash commands for start, stop, restart, backup, logs, and stats
- **Zero-spam notifications** — all status notifications and console messages suppress push notifications/unread badges
- **Auto-clean logs** — console channels clear automatically on server status transitions to keep history fresh
- **Command channel protection** — restrict execute commands to authorized channels with automatic user input message cleanup
- **Self-healing categories** — automatic recreation of server categories and console/commands/status channels if deleted on Discord
- **Automatic deprovisioning** — cleans up Discord channels and roles automatically when a bot is deleted or settings are updated

</details>

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 18+ |
| Web framework | Express 4 |
| Real-time | `ws` (WebSocket) |
| Database | SQLite 3 (`sqlite3`) |
| Auth | `jsonwebtoken` + `bcryptjs` |
| File uploads | Multer |
| Archiving | Archiver, adm-zip |
| FTP | ftp-srv |
| NBT parsing | prismarine-nbt |
| Process stats | pidusage |
| Discord integration | discord.js |

No build step. The frontend is plain HTML/CSS/JS served as static files.

---

## Getting Started

### Prerequisites

- **Node.js** v18 or higher
- **Java** installed and in `PATH`
- **Python 3** (optional — for the setup wizard)

### Quick Setup (Recommended)

```bash
# Windows
python setup.py

# Linux / macOS
python3 setup.py
```

### Manual Setup

```bash
git clone https://github.com/yourusername/MinePanel.git
cd MinePanel
npm install
cp .env.example .env   # set SECRET_KEY and other values
npm start
```

Open `http://localhost:8082`. On first run the default admin credentials are printed to stdout — **copy them immediately**.

---

## Configuration

```env
PORT=8082
SECRET_KEY=your-secret-here     # required — signs all JWT tokens
JWT_EXPIRES_IN=24h
ALLOWED_ORIGINS=*               # set to your domain in production
RATE_LIMIT=100
HTTPS=false
HTTPS_KEY=certs/key.pem
HTTPS_CERT=certs/cert.pem
```

See [`docs/configuration.md`](docs/configuration.md) for the full reference including Nginx and systemd setup.

---

## Project Structure

```
MinePanel/
├── src/
│   ├── index.js              # Entry point
│   ├── core/
│   │   ├── processManager.js # Minecraft process lifecycle + console buffer
│   │   ├── resolvers.js      # JAR download + version resolution
│   │   ├── ftpServer.js      # Per-server FTP
│   │   ├── discord/          # Discord Bot integration (manager, commands, provisioner)
│   │   └── ...
│   ├── db/database.js        # SQLite init + helpers
│   ├── routes/               # Express route handlers
│   └── public/               # Frontend static files (no build step)
├── servers/                  # Per-server working directories
├── data/minepanel.db         # SQLite database
├── cache/jars/               # Cached server JARs
├── setup.py                  # Cross-platform setup wizard
└── .env.example              # Config template
```

---

## API Overview

All routes are under `/api/`. Most require `Authorization: Bearer <jwt>`.

| Prefix | Description |
|---|---|
| `POST /api/auth/login` | Obtain a JWT token |
| `/api/servers` | CRUD + lifecycle (start/stop/restart/kill) + version/software change + import |
| `/api/servers/:id/files` | File manager |
| `/api/servers/:id/plugins` | Plugin/mod management |
| `/api/servers/:id/backups` | Backup management |
| `/api/servers/:id/players` | Player list + kick/ban/op |
| `/api/servers/:id/properties` | server.properties + server icon |
| `/api/servers/:id/ftp` | Per-server FTP |
| `/api/users` | User management |
| `/api/ranks` | Rank management |
| `/api/system` | System info + panel settings |

WebSocket: `ws://<host>:<port>/ws?serverId=<id>` (send `{"type":"auth","token":"<jwt>"}` as first message)

---

## Permissions Reference

| Key | Group |
|---|---|
| `server.start` / `stop` / `restart` / `kill` | Lifecycle |
| `server.console.read` / `write` | Console |
| `server.files.read` / `write` / `delete` | Files |
| `server.players.read` / `kick` / `ban` / `op` | Players |
| `server.plugins.read` / `manage` | Plugins |
| `server.backups.read` / `create` / `restore` / `delete` | Backups |
| `server.properties.read` / `write` | Properties |
| `server.logs.read` | Logs |
| `server.ftp.access` / `manage` | FTP |
| `account.manage` | Global |
| `panel.settings` | Global |

---

## Documentation

Full docs are available in the [`docs/`](docs/) folder and inside the panel under **Docs** in the sidebar.

- [Getting Started](docs/getting-started.md)
- [Server Management](docs/server-management.md)
- [Users & Permissions](docs/users-permissions.md)
- [Ranks](docs/ranks.md)
- [Configuration](docs/configuration.md)
- [Advanced / Internals](docs/advanced.md)
- [Discord Bot Integration](docs/discord-bot.md)

---

## License

GNU GPLv3 — free to use, modify, and distribute.

---