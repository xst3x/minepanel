---
title: Bedrock Dedicated Adapter
type: adapter
source_file: src/adapters/bedrock.ts
tags:
  - #adapter
  - #backend
---

# Bedrock Dedicated Adapter

Adapter handling execution, console I/O, and lifecycle management for official Minecraft Bedrock Dedicated Server (BDS) executables.

## Implementation Details
- Spawns native BDS binaries (\`bedrock_server.exe\` on Windows, \`bedrock_server\` ELF on Linux).
- Sets required environment variables (\`LD_LIBRARY_PATH=.\`).
- Manages \`server.properties\` and \`permissions.json\` configuration files for Bedrock protocols.
- Parses BDS console log format to track player connections and world loading events.

## Related Architecture
- Subsystem: [[Subsystem - Server Lifecycle and Adapters]]
- Companion: [[Bedrock Version Service]]
- Contrast with: [[PocketMine Adapter]]
