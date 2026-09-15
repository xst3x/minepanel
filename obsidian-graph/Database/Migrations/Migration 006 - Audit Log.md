---
title: Migration 006 - Audit Log
type: migration
source_file: src/db/migrations/006_audit_log.ts
tags:
  - #database
  - #migration
  - #security
---

# Migration 006 - Audit Log

Expands security audit logging with metadata, IP address tracking, and structured event payloads.

## Schema Changes
- Updated `audit_logs` table:
  - Added `ip_address`, `user_agent`, `target_server_id`, `metadata` (JSONB)

## Related Architecture
- Model: [[Model - AuditLog]]
- Middleware: [[Request Logger Middleware]]
- Auth: [[Subsystem - Authentication and Permissions]]
