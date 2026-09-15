---
title: Migration 023 - Server API Keys IP Allowlist
type: migration
source_file: src/db/migrations/023_server_api_keys_ip_allowlist.ts
tags:
  - #database
  - #migration
  - #security
---

# Migration 023 - Server API Keys IP Allowlist

Adds CIDR / IP address restriction enforcement to server API keys for enhanced zero-trust security.

## Schema Changes
- Added column to `server_api_keys`:
  - `ip_allowlist` (JSON array of CIDR blocks or IP strings)

## Related Architecture
- Enforced by: [[API Key Auth Middleware]]
- Model: [[Model - ServerApiKey]]
- Route: [[Server API Key Management Routes]]
