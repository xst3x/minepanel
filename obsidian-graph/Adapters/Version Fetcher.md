---
title: "Version Fetcher"
type: "service"
layer: "core"
source: "src/core/versionFetcher.ts"
tags:
  - minepanel
  - core
  - service
---

# Version Fetcher

**Source**: `src/core/versionFetcher.ts`

Aggregates calls to all 17 upstream software resolvers in [[Software Version Resolvers]] to fetch the complete list of available versions for Vanilla, Snapshots, Paper, Purpur, Fabric, Forge, NeoForge, Quilt, Magma, Mohist, Arclight, Pufferfish, Leaves, Folia, Velocity, Waterfall, SpongeVanilla, and Bedrock.

## Relationships
- Belongs to: [[Subsystem - Software Resolvers and Updates]]
- Uses: [[Software Version Resolvers]]
- Used by: [[Version Manager]]
