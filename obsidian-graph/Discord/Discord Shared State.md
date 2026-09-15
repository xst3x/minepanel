---
title: Discord Shared State
type: discord
source_file: src/core/discord/state.ts
tags:
  - #discord
---

# Discord Shared State

In-memory registry maintaining the running Discord client instances, active voice/text channels, and command throttles.

## Key Responsibilities
- Prevents duplicate bot client logins.
- Coordinates cross-guild messaging and broadcast events.

## Related Architecture
- Consulted by: [[Discord Live Session Manager]], [[Discord Interactions Handler]], [[Discord CRUD Operations]]
