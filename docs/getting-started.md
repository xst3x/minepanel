# Getting Started

## Overview

MinePanel is a **self-hosted** Node.js control panel for Minecraft servers. It runs an Express API with a WebSocket layer and a single-page frontend — no external services, no Docker required.

**Stack:** Node.js + Express + SQLite + WebSocket. The entire panel is a single process.

**Supported server software:** Paper, Purpur, Vanilla, Fabric, Quilt, Forge (auto-installer), Magma. Any JAR-based server also works via **Import**.

## Requirements

| | |
|---|---|
| Node.js | ≥ 18.x |
| Java | In `PATH`, or a custom per-server path |
| OS | Windows, Linux, macOS |
| Ports | Web UI (default 8082) + your game server ports |

## Installation

### Option A — Setup Wizard (recommended)

```bash
# Windows
python setup.py

# Linux / macOS
python3 setup.py
```

Choose **1 · Install MinePanel**. The wizard will check/install Node.js, write a `.env` with a random `SECRET_KEY`, optionally configure HTTPS, run `npm install`, and optionally register a system service.

### Option B — Manual

```bash
git clone https://github.com/yourusername/MinePanel.git
cd MinePanel
cp .env.example .env
npm install
npm start
```

On first launch the panel creates `data/minepanel.db` and bootstraps the default admin account. **The credentials are printed to stdout — copy them before anything else.**

Open your browser at `http://localhost:8082`.

> **Important:** Set a strong `SECRET_KEY` in `.env` before exposing the panel to the internet.

## Directory Layout

| Path | Purpose |
|---|---|
| `src/` | Application source |
| `src/public/` | Static frontend (no build step) |
| `data/minepanel.db` | SQLite database |
| `servers/<name>/` | Working directory for each managed server |
| `cache/jars/` | Cached server JARs (re-used across installs) |
| `.env` | Runtime configuration — **never commit this** |

## Authentication

Auth is JWT-based. A token is issued on login and sent as `Authorization: Bearer <token>` on every subsequent API request. Tokens are also used for WebSocket auth — the first message after connecting must be `{"type":"auth","token":"<jwt>"}`.

**Registration is invite-only.** An admin generates a one-time token under **Users → Generate Token**. Tokens expire and are purged hourly.

## Panel Layout

**Sidebar — SERVERS:** Lists every server the current user has access to. Status dot updates live. Admins see all servers; regular users see only those they have at least one permission on.

**Sidebar — GLOBAL:**

| Item | Who can see it |
|---|---|
| Users | Everyone (non-managers see only themselves) |
| Ranks | Users with `account.manage` |
| Panel Settings | Admins and users with `panel.settings` |
| Docs | Everyone |

**Server Dashboard Tabs:** Overview · Console · Files · Plugins/Mods · Players · Properties · Backups · Logs · Settings · FTP
