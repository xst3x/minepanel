---
title: Authentication Core Service
type: security
source_file: src/core/auth.ts
tags:
  - #security
  - #core
  - #backend
---

# Authentication Core Service

Core cryptographic service managing password hashing, JWT creation/validation, and two-factor TOTP operations.

## Security Algorithms
- **Password Hashing**: \`bcrypt\` with configurable work factor (default 12 rounds).
- **JWT Issuance**: Signed with HS256 / RS256 algorithm using secret from [[Config Module]].
- **TOTP Engine**: RFC 6238 compliant time-based one-time password generation using HMAC-SHA1.
- **Backup Codes**: Cryptographically secure random alphanumeric emergency recovery tokens stored as hashes: [[Migration 010 - Add TOTP Backup Codes]].

## Session Invalidation
- Instant revocation support using \`token_revoked_at\` timestamp comparison: [[Migration 009 - Add 2FA and Token Revocation]].

## Related Architecture
- Subsystem: [[Subsystem - Authentication and Permissions]]
- Flow: [[Data Flow - Two-Factor Authentication and JWT]]
- Routes: [[Auth Routes]], [[User Management Routes]]
- Model: [[Model - User]]
