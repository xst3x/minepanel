# MinePanel: File Structure Map

Complete hierarchical breakdown of all project files and their purposes.

---

## Root Directory Structure

```
MinePanel/
├─ minepanel_main.js          [CORE] Entry point: spawns src/minepanel.js
├─ src/minepanel.js           [CORE] Main server: Express app, WebSocket, launcher logic
├─ package.json               [CONFIG] Dependencies & npm scripts
├─ package-lock.json          [CONFIG] Lockfile
├─ .env                        [CONFIG] Environment variables (PORT, JWT_SECRET, etc.)
├─ .gitignore                  [CONFIG] Git ignore rules
├─ README.md                   [DOCS] Project README
├─ LICENSE                     [DOCS] License file
├─ setup.py                    [UTIL] Python setup utility
├─ Build.bat / Run.bat         [UTIL] Windows batch scripts
│
├─ data/                        [RUNTIME] Database & application data
│  ├─ minepanel.db            Database file (SQLite3)
│  ├─ db/                      Database storage
│  │  └─ backups/             Database backup snapshots
│  ├─ avatars/                 User avatar images
│  └─ sftp_host_key           FTP server SSH host key
│
├─ logs/                        [RUNTIME] Log files
│  ├─ minepanel.log           Main application log
│  └─ error.log               Error log
│
├─ cache/                       [RUNTIME] Version resolver cache
│  ├─ jars/                   Downloaded JAR files
│  │  ├─ github/
│  │  ├─ jenkins/
│  │  ├─ mojang/
│  │  ├─ mojang-bedrock/
│  │  ├─ papermc/
│  │  ├─ purpur/
│  │  └─ minecraftforge/
│  └─ resolvers/              Cached version metadata JSON
│     ├─ bds.json
│     ├─ pocketmine.json
│     └─ ... (other software versions)
│
├─ servers/                     [RUNTIME] Individual server instances
│  ├─ forge/                   Example Forge server directory
│  │  ├─ server.jar
│  │  ├─ server.properties
│  │  ├─ eula.txt
│  │  ├─ mods/
│  │  ├─ logs/
│  │  └─ world/
│  ├─ vanilla/
│  ├─ test/                    Bedrock server example
│  ├─ purpur/
│  └─ ... (user-created servers)
│
├─ docker/                      [CONFIG] Docker deployment
│  ├─ Dockerfile              Production image definition
│  ├─ docker-compose.yml       Docker Compose config
│  ├─ .env.docker             Docker-specific env vars
│  └─ .dockerignore           Docker build ignore rules
│
├─ docs/                        [DOCS] User documentation
│  ├─ getting-started.md
│  ├─ configuration.md
│  ├─ server-management.md
│  ├─ users-permissions.md
│  ├─ ranks.md
│  └─ discord-bot.md
│
├─ project-index/              [DOCS] AI-Readable system map (this folder)
│  ├─ INDEX.md                Navigation & quick reference
│  ├─ PROJECT_OVERVIEW.md     Architecture & core modules
│  ├─ FILE_TREE.md            This file
│  ├─ API_ROUTES.md           All HTTP endpoints
│  ├─ BACKEND_MAP.md          Services & data flows
│  ├─ DATABASE.md             Schema & relationships
│  ├─ FRONTEND_MAP.md         React components & pages
│  └─ SYSTEM_BEHAVIOR.md      Workflows & state machines
│
├─ github-assets/              [DOCS] Screenshots & images
│
└─ node_modules/               [DEPENDENCIES] Installed packages
```

---

## Source Code: Backend Structure

### `src/minepanel.js` [CORE] (479 lines)
**Purpose**: Main Express server application
- Express app initialization & middleware setup
- Launcher process logic (checks MINEPANEL_SERVER env var)
- Port binding with auto-retry on failure
- Route mounting (all API routes)
- WebSocket handler setup
- Server startup sequence

---

### `src/config.js`
**Purpose**: Centralized configuration constants
**Exports**: SERVER_TYPES, VALID_SOFTWARE, PORT_RANGES, etc.
**Importance**: MEDIUM — Reference before adding new server software

---

### `src/db/` - Database Layer

| File | Purpose | Importance |
|------|---------|------------|
| `database.js` | DB initialization, model loading, backup/integrity | **CORE** |
| `sequelize.js` | Sequelize connection, SQLite3 config | MEDIUM |
| `migrationRunner.js` | Load & execute migrations on startup | **CORE** |
| `db-cli.js` | CLI tool for DB management | MEDIUM |

**Models** (`src/db/models/`):
- `User.js` — Panel user accounts (**CORE**)
- `Server.js` — Minecraft server instances (**CORE**)
- `ServerStats.js` — Performance time-series
- `Rank.js` — Permission role definitions
- `UserServerPermission.js` — Per-server ACLs
- `UserServerRank.js` — Server-specific roles
- `Setting.js` — Panel config
- `DiscordBot.js`, `DiscordBotServer.js`, `DiscordIntegration.js` — Discord integration
- `Webhook.js` — Generic webhooks
- `UserCustomAccent.js` — Theme color overrides
- `AccountCreationToken.js` — Signup tokens
- `AuditLog.js` — Admin activity log

**Migrations** (`src/db/migrations/`):
- `001_init.js` through `013_docker_execution_mode.js`
- 13+ migrations handling schema evolution

---

### `src/routes/` - Express Route Handlers

| File | Endpoints | Purpose | Importance |
|------|-----------|---------|------------|
| `serverRoutes.js` | `/api/server/*` | Server CRUD, start/stop/restart, files, properties | **CORE** |
| `authRoutes.js` | `/auth/*` | Authentication, JWT, 2FA | **CORE** |
| `fileRoutes.js` | `/api/files/*` | File browser, upload, download, edit | **CORE** |
| `backupRoutes.js` | `/api/backup/*` | Backup list, create, restore | HIGH |
| `playerRoutes.js` | `/api/players/*` | Ban, whitelist, OP management | MEDIUM |
| `pluginRoutes.js` | `/api/plugins/*` | Plugin list, upload, ignore | MEDIUM |
| `userRoutes.js` | `/api/users/*` | User CRUD, profile | MEDIUM |
| `rankRoutes.js` | `/api/ranks/*` | Permission group CRUD | MEDIUM |
| `propertiesRoutes.js` | `/api/properties/*` | server.properties editor | MEDIUM |
| `logRoutes.js` | `/api/logs/*` | Log file viewer | LOW |
| `systemRoutes.js` | `/api/system/*` | Panel stats, Java detection | MEDIUM |
| `statsRoutes.js` | `/api/stats/*` | Performance time-series | MEDIUM |
| `discordRoutes.js` | `/api/discord/*` | Webhook config | MEDIUM |
| `discordBotsRoutes.js` | `/api/discord-bots/*` | Bot management | MEDIUM |
| `docsRoutes.js` | `/api/docs/*` | Documentation viewer | LOW |
| `dockerRoutes.js` | `/api/docker/*` | Docker execution settings | MEDIUM |
| `pocketmineRoutes.js` | `/api/pocketmine/*` | PocketMine-specific | LOW |
| `thresholdRoutes.js` | `/api/thresholds/*` | CPU/RAM alerts | LOW |

---

### `src/middleware/` - Express Middleware

| File | Purpose | Importance |
|------|---------|------------|
| `validation.js` | Joi schema validation wrapper | **CORE** |
| `validators.js` | Joi schemas for all endpoints | **CORE** |
| `requestLogger.js` | HTTP request/response logging | MEDIUM |

---

### `src/core/` - Core Business Logic & Services

| File | Purpose | Importance |
|------|---------|------------|
| `auth.js` | JWT, TOTP 2FA, password hashing | **CORE** |
| `permissions.js` | RBAC, per-server ACL evaluation | **CORE** |
| `processManager.js` | Spawn/monitor/kill JVM, emit events | **CORE** |
| `executionManager.js` | Abstraction: native vs Docker | **CORE** |
| `serverHelper.js` | Utilities, findAvailablePort(), isPortAvailable() | **CORE** |
| `statsCollector.js` | CPU/RAM/player sampling, broadcast | HIGH |
| `versionManager.js` | Version compatibility checking | MEDIUM |
| `versionFetcher.js` | Fetch versions from resolvers | MEDIUM |
| `ftpServer.js` | Per-server FTP (port, auth, mount) | HIGH |
| `dockerService.js` | Docker container management | MEDIUM |
| `javaManager.js` | Detect Java versions | MEDIUM |
| `diskUsage.js` | Calculate server directory size | LOW |
| `webhookManager.js` | Trigger webhooks on events | LOW |
| `errorCodes.js` | Error constants | MEDIUM |
| `errors.js` | Error class + utility | MEDIUM |

**Resolvers** (`src/core/resolvers/`):
- `index.js` — Dispatcher
- `PaperMC.js`, `Forge.js`, `Bukkit.js`, `Purpur.js` — Java servers
- `Bedrock.js`, `PocketMine.js`, `PowerNukkit.js`, `WaterdogPE.js` — Non-Java

**Discord** (`src/core/discord/`):
- `discordBot.js` — Bot initialization & handlers
- `discordWebhook.js` — Webhook utilities

**Update** (`src/core/update/`):
- `BackupManager.js` — Backup creation
- `RestoreManager.js` — Backup restore
- `UpdateManager.js` — Auto-update workflows

**Utils** (`src/core/utils/`):
- `logger.js` — Winston logging
- `envHelper.js` — .env operations
- `fsRetry.js` — Retry wrappers (Windows EBUSY handling)

---

### `src/adapters/` - Software-Specific Adapters

| File | Purpose |
|------|---------|
| `bedrock.js` | Bedrock server config, RCON mapping |
| `pocketmine.js` | PocketMine server config |

---

## Frontend: React/Vite Application

### `src/frontend/` Structure

**Root Files**:
- `package.json` — Frontend dependencies & build scripts
- `vite.config.js` — Vite bundler configuration
- `index.html` — HTML entry point
- `README.md` — Frontend documentation

### `src/frontend/src/` - React Source

**Main**:
- `main.jsx` — Entry point, mounts to DOM
- `App.jsx` — Top-level router, route definitions

**Components** (`components/`):
| File | Purpose | Reusable |
|------|---------|----------|
| `AppLayout.jsx` | Main nav, theme, logo/favicon | Yes |
| `ServerLayout.jsx` | Server context wrapper | Yes |
| `RequireAuth.jsx` | Protected route guard | Yes |
| `CodeEditor.jsx` | CodeMirror syntax editor | Yes |
| `Select.jsx` | Reusable dropdown | Yes |
| `Toast.jsx` | Notifications | Yes |
| `BgCanvas.jsx` | Animated background | No |

**Pages** (`pages/`):
| File | Route | Purpose |
|------|-------|---------|
| `Login.jsx` | `/login` | Authentication UI |
| `Panel.jsx` | `/` | Dashboard + modals |
| `Servers.jsx` | `/servers` | Server list |
| `Settings.jsx` | `/settings` | Panel config |
| `Users.jsx` | `/users` | User management |
| `Ranks.jsx` | `/ranks` | Permission groups |
| `Profile.jsx` | `/profile` | User settings |
| `Discord.jsx` | `/discord` | Bot config |
| `Docs.jsx` | `/docs` | Documentation |

**Server Pages** (`pages/server/`):
- `Overview.jsx` — Status & quick stats
- `Console.jsx` — Live command line
- `Files.jsx` — File browser
- `Backup.jsx` — Backup management
- `Plugins.jsx` — Plugin manager
- `Properties.jsx` — server.properties editor
- `Players.jsx` — Player management
- `Settings.jsx` — Server config
- `Stats.jsx` — Performance graphs
- `Logs.jsx` — Log viewer

**Context** (`context/`):
- `AuthContext.jsx` — Global auth state

**Libraries** (`lib/`):
- `api.js` — Axios wrapper with token injection

**Styling** (`styles/`):
- `style.css` — Global styles, CSS variables, themes

**Legacy** (`legacy/`):
- Old HTML/JS implementation (reference only)

---

## Testing

### Test Files (`tests/`)
| File | Coverage |
|------|----------|
| `api_test.js` | API endpoints |
| `auth.test.js` | Authentication |
| `backups.test.js` | Backup/restore |
| `errors.test.js` | Error handling |
| `files.test.js` | File operations |
| `panel.test.js` | Panel core |
| `security.test.js` | Permissions |
| `server.test.js` | Server CRUD |
| `validation.test.js` | Input validation |

---

## Summary

| Category | Count | Core Files |
|----------|-------|-----------|
| Routes | 18 | serverRoutes, authRoutes, fileRoutes |
| Models | 14 | User, Server, Rank, Permission |
| Migrations | 13+ | Schema evolution |
| Core Services | 15+ | ProcessManager, StatsCollector, etc. |
| Resolvers | 10 | PaperMC, Forge, Bedrock, etc. |
| Frontend Pages | 18 | Login, Panel, Servers, etc. |
| Frontend Components | 7 | AppLayout, ServerLayout, etc. |
| Tests | 10+ | Various coverage |
| **Total Lines** | ~23,000+ | Backend + Frontend |

---

## File Importance Legend

- **CORE**: Essential to system operation; breaking changes cascade widely
- **HIGH**: Important business logic; changes require careful testing
- **MEDIUM**: Significant functionality; modifications affect features
- **LOW**: Utilities or optional features; safe to modify