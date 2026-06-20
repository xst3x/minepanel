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
├─
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
├─ github-assets/              [DOCS] Screenshots & images
│
└─ node_modules/               [DEPENDENCIES] Installed packages
   └─ ... (npm packages)
```

---

## Source Code Structure

### `src/` - Main Application

#### `src/minepanel.js` [CORE] (479 lines)
**Purpose**: Main Express server application
**Contains**:
- Express app initialization & middleware setup
- Launcher process logic (checks MINEPANEL_SERVER env var)
- Port binding with auto-retry on failure
- Route mounting (all API routes)
- WebSocket handler setup
- Server startup sequence
**Importance**: **CORE** — Don't modify launcher logic without understanding process lifecycle

#### `src/index.js`
**Purpose**: Unknown/legacy
**Importance**: LOW

---

### `src/config.js`
**Purpose**: Centralized configuration constants
**Exports**: SERVER_TYPES, VALID_SOFTWARE, PORT_RANGES, etc.
**Importance**: MEDIUM — Reference before adding new server software

---

### `src/db/` - Database Layer

#### `database.js` [CORE] (306 lines)
**Purpose**: Database initialization, model loading, backup/integrity operations
**Exports**:
- `initDb()`: Initialize Sequelize + run migrations
- `db`, `dbRun()`, `dbGet()`, `dbAll()`: Low-level query helpers
- `backupDatabase()`, `listBackups()`: Backup operations
- `checkIntegrity()`: DB integrity check
- `PREMADE_RANKS`: Default role definitions
**Importance**: **CORE** — Entry point for all DB operations

#### `sequelize.js`
**Purpose**: Sequelize connection configuration
**Contains**: SQLite3 connection setup, logger binding
**Importance**: MEDIUM — Modify if changing DB driver

#### `migrationRunner.js`
**Purpose**: Loads & executes pending migrations on startup
**Importance**: CORE — Handles schema evolution

#### `db-cli.js`
**Purpose**: Command-line tool for DB management
**Usage**: `npm run db migrate | backup | integrity | status`
**Importance**: MEDIUM

#### `models/` - Sequelize Model Definitions
| File | Table | Purpose | Importance |
|------|-------|---------|------------|
| `User.js` | users | Panel user accounts | **CORE** |
| `Server.js` | servers | Minecraft server instances | **CORE** |
| `ServerStats.js` | server_stats | Historical performance data | MEDIUM |
| `Rank.js` | ranks | Permission role definitions | HIGH |
| `UserServerPermission.js` | user_server_permissions | Per-server ACLs | HIGH |
| `UserServerRank.js` | user_server_ranks | Server-specific role assignment | HIGH |
| `Setting.js` | settings | Global panel configuration | MEDIUM |
| `DiscordBot.js` | discord_bots | Registered Discord bots | MEDIUM |
| `DiscordBotServer.js` | discord_bot_servers | Bot→Server assignment | MEDIUM |
| `DiscordIntegration.js` | discord_integrations | Server webhook configs | MEDIUM |
| `UserCustomAccent.js` | user_custom_accents | Theme color overrides | LOW |
| `Webhook.js` | webhooks | Generic webhooks | MEDIUM |
| `AccountCreationToken.js` | account_creation_tokens | Signup link tokens | MEDIUM |
| `AuditLog.js` | audit_logs | Admin action tracking | MEDIUM |

#### `migrations/` - Schema Evolution
| File | Description | Status |
|------|-------------|--------|
| `001_init.js` — `013_docker_execution_mode.js` | 13+ migrations | Active |

**Importance**: Do not modify executed migrations; create new ones for schema changes

---

### `src/routes/` - Express Route Handlers

| File | Endpoints | Purpose | Lines | Importance |
|------|-----------|---------|-------|------------|
| `serverRoutes.js` | `GET/POST/PATCH /api/server/*` | Server CRUD, start/stop/restart, files, properties | 1483 | **CORE** |
| `authRoutes.js` | `POST /auth/login`, `/verify`, `/totp`, etc. | Authentication, JWT, 2FA | HIGH | **CORE** |
| `fileRoutes.js` | `GET/POST /api/files/*` | Server file browser, upload, download, edit | HIGH | **CORE** |
| `userRoutes.js` | `GET/POST/PATCH /api/users/*` | User management, profile | MEDIUM |
| `rankRoutes.js` | `GET/POST/PATCH /api/ranks/*` | Permission group CRUD | MEDIUM |
| `backupRoutes.js` | `GET/POST /api/backup/*` | Backup list, create, restore | HIGH |
| `playerRoutes.js` | `GET/POST /api/players/*` | Ban, whitelist, OP management | MEDIUM |
| `pluginRoutes.js` | `GET/POST /api/plugins/*` | Plugin list, upload, ignore list | MEDIUM |
| `propertiesRoutes.js` | `GET/PATCH /api/properties/*` | server.properties editor | MEDIUM |
| `logRoutes.js` | `GET /api/logs/*` | Log file viewer | LOW |
| `systemRoutes.js` | `GET /api/system/*` | Panel stats, Java versions, RCON | MEDIUM |
| `statsRoutes.js` | `GET /api/stats/*` | Server stats time-series | MEDIUM |
| `discordRoutes.js` | `GET/POST /api/discord/*` | Discord webhook config | MEDIUM |
| `discordBotsRoutes.js` | `GET/POST /api/discord-bots/*` | Discord bot management | MEDIUM |
| `docsRoutes.js` | `GET /api/docs/*` | In-app documentation | LOW |
| `dockerRoutes.js` | `GET/POST /api/docker/*` | Docker execution mode settings | MEDIUM |
| `pocketmineRoutes.js` | `GET /api/pocketmine/*` | PocketMine-specific endpoints | LOW |
| `thresholdRoutes.js` | `GET/PATCH /api/thresholds/*` | CPU/RAM alert thresholds | LOW |

**Importance**: Routes are entry points for all API operations

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
| **auth.js** | JWT generation/verification, TOTP 2FA, password hashing | **CORE** |
| **permissions.js** | RBAC: role checks, per-server ACL evaluation | **CORE** |
| **processManager.js** | Spawn/monitor/kill JVM processes, emit WebSocket events | **CORE** |
| **executionManager.js** | Abstraction: delegates to processManager OR dockerService | **CORE** |
| **errorCodes.js** | Centralized error constants (ERROR_SERVER_NOT_FOUND, etc.) | MEDIUM |
| **errors.js** | Error class + sendError() utility | MEDIUM |
| **serverHelper.js** | Utilities: getServer(), getServerDir(), backup creation | **CORE** |
| **versionManager.js** | Server version compatibility checking | MEDIUM |
| **versionFetcher.js** | Fetch latest versions from resolvers | MEDIUM |
| **statsCollector.js** | Periodic CPU/RAM/player sampling, WebSocket broadcast | HIGH |
| **ftpServer.js** | Per-server FTP server (port, auth, mounting) | HIGH |
| **dockerService.js** | Docker container management via dockerode | MEDIUM |
| **migrationService.js** | Helper for schema migrations | LOW |
| **javaManager.js` | Detect Java versions, resolve java executable path | MEDIUM |
| **diskUsage.js** | Calculate server directory disk usage | LOW |
| **performance.js** | Performance monitoring utilities | LOW |
| **webhookManager.js** | Trigger webhooks on events (server start, crash, etc.) | LOW |
| **thresholdManager.js** | CPU/RAM threshold enforcement | LOW |
| **throttleManager.js** | Rate limiting utilities | LOW |

#### `src/core/resolvers/` - Software Version Resolvers
| File | Software | Method |
|------|----------|--------|
| `index.js` | Dispatcher | Route software type to resolver |
| `PaperMC.js` | PaperMC | GitHub API |
| `Forge.js` | Forge | Jenkins API |
| `Bukkit.js` | Bukkit/CraftBukkit | GitHub API |
| `Purpur.js` | Purpur | GitHub API |
| `Spigot.js` | Spigot | Custom scraper |
| `Bedrock.js` | Bedrock Edition | Microsoft API |
| `PocketMine.js` | PocketMine-MP | GitHub + RSS feed |
| `PowerNukkit.js` | PowerNukkit | GitHub API |
| `WaterdogPE.js` | WaterdogPE | GitHub API |

#### `src/core/discord/`
| File | Purpose |
|------|---------|
| `discordBot.js` | Discord.js bot initialization & event handlers |
| `discordWebhook.js` | Webhook posting utilities |
| Other files | Discord-specific helpers |

#### `src/core/update/`
| File | Purpose |
|------|---------|
| `BackupManager.js` | Create/restore backups |
| `RestoreManager.js` | Restore from backup |
| `UpdateManager.js` | Handle auto-update workflows |

#### `src/core/utils/`
| File | Purpose | Importance |
|------|---------|------------|
| `logger.js` | Winston logging setup | MEDIUM |
| `envHelper.js` | .env file operations, port updates | MEDIUM |
| `fsRetry.js` | Retry wrappers for file ops (handle EBUSY on Windows) | HIGH |
| Other files | Various utilities | LOW |

---

### `src/adapters/` - Software-Specific Adapters

| File | Purpose |
|------|---------|
| `bedrock.js` | Bedrock server launch config, RCON command mapping |
| `pocketmine.js` | PocketMine server launch config |

---

### `src/frontend/` - React Vite Application

#### Root Files
| File | Purpose |
|------|---------|
| `package.json` | Frontend dependencies & build scripts |
| `vite.config.js` | Vite bundler configuration |
| `index.html` | HTML entry point |
| `README.md` | Frontend documentation |

#### `src/frontend/src/`

**`main.jsx`** — Entry point, mounts React app to DOM

**`App.jsx`** — Top-level router, route definitions

**Components** (`components/`)
| File | Purpose | Reusable |
|------|---------|----------|
| `AppLayout.jsx` | Main nav, theme provider, logo/favicon | Yes |
| `ServerLayout.jsx` | Server context wrapper (`:serverId` param) | Yes |
| `RequireAuth.jsx` | Protected route guard | Yes |
| `CodeEditor.jsx` | CodeMirror-based syntax editor | Yes |
| `Select.jsx` | Dropdown/select component | Yes |
| `Toast.jsx` | Notification system | Yes |
| `BgCanvas.jsx` | Animated background | No |

**Pages** (`pages/`)
| File | Route | Purpose |
|------|-------|---------|
| `Login.jsx` | `/login` | Authentication UI |
| `Panel.jsx` | `/` | Dashboard |
| `Servers.jsx` | `/servers` | Server list & creation |
| `Settings.jsx` | `/settings` | Panel configuration |
| `Users.jsx` | `/users` | User management |
| `Ranks.jsx` | `/ranks` | Permission group editor |
| `Profile.jsx` | `/profile` | User settings, 2FA, theme |
| `Discord.jsx` | `/discord` | Discord bot config |
| `Docs.jsx` | `/docs` | Documentation viewer |

**Server Sub-Pages** (`pages/server/`) — All nested under `/server/:serverId/`
| File | Route | Purpose |
|------|-------|---------|
| `Overview.jsx` | `overview` | Server status & quick stats |
| `Console.jsx` | `console` | Live command line |
| `Files.jsx` | `files` | File browser & editor |
| `Backup.jsx` | `backup` | Backup management |
| `Plugins.jsx` | `plugins` | Plugin manager |
| `Properties.jsx` | `properties` | server.properties editor |
| `Players.jsx` | `players` | Whitelist, bans, OPs |
| `Settings.jsx` | `settings` | Server-specific config |
| `Stats.jsx` | `stats` | Performance graphs |
| `Logs.jsx` | `logs` | Log file viewer |

**Context** (`context/`)
| File | Purpose |
|------|---------|
| `AuthContext.jsx` | Global auth state, user info, token management |

**Libraries** (`lib/`)
| File | Purpose |
|------|---------|
| `api.js` | Axios HTTP client with token injection, error handling |

**Styling** (`styles/`)
| File | Purpose |
|------|---------|
| `style.css` | Global styles, CSS variables, theme definitions |

**Legacy** (`legacy/`)
- Old HTML/JS implementation (kept for reference)
- Not actively used

---

## Testing

### Test Files (`tests/`)
| File | Coverage |
|------|----------|
| `api_test.js` | API endpoint integration tests |
| `auth.test.js` | Authentication workflows |
| `backups.test.js` | Backup/restore operations |
| `errors.test.js` | Error handling |
| `files.test.js` | File operations |
| `panel.test.js` | Panel core functionality |
| `security.test.js` | Security/permission tests |
| `server.test.js` | Server CRUD operations |
| `validation.test.js` | Input validation |
| Others | Specialized tests (magma, parsing, etc.) |

**Run**: `npm test`

---

## Configuration Files

| File | Purpose |
|------|---------|
| `.env` | Environment variables (PORT, JWT_SECRET, DATA_DIR, etc.) |
| `.gitignore` | Git ignore rules |
| `.gitattributes` | Git attributes (line endings, etc.) |
| `settings.json` | Runtime panel settings (persisted to DB) |

---

## Summary Table

| Category | Count | Core Files |
|----------|-------|-----------|
| Routes | 18 | serverRoutes, authRoutes, fileRoutes |
| Models | 14 | User, Server, Rank, Permission |
| Migrations | 13+ | Schema evolution |
| Core Services | 15+ | ProcessManager, ExecutionManager, StatsCollector |
| Resolvers | 10 | PaperMC, Forge, Bedrock, etc. |
| Frontend Pages | 18 | Login, Panel, Servers, Settings, etc. |
| Frontend Components | 7 | AppLayout, ServerLayout, CodeEditor, etc. |
| Tests | 10+ | Various coverage |
| Total Lines (Backend) | ~15,000+ | Estimated |
| Total Lines (Frontend) | ~8,000+ | Estimated |

---

## File Importance Legend

- **CORE**: Essential to system operation; breaking changes here cascade widely
- **HIGH**: Important business logic; changes require careful testing
- **MEDIUM**: Significant functionality; modifications affect features
- **LOW**: Utilities or optional features; safe to modify

Always check dependencies before modifying CORE files.
