---
title: "Concept - Granular Permissions and Ranks"
type: "concept"
layer: "domain"
source: "src/core/permissions.ts"
tags:
  - minepanel
  - domain
  - concept
---

# Domain Concept: Granular Permissions and Ranks

MinePanel uses a two-tier access model combining role-based access control (RBAC) with granular per-server permission overrides.

## Scope Taxonomy
1. **Global Permissions**: `account.manage`, `server.create`, `panel.settings`, `panel.users`.
2. **Server Lifecycle**: `server.start`, `server.stop`, `server.restart`, `server.kill`.
3. **Console**: `server.console.read`, `server.console.write`, `server.console.chat.send`.
4. **Files & Backups**: `server.files.read`, `server.files.write`, `server.files.delete`, `server.backups.create`, `server.backups.restore`.
5. **Administration**: `server.players.manage`, `server.plugins.manage`, `server.properties.write`, `server.automation.write`.

## Evaluation Order
Global Admin (`admin` role) → Global Rank Permissions → Server User Rank → Granular Server Overrides.

## Relationships
- Implemented in: [[Permissions System]]
- Entities: [[Model - Rank]], [[Model - User]]
