---
title: "Modpack Service"
type: "service"
layer: "core"
source: "src/core/services/modpackService.ts"
tags:
  - minepanel
  - core
  - service
---

# Modpack Service

**Source**: `src/core/services/modpackService.ts`

`Modpack Service` interfaces with the Modrinth API to search, inspect, download, and install Minecraft modpacks (`.mrpack` archives). It extracts configuration files, downloads dependencies, and sets up modded server instances.

## Relationships
- Belongs to: [[Subsystem - Software Resolvers and Updates]]
- Uses: [[Server Helper]]
