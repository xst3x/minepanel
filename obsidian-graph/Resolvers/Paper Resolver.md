---
title: "Paper Resolver"
type: "resolver"
layer: "core"
source: "src/core/resolvers/paper.ts"
tags:
  - minepanel
  - core
  - resolver
---

# Paper Resolver

**Source**: `src/core/resolvers/paper.ts`

Connects to the official **PaperMC v2 REST API** (`api.papermc.io`). It fetches project versions, builds, and direct jar download URLs for PaperMC servers, validating SHA256 build checksums.

## Relationships
- Belongs to: [[Subsystem - Software Resolvers and Updates]]
- Part of: [[Software Version Resolvers]]
