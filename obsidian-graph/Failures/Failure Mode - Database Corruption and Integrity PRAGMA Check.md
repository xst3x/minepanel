---
title: "Failure Mode - Database Corruption and Integrity PRAGMA Check"
type: "failure"
layer: "safety"
source: "src/db/database.ts"
tags:
  - minepanel
  - safety
  - failure
---

# Failure Mode: Database Corruption and Integrity PRAGMA Check

## Trigger
Host power outage, abrupt shutdown, or bad disk blocks corrupting the SQLite database file.

## Detection & Safety Gate
On startup, before running any schema synchronizations or migrations, [[Database Access Layer]] calls `checkIntegrity()`, executing:
`PRAGMA integrity_check`
- If the result is not `'ok'`, critical errors are logged and migrations are aborted to prevent cascading data loss.
- During automated backups, `VACUUM INTO` is verified with a secondary integrity check before the snapshot is saved.
