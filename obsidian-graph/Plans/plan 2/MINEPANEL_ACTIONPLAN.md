---
title: "MINEPANEL_ACTIONPLAN"
type: "plan"
tags:
  - #plan
  - #architecture
---

# MINEPANEL_ACTIONPLAN

> Internal development plan for [[Project]].

# MinePanel: 3-Week Production Roadmap (Quick Action Plan)

## 🚀 GOAL: Beat Crafty in 21 Days

---

## WEEK 1: SECURITY & FIXES (Days 1-5)

### Day 1: Authentication Hardening (4 hours)
- [ ] **Hour 1:** Fix case-sensitive username (src/core/auth.js + src/routes/authRoutes.js)
  - Use LOWER() in all username queries
  - Test: `SELECT * FROM users WHERE LOWER(username) = LOWER(?)`
  
- [ ] **Hour 2:** Add login rate limiting
  - Copy `loginLimiter` from MINEPANEL_FIXES.js
  - Apply to `/login` route
  
- [ ] **Hour 3:** Add password complexity validation
  - Create `src/core/utils/passwordValidator.js`
  - Copy `validatePassword()` function
  - Call in register & user creation
  
- [ ] **Hour 4:** Test auth fixes
  - Test duplicate usernames (different case)
  - Test rate limiting (5 failed logins)
  - Test weak password rejection

**Commit:** "Security: Fix auth case sensitivity, add rate limiting, password validation"

---

### Day 2: File Security & Error Handling (4 hours)
- [ ] **Hour 1:** Fix file path traversal
  - Create `validateFilePath()` in src/routes/fileRoutes.js
  - Apply to all file routes
  - Test: Try accessing `../../.env` (should fail)
  
- [ ] **Hour 2:** Fix JWT logout token reuse
  - Add `invalidatedTokens` Set in auth.js
  - Update `authenticateToken` to check it
  - Add `/logout` route
  
- [ ] **Hour 3:** Standardize all error responses
  - Replace all `res.status(x).json({ error: '...' })` with `sendError()`
  - Check these files:
    - src/routes/authRoutes.js
    - src/routes/serverRoutes.js
    - src/routes/fileRoutes.js
    - src/routes/userRoutes.js
  - Rough count: ~30-40 replacements
  
- [ ] **Hour 4:** Test security fixes
  - Verify file path validation
  - Verify token invalidation on logout
  - Verify consistent error codes

**Commit:** "Security: File path traversal, JWT logout, consistent errors"

---

### Day 3: CSRF Protection & Validation (5 hours)
- [ ] **Hour 1:** Add CSRF protection
  - `npm install csrf-csrf`
  - Import and use in src/index.js
  
- [ ] **Hour 2-3:** Create comprehensive input validation schemas
  - Edit src/middleware/validators.js
  - Copy all schemas from MINEPANEL_FIXES.js
  - Covers: login, register, createServer, updateProperties, etc.
  
- [ ] **Hour 4:** Apply validation to all routes
  - Get list of all routes from src/routes/*.js
  - Add `validateRequest(schemas.xxx)` middleware
  - Estimate: 20 routes × 5 minutes = ~100 minutes
  
- [ ] **Hour 5:** Test validation
  - Send invalid data to each endpoint
  - Verify 400 Bad Request with proper error codes

**Commit:** "Security: CSRF protection, comprehensive input validation"

---

### Day 4: Logging & Monitoring Setup (4-5 hours)
- [ ] **Hour 1:** Create logging infrastructure
  - Create src/core/logger.js
  - Create src/core/performance.js
  - Copy both from MINEPANEL_FIXES.js
  
- [ ] **Hour 2:** Setup logging directory & rotation
  - Create logs/ directory
  - Verify Winston is logging to files
  - Test log rotation (5MB limit)
  
- [ ] **Hour 3:** Add monitoring middleware
  - Add request timing middleware to src/index.js
  - Add `/health` endpoint
  - Add `/metrics` endpoint (Prometheus)
  
- [ ] **Hour 4:** Integration testing
  - Check that requests are being logged
  - Verify /health endpoint works
  - Verify /metrics endpoint returns valid Prometheus format
  
- [ ] **Hour 5:** Remove all console.log statements
  - Find: grep -r "console.log" src/
  - Replace with: logger.info()
  - Estimate: ~30 replacements

**Commit:** "Logging: Structured logging, performance metrics, monitoring endpoints"

---

### Day 5: Security Audit & Headers (3-4 hours)
- [ ] **Hour 1:** Add security headers middleware
  - Copy security headers code from MINEPANEL_FIXES.js
  - Add to src/index.js before routes
  
- [ ] **Hour 2:** Review all database queries
  - Search for: `SELECT * FROM` (should use specific columns)
  - Add: LIMIT clauses where needed
  - Verify: All parameterized queries (no string concatenation)
  
- [ ] **Hour 3:** Security checklist
  - [ ] SQL injection tests (parameterized queries ✓)
  - [ ] XSS tests (JSON endpoints safe ✓)
  - [ ] CSRF tests (CSRF middleware ✓)
  - [ ] Auth bypass tests (middleware checks ✓)
  - [ ] File access tests (path validation ✓)
  
- [ ] **Hour 4:** Create SECURITY.md
  - Document all security measures
  - Document how to report vulnerabilities

**Commit:** "Security: Headers, query optimization, security documentation"

---

## WEEK 2: INFRASTRUCTURE & FEATURES (Days 6-10)

### Day 6: Database Migrations (4-5 hours)
- [ ] **Hour 1:** Create migrations folder structure
  - `mkdir src/db/migrations`
  - Create src/db/migrations/001_initial_schema.js
  
- [ ] **Hour 2:** Move current schema to migration
  - Copy from `initDb()` in src/db/database.js
  - Put into migration 001_initial_schema.js
  - Update initDb() to call `runMigrations()`
  
- [ ] **Hour 3:** Create migration runner
  - Copy migrationRunner.js from MINEPANEL_FIXES.js
  - Test: Run migrations, check migrations table
  
- [ ] **Hour 4:** Update src/index.js
  - Call `runMigrations(db)` on startup
  - Log migration execution
  
- [ ] **Hour 5:** Test migration system
  - Delete data/minepanel.db
  - Start server, verify migrations run
  - Create second migration (test), run again

**Commit:** "Database: Migration system with versioning"

---

### Day 7-8: Statistics Dashboard (CRITICAL FEATURE) (10-12 hours)

**This is the killer feature that Crafty has but MinePanel doesn't.**

- [ ] **Hour 1-2:** Create database schema for stats
  - Create migration 002_add_stats_table.js
  - Add: server_stats table with columns:
    - id, server_id, timestamp
    - players_online, tps, memory_usage, cpu_usage, uptime_ms
  - Add: statistics_config table for retention policies

- [ ] **Hour 3-4:** Create stats collection service
  - Create src/core/statsCollector.js
  - Every 30 seconds: collect stats from all active servers
  - Store in server_stats table
  - Cleanup old stats (>7 days)

- [ ] **Hour 5-6:** Create API endpoints
  - GET `/api/servers/:serverId/stats?range=24h`
  - Returns: { stats: [ { timestamp, players_online, tps, ... } ] }
  - Supports ranges: 1h, 6h, 24h, 7d
  - Test: curl http://localhost:8082/api/servers/1/stats?range=24h

- [ ] **Hour 7-8:** Create frontend display
  - Create src/public/js/stats.js
  - Use Chart.js (or similar) for graphs
  - Display: Player count, TPS, memory usage, uptime
  - Update: src/public/index.html with stats tab

- [ ] **Hour 9-10:** Testing & optimization
  - Test stat collection doesn't slow server
  - Test graph rendering with 7 days of data
  - Verify database queries are indexed
  - Add: CREATE INDEX on server_stats(server_id, timestamp)

- [ ] **Hour 11-12:** Documentation
  - Add stats section to docs/
  - Document retention policy
  - Document customization

**Commit:** "Features: Statistics dashboard with graphs and historical data"

---

### Day 9: Server Templates (4-5 hours)

**Easy feature, big UX improvement.**

- [ ] **Hour 1:** Define template structure
  - Create src/core/serverTemplates.js
  - Define: vanilla, spigot, paper, skyblock, modded
  
- [ ] **Hour 2:** Create API endpoint
  - POST `/api/servers/from-template`
  - Takes: { template, serverName, port, ram }
  - Returns: { serverId, message }
  
- [ ] **Hour 3:** Create template installer
  - Pre-populate server.properties
  - Pre-download JAR if needed
  - Pre-create plugins folder structure
  
- [ ] **Hour 4:** Frontend integration
  - Update create server UI
  - Add template selector before form
  - Show template description & requirements
  
- [ ] **Hour 5:** Testing
  - Create server from each template
  - Verify properties are applied
  - Verify JAR is correct

**Commit:** "Features: Server templates for quick setup"

---

### Day 10: Webhook Integrations (3-4 hours)

**Nice-to-have feature for automation.**

- [ ] **Hour 1:** Create database schema
  - Migration 003_add_webhooks_table.js
  - Columns: id, server_id, event, url, active, created_at

- [ ] **Hour 2:** Create webhook manager
  - Create src/core/webhookManager.js
  - Functions: createWebhook, deleteWebhook, triggerWebhook
  - Trigger on: serverStarted, serverStopped, playerJoined, playerLeft
  
- [ ] **Hour 3:** Create API endpoints
  - POST `/api/webhooks/create`
  - DELETE `/api/webhooks/:webhookId`
  - GET `/api/webhooks?serverId=X`
  
- [ ] **Hour 4:** Testing
  - Create webhook pointing to webhook.site or RequestBin
  - Start server, verify webhook fires
  - Test payload format

**Commit:** "Features: Webhook integrations for automations"

---

## WEEK 3: TESTING & POLISH (Days 11-15)

### Day 11-12: Comprehensive Testing (12-14 hours)

**This is where you reach 80%+ code coverage.**

- [ ] **Hour 1-2:** Auth tests (10-12 tests)
  - Copy template from MINEPANEL_FIXES.js
  - Add: login, logout, register, rate limit, case sensitivity, password validation
  - Run: `npm test -- tests/auth.test.js --coverage`

- [ ] **Hour 3-4:** Server tests (8-10 tests)
  - Create/start/stop/restart server
  - Edit properties
  - Test permission checks
  - Test concurrent operations

- [ ] **Hour 5-6:** File tests (8-10 tests)
  - Upload/download files
  - Test path traversal prevention
  - Test size limits
  - Test permission checks

- [ ] **Hour 7-8:** API validation tests (8-10 tests)
  - Test invalid inputs
  - Test missing fields
  - Test SQL injection attempts
  - Test XSS attempts

- [ ] **Hour 9-10:** Integration tests (10 tests)
  - Full workflow: register → login → create server → start
  - Full workflow: manage files → edit properties → backup
  - Concurrent users
  - Race conditions

- [ ] **Hour 11-12:** Coverage analysis
  - Run: `npm test -- --coverage`
  - Target: 80%+
  - Identify uncovered lines
  - Add spot tests as needed

- [ ] **Hour 13-14:** Performance tests
  - Load test: 100 concurrent users
  - Stress test: Large file uploads
  - Long-running test: 24-hour uptime
  - Memory leak check

**Commit:** "Testing: 100+ tests, 80%+ coverage, performance validated"

---

### Day 13: Security Audit (4-5 hours)

**Final security review before production release.**

- [ ] **Hour 1:** Code review
  - Check all authentication flows
  - Verify all inputs are validated
  - Verify all outputs are escaped/sanitized
  
- [ ] **Hour 2:** Dependency scan
  - `npm audit`
  - Update any vulnerable packages
  - Check: No deprecated packages
  
- [ ] **Hour 3:** Penetration testing
  - Try to bypass auth
  - Try SQL injection in all fields
  - Try path traversal
  - Try CSRF
  - Try XSS
  
- [ ] **Hour 4:** Create SECURITY.txt
  - Responsible disclosure policy
  - Security contact email
  - Known limitations documented
  
- [ ] **Hour 5:** Create CHANGELOG.md
  - Document all fixes since current version
  - Highlight security improvements

**Commit:** "Security: Final audit, vulnerability checks, security documentation"

---

### Day 14: Documentation (4-5 hours)

**Make it production-ready with docs.**

- [ ] **Hour 1:** API Documentation
  - Create docs/API.md or use Swagger/OpenAPI
  - Document every endpoint
  - Include request/response examples
  - Document error codes
  
- [ ] **Hour 2:** Deployment Guide
  - Create docs/DEPLOYMENT.md
  - Cover: systemd service, Docker, reverse proxy
  - Include: Linux, Windows, macOS setup
  
- [ ] **Hour 3:** Troubleshooting Guide
  - Create docs/TROUBLESHOOTING.md
  - Common issues & solutions
  - How to read logs
  - How to report bugs
  
- [ ] **Hour 4:** Configuration Guide
  - Create docs/CONFIGURATION.md
  - Document all .env variables
  - Document all settings
  - Include: Security recommendations
  
- [ ] **Hour 5:** Architecture Overview
  - Create docs/ARCHITECTURE.md
  - Explain: Launcher pattern, WebSocket, stats collection
  - Include: Database schema diagram
  - Document: Performance considerations

**Commit:** "Documentation: Complete API docs, deployment, troubleshooting"

---

### Day 15: Release Preparation (3-4 hours)

**Make it production-ready.**

- [ ] **Hour 1:** Version bump
  - Update: package.json version to 1.0.0
  - Update: CHANGELOG.md with final notes
  - Create: GitHub release draft

- [ ] **Hour 2:** Final testing on clean install
  - `rm -rf data/ logs/ node_modules/`
  - `npm install`
  - `npm start`
  - Verify: Everything works from scratch
  - Verify: No console errors
  - Verify: Database created, admin account printed

- [ ] **Hour 3:** Create installation packages
  - Test: Windows installer
  - Test: Linux systemd service
  - Test: Docker image (optional)
  - Create: setup.py wizard updates

- [ ] **Hour 4:** Marketing materials (optional)
  - Write: "What's new in 1.0.0" blog post
  - Create: Feature comparison table (vs Crafty)
  - Share on: Reddit /r/homelab, Discord communities

**Commit:** "Release: Version 1.0.0 - Production ready"

---

## 📊 DAILY CHECKLIST TEMPLATE

```
WEEK 1 - SECURITY
[ ] Day 1: Auth hardening (4h) - ___/4 hours
[ ] Day 2: File security (4h) - ___/4 hours
[ ] Day 3: CSRF + Validation (5h) - ___/5 hours
[ ] Day 4: Logging (5h) - ___/5 hours
[ ] Day 5: Headers + Audit (4h) - ___/4 hours
├─ Total: 22 hours spent, 22 hours planned ✓

WEEK 2 - INFRASTRUCTURE
[ ] Day 6: Migrations (5h) - ___/5 hours
[ ] Day 7-8: Stats Dashboard (12h) - ___/12 hours
[ ] Day 9: Templates (4h) - ___/4 hours
[ ] Day 10: Webhooks (4h) - ___/4 hours
├─ Total: 25 hours spent, 25 hours planned ✓

WEEK 3 - TESTING & RELEASE
[ ] Day 11-12: Testing (14h) - ___/14 hours
[ ] Day 13: Security Audit (5h) - ___/5 hours
[ ] Day 14: Documentation (5h) - ___/5 hours
[ ] Day 15: Release (4h) - ___/4 hours
├─ Total: 28 hours spent, 28 hours planned ✓

GRAND TOTAL: ~75 hours of focused work
```

---

## 🎯 SUCCESS METRICS

At end of 3 weeks:

### Security
- [ ] 0 high-severity vulnerabilities (per npm audit)
- [ ] 100% of endpoints validate input
- [ ] 0 SQL injection vectors
- [ ] 0 path traversal vulnerabilities
- [ ] CSRF protection enabled

### Code Quality
- [ ] 80%+ test coverage
- [ ] 100+ automated tests
- [ ] Structured logging on all operations
- [ ] Performance metrics enabled
- [ ] 0 console.log statements in production code

### Features
- [ ] Statistics dashboard with graphs ✓
- [ ] Server templates ✓
- [ ] Webhook integrations ✓
- [ ] Database migrations ✓

### Documentation
- [ ] Complete API documentation ✓
- [ ] Deployment guide ✓
- [ ] Troubleshooting guide ✓
- [ ] Security documentation ✓

---

## 🚀 GO TIME

**Start:** Tomorrow, 9 AM  
**Duration:** 21 days (3 weeks)  
**Hours:** ~75 hours focused work (≈3 hours/day)  
**Breaks:** Weekends are optional for reviewing  
**Goal:** MinePanel 1.0.0 - Production Ready  

**Do this, and Crafty becomes irrelevant.**

You got this. 💪


## Related Architecture
- Overview: [[Project]]
- Roadmap: [[MASTER_ROADMAP]]


## Architecture Connections
- Master Plan: [[MASTER_ROADMAP]]
- Backend Subsystem: [[Subsystem - Core Backend and Web Server]]
- Persistence: [[Subsystem - Database and Persistence]]
- Supervisor: [[Subsystem - Supervisor and Launcher]]
