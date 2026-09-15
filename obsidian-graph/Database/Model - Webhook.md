---
title: "Model - Webhook"
type: "model"
layer: "database"
source: "src/db/models/Webhook.ts"
tags:
  - minepanel
  - database
  - model
---

# Model: Webhook

**Source**: `src/db/models/Webhook.ts`

Represents an automated HTTP webhook notification endpoint registered for a Minecraft server.

## Fields
- `id`: Primary key
- `server_id`: Foreign key to [[Model - Server]]
- `event`: Trigger event (`server_start`, `server_stop`, `crash`, `backup_completed`)
- `url`: Destination HTTP/HTTPS endpoint
- `active`: Boolean status flag

## Relationships
- Belongs to: [[Subsystem - Database and Persistence]]
- Part of: [[Database Access Layer]]
- Managed by: [[Webhook Manager]]
