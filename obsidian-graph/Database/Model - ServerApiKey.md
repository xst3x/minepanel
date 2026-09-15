---
title: "Model - ServerApiKey"
type: "model"
layer: "database"
source: "src/db/models/ServerApiKey.ts"
tags:
  - minepanel
  - database
  - model
---

# Model: ServerApiKey

**Source**: `src/db/models/ServerApiKey.ts`

Stores external developer API keys used for authenticating with `/api/v1/servers` and `/ws/serverapi`.

## Fields
- `id`: Primary key
- `name`: Key description
- `key_hash`: Argon2 hash of the API secret
- `server_id`: Foreign key to [[Model - Server]]
- `user_id`: Creator foreign key to [[Model - User]]
- `permissions`: Allowed scopes (JSON array)
- `ip_allowlist`: Permitted client IPs or CIDRs
- `expires_at`: Expiration timestamp

## Relationships
- Belongs to: [[Subsystem - Database and Persistence]]
- Part of: [[Database Access Layer]]
