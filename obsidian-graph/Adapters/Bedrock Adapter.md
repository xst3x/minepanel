---
title: "Bedrock Adapter"
type: "adapter"
layer: "adapter"
source: "src/adapters/bedrock.ts"
tags:
  - minepanel
  - adapter
  - adapter
---

# Bedrock Adapter

**Source**: `src/adapters/bedrock.ts`

`Bedrock Adapter` implements execution descriptors and configuration management for official Minecraft Bedrock Dedicated Server (BDS) binaries on Windows and Linux.

## Key Functions
- `isBedrock(software)`: Checks if server software matches `bedrock` or `bds`.
- `getBedrockLaunchDescriptor(server, serverDir)`: Returns launch arguments, executable binary name (`bedrock_server.exe` on Windows, `./bedrock_server` on Linux), and environment variables (`LD_LIBRARY_PATH=.`).
- Configures `server.properties` and `permissions.json`.

## Relationships
- Belongs to: [[Subsystem - Server Lifecycle and Adapters]]
- Used by: [[Real Process Manager]], [[Server Lifecycle Routes]], [[MinePanel Entrypoint]]
