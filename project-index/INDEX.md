# MinePanel Project Intelligence Index

**Complete AI-Readable System Map** — Eliminates need for re-scanning codebase on every analysis.

---

## Quick Navigation

This index contains **7 comprehensive documents** that fully map the MinePanel system:

1. **PROJECT_OVERVIEW.md** — What the project does, architecture, core modules
2. **FILE_TREE.md** — Every file, folder, purpose, importance level
3. **API_ROUTES.md** — All 115+ HTTP endpoints with parameters & dependencies
4. **BACKEND_MAP.md** — Core services, data flows, ProcessManager, Docker, webhooks
5. **DATABASE.md** — All 14 tables, columns, relationships, JSON fields, migrations
6. **FRONTEND_MAP.md** — React components, pages, state management, routing
7. **SYSTEM_BEHAVIOR.md** — Step-by-step workflows: startup, backup, restore, updates

---

## For AI Agents: How to Use This Index

### I need to understand the entire system
→ Read: **PROJECT_OVERVIEW.md** (15 min)

### I need to find a specific file
→ Search: **FILE_TREE.md** for path, then use `grep` or editor

### I need to modify an API endpoint
→ Check: **API_ROUTES.md** for route, then **FILE_TREE.md** for implementation file

### I need to understand data flow for feature X
→ Read: **PROJECT_OVERVIEW.md** (data flow section), then **BACKEND_MAP.md** (specific service)

### I need to add a new table or column
→ Check: **DATABASE.md** (schema), then **FRONTEND_MAP.md** (if UI needed)

### I need to debug a WebSocket issue
→ Read: **BACKEND_MAP.md** (WebSocket Broadcasting), **SYSTEM_BEHAVIOR.md** (Console Command section)

### I need to understand permission system
→ Check: **BACKEND_MAP.md** (Permission System section), **API_ROUTES.md** (Auth section)

### I need to fix a frontend bug
→ Read: **FRONTEND_MAP.md** (component hierarchy), check **FILE_TREE.md** (exact file)

### I need to understand server startup
→ Read: **SYSTEM_BEHAVIOR.md** (Server Startup Flow section) — step-by-step with code

---

## Project Stats

| Metric | Count |
|--------|-------|
| **Backend Files** | 50+ |
| **Frontend Components** | 7 core + 18 pages |
| **Database Tables** | 14 |
| **API Routes** | 115+ |
| **Core Services** | 15+ |
| **Migrations** | 13+ |
| **Test Files** | 10+ |
| **Total Lines (est)** | 23,000+ |
| **Entry Points** | 2 (minepanel_main.js, src/minepanel.js) |

---

## Architecture Overview (1 Minute Read)

```
User Browser
    ↓ HTTP + WebSocket
    ↓
Express.js (Node.js)
    ├─ Routes (18 files)
    ├─ Auth (JWT + TOTP)
    ├─ Permissions (RBAC)
    └─ Middleware (validation, logging)
    
    ↓ Delegates to
    
Core Services
    ├─ ProcessManager (spawn/monitor JVM)
    ├─ ExecutionManager (abstraction)
    ├─ StatsCollector (CPU/RAM sampling)
    ├─ BackupManager/RestoreManager
    ├─ VersionFetcher (GitHub/Jenkins APIs)
    ├─ FtpServer (per-server file access)
    ├─ DockerService (containerized servers)
    └─ WebhookManager (event notifications)
    
    ↓ Uses
    
SQLite3 Database
    ├─ 14 tables
    ├─ Auto-migrations
    └─ PRAGMA integrity checks
    
    ↓ Manages
    
Minecraft Servers
    ├─ servers/ (user-created instances)
    ├─ cache/ (JARs, versions)
    └─ data/ (database backups)
```

---

## Key Architectural Decisions

### 1. Launcher-Server Pattern (Two Processes)
- **Why**: Dynamic port allocation without manual restart
- **How**: `minepanel_main.js` spawns `src/minepanel.js`
- **Details**: Read PROJECT_OVERVIEW.md → "Launcher-Server Pattern"

### 2. ExecutionManager Abstraction
- **Why**: Support both native and Docker execution
- **Impact**: Routes don't care which executor is used
- **Details**: Read BACKEND_MAP.md → "ExecutionManager Service"

### 3. WebSocket for Real-Time Updates
- **Why**: Live console, stats, process state
- **Protocol**: Subscribe/publish model (no persistence)
- **Details**: Read BACKEND_MAP.md → "WebSocket Broadcasting"

### 4. Permission System (RBAC)
- **Why**: Fine-grained control (per-rank + per-server overrides)
- **Flow**: Read SYSTEM_BEHAVIOR.md → "Permission Check Flow"
- **Tables**: `ranks`, `user_server_permissions`, `user_server_ranks`

### 5. Stat Sampling Architecture
- **Why**: Efficient time-series data without hammering database
- **How**: Periodic samples via pidusage, auto-cleanup after retention
- **Details**: Read BACKEND_MAP.md → "StatsCollector Service"

---

## Critical Files (Modify with Care)

| File | Reason | Impact |
|------|--------|--------|
| `src/minepanel.js` | Server startup logic, launcher protocol | Breaking change = app won't start |
| `src/core/processManager.js` | JVM process lifecycle | Breaking change = servers won't start/stop |
| `src/db/database.js` | DB initialization, model loading | Breaking change = database won't load |
| `src/core/auth.js` | Authentication, JWT generation | Breaking change = 401 errors, lockout |
| `src/core/permissions.js` | Permission checks | Breaking change = permission bypass or denial for all |
| `src/routes/serverRoutes.js` | Core server operations | Large file; be surgical with edits |

---

## Common Modifications Workflow

### Add a new API endpoint
1. Add route in `src/routes/*.js` file
2. Validate input with Joi schema in `src/middleware/validators.js`
3. Add permission check via `checkPermission()`
4. Implement business logic (may need new service method)
5. Document in **API_ROUTES.md** (this index)
6. Test via Postman or `curl`

### Add a new database table
1. Create model file: `src/db/models/YourModel.js`
2. Create migration: `src/db/migrations/XXX_your_feature.js`
3. Update `src/db/database.js` associations if needed
4. Document in **DATABASE.md** (this index)
5. Run migration: App auto-runs on startup
6. Use `dbRun`, `dbGet`, `dbAll` helpers for queries

### Add a new permission
1. Define in `src/config.js` or inline in rank seed
2. Check via: `checkPermission(userId, serverId, 'resource.action')`
3. Add to rank definitions in `src/db/database.js` (PREMADE_RANKS)
4. Document in **BACKEND_MAP.md** → Permission System

### Add a new frontend page
1. Create component: `src/frontend/src/pages/YourPage.jsx`
2. Add route in `App.jsx`
3. Wrap with `<RequireAuth>` if protected
4. Use `useAuthContext()` for user/permissions
5. Call APIs via `lib/api.js` wrapper
6. Document in **FRONTEND_MAP.md** (this index)

---

## Performance Considerations

### Database Queries
- **ServerStats** table grows quickly (1000s/day) → cleanup via retention policy
- **Backup** operations are I/O intensive → may pause server
- **Console logs** streamed via WebSocket → batching recommended for high-traffic servers

### Process Management
- **pidusage** samples every 5-10s → lightweight, 1% CPU impact
- **RCON queries** for player count → may timeout on slow servers
- **Minecraft server startup** 2-30s depending on world size → expect delays

### Frontend Performance
- **Console output** appended to DOM → virtualization recommended for 10k+ lines
- **Stats graphs** update every 5-10s → use Canvas (Chart.js) not SVG
- **File browser** loads directory listing → paginate for large directories

---

## Security Considerations

### Authentication
- JWT tokens: 1-hour expiry (adjust in auth.js if needed)
- Passwords: bcrypt with cost 10+
- 2FA: TOTP (RFC 6238) with backup codes
- **No refresh tokens**: User must re-login; acceptable for admin panel

### Authorization
- All routes require `checkPermission()`
- Database entries filtered by ownership
- Path traversal validated in fileRoutes
- **No hardcoded secrets**: Use environment variables (.env)

### Data Protection
- FTP passwords hashed (bcryptjs)
- Discord bot tokens encrypted recommended (currently plain)
- Database backups auto-created, unencrypted
- **No HTTPS enforced**: Deploy behind nginx/Caddy with SSL

### Audit Trail
- `audit_logs` table tracks sensitive actions
- IP address logged for each admin action
- Webhook events logged (may contain IP/player names)

---

## Testing Strategy

### Unit Tests
- `tests/auth.test.js` — Authentication flows
- `tests/validation.test.js` — Input validation schemas
- `tests/security.test.js` — Permission checks

### Integration Tests
- `tests/api_test.js` — Full API endpoint tests
- `tests/server.test.js` — Server CRUD operations
- `tests/backups.test.js` — Backup/restore workflows

### Manual Testing
- See FRONTEND_MAP.md → "Testing & QA" section
- Checklist: Login, Create Server, Start Server, Console, Backups, etc.

---

## Deployment Checklist

- [ ] Verify `.env` file exists with all variables (PORT, JWT_SECRET, etc.)
- [ ] Database exists or will auto-initialize
- [ ] `node_modules/` installed: `npm install` or restore from lock file
- [ ] Frontend built: `cd src/frontend && npm run build`
- [ ] Port 8082 (or custom) not in use
- [ ] Java installed (for native mode) or Docker running (for Docker mode)
- [ ] Sufficient disk space (for server instances + backups)
- [ ] Test: `npm start` and visit http://localhost:8082

---

## Troubleshooting Quick Links

| Symptom | Check |
|---------|-------|
| App won't start | Launcher pattern → Check PORT in .env, check Node.js version |
| Servers won't start | ProcessManager → Check Java installed, JAR exists, port available |
| WebSocket console not updating | BACKEND_MAP.md → WebSocket Broadcasting, check WS connection |
| Permissions not working | SYSTEM_BEHAVIOR.md → Permission Check Flow, verify rank in DB |
| Database error on startup | DATABASE.md → Backup & Recovery section, restore from backup |
| API returning 401 | Check JWT token expiry in auth.js (1 hour default) |
| API returning 403 | BACKEND_MAP.md → Permission System, check user rank |
| File operations failing | fsRetry wrapper handles Windows EBUSY, check disk space |
| Stats not collecting | BACKEND_MAP.md → StatsCollector, verify pidusage installed |
| Backup too slow | SYSTEM_BEHAVIOR.md → Backup Flow, disable if not needed |
| Discord webhook fails | Verify URL is valid, not rate-limited |

---

## Code Style & Conventions

### Naming
- `camelCase` for variables, functions
- `PascalCase` for classes, components
- `UPPERCASE` for constants

### Async/Await vs Callbacks
- **Prefer**: async/await (more readable)
- **Database**: `dbRun()`, `dbGet()` are promise-wrapped
- **File ops**: `fs.promises` or `retryXxx()` wrappers

### Error Handling
- Custom errors: `throw new ErrorCode('CODE', 'message')`
- Route handlers: Try/catch with `sendError()` utility
- Never swallow errors: Always log or re-throw

### Validation
- All inputs: Joi schema + `validate()` middleware
- Database: Referential integrity via foreign keys
- File paths: `sanitizePath()` to prevent traversal

### Comments
- **Avoid**: Marketing speak, buzzwords, emojis
- **Write**: Technical explanations of why, not what
- **Example**: `// Use pidusage for lightweight CPU/RAM sampling instead of polling /proc`

---

## Quick Reference: API Response Format

### Success
```json
{
  "success": true,
  "data": { /* entity or array */ }
}
```

### Error
```json
{
  "success": false,
  "error": "ERROR_CODE",
  "message": "Human-readable message"
}
```

### Status Codes
- `200`: OK
- `400`: Validation error
- `401`: Authentication required
- `403`: Permission denied
- `404`: Resource not found
- `409`: Conflict (e.g., port in use)
- `500`: Server error

---

## External Dependencies

### Runtime
- **express**: HTTP server
- **sqlite3** + **sequelize**: Database
- **jsonwebtoken**: JWT
- **bcrypt**: Password hashing
- **ws**: WebSocket
- **dockerode**: Docker API
- **ftp-srv**: FTP server
- **axios**: HTTP client
- **winston**: Logging

### Build
- **vite**: Frontend bundler
- **jest**: Testing

### Optional
- **node-schedule**: Cron-like scheduling (if auto-backup needs exact times)
- **redis**: Session store (if scaling to multiple processes)

---

## Version History

- **v1.0.0**: Initial release (as of June 2024)
  - Multi-server Minecraft management
  - REST API + WebSocket
  - SQLite3 database
  - Docker support
  - Discord integration
  - RBAC permission system
  - Backup/restore workflows

---

## Support & Contributing

### For Questions
- Check relevant document in this index
- Search codebase for similar patterns
- Review git history: `git log --oneline src/file.js`

### For Bug Fixes
1. Identify affected component (use FILE_TREE.md)
2. Read SYSTEM_BEHAVIOR.md for that flow
3. Write targeted test (`npm test`)
4. Modify code surgically (avoid large rewrites)
5. Update this index if architecture changes

### For New Features
1. Document design in a new section of relevant .md
2. Add to FILE_TREE.md (new files/functions)
3. Add to API_ROUTES.md (new endpoints)
4. Update DATABASE.md if schema changes
5. Update FRONTEND_MAP.md if UI changes

---

## Index Metadata

| Property | Value |
|----------|-------|
| Created | June 19, 2024 |
| Last Updated | June 19, 2024 |
| Documents | 7 comprehensive guides |
| Estimated Coverage | 95%+ of system |
| Intended Audience | Developers, AI agents, new contributors |
| Maintenance | Update when architecture changes |

---

## Document Map

```
project-index/
├─ INDEX.md (this file)  ← You are here
├─ PROJECT_OVERVIEW.md   ← Start here for big picture
├─ FILE_TREE.md          ← Find specific files
├─ API_ROUTES.md         ← All HTTP endpoints
├─ BACKEND_MAP.md        ← Core services, data flows
├─ DATABASE.md           ← Schema, tables, migrations
├─ FRONTEND_MAP.md       ← React components, pages
└─ SYSTEM_BEHAVIOR.md    ← Step-by-step workflows
```

---

**End of Index**. For detailed information, see individual documents above.
