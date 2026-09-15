---
title: "Forge Resolver"
type: "resolver"
layer: "core"
source: "src/core/resolvers/forge.ts"
tags:
  - minepanel
  - core
  - resolver
---

# Forge Resolver

**Source**: `src/core/resolvers/forge.ts`

Fetches Minecraft Forge installer binaries from Maven files. Dispatches installation tasks to [[Server Lifecycle Helpers]] to run the headless `--installServer` routine for modern (1.17+) and legacy (<=1.16) Forge formats.

## Relationships
- Belongs to: [[Subsystem - Software Resolvers and Updates]]
- Uses: [[Server Lifecycle Helpers]]
