---
title: "NeoForge Resolver"
type: "resolver"
layer: "core"
source: "src/core/resolvers/neoforge.ts"
tags:
  - minepanel
  - core
  - resolver
---

# NeoForge Resolver

**Source**: `src/core/resolvers/neoforge.ts`

Queries the **NeoForged Maven API** for NeoForge server versions. Handles headless installer downloads and auto-generates `run.bat`/`run.sh` launch scripts for NeoForge 1.20.2+.

## Relationships
- Belongs to: [[Subsystem - Software Resolvers and Updates]]
- Uses: [[Server Lifecycle Helpers]]
