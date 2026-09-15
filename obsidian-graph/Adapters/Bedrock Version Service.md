---
title: "Bedrock Version Service"
type: "service"
layer: "core"
source: "src/core/services/bedrockVersionService.ts"
tags:
  - minepanel
  - core
  - service
---

# Bedrock Version Service

**Source**: `src/core/services/bedrockVersionService.ts`

Dedicated service querying upstream Bedrock server versions using `minecraft-bedrock-server`. It caches release and preview platform binaries for Windows and Linux with a 6-hour TTL and fallback handlers.

## Relationships
- Belongs to: [[Subsystem - Software Resolvers and Updates]]
- Used by: [[Bedrock Adapter]]
