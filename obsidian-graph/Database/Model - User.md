---
title: "Model - User"
type: "model"
layer: "database"
source: "src/db/models/User.ts"
tags:
  - minepanel
  - database
  - model
---

# Model: User

**Source**: `src/db/models/User.ts`

Represents a panel user account with authentication and access control details.

## Fields & Relations
- `id`: Primary key
- `username`: Unique account handle
- `password`: Argon2 or bcrypt password hash
- `role`: Global role (`admin` or `user`)
- `rank_id`: Foreign key to [[Model - Rank]]
- `two_factor_secret`, `two_factor_enabled`, `backup_codes`: TOTP 2FA data
- `is_disabled`: Suspended user flag
- **Has Many**: [[Model - Server]] (as owner)
- **Belongs To**: [[Model - Rank]]

## Relationships
- Belongs to: [[Subsystem - Database and Persistence]]
- Part of: [[Database Access Layer]]
