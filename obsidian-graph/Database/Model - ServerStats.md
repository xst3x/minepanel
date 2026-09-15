---
title: "Model - ServerStats"
type: "model"
layer: "database"
source: "src/db/models/ServerStats.ts"
tags:
  - minepanel
  - database
  - model
---

# Model: ServerStats

**Source**: `src/db/models/ServerStats.ts`

Stores time-series resource utilization samples for analytics and dashboard charts.

## Fields
- `id`: Primary key
- `server_id`: Foreign key to [[Model - Server]]
- `cpu`: CPU percentage usage
- `ram`: Memory consumption in MB
- `tps`: Ticks per second (when available)
- `players_online`: Count of connected players
- `timestamp`: Sample recording time

## Relationships
- Belongs to: [[Subsystem - Database and Persistence]]
- Part of: [[Database Access Layer]]
