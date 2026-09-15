---
title: Migration 019 - Add Sort Order to Ranks
type: migration
source_file: src/db/migrations/019_add_sort_order_to_ranks.ts
tags:
  - #database
  - #migration
  - #security
---

# Migration 019 - Add Sort Order to Ranks

Adds explicit ordering to user ranks to determine role precedence and UI display order.

## Schema Changes
- Added column to `ranks`:
  - `sort_order` (Integer, indexed)

## Related Architecture
- Model: [[Model - Rank]]
- Route: [[Rank Management Routes]]
- Service: [[Permissions System]]
