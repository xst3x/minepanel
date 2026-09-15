---
title: Velocity Resolver
type: resolver
source_file: src/core/resolvers/velocity.ts
tags:
  - #resolver
  - #backend
---

# Velocity Resolver

Resolves Velocity modern proxy server builds from PaperMC's Downloads API (`api.papermc.io`).

## Key Responsibilities
- Queries PaperMC API for `velocity` project versions and build numbers.
- Supplies standalone proxy server jar packages.

## Related Architecture
- Registered in: [[Software Version Resolvers]]
- PaperMC family: [[Paper Resolver]], [[Waterfall Resolver]], [[Folia Resolver]]
