---
title: Discord Command Registrar
type: discord
source_file: src/core/discord/command-registrar.ts
tags:
  - #discord
  - #security
---

# Discord Command Registrar

Registers application slash commands (`/server start`, `/server stop`, `/console`, `/stats`) with Discord's REST API.

## Key Responsibilities
- Generates JSON command definitions with option schemas.
- Updates global or guild-specific application commands via Discord API v10.
- Ensures command schemas match interaction handlers.

## Related Architecture
- Handled by: [[Discord Interactions Handler]]
- Registered during: [[Discord Client Lifecycle]]
