---
title: PocketMine Plugin Routes
type: route
source_file: src/routes/pocketmineRoutes.ts
tags:
  - #route
  - #adapter
---

# PocketMine Plugin Routes

API endpoints for managing Bedrock Edition PocketMine-MP servers, poggit plugins, and PHP runtime dependencies.

## Endpoints
- \`GET /api/pocketmine/plugins/search\`: Searches Poggit plugin repository.
- \`POST /api/pocketmine/plugins/install\`: Downloads and installs \`.phar\` plugins to \`plugins/\`.
- \`GET /api/pocketmine/plugins/installed\`: Lists installed \`.phar\` plugins on server.

## Related Architecture
- Subsystem: [[Subsystem - Server Lifecycle and Adapters]]
- Adapter: [[PocketMine Adapter]]
- UI View: [[Frontend Page - PocketMine Plugins]]
