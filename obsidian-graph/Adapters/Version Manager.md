---
title: "Version Manager"
type: "manager"
layer: "core"
source: "src/core/versionManager.ts"
tags:
  - minepanel
  - core
  - manager
---

# Version Manager

**Source**: `src/core/versionManager.ts`

`Version Manager` caches and provides software versions, supported Minecraft releases, and build numbers across all supported platforms. It queries upstream sources on startup and maintains an in-memory catalog for server creation and version switching.

## Relationships
- Belongs to: [[Subsystem - Software Resolvers and Updates]]
- Uses: [[Software Version Resolvers]]
- Initialized by: [[MinePanel Entrypoint]]
