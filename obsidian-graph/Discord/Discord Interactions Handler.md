---
title: Discord Interactions Handler
type: discord
source_file: src/core/discord/interactions.ts
tags:
  - #discord
  - #flow
---

# Discord Interactions Handler

Processes incoming Discord interaction webhooks/events (slash commands, button clicks, modal submissions).

## Key Responsibilities
- Dispatches commands:
  - `/server start` -> [[Execution Manager]]
  - `/server stop` -> [[Execution Manager]]
  - `/stats` -> [[Stats Routes]]
- Verifies user permissions via Discord role mappings.
- Manages ephemeral response replies.

## Related Architecture
- Uses: [[Discord Command Registrar]], [[Permissions System]]
- Session bridge: [[Discord Live Session Manager]]
