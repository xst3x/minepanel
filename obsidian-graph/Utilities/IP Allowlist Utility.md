---
title: "IP Allowlist Utility"
type: "utility"
layer: "security"
source: "src/core/utils/ipAllowlist.ts"
tags:
  - minepanel
  - security
  - utility
---

# IP Allowlist Utility

**Source**: `src/core/utils/ipAllowlist.ts`

Validates client IP addresses against CIDR subnets and IP lists for external API keys and administrative endpoints.

## Relationships
- Belongs to: [[Subsystem - Authentication and Permissions]]
- Used by: [[API Key Authentication]], [[Server API WebSocket]]
