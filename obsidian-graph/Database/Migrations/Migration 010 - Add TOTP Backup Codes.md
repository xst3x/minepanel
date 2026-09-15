---
title: Migration 010 - Add TOTP Backup Codes
type: migration
source_file: src/db/migrations/010_add_totp_backup_codes.ts
tags:
  - #database
  - #migration
  - #security
---

# Migration 010 - Add TOTP Backup Codes

Stores hashed single-use recovery codes for TOTP two-factor authentication.

## Schema Changes
- Added column to `users`:
  - `totp_backup_codes` (JSON array of hashed recovery codes)

## Related Architecture
- Managed by: [[Data Flow - Two-Factor Authentication and JWT]]
- Consumed in: [[Auth Routes]], [[User Management Routes]]
