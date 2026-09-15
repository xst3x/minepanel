---
title: "Config Module"
type: "config"
layer: "core"
source: "src/config.ts"
tags:
  - minepanel
  - core
  - config
---

# Config Module

**Source**: `src/config.ts`

Central application configuration resolving `PORT`, `HTTPS_ENABLED`, `HTTPS_KEY`, `HTTPS_CERT`, `ALLOWED_ORIGINS`, and `RATE_LIMIT` from process environment and defaults.

## Relationships
- Belongs to: [[Subsystem - Core Backend and Web Server]]
- Used by: [[MinePanel Entrypoint]]
