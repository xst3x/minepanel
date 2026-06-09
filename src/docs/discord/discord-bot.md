---
type: doc
title: Discord Bot
category: discord
order: 1
---

# Discord Bot

## Overview & Features

MinePanel features a multi-bot Discord integration that provides real-time server console streaming, live server status updates, and command execution directly from Discord channels.

| Feature | Description |
|---|---|
| Multi-Bot System | Register multiple bots in the panel, each managing specific game servers. |
| Dedicated Categories | Each server gets a dedicated category with `#console`, `#commands`, and `#status` channels. |
| Customizable Names | Rename or move categories/channels on Discord; the bot tracks them by their ID. |
| Silent Logging | All bot messages suppress push notifications and unread badges. |
| Console Auto-Clear | Automatically deletes messages in the console channel when the server starts, stops, or restarts. |
| Instant Commands | Executing commands forwards input instantly and deletes the user message immediately. |
| Self-Healing | Missing or deleted channels are auto-detected and recreated in the background. |
| Offline Cleanup | When a bot or server is unassigned or deleted, the panel cleans up channels/roles on Discord and leaves the guild. |

## Slash Commands

Authorized users can run the following slash commands within the dedicated Discord channels:

| Command | Description |
|---|---|
| `/status` | Sends a status panel with Start, Stop, Restart, and Refresh buttons. |
| `/console [live]` | Streams a live console interface inside any channel. |
| `/stats [live]` | Streams live CPU and RAM resource usage graphs. |
| `/players` | Lists online players. |
| `/logs` | Browses, filters, and paginates server log files. |
| `/execute <cmd>` | Runs a console command directly on the server. |
| `/start \| /stop \| /restart` | Controls the server state. |
| `/init [server]` | Manually initializes or recreates the channels and roles for a server. |

> Most commands (except `/init`) will only execute inside the server's dedicated channels to keep other guild channels clean.
