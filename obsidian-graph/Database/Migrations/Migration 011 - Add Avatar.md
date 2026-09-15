---
title: Migration 011 - Add Avatar
type: migration
source_file: src/db/migrations/011_add_avatar.ts
tags:
  - #database
  - #migration
---

# Migration 011 - Add Avatar

Adds user profile avatar image path or URL support.

## Schema Changes
- Added column to `users`:
  - `avatar` (String / Path)

## Related Architecture
- Managed by: [[User Management Routes]]
- Model: [[Model - User]]
