---
type: doc
title: Architecture Overview
category: getting-started
order: 2
---

# Architecture Overview

## General Architecture

### Sidebar — SERVERS section

Lists every server the current user has access to. Status dot updates live via WebSocket. Admins see all servers; non-admins see only those they have at least one permission on.

### Sidebar — GLOBAL section

| Item | Who can see it |
|---|---|
| `Users` | Everyone (self only for non-managers) |
| `Ranks` | Users with `account.manage` |
| `Panel Settings` | Admins and users with `panel.settings` |
| `Docs` | Everyone |

### Server Dashboard Tabs

Overview · Console · Files · Plugins/Mods · Players · Properties · Backups · Logs · Settings · FTP

## Authentication

Auth is JWT-based. A token is issued on login and sent as `Authorization: Bearer <token>` on every subsequent API request. Tokens are also used for WebSocket auth — the first message after connecting must be `{"type":"auth","token":"<jwt>"}`.

**Registration is invite-only.** An admin generates a one-time token under **Users → Generate Token**. Tokens expire and are purged hourly.
