---
title: Migration 009 - Add 2FA and Token Revocation
type: migration
source_file: src/db/migrations/009_add_2fa_and_token_revocation.ts
tags:
  - #database
  - #migration
  - #security
---

# Migration 009 - Add 2FA and Token Revocation

Implements core two-factor authentication columns and JWT invalidation timestamps.

## Schema Changes
- Added columns to `users`:
  - `two_factor_secret` (Encrypted TOTP secret)
  - `two_factor_enabled` (Boolean)
  - `token_revoked_at` (Timestamp for instant session termination)

## Related Architecture
- Implemented in: [[Data Flow - Two-Factor Authentication and JWT]]
- Verified by: [[Data Flow - Two-Factor Authentication and JWT]]
- Route: [[Auth Routes]]
