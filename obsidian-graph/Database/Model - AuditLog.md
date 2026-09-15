---
title: "Model - AuditLog"
type: "model"
layer: "database"
source: "src/db/models/AuditLog.ts"
tags:
  - minepanel
  - database
  - model
---

# Model: AuditLog

**Source**: `src/db/models/AuditLog.ts`

Stores immutable security audit trail entries for sensitive operations performed in the panel.

## Fields
- `id`: Primary key
- `user_id`: Acting user identifier
- `action`: Event code (e.g. `auth.login`, `server.delete`, `permission.grant`)
- `target_type`, `target_id`: Affected resource
- `ip_address`: Client IP address
- `details`: JSON metadata describing the change
- `timestamp`: Timestamp of event

## Relationships
- Belongs to: [[Subsystem - Database and Persistence]]
- Part of: [[Database Access Layer]]
- Written by: [[Audit Logger]]
