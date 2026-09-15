---
title: "Server Lifecycle Helpers"
type: "utility"
layer: "backend"
source: "src/routes/modules/serverHelpers.ts"
tags:
  - minepanel
  - backend
  - utility
---

# Server Lifecycle Helpers

**Source**: `src/routes/modules/serverHelpers.ts`

Provides helper utilities for server lifecycle execution:
- `getStartInfo(server)`: Resolves launch descriptors across Bedrock, PocketMine, and Java servers (stripping incompatible JVM flags).
- `importUpload`: Multer file upload handler supporting up to 50 GB server zip imports.
- `runForgeInstaller` & `runNeoForgeInstaller`: Automated execution of modded installer jars.
- `buildDefaultStartCommand`: Generates command string for custom launch options.

## Relationships
- Belongs to: [[Subsystem - Server Lifecycle and Adapters]]
- Uses: [[Bedrock Adapter]], [[PocketMine Adapter]], [[Server Helper]]
