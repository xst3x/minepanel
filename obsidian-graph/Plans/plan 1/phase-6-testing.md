---
title: "phase-6-testing"
type: "plan"
tags:
  - #plan
  - #architecture
---

# phase-6-testing

> Internal development plan for [[Project]].

# Phase 6 - Testing Infrastructure

Read and follow core-rules.md.

Goal:
Create automated tests.

Use:
- Jest
- SuperTest

Priority:
1. Authentication
2. API
3. Server lifecycle
4. Files
5. Backups

Requirements:
- Fast
- Reliable
- No flaky tests

---

## Coverage
We aim to cover 100% of core middleware and router code paths, specifically:
- Token verification and roles.
- Invite token creation and consumption logic.
- Input validation (Joi validators).
- Server creation constraints and lifecycle locks.
- File sandbox guards and CRUD operations.
- Backup scheduling and retrieval.

## Files Added
* `tests/auth.test.js` - JWT login, register, and middleware routes.
* `tests/server.test.js` - Server CRUD, lock verification, lifecycle commands.
* `tests/files.test.js` - Path-traversal checks, upload, write, list.
* `tests/backups.test.js` - Backups creation, lists, restore operations.

## Implementation
1. **In-Memory Database**: For all testing, `process.env.NODE_ENV` is set to `test`. The SQLite provider switches from `data/minepanel.db` to `:memory:`, initializing clean tables and seeding premade ranks on every test run.
2. **SuperTest Integration**: Allows routing checks without listening on real network sockets, minimizing port collisions on the testing host.
3. **Module Mocking**: External services (like Discord client logging, version downloads, and FTP servers) are stubbed/mocked via Jest mock functions.

## Estimated Runtime
- 2 to 4 seconds total runtime. All tests run in-band and in-memory.


## Related Architecture
- Overview: [[Project]]
- Roadmap: [[MASTER_ROADMAP]]


## Architecture Connections
- Supervisor Watchdog: [[Launcher Watchdog]]
- Process Supervision: [[Launcher Process Manager]]
- Database Recovery: [[Failure Mode - Database Corruption and Integrity PRAGMA Check]]
- Port Collision Tests: [[Failure Mode - Server Port Collision and Rebind Rollback]]
