---
title: Pufferfish Resolver
type: resolver
source_file: src/core/resolvers/pufferfish.ts
tags:
  - #resolver
  - #backend
---

# Pufferfish Resolver

Resolves high-performance Pufferfish Paper fork builds via Jenkins / Pufferhost API.

## Key Responsibilities
- Queries build jobs and resolves optimized server jars for large player counts.
- Verifies upstream Paper compatibility.

## Related Architecture
- Registered in: [[Software Version Resolvers]]
- Performance: [[Paper Resolver]], [[Purpur Resolver]]
