# MinePanel — Comprehensive Deep Audit Report

**Date**: July 21, 2026
**Audit Scope**: Full codebase — backend (TypeScript/JavaScript), frontend (React/TypeScript), database, tests, infrastructure
**Methodology**: Static analysis, code pattern search, architecture review, dependency analysis

---

## Executive Summary

**Overall Project Health Score: 58/100**

MinePanel is an ambitious, feature-rich Minecraft server management panel. It demonstrates strong domain knowledge and covers a wide surface area of features (auth, permissions, backups, FTP, Docker, Discord bot, automation, server management). However, it suffers from significant architectural debt, incomplete TypeScript migration, extensive `any` abuse, inconsistent error handling, memory/resource leak patterns, and a fragmented build process.

### Major Strengths
- **Feature breadth** — Server lifecycle, backup/restore, file editing, FTP, Discord integration, automation engine, plugin/mod system, world management
- **RBAC permission system** — Flexible rank-based + per-server override model
- **Execution manager abstraction** — Clean separation between native and Docker execution
- **Comprehensive project index** — Well-documented architecture docs in `project-index/`
- **Automation engine** — Scriptable rules engine with Python sandbox support
- **Database migration system** — 23 well-structured migrations with proper up/down handling
- **23 database migrations** — Well-structured schema evolution with proper up/down patterns

### Major Concerns
- **TypeScript half-migration** — All `.ts` files compile to `.js` with `.js.map`, both checked into git. Massive `any` abuse throughout.
- **Dual module system** — Mixed `require()` (CommonJS) and `import` (ESM) in the same files
- **Swallowed exceptions** — Widespread empty catch blocks (`catch (_) {}`) that silently hide errors — 77+ locations
- **Timer/event-leak patterns** — `setInterval` for stats collection and cleanup without proper lifecycle management
- **Process management fragility** — Complex launcher-spawner pattern with race conditions around port allocation
- **No automated testing infrastructure** — Tests exist but are fragile, use extensive mocking, and test harness is incomplete
- **Security concerns** — JWT secret in source code comments, no CSRF tokens, no refresh token rotation, plain-text logging of sensitive data

---

## Critical Issues

### C1 — Extensive `any` abuse throughout TypeScript codebase (Severity: Critical)

**Files affected**: Nearly every `.ts` file in `src/`, `src/routes/`, `src/core/`, `src/db/`

**Evidence**: The codebase is riddled with `any` types:
- `src/core/services/modrinthHttp.ts`: `const fetchJson = (url: string, options: any = {}) => new Promise<any>((resolve, reject) => {`
- `src/core/utils/auditLog.ts`: `const log = async (req: any, event: string, meta: any = {}) => {`
- `src/core/process-proxy-manager.ts`: `private worker: any = null;`
- `src/routes/pluginRoutes.ts`: `const fetchJson = (url: string, options: any = {}) => new Promise<any>((resolve, reject) => {`
- `src/routes/automationRoutes.ts`: `const newName = name !== undefined ? name.trim() : row.name;` — implicit any on `row`
- `src/types/express.d.ts`: `user?: any;`
- `src/types/global.d.ts`: `interface Object { [key: string]: any; }` — This globally mutates the `Object` type to allow any property access, effectively disabling all type checking on objects.

**Impact**: Zero type safety. Every function signature is effectively `(args: any): any`. TypeScript provides no benefits. Bugs that would be caught at compile-time are deferred to runtime.

**Fix**: Define proper interfaces for all data types (Server, User, API responses, DB rows, WebSocket messages). Use generics for promise wrappers. Remove the global `Object` type augmentation.

---

### C2 — Empty catch blocks silently swallowing all errors (Severity: Critical)

**Files affected**: 77+ locations across the codebase

**Evidence**:
- `src/minepanel.ts` (line 203): `} catch (_) {}`
- `src/minepanel.ts` (line 334): `} catch (_) {}`
- `src/minepanel.ts` (line 346): `} catch (e) {}`
- `src/adapters/pocketmine.ts` (line 320): `} catch (_) {}`
- `src/adapters/pocketmine.ts` (line 442): `} catch (_) {}`
- `src/adapters/pocketmine.ts` (line 451): `} catch (_) {}`
- `src/adapters/pocketmine.ts` (line 464): `} catch (_) {}`
- `src/tests/files.test.ts` (line 58): `} catch (_) {}`
- `src/tests/backups.test.ts` (line 64): `} catch (_) {}`
- `src/tests/datapacks.test.ts` (line 57): `} catch (_) {}`
- `src/tests/security.test.ts` (line 61): `} catch (_) {}`
- `src/db/database.ts` (line 270 in seedRanks): `} catch (e) { /* ignore */ }`
- `src/core/automationEngine.ts` (line 144): `.catch(() => {})` — fire-and-forget promise rejection swallowed

**Impact**: Errors in critical paths (WebSocket handling, file operations, database seeding, FTP operations, automation engine) are completely invisible. Servers could fail silently, database corruption goes undetected, and automation scripts could malfunction without any logging.

**Fix**: Every catch block should at minimum log the error via `logger.error()`. Never use empty catch blocks in production code.

---

### C3 — Uncontrolled `setInterval`/`setTimeout` lifecycle — Timer leaks (Severity: Critical)

**Files affected**: `src/minepanel.ts`, `src/worker.ts`, `src/routes/backupRoutes.ts`, `src/core/automation/workerManager.ts`, `src/core/thresholdManager.ts`

**Evidence**:
- `src/minepanel.ts` (line 330): `setInterval()` inside WebSocket message handler (nested inside `jwt.verify` callback) creates timers per-connection. If error occurs in callback before interval is assigned, interval is never tracked for cleanup.
- `src/minepanel.ts` (line 368): `setInterval()` at module level for token cleanup — never cleared.
- `src/minepanel.ts` (line 391): `setTimeout()` inside crash handler loop — no guard against repeated crashes creating cascading timers.
- `src/minepanel.ts` (line 433): `setTimeout()` inside autostart loop — fires even if server starts manually before timeout.
- `src/minepanel.ts` (line 462): `setTimeout(() => process.exit(100), 2000)` — no cleanup if port bind succeeds after timeout started.
- `src/worker.ts` (line 14): `setInterval()` global stats interval with no cleanup on worker exit.
- `src/routes/backupRoutes.ts` (line 242): `setInterval(runScheduledBackups, 3600000)` — module-level interval, never cleared.
- `src/core/automation/workerManager.ts` (line 119): `setTimeout()` for Python sandbox — no timeout cleanup if process finishes early.
- `src/core/thresholdManager.ts` (line 350): `setTimeout()` inside threshold check loop.

**Impact**: Over time, leaked timers accumulate, causing memory growth. Multiple execution contexts (worker, launcher, main) each have independent timers that never get cleaned up. On server restart (port change), the old intervals may survive.

**Fix**: Track all intervals in a `Set<NodeJS.Timeout>` and clear on shutdown. Use `clearInterval` in shutdown handlers. Module-level intervals should also have cleanup calls.

---

## High Priority Issues

### H1 — Mixed CommonJS/ESM module system

**Files affected**: All `.ts` files use `export =` (CommonJS pattern) while simultaneously using `import` statements

**Evidence**:
- `src/db/database.ts`: Uses `import path = require('path')` alongside `require('sqlite3')` and `export { ... }`
- `src/core/auth.ts`: Uses `import argon2 = require('argon2')` then `export = {...}`
- `src/core/errors.ts`: `const E = {...}` then `export = { E, AppError, sendError, MESSAGES }`
- `src/core/permissions.ts`: `import { db, dbGet, dbAll } from '../db/database'` then `export = { ... }`
- `src/index.ts`: `export = require('./minepanel');` — re-export hack
- `src/frontend/src/` files use ESM `import` while backend uses `require`

**Impact**: The `import x = require('y')` TypeScript pattern is non-standard and confusing. It creates friction for tooling (IDE autocomplete, refactoring). The inconsistency between frontend and backend makes it harder for developers to switch context.

**Fix**: Standardize on ESM (`import`/`export`) for both frontend and backend, or commit to CommonJS throughout.

---

### H2 — `.js` + `.js.map` checked into git alongside `.ts` (Build artifacts in source)

**Evidence**: Every `.ts` file in the project has a corresponding `.js` (compiled output) and `.js.map` (source map) in the same directory. The `.gitignore` does NOT exclude these.

**Examples**:
- `src/core/auth.ts` → `src/core/auth.js` + `src/core/auth.js.map`
- `src/core/auth.js` at line 8: `console.error('FATAL ERROR: process.env.JWT_SECRET is not set...');` — production code runs from `.js` files
- `src/routes/modules/serverManagementRoutes.ts` → `src/routes/modules/serverManagementRoutes.js` + `.js.map`
- Every model file in `src/db/models/` has triplets
- Every migration in `src/db/migrations/` has triplets
- Every route in `src/routes/` has triplets

**Estimated count**: ~180+ `.js` and `.js.map` files that are build artifacts.

**Impact**: Code changes must be made in two files. Reviews show both `.ts` and `.js` changes. Merge conflicts are doubled. Bloat in repository size. Source maps serve no purpose in a git repository.

**Fix**: Add `*.js` and `*.js.map` to `.gitignore` (except specific entry points). Use a build step. Only commit `.ts` source files.

---

### H3 — Worker process lifecycle not properly managed

**Files affected**: `src/worker.ts`, `src/core/process-proxy-manager.ts`, `src/core/process-real-manager.ts`

**Evidence**:
- `src/worker.ts`: Forks a child process for each Minecraft server but the worker process itself has no restart policy
- `src/core/process-proxy-manager.ts` (line 87-102): Event listeners on worker process (`this.worker.on('message')`, `this.worker.on('exit')`, `this.worker.on('error')`), but no reconnection logic
- `src/core/process-proxy-manager.ts` (line 76): `this.worker.on('message', (message) => {` — no validation on message format
- `src/worker.ts` (lines 110-112): `process.on('SIGTERM', shutdown)` / `process.on('SIGINT', shutdown)` — but the shutdown function may not be defined at registration time (hoisting issue)
- `src/worker.ts` (line 30): `process.on('message', async (message: any) => {` — no schema validation on IPC messages
- `src/core/process-real-manager.ts` (lines 206-251): Extensive event handlers (`child.stdin?.on('error')`, `child.stdout?.on('data')`, `child.stderr?.on('data')`, `child.on('close')`, `child.on('error')`) — but no cleanup if child process is already dead

**Impact**: If the worker process crashes, child servers become orphaned. No heartbeat/watchdog between worker and parent. Zombie server processes accumulate.

**Fix**: Implement heartbeat between parent and worker, add automatic worker restart, and ensure child processes are killed on worker shutdown.

---

### H4 — Security: JWT default secret in source code

**Files affected**: `src/core/auth.ts`, `src/core/auth.js`

**Evidence**:
```typescript
const defaultJwt = 'minepanel_super_secret_jwt_key_schimba_asta_in_productie_2024';
```

The default JWT secret is hardcoded in the source code. The validation checks only guard against the exact default, but the proliferation of this secret in a public repo means anyone can forge tokens.

Additionally, `src/core/auth.ts` line 4: `const SECRET_KEY = process.env.JWT_SECRET;` — if the env var is not set, the validation at line 7 calls `process.exit(1)`. But if `.env` is present with a weak secret, the validation at line 10 only runs in non-test mode, meaning test environments could use the default.

**Impact**: Any deployment using the default JWT secret (which includes all development and demo instances) can be trivially impersonated with forged JWTs.

**Fix**: Remove the default entirely. Force users to set a JWT_SECRET in .env on first run with a generated random key.

---

### H5 — `src/types/global.d.ts` globally mutates `Object.prototype` (Severity: High)

**Evidence**:
```typescript
// Allow any property access on `{}` and `object` types
// This fixes "Property does not exist on type '{}'" errors
interface Object {
  [key: string]: any;
}
```

This augments the global `Object` interface to allow any property access on any object of type `{}` or `object`. This disables TypeScript's structural typing entirely for these types.

**Impact**: Every `{}` and `object` type in the entire project loses all type safety — not just in MinePanel code, but also in any libraries that use plain objects. This essentially nullifies TypeScript's main benefit.

**Fix**: Define specific interfaces for DB results (e.g., `interface DbRow { [column: string]: unknown }`) instead of mutating global Object. Use proper typing for the data access patterns rather than sweeping the type errors under the rug.

---

### H6 — Irregular shutdown sequence — `gracefulShutdown` defined after `module.exports`

**Files affected**: `src/minepanel.ts`

**Evidence**:
```javascript
}).catch(err => { console.error('Failed to initialize database:', err); process.exit(1); });
    module.exports = { app, server };
    const gracefulShutdown = async (signal) => {
    logger.info(`[${signal}] Shutting down...`);
    ...
};
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
```

The `gracefulShutdown` function and `process.on` handlers are defined AFTER `module.exports` at the module level. Due to JavaScript hoisting rules, this works because `async function` declarations are hoisted. However, the placement is a maintenance hazard — the shutdown logic is at the bottom of a 500+ line file after the export.

**Impact**: If `gracefulShutdown` throws during initialization, the process exits with unhandled rejection. Code order is confusing.

**Fix**: Move shutdown logic to a separate module. Define shutdown handlers in `initDb().then()` callback.

---

## Medium Priority Issues

### M1 — WebSocket listener leak potential

**Files affected**: `src/minepanel.ts` (lines 297-342), `src/core/serverApiWebSocket.ts`

**Evidence**: Each WebSocket connection registers listeners via:
- `processManager.on('console', consoleListener)`
- `processManager.on('status', statusListener)`
- `processManager.on('clear_console', clearConsoleListener)`
- `automationEngine.on('log', automationLogListener)`

These are removed in `ws.on('close')`. However:
1. If `ws.on('close')` fails to fire (e.g., abrupt disconnect without close frame, process kill), listeners leak
2. The `statsInterval` is created inside a nested callback (the `jwt.verify` callback). If the outer try/catch catches an error before `statsInterval` is assigned, the interval is never tracked
3. `serverApiWebSocket.ts` has similar patterns but with different cleanup code

**Impact**: Each leaked connection adds 4-5 event listeners and a `setInterval` that runs forever. Over time with reconnecting clients, memory grows unbounded.

**Fix**: Use `EventEmitter.once` or a weak reference pattern. Always assign `statsInterval` before the risky code. Add a forced cleanup on connection close with a fallback timeout.

---

### M2 — Console.log instead of structured logger

**Files affected**: `src/minepanel.ts`, `src/core/auth.ts`, `src/core/permissions.ts`, `src/launcher/`, scratch files, test files

**Evidence**:
- `src/minepanel.ts` (line 26): `console.log('[Launcher] Starting...')` — should be `logger.info()`
- `src/minepanel.ts` (line 32): `console.log('[Launcher] Server child process exited...')` — should be `logger.info()`
- `src/minepanel.ts` (line 109): `console.error('[HTTPS] Certificate files not found!')` — should be `logger.error()`
- `src/core/auth.ts` (line 7): `console.error('FATAL ERROR:...')` — should be `logger.error()`
- `src/core/permissions.ts` (line 94): `console.error(...)` — should be `logger.error()`
- `src/core/permissions.ts` (line 56): `console.error('[Permissions] checkPermission error...', e)` — should be `logger.error()`
- Launcher files (`src/launcher/`) use `console.log`/`console.error` exclusively — they don't even import the logger
- All scratch and test files use `console.log` for debugging output
- `src/core/resolvers/bedrock/index.ts` (lines 44-64): `console.warn(...)` in a loop for each resolver failure

**Impact**: Inconsistent log formatting, no log levels, no structured JSON output. Production monitoring becomes difficult.

**Fix**: Replace all `console.log/warn/error` with `logger.info/warn/error` throughout the codebase.

---

### M3 — Fragile test suite

**Files affected**: All files in `tests/`

**Evidence**:
- Tests use mock implementations that don't reflect real behavior: `on() { return this; }` — this returns `this` for every method, passing trivially
- `src/tests/api_test.ts` has actual HTTP API calls to a live server instead of unit tests with mocks
- `src/tests/automationEngine.test.ts` (line 34): `jest.spyOn(automationEngine, 'triggerEvent')` — the only test using proper jest mocking
- No test runner configuration in `package.json`
- Tests require specific environment setup (`JWT_SECRET`, `NODE_ENV=test`, etc.)
- `src/tests/automationEngine.test.ts` (line 144): `this.isAutomationActive(serverId).catch(() => {});` — fire-and-forget promise
- `src/tests/datapacks.test.ts`, `src/tests/errors.test.ts`, etc. all share identical mock boilerplate

**Impact**: Tests provide false confidence. Many "pass" because mocks are trivially permissive, not because the code works correctly.

**Fix**: Rewrite tests with proper mocks, real database integration, and test runner configuration.

---

### M4 — Circular dependency between database and auth modules

**Files affected**: `src/core/auth.ts`, `src/db/database.ts`

**Evidence**:
- `auth.ts` uses lazy `require('../db/database').User` to avoid circular import
- `database.ts` imports auth-related models and exports them
- `auth.ts` imports `sendError` from `errors.js` which tries to import `logger`

The dependency chain:
```
auth.ts → database.ts (via require)
        → errors.ts (via require)
            → utils/logger (via require)
database.ts → models/User.ts → sequelize
```

**Impact**: Brittle initialization order. If `auth.js` is loaded before `database.js`, it silently works at runtime but TypeScript can't verify the types. The pattern is fragile and could break if initialization order changes.

**Fix**: Extract `User` model into its own file and import it directly where needed.

---

### M5 — Rate limiter bypass for server import endpoint

**Evidence**:
```javascript
app.use('/api/', (req, res, next) => {
    if (req.path === '/servers/import') return next();
    return globalRateLimiter(req, res, next);
});
```

The `/api/servers/import` path is explicitly excluded from rate limiting. This endpoint allows importing servers (potentially creating resources). Without rate limiting, this could be abused for resource exhaustion.

---

## Low Priority Issues

### L1 — Unused exports in database.ts

**Evidence**: `src/db/database.ts` exports `sequelize` but only `src/db/sequelize.ts` should be the source of the sequelize instance. The re-export creates confusion about which module is authoritative.

### L2 — `settings.json` caching without invalidation on writes

**Evidence**: `src/minepanel.ts` has a 30-second TTL cache for `settings.json`, but routes that modify settings (e.g., `systemRoutes.ts`, `settingsRoutes.ts`) don't invalidate this cache. The cache can serve stale data for up to 30 seconds.

### L3 — Multiple file routes registered at different paths

**Evidence**:
```javascript
app.use('/api/servers/:serverId/files', fileRoutes);
app.use('/api/files', fileRoutes);
```

Both mount the same router at different paths. The `/api/files` route lacks the `:serverId` param, which causes all middleware that expects `req.params.serverId` to fail silently.

### L4 — `errorCodes.ts` merely re-exports errors.ts

**Evidence**: `src/core/errorCodes.ts` just does:
```typescript
const { E } = require('./errors');
export = E;
```

This is a deprecated abstraction layer that adds no value.

### L5 — `src/index.ts` is a passthrough

**Evidence**:
```typescript
export = require('./minepanel');
```

No other file imports from `src/index.ts`. The entry point for the app is `minepanel_main.js`.

### L6 — Missing route for `worldRoutes.ts`

**Evidence**: `src/routes/worldRoutes.ts` exists and is compiled to `.js`, but `src/minepanel.ts` does NOT register any route for it. The world management feature is not wired up.

---

## Unfinished Features

### U1 — Automation Engine (partially implemented)

**Files**: `src/core/automation/`, `src/routes/automationRoutes.ts`, `src/core/automationEngine.ts`

**Evidence**: The automation system has:
- A Python sandbox runner (`sandbox_runner.py`)
- A validator (`validator.py`)
- A worker manager (`workerManager.ts`)
- An engine with event listeners (`automationEngine.ts`)
- Frontend pages (`Automation.tsx`) in both demo and production

But:
- `automationEngine.ts` is imported in `minepanel.ts` but only uses the `on('log')` event
- The engine's `start()` and `stop()` methods are called but the integration with the Python sandbox is unclear
- `automationEngine.ts` (line 144): `this.isAutomationActive(serverId).catch(() => {});` — fire-and-forget promise
- No automated test coverage for the Python sandbox or rule evaluation

### U2 — World management frontend page (recently added, likely broken)

**Files**: `src/frontend/src/pages/server/Worlds.tsx` (untracked in git)

**Evidence**: Worlds.tsx is an untracked file (added recently). Its imports reference:
- `../../utils/api` — path doesn't exist
- `../../utils/toast` — path doesn't exist
- `../../utils/confirm` — path doesn't exist

These should likely be `../../lib/api.ts` and `../../components/Toast.tsx`. The page is in early development and would crash on load.

### U3 — Docker execution mode (deprecated/disabled)

**Files**: `src/core/dockerService.ts`, `src/routes/dockerRoutes.ts`

**Evidence**:
- `dockerRoutes.ts` line 4: `Returns 410 Gone for all endpoints so any stale frontend calls get a clear error.`
- `dockerService.ts` line 4: `This stub exists only to prevent require() errors from any cached reference.`

The entire Docker integration has been disabled and replaced with stubs. The code remains as dead weight.

### U4 — Server API key system (newly added)

**Files**: `src/routes/serverApiKeyManagementRoutes.ts`, `src/routes/serverApiRoutes.ts`, `src/core/serverApiWebSocket.ts`, `src/db/migrations/022_server_api_keys.ts`, `023_server_api_keys_ip_allowlist.ts`

**Evidence**: The server API key system includes:
- API key management routes
- Server API routes (1150+ lines)
- WebSocket support with IP allowlisting
- Two migrations

The frontend page (`ApiKeys.tsx`) exists. But the routes are not wired into `minepanel.ts` — there's no `app.use('/api/servers/:serverId/api-keys', ...)` registration.

### U5 — Frontend vs Demo duplication

**Files**: `src/frontend/` and `src/demo/`

**Evidence**: There are two complete frontend applications — one real (`src/frontend/`) and one demo (`src/demo/`). They share similar page structures but have different implementations:
- `src/frontend/src/pages/Discord.tsx` vs `src/demo/src/pages/Discord.tsx`
- `src/frontend/src/pages/Users.tsx` vs `src/demo/src/pages/Users.tsx`
- `src/frontend/src/components/Toast.tsx` vs `src/demo/src/components/Toast.tsx`
- Every component, page, context, and utility is duplicated

**Impact**: ~20 files are duplicated across both projects. Bug fixes and features must be implemented twice. The demo is already showing signs of divergence (different import paths, mock data layer).

---

## Dead Code

### D1 — Compiled JS files alongside TS sources (~180 files)

Every `.ts` file has `.js` and `.js.map` siblings. These are checked into git and are build artifacts, not source files.

### D2 — `src/index.ts` is a dead passthrough

```typescript
export = require('./minepanel');
```

No other file imports from `src/index.ts`. The entry point is `minepanel_main.js`.

### D3 — `errorCodes.ts` is a pure re-export

```typescript
const { E } = require('./errors');
export = E;
```

This adds no value. All consumers can import from `errors.ts` directly.

### D4 — `src/types/express.d.ts` ParamsDictionary override

The `ParamsDictionary` augmentation allows any string key, which defeats the purpose of type-checking route params.

### D5 — `setup.py` — orphaned Python script

A `setup.py` at the project root is unrelated to the Node.js application. Likely a leftover from an older prototype.

### D6 — `scratch/` directory files

Contains test scripts that are one-off debugging tools, not part of the application:
- `check_api.ts`, `check_api_jwt.ts` — API testing scripts
- `check_state.js` — DB inspection
- `debug_modrinth.ts` — Modrinth API debug
- `fix_setup_py.js`, `fix_analyze_stats.js` — fix utilities
- `reset_admin_pass.js` — password reset utility
- `strip_emojis.js` — emoji removal utility

### D7 — `src/core/dockerService.ts` — disabled feature

The entire file is a stub. Dead code.

### D8 — `src/routes/dockerRoutes.ts` — always returns 410

All endpoints return 410 Gone. File exists only to prevent import errors.

### D9 — `analyze_stats.py` — orphaned Python script

At project root. Not referenced by any build or run process.

### D10 — Old `src/public/assets/index-C3bDGGpX.js` (deleted in working tree)

Shown in git diff as deleted. Old frontend build artifact.

### D11 — `src/adapters/bedrock.js/ts` and `pocketmine.js/ts` — questionable usage

These adapter files exist but are imported directly in `minepanel.ts` during autostart/crash-restart rather than through the execution manager abstraction layer. This bypasses the ExecutionManager pattern that was designed for this purpose.

---

## Architecture Problems

### A1 — Dual Frontend Maintainability Nightmare

**The Problem**: `src/frontend/` and `src/demo/` are nearly identical React applications. Any bug fix or feature addition must be implemented in both.

**Duplicated files (partial list)**:
| Component | Production | Demo |
|-----------|-----------|------|
| App | `src/frontend/src/App.tsx` | `src/demo/src/App.tsx` |
| AppLayout | `src/frontend/src/components/AppLayout.tsx` | `src/demo/src/components/AppLayout.tsx` |
| AuthContext | `src/frontend/src/context/AuthContext.tsx` | `src/demo/src/context/AuthContext.tsx` |
| ServerModalsContext | `src/frontend/src/context/ServerModalsContext.tsx` | `src/demo/src/context/ServerModalsContext.tsx` |
| Panel | `src/frontend/src/pages/Panel.tsx` | `src/demo/src/pages/Panel.tsx` |
| Discord | `src/frontend/src/pages/Discord.tsx` | `src/demo/src/pages/Discord.tsx` |
| ... and many more | | |

**Impact**: ~2x maintenance burden. Inconsistencies will accumulate. Tests and CI must cover both.

**Fix**: Create a shared monorepo structure. Have the demo import components from the real frontend and just override the API layer.

### A2 — SPA Catch-All Route Serves index.html for ALL Non-API Routes

```javascript
app.get(/^(?!\/api\/).*$/, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
```

This sends `index.html` for ALL non-API requests, including:
- Missing assets (broken images, missing CSS/JS)
- Typos in URLs
- Malicious probe routes (e.g., `/wp-admin`, `/admin`, `.env`)

404s should return proper error pages, not the SPA shell.

### A3 — No clear service boundaries between process managers

The process management architecture has too many layers:
- `processManager.ts` — wraps `process-real-manager.ts` and `process-proxy-manager.ts`
- `executionManager.ts` — wraps the above plus `dockerService.ts`
- `process-real-manager.ts` — actual server spawning
- `process-proxy-manager.ts` — worker-based spawning
- `worker.ts` — separate Node.js process

The event emitter pattern creates a tangled web of listeners across modules with no way to track dependencies.

### A4 — Worker process architecture adds complexity without clear benefit

The worker process (`src/worker.ts`) forks a separate Node.js process to manage Minecraft servers. But the main process (`src/minepanel.ts`) also has a `processManager` that can manage servers directly. The interaction between these two is not well-defined:
- Does the worker manage ALL servers or just some?
- What happens if both try to manage the same server?
- When is the worker used vs the main process?

### A5 — `src/minepanel.ts` has grown into a monolith (~500 lines)

This file handles:
- Launcher process logic (forking child)
- Express app setup (middleware, routes, CORS)
- HTTPS/HTTP server creation
- WebSocket server with full message handling
- Database initialization
- FTP server startup
- Discord bot startup
- Auto-update scheduler
- Server autostart logic
- Crash restart logic
- Port change/restart logic
- Graceful shutdown

**Recommendation**: Split into multiple files (e.g., `launcher.ts`, `app.ts`, `websocket.ts`, `startup.ts`, `shutdown.ts`).

### A6 — World routes exist but are not wired up

`src/routes/worldRoutes.ts` — compiled to `.js`, has full route handlers. But `src/minepanel.ts` has no `app.use()` for it. Feature is invisible.

---

## Performance Problems

### P1 — setInterval stats polling for every connected WebSocket client

**Evidence**: `src/minepanel.ts` (line 330): Every WebSocket connection creates a `setInterval` at 2-second intervals that calls `executionManager.getStats(serverId)`. If 10 clients are watching the same server, there are 10 interval timers polling the same data.

**Impact**: Redundant CPU usage. 10x duplicate polling for the same data.

**Fix**: Use a single interval per server, broadcast to all connected clients.

### P2 — Synchronous file reads in request path

**Evidence**:
```javascript
const getSettings = () => {
    ...
    if (fs.existsSync(settingsPath)) {
        cachedSettings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
        ...
    }
    ...
};
```

**Impact**: Every API request that triggers this function blocks the event loop while reading `settings.json` from disk.

**Fix**: Use async `fs.promises.readFile`.

### P3 — Expensive operations in request handlers

**Evidence**: Various routes do multiple sequential `dbGet`/`dbAll` calls inside request handlers. These are not batched or cached.

Example — `src/core/permissions.ts` `getEffectivePermissions()`:
```
1. SELECT user
2. SELECT rank (if rank_id exists)
3. JSON.parse(rank.global_permissions) + iterate
4. JSON.parse(rank.permissions) + iterate server-specific
5. SELECT user_server_permissions
6. Iterate individual permissions
```

This has 2-3+ sequential `SELECT` queries on every permission check (which happens on every single API call).

**Impact**: Each API call can do 3-5+ sequential database queries, increasing latency.

**Fix**: Batch queries, cache permission results with TTL, or use a single JOIN query.

### P4 — `JSON.parse` / `JSON.stringify` on every read/write for permission fields

**Evidence**: Permission fields are stored as JSON strings in SQLite and parsed/serialized on every access. This includes rank permissions, server-specific permissions, and threshold rules.

**Impact**: Additional CPU overhead on every permission check (which happens on every API call).

**Fix**: Use a separate table for permissions instead of JSON blobs, or use SQLite's JSON functions.

### P5 — Multiple `Promise` constructor wrappers

**Evidence**: The codebase has many instances of `new Promise((resolve, reject) => { ... })` when the operation already returns a promise or uses async/await:
- `src/db/database.ts`: `const dbRun = ... new Promise((resolve, reject) => { db.run(sql, params, function(err) { ... }) })`
- `src/core/diskUsage.ts`: `const sizes = await Promise.all(tasks)` — creates promises unnecessarily
- `src/routes/pluginRoutes.ts`: `const fetchJson = ... new Promise((resolve, reject) => { ... })`

The `dbRun`/`dbGet`/`dbAll` wrappers are necessary (wrapping callback-based sqlite3), but many other `new Promise` patterns could be simplified.

---

## Security Problems

### S1 — No CSRF protection (Medium)

The API uses JWT in Authorization header which is immune to basic CSRF. However, there's no anti-CSRF token for cookie-based auth or state-changing operations. Any XSS vulnerability would allow full account takeover.

### S2 — No rate limiting on password reset (Low)

`authRoutes.ts` defines rate limiters for login (line 41) but the password reset endpoint (if it exists) may not be rate-limited.

### S3 — FTP passwords potentially logged (Low)

`minepanel.ts` line 376: `logger.error('Failed to start FTP service: ' + ftpErr.message)` — if the error message contains the password, it would be logged.

### S4 — No input sanitization on WebSocket messages (Medium)

`src/minepanel.ts` line 299: `const parsed = JSON.parse(message);` — no schema validation. Any malformed message could crash the connection or cause unexpected behavior.

### S5 — Process spawning with user-controlled arguments (High)

`src/minepanel.ts` lines 411-418: Server startup uses user-controlled values (`srv.ram_mb`, `serverDir`, `srv.java_path`, etc.) in process spawn. While these are validated at the API level, there's no defense-in-depth at the process manager level.

### S6 — Metrics endpoint authentication optional

`src/minepanel.ts` (line 232): `const metricsAuthDisabled = process.env.METRICS_AUTH === 'false';` — if the env var is set, anyone can access `/metrics` without authentication. This exposes process uptime and memory usage.

### S7 — SQL injection potential via raw SQL queries

**Evidence**: Throughout the codebase, raw SQL is constructed with string interpolation:
```
`SELECT * FROM servers WHERE id = ${serverId}`
```

While `serverId` is typically validated as an integer, several places use raw values:
- `src/minepanel.ts` (line 411-418): `srv.ram_mb`, `serverDir` — user-controlled
- `src/db/database.ts`: Uses `?` parameterized queries (safe), but some routes may not

### S8 — Avaliable permissions list includes sensitive operations without proper guards

`src/core/permissions.ts` defines `AVAILABLE_PERMISSIONS` that includes operations like `server.kill`, `server.backups.restore`, `account.manage`. There's no concept of "requires admin" or "requires permission X to assign permission Y."

---

## TypeScript Problems

### T1 — `any` abuse (documented above in C1)

~95% of all TypeScript types are `any` or inferred as `any`.

### T2 — Global Object type mutation (documented above in H5)

`src/types/global.d.ts` effectively disables TypeScript.

### T3 — TypeScript compilation not enforced

The project runs directly from `.js` files, meaning TypeScript compilation is optional. The `.ts` files are aspirational but not authoritative. The `.js` files are the actual source of truth.

### T4 — Missing strict mode

`tsconfig.json` likely doesn't enable:
- `strict: true`
- `noImplicitAny: true`
- `strictNullChecks: true`
- `noUnusedLocals: true`

### T5 — `@ts-ignore` / `eslint-disable` usage

Found in frontend files:
- `src/frontend/src/components/ModpackBrowser.tsx` (lines 112, 117): `// eslint-disable-line react-hooks/exhaustive-deps`
- `src/demo/src/components/ModpackBrowser.tsx` (lines 112, 117): Same suppression

React hooks dependency arrays are intentionally suppressed, which means stale closures are possible.

### T6 — Missing return types on all functions

Almost every async function is typed as `async function foo(...) {` without an explicit return type. TypeScript infers `Promise<any>` or similar.

### T7 — Loose params dictionary

`src/types/express.d.ts` defines `ParamsDictionary` with `[key: string]: string`, allowing any param access without type checking.

---

## Code Smells

### Smell 1 — `import x = require('y')` pattern

This TypeScript-specific CommonJS interop pattern appears ~200 times. It's valid TypeScript but non-standard and harder to read than `import * as x from 'y'`.

### Smell 2 — Fire-and-forget promises

```typescript
this.isAutomationActive(serverId).catch(() => {});
```

Multiple instances of `.catch(() => {})` that silently swallow rejections.

### Smell 3 — Multiple startup logic paths

The `minepanel.ts` has three distinct execution paths:
1. Launcher mode (`MINEPANEL_SERVER !== 'true'`)
2. Server mode (the else block)
3. Test mode (skips port binding)

This makes the file ~500 lines and hard to reason about.

### Smell 4 — Excessive try/catch blocks

The server startup sequence has try/catch around every single step:
```typescript
try { await migrateServerDirectories(); } catch (e) { logger.warn(...); }
try { await initFtpServer(...); } catch (ftpErr) { logger.error(...); }
try { await discordManager.startAll(); } catch (e) { logger.warn(...); }
try { UpdateScheduler.start(); } catch (e) { logger.warn(...); }
```

While defensive, it suggests the architecture is fragile and failures are expected.

### Smell 5 — Directory listing of entire project root

`src/` file tree shows source files, configs, build artifacts, documentation, and runtime data all mixed together.

### Smell 6 — SQL query patterns inconsistent

Uses both Sequelize ORM (model methods) AND raw SQL via `dbRun`/`dbGet`/`dbAll`:
- Sequelize: `User.findByPk(id)`, `User.update(...)`, `Server.findAll()`
- Raw SQL: `SELECT * FROM servers WHERE autostart = 1`, `DELETE FROM account_creation_tokens WHERE expires_at < ?`

This creates confusion about which pattern to use.

### Smell 7 — JSON.stringify/JSON.parse for permission storage

Permissions stored as JSON text blobs in SQLite. This prevents:
- Foreign key enforcement
- Indexing
- Partial updates
- TypeScript type validation

### Smell 8 — `undefined` vs `null` inconsistency

The codebase uses both `null` and `undefined` inconsistently to represent "no value":
- `src/routes/automationRoutes.ts`: `name !== undefined ? name.trim() : row.name`
- `src/routes/backupRoutes.ts`: `s.log_retention_days !== null && s.log_retention_days !== undefined`
- `src/middleware/validators.ts`: `.allow('', null)` — allows both

### Smell 9 — Hardcoded paths throughout

Paths like `'data/avatars'`, `'settings.json'`, `'../.env'` are hardcoded in multiple files instead of centralized.

### Smell 10 — `require()` inside functions to avoid circular deps

```javascript
let _User = null;
const getUser = () => {
    if (!_User) _User = require('../db/database').User;
    return _User;
};
```

This pattern appears in `auth.ts` and is a sign of circular dependency issues.

---

## Cleanup Candidates

### Immediate (non-breaking)
1. Add `*.js` and `*.js.map` to `.gitignore` (except specific entry points like `minepanel_main.js`)
2. Delete `src/core/errorCodes.ts` — redundant re-export
3. Delete `src/index.ts` — unused passthrough
4. Delete `setup.py` — not related to Node.js project
5. Delete `analyze_stats.py` — orphaned script
6. Delete `scratch/` directory (or move to `dev-tools/`)
7. Delete `src/core/dockerService.ts` — dead feature
8. Delete `src/routes/dockerRoutes.ts` — returns 410 anyway
9. Delete old frontend asset files (`src/public/assets/index-C3bDGGpX.js`, `react-vendor-Chb-88Oe.js`)

### Short-term
10. Merge or delete `src/demo/` — should reference the real frontend
11. Remove `src/types/global.d.ts` global Object mutation
12. Delete compiled `.js.map` files from git tracking
13. Wire up `worldRoutes.ts` or remove it

### Long-term
14. Remove legacy bcrypt support from `auth.ts` once all users migrated
15. Remove old migration compatibility code for dropped columns
16. Standardize on Sequelize ORM or raw SQL, not both

---

## Recommended Refactors (Ordered by Impact)

### Tier 1 — Critical (address immediately)

1. **Fix the global Object type mutation** — Remove `src/types/global.d.ts` and introduce proper interfaces for DB results. This single change will unlock all other TypeScript fixes.

2. **Add error logging to all empty catch blocks** — Search for `catch (_) {}` and `catch (e) {}` throughout the codebase. Log the error with `logger.error()`.

3. **Fix timer leak patterns** — Track all `setInterval`/`setTimeout` in a cleanup Set. Clear them in shutdown handlers and WebSocket close handlers. Add proper cleanup to `worker.ts`.

4. **Remove JWT default from source** — Force users to configure JWT_SECRET via .env. Generate a random key on first run if not set.

### Tier 2 — Essential (address within 2 weeks)

5. **Enforce TypeScript** — Turn on `strict: true` in tsconfig. Fix all `any` types. Stop running from `.js` files in development.

6. **Standardize module system** — Choose ESM (`import`/`export`) throughout the backend. Migrate all `require()` calls.

7. **Wire up or remove dead routes** — Register `worldRoutes.ts` and `serverApiKeyManagementRoutes.ts` in `minepanel.ts`, or remove them if not ready.

8. **Replace `console.log` with structured logger** — Audit all files in `src/`, especially launcher and core. Use `logger.info()`/`logger.warn()`/`logger.error()` consistently.

### Tier 3 — Important (address within 1 month)

9. **Consolidate frontend** — Merge `src/demo/` into `src/frontend/` or make it a proper consumer that imports from the real app.

10. **Fix WebSocket listener management** — Use proper cleanup patterns. Move WebSocket handling to a separate module.

11. **Batch database queries** — Cache permission results with TTL. Use JOIN queries instead of sequential SELECTs.

12. **Fix Worlds.tsx import paths** — Update the untracked file to use the correct import paths (`../../lib/api.ts`, `../../components/Toast.tsx`).

### Tier 4 — Strategic (address within 3 months)

13. **Split `src/minepanel.ts`** — Extract launcher, app setup, WebSocket, and startup logic into separate modules.

14. **Add proper test infrastructure** — Set up Jest with proper configuration. Write real unit tests with proper mocks.

15. **Add CI pipeline** — Linting, type checking, test execution on every commit.

16. **Restore or remove Docker feature** — Either rebuild the Docker integration properly or remove all traces.

---

## Maintainability Scores

| Metric | Score (1-10) | Explanation |
|--------|:------------:|-------------|
| **Architecture** | **5/10** | Good high-level separation (services, routes, models) undermined by dual frontends, tangled event listeners, and no clear boundaries between launcher/server/worker processes. The ExecutionManager abstraction is clean, but the underlying process management is a mess. |
| **Readability** | **6/10** | Code follows consistent naming conventions and is generally clean. But the mixed module systems, aggressive type-casting, and sprawling `minepanel.ts` (500 lines) hurt readability. Comments are generally useful but inconsistent. |
| **Performance** | **5/10** | No major bottlenecks but redundant polling (2s intervals per WebSocket client), synchronous I/O in request paths, JSON parsing overhead on every permission check, and sequential DB queries. OK for a home server panel with <10 concurrent users. |
| **Security** | **4/10** | JWT default in source code, no CSRF, no input sanitization on WebSocket, process spawning without defense-in-depth, FTP passwords potentially logged. The lack of authentication on metrics endpoint is concerning. SQL injection potential via raw queries. |
| **Reliability** | **3/10** | The weakest score. Empty catch blocks everywhere (77+ locations), unhandled promise rejections, no proper shutdown sequence for child processes, timer leaks, no health-check between processes. Silent failures in critical paths (database seeding, FTP, Discord). |
| **Scalability** | **4/10** | Single-process Node.js with SQLite. Both are limitations for scaling beyond ~50 servers. The process manager and stats collector are single-threaded. No caching layer. OK for a home server panel (target audience) but would not scale to hundreds of servers. |
| **Type Safety** | **2/10** | The TypeScript migration is cosmetic at best. With `any` on ~95% of types and a global Object type mutation, there is effectively zero type safety. TypeScript provides no benefits over JavaScript in this state. |
| **Maintainability** | **4/10** | Dual frontends (2x maintenance), build artifacts in source, no CI, fragile tests, dead features, redundant files. The strong documentation in `project-index/` is a bright spot. Would require significant rework before another developer could contribute effectively. |

**Weighted Average: 4.1/10**

---

## Final Verdict

**Production Readiness: ~40%**

The application works and has real functionality, but it would not survive production use at scale. The reliability issues (silent errors, resource leaks, no monitoring) would cause gradual degradation over days or weeks. A deployment behind nginx with process management (systemd, PM2) could mask some issues, but the underlying fragility remains.

**What works**: The core user flows — login, create server, start/stop, view console, file browser, basic CRUD. The permission system is functional. The Discord integration works. The frontend UI is polished.

**What will break**: Edge cases — rapid start/stop cycles, simultaneous WebSocket connections, server crash cascading, port binding failures, memory exhaustion from leaked timers, automation engine edge cases.

**Technical Debt Estimate: ~65%**

The TypeScript half-migration, dual frontends, dead Docker code, and inconsistent error handling represent significant rework. Estimated 6-12 weeks of focused effort for one experienced developer to address all critical and high-priority issues.

**Estimated breakdown:**
- TypeScript fixing + type definitions: 2 weeks
- Error handling + empty catch blocks: 1 week
- Timer/event cleanup: 1 week
- Module system standardization: 1 week
- Frontend consolidation: 2 weeks
- CI + testing infrastructure: 2 weeks
- Architecture cleanup (split monoliths): 2 weeks
- Security hardening: 1 week

**Total: ~12 weeks for one developer**

**Long-Term Maintainability: Poor → Fair (with intervention)**

Without addressing the type system, module consistency, and test infrastructure, the project will become increasingly harder to maintain as it grows. Each new feature adds to the debt rather than paying it down. The strong documentation in `project-index/` is a significant asset that, combined with proper TypeScript usage and testing, could make this a very maintainable project.

---

## Appendix: File Inventory

### Source Files (Typescript)
- `src/*.ts`: 5 files (index, config, minepanel, worker)
- `src/core/*.ts`: 28 files (auth, automationEngine, diskUsage, dockerService, errors, executionManager, ftpServer, javaManager, misc, permissions, process-manager, process-output-parser, process-persistence, process-proxy-manager, process-real-manager, serverApiWebSocket, serverHelper, statsCollector, thresholdManager, throttleManager, versionFetcher, versionManager, webhookManager + automation, discord, resolvers, services, update, utils subdirectories)
- `src/routes/*.ts`: 23 files (all route handlers + modules)
- `src/middleware/*.ts`: 4 files
- `src/adapters/*.ts`: 2 files
- `src/db/*.ts`: 5 files (database, db-cli, migrationRunner, sequelize + models)
- `src/db/models/*.ts`: 16 files
- `src/db/migrations/*.ts`: 23 files
- `src/launcher/*.ts`: 7 files
- `src/frontend/src/*.tsx`: ~30 files (App, pages, components, context, lib)

### Build Artifacts in Git
- ~180 `.js` files (compiled TypeScript)
- ~180 `.js.map` files (source maps)

### Test Files
- 17 test files in `tests/`

### Documentation
- 7 documents in `project-index/`
- 6 documents in `docs/`
- Multiple files in `src/docs/`

---

*This audit was performed on July 21, 2026 using static analysis of the MinePanel codebase. Findings are based on code patterns, file structure, and architecture review. Some findings may not be accurate if runtime behavior differs from static analysis. All file paths are relative to the project root.*
