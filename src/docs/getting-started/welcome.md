---
type: doc
title: Welcome to MinePanel
category: getting-started
order: 1
---

# Welcome to MinePanel

MinePanel is a modern, lightweight Minecraft server management dashboard designed for ease of use, security, and homelab friendliness.

## Features at a Glance

- Automatic software installation & updates
- Real-time console stream & command execution
- Sandboxed multi-user file explorer & uploader
- Automated scheduled backups & logs retention
- Per-server sandboxed SFTP daemon
- Multi-bot Discord integration with console stream & slash commands

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
