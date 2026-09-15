---
title: Migration 020 - Modpack Metadata
type: migration
source_file: src/db/migrations/020_modpack_metadata.ts
tags:
  - #database
  - #migration
---

# Migration 020 - Modpack Metadata

Stores external platform references (Modrinth / CurseForge modpack IDs and version IDs) on server records.

## Schema Changes
- Added columns to `servers`:
  - `modpack_id` (String)
  - `modpack_version_id` (String)
  - `modpack_platform` ('modrinth' | 'curseforge')

## Related Architecture
- Managed by: [[Modpack Service]], [[Modpack Service]]
- Route: [[Modpack Routes]]
