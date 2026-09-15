---
title: Migration 014 - Add Extra Ports
type: migration
source_file: src/db/migrations/014_add_extra_ports.ts
tags:
  - #database
  - #migration
---

# Migration 014 - Add Extra Ports

Enables allocation of auxiliary network ports (Votifier, Geyser, Dynmap, Voice Chat) per server instance.

## Schema Changes
- Added column to `servers`:
  - `extra_ports` (JSON array of port objects)

## Related Architecture
- Managed by: [[Execution Manager]]
- Route: [[Server Management Routes]]
