---
title: "Software Version Resolvers"
type: "service"
layer: "core"
source: "src/core/resolvers/index.ts"
tags:
  - minepanel
  - core
  - service
---

# Software Version Resolvers

**Source**: `src/core/resolvers/index.ts`

The `Software Version Resolvers` module is a comprehensive registry of download resolvers for Minecraft server server.jar binaries. It aggregates individual platform resolvers:
- **PaperMC Family**: `paper.ts`, `purpur.ts`, `pufferfish.ts`, `leaves.ts`, `folia.ts`, `velocity.ts`, `waterfall.ts`
- **Modded Hybrids**: `forge.ts`, `neoforge.ts`, `fabric.ts`, `quilt.ts`, `mohist.ts`, `magma.ts`, `arclight.ts`, `spongevanilla.ts`
- **Vanilla & Bedrock**: `vanilla.ts`, `bedrock/index.ts`

## Key Functions
- `resolveJar(software, version, build)`: Contacts upstream API (Paper API, Purpur API, Mojang Version Manifest, Fabric Meta, NeoForged Maven) to obtain direct artifact download URLs and SHA256 checksums.
- `downloadJar(url, targetPath)`: Streams jar files to disk with integrity validation.

## Relationships
- Belongs to: [[Subsystem - Software Resolvers and Updates]]
- Used by: [[Version Manager]], [[Update Manager]]
