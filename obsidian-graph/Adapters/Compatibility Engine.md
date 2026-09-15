---
title: "Compatibility Engine"
type: "engine"
layer: "core"
source: "src/core/update/CompatibilityEngine.ts"
tags:
  - minepanel
  - core
  - engine
---

# Compatibility Engine

**Source**: `src/core/update/CompatibilityEngine.ts`

`Compatibility Engine` enforces rules regarding Minecraft software, Java runtime versions, and plugins. For example, it prevents switching a 1.20.6 server to Java 8, or upgrading a Spigot server with incompatible legacy plugins without user confirmation.

## Relationships
- Belongs to: [[Subsystem - Software Resolvers and Updates]]
- Uses: [[Java Manager]]
- Used by: [[Update Manager]]
