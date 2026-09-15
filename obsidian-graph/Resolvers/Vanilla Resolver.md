---
title: Vanilla Resolver
type: resolver
source_file: src/core/resolvers/vanilla.ts
tags:
  - #resolver
  - #backend
---

# Vanilla Resolver

Fetches official Mojang Minecraft Java Edition versions directly from Mojang's official Version Manifest API (`launchermeta.mojang.com`).

## Key Responsibilities
- Queries Mojang version manifest JSON.
- Resolves official server jar download URLs, release dates, and SHA-1 hashes.
- Categorizes versions into 'release' and 'snapshot'.

## Related Architecture
- Registered in: [[Software Version Resolvers]]
- Subsystem: [[Subsystem - Software Resolvers and Updates]]
- Service: [[Version Fetcher]]
