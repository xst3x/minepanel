---
title: Migration 012 - Add TOTP Verified
type: migration
source_file: src/db/migrations/012_add_totp_verified.ts
tags:
  - #database
  - #migration
  - #security
---

# Migration 012 - Add TOTP Verified

Adds enrollment verification handshake boolean so 2FA is only enforced once the user confirms their first valid token.

## Schema Changes
- Added column to `users`:
  - `totp_verified` (Boolean)

## Related Architecture
- Handled in: [[Data Flow - Two-Factor Authentication and JWT]]
- Endpoint in: [[Auth Routes]]
