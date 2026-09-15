---
title: "Hotspot - Database Access Layer"
type: "hotspot"
layer: "database"
source: "src/db/database.ts"
tags:
  - minepanel
  - database
  - hotspot
---

# Architectural Hotspot: Database Access Layer

**Fan-In: Highest in Codebase (27+ incoming dependents)**

`src/db/database.ts` is imported by nearly every controller, middleware, and background service. It acts as the single source of truth for database connections, schema migrations, and promise-based SQL execution.
