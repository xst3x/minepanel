---
title: Migration 015 - Auto Update Settings
type: migration
source_file: src/db/migrations/015_auto_update_settings.ts
tags:
  - #database
  - #migration
---

# Migration 015 - Auto Update Settings

Adds automatic software jar update configurations to the `servers` table.

## Schema Changes
- Added columns to `servers`:
  - `auto_update` (Boolean)
  - `auto_update_channel` ('stable' | 'beta')

## Related Architecture
- Managed by: [[Version Manager]]
- Worker: [[Version Fetcher]]
