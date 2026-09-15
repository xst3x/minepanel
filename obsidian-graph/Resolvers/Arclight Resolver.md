---
title: Arclight Resolver
type: resolver
source_file: src/core/resolvers/arclight.ts
tags:
  - #resolver
  - #backend
---

# Arclight Resolver

Resolves Arclight hybrid server implementations across Forge, Fabric, and NeoForge branches.

## Key Responsibilities
- Queries GitHub release assets and Maven repositories for Arclight jars.
- Normalizes version naming across distinct mod engine branches.

## Related Architecture
- Registered in: [[Software Version Resolvers]]
- Generic helper: [[GitHub Java Resolver]]
