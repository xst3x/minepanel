---
title: "Properties Routes"
type: "route"
layer: "backend"
source: "src/routes/propertiesRoutes.ts"
tags:
  - minepanel
  - backend
  - route
---

# Properties Routes

**Source**: `src/routes/propertiesRoutes.ts`

Handles reading and writing Minecraft server configuration files:
- Java Edition: `server.properties`
- Bedrock Edition: `server.properties` and `permissions.json`
- PocketMine-MP: `pocketmine.yml`

Performs key-value parsing, type validation, and atomic file saving.

## Relationships
- Belongs to: [[Subsystem - Server Lifecycle and Adapters]]
- Uses: [[Server Helper]], [[Permissions System]]
