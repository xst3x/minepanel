---
title: Discord CRUD Operations
type: discord
source_file: src/core/discord/crud.ts
tags:
  - #discord
  - #backend
---

# Discord CRUD Operations

Handles creation, retrieval, updating, and deletion of Discord bot credentials and configuration profiles.

## Key Responsibilities
- Token encryption and safe persistence.
- Guild link associations and default channel routing.
- Audit logging of bot configuration changes.

## Related Architecture
- Consumed by: [[Discord Routes]], [[Discord Bots Routes]]
- Interacts with: [[Discord Shared State]]
