---
title: Migration 017 - Visual Automation Fields
type: migration
source_file: src/db/migrations/017_visual_automation_fields.ts
tags:
  - #database
  - #migration
  - #automation
---

# Migration 017 - Visual Automation Fields

Stores node-graph layout metadata (coordinates, blocks, connections) for visual automation workflows.

## Schema Changes
- Added column to `automation_rules`:
  - `visual_flow` (JSONB containing visual canvas nodes and edges)

## Related Architecture
- Consumed by: [[Automation Engine]], [[Frontend Automation View]]
