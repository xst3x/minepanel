---
title: Mohist Resolver
type: resolver
source_file: src/core/resolvers/mohist.ts
tags:
  - #resolver
  - #backend
---

# Mohist Resolver

Fetches MohistMC server builds (Forge/NeoForge + Paper hybrid) from Mohist's distribution API.

## Key Responsibilities
- Retrieves release channels and build hashes.
- Validates Java runtime version compatibility.

## Related Architecture
- Registered in: [[Software Version Resolvers]]
- Partner: [[Magma Resolver]], [[Arclight Resolver]]
