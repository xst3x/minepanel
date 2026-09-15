---
title: "Model - UserServerPermission"
type: "model"
layer: "database"
source: "src/db/models/UserServerPermission.ts"
tags:
  - minepanel
  - database
  - model
---

# Model: UserServerPermission

**Source**: `src/db/models/UserServerPermission.ts`

Join table storing granular per-user per-server permission grants (e.g. allowing User 3 `server.console.write` specifically on Server 7).

## Relationships
- Part of: [[Database Access Layer]]
- Evaluated by: [[Permissions System]]
- Connects: [[Model - User]] to [[Model - Server]]
