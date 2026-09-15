---
title: Migration 013 - Docker Execution Mode
type: migration
source_file: src/db/migrations/013_docker_execution_mode.ts
tags:
  - #database
  - #migration
  - #process
---

# Migration 013 - Docker Execution Mode

Historical migration adding `execution_mode` ('native' | 'docker') and `docker_image` to `servers`.

## Architectural Note
- Docker execution mode was subsequently removed from MinePanel in favor of native Java execution.
- See: [[Failure Mode - Server Port Collision and Rebind Rollback]], [[Execution Manager]]
- Model: [[Model - Server]]
