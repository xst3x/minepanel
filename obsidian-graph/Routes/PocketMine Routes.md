---
title: "PocketMine Routes"
type: "route"
layer: "backend"
source: "src/routes/pocketmineRoutes.ts"
tags:
  - minepanel
  - backend
  - route
---

# PocketMine Routes

**Source**: `src/routes/pocketmineRoutes.ts`

Specialized routes for PocketMine-MP servers:
- Scans PocketMine `.phar` plugins.
- Interfaces with the Poggit API to search and download PocketMine-compatible plugins.
- Toggles and deletes PocketMine plugins.

## Relationships
- Belongs to: [[Subsystem - Server Lifecycle and Adapters]]
- Uses: [[PocketMine Adapter]], [[Server Helper]], [[Permissions System]]
