---
title: "PocketMine Adapter"
type: "adapter"
layer: "adapter"
source: "src/adapters/pocketmine.ts"
tags:
  - minepanel
  - adapter
  - adapter
---

# PocketMine Adapter

**Source**: `src/adapters/pocketmine.ts`

`PocketMine Adapter` handles execution and configuration for PocketMine-MP, a high-performance PHP-based Minecraft Bedrock server engine.

## Key Functions
- `isPocketMine(software)`: Checks if software matches PocketMine-MP.
- `getPocketMineLaunchDescriptor(server, serverDir)`: Returns execution configuration locating the bundled PHP binary (`bin/php/php.exe` or `bin/php7/bin/php`) and `PocketMine-MP.phar`.
- Manages PocketMine `.phar` plugin installations and updates.

## Relationships
- Belongs to: [[Subsystem - Server Lifecycle and Adapters]]
- Used by: [[Real Process Manager]], [[Server Lifecycle Routes]], [[MinePanel Entrypoint]]
