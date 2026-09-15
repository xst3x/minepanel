---
title: Migration 022 - Server API Keys
type: migration
source_file: src/db/migrations/022_server_api_keys.ts
tags:
  - #database
  - #migration
  - #security
---

# Migration 022 - Server API Keys

Introduces scoped API keys for headless programmatic management of individual Minecraft servers.

## Schema Changes
- Created `server_api_keys` table:
  - `id` (UUID)
  - `server_id` (Foreign key)
  - `key_hash` (Hashed secret)
  - `name` (Label)
  - `permissions` (Array of granted actions)
  - `last_used_at` (Timestamp)
  - `expires_at` (Timestamp)

## Related Architecture
- Model: [[Model - ServerApiKey]]
- Middleware: [[API Key Auth Middleware]]
- Route: [[Server API Key Management Routes]], [[External Server API Routes]]
