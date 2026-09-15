---
title: PocketMine Server Adapter
type: adapter
source_file: src/adapters/pocketmine.ts
tags:
  - #adapter
  - #backend
---

# PocketMine Server Adapter

Lifecycle and runtime supervisor for PocketMine-MP PHP-based Minecraft Bedrock servers.

## Execution Details
- Locates bundled or system PHP binary (\`bin/php/bin/php\` or \`bin/php7/bin/php\`).
- Launches \`PocketMine-MP.phar\` with custom memory limits.
- Manages \`pocketmine.yml\` and \`server.properties\` files.
- Handles plugin loading from \`plugins/\` folder.

## Related Architecture
- Subsystem: [[Subsystem - Server Lifecycle and Adapters]]
- Routes: [[PocketMine Plugin Routes]]
- UI View: [[Frontend Page - PocketMine Plugins]]
