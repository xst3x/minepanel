---
title: "STAGE_1_SECURITY"
type: "plan"
tags:
  - #plan
  - #architecture
---

# STAGE_1_SECURITY

> Internal development plan for [[Project]].

# STAGE 1: SECURITY HARDENING
**Duration:** Day 1-5 (Approx. 22 hours)
**Status:** CRITICAL

## STAGE GOAL
Fix all critical authentication and file security vulnerabilities. 

## TASKS
1. **Case-Sensitive Username:** Use `LOWER()` in SQL queries to prevent shadowing.
2. **Rate Limiting:** Add `express-rate-limit` to `/login`.
3. **Password Validator:** Create `src/core/utils/passwordValidator.js`.
4. **Path Traversal:** Validate paths in `src/routes/fileRoutes.js` using `path.resolve`.
5. **JWT Logout:** Implement `invalidatedTokens` Set.
6. **Security Headers:** Add CSP, HSTS, X-Frame-Options in `src/index.js`.


## Related Architecture
- Overview: [[Project]]
- Roadmap: [[MASTER_ROADMAP]]


## Architecture Connections
- Security Layer: [[Subsystem - Authentication and Permissions]]
- Auth Core: [[Authentication Core Service]]
- Token Revocation: [[Migration 009 - Add 2FA and Token Revocation]]
- API Keys: [[Migration 022 - Server API Keys]], [[API Key Auth Middleware]]
