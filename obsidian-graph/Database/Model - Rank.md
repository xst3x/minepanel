---
title: "Model - Rank"
type: "model"
layer: "database"
source: "src/db/models/Rank.ts"
tags:
  - minepanel
  - database
  - model
---

# Model: Rank

**Source**: `src/db/models/Rank.ts`

Represents a reusable permission role (e.g. Owner, Admin, Manager, Helper, Player).

## Fields
- `id`: Primary key
- `name`: Role name
- `color`: Hex color code for UI badges
- `is_builtin`: Boolean flag protecting built-in ranks from deletion
- `global_permissions`: JSON array of panel-wide permission keys
- `permissions`: JSON array of server-specific permission keys

## Relationships
- Belongs to: [[Subsystem - Database and Persistence]]
- Part of: [[Database Access Layer]]
- Referenced by: [[Model - User]]
