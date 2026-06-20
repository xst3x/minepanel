# MinePanel: Project Overview

## What This Project Does

MinePanel is a **self-hosted Minecraft server management panel** that enables users to create, run, and administer multiple Minecraft servers from a single unified web interface. It provides comprehensive server control, player management, backup/restore, plugin administration, and real-time monitoring.

### Key Capabilities
- **Multi-server management**: Create and manage Java, Bedrock, PocketMine, and other server types
- **Real-time server control**: Start, stop, restart, kill server processes
- **Console access**: Monitor and execute commands on servers live
- **File management**: Upload, download, edit server files via web UI
- **Backup system**: Automated and manual backups with configurable retention
- **Player management**: Whitelist, ban, OP controls, player statistics tracking
- **Plugin management**: View, upload, manage plugins with ignoration lists
- **FTP server**: Built-in per-server FTP access for file transfers
- **User & permission system**: Role-based access control (Owner, Admin, Manager, Moderator, Guest)
- **Discord integration**: Bot management and server webhook integration
- **Statistics & monitoring**: CPU, RAM, player count, server uptime tracking
- **Docker support**: Per-server Docker execution mode (native or containerized)

---

## System Architecture

### High-Level Layers

```
┌─────────────────────────────────────┐
│       Web Browser                   │
│   (React/Vite SPA Frontend)        │
└────────────────┬────────────────────┘
                 │ HTTP/REST + WebSocket
                 ▼
┌─────────────────────────────────────┐
│  Express.js Backend (Node.js)       │
│  - REST API routes                  │
│  - WebSocket handlers               │
│  - Auth & authorization             │
│  - Business logic                   │
└────────┬────────────────────┬───────┘
         │                    │
         ▼                    ▼
┌─────────────────┐   ┌──────────────────────┐
│  SQLite3 DB     │   │  Core Services       │
│  - Models       │   │  - ProcessManager    │
│  - Migrations   │   │  - ExecutionManager  │
│                 │   │  - VersionManager    │
│                 │   │  - BackupManager     │
│                 │   │  - StatsCollector    │
│                 │   │  - FtpServer         │
│                 │   │  - DockerService     │
└─────────────────┘   └──────────────────────┘
         △                    │
         │                    ▼
         │            ┌───────────────────┐
         └────────────│ Server Processes  │
                      │ & Minecraft JAR   │
                      └───────────────────┘
```

---

## Core Architecture Decision: Launcher-Server Pattern

MinePanel uses a **two-process launcher pattern**:

### Process 1: Launcher (minepanel_main.js → src/minepanel.js parent)
- Runs first, handles process lifecycle
- Manages port reallocation if binding fails
- Re-launches server on exit code 100 (port change requested)
- Rolls back to last-known-good port on exit code 101 (bind failure)

### Process 2: Server (src/minepanel.js with MINEPANEL_SERVER=true)
- The actual Express app + WebSocket handler
- Runs child spawned by launcher
- Can request new port (exit 100) or trigger rollback (exit 101)
- Handles all API routes, database, and backend logic

**Why**: Allows dynamic port changes without human intervention. If port 8082 is in use, the system tries adjacent ports automatically.

---

## Data Flow: User Request Lifecycle

```
Browser Request (e.g., POST /api/server/:id/update/settings)
    │
    ▼
Express Route Handler (src/routes/serverRoutes.js)
    │
    ├─► Authentication Middleware (authenticateToken)
    │       → Verify JWT token from request header
    │       → Reject if invalid/expired
    │
    ├─► Permission Check (checkPermission)
    │       → Lookup user role + specific server permissions
    │       → Verify permission against required scope (e.g., 'server.properties.write')
    │       → Reject with 403 if insufficient
    │
    ├─► Input Validation (validate + V.*)
    │       → Joi schema validation on body/params
    │       → Sanitize inputs (SQL injection prevention, path traversal)
    │
    ├─► Core Service Layer
    │   ├─ Database Operations (dbRun, dbGet, dbAll)
    │   │       → Query/update SQLite3 via Sequelize ORM
    │   │
    │   ├─ Process Management (processManager)
    │   │       → Start/stop/restart server processes
    │   │       → Monitor JVM via pidusage
    │   │
    │   ├─ Backup Management (createBackup)
    │   │       → Snapshot server directory
    │   │       → Compress to ZIP
    │   │
    │   └─ File Operations (fs + fsRetry wrappers)
    │       → Handle concurrent file access
    │       → Prevent race conditions
    │
    ▼
Response JSON + Status Code
    │
    ▼
Browser Receives & Updates UI State (React)
```

---

## Core Modules Overview

### 1. **Database Layer** (`src/db/`)
- **database.js**: Initialization, models loading, backup/integrity functions
- **sequelize.js**: SQLite3 connection configuration
- **migrationRunner.js**: Execute pending migrations on startup
- **models/**: 14 Sequelize models (User, Server, Rank, Webhook, etc.)
- **migrations/**: 15+ migrations for schema evolution

**Key Models**:
- `User`: Panel accounts with roles
- `Server`: Minecraft server instances
- `ServerStats`: Time-series performance data
- `Rank`: Hierarchical permission groups
- `UserServerPermission`: Granular per-server permissions
- `DiscordBot`, `DiscordIntegration`, `Webhook`: Discord integration data
- `AuditLog`: Admin activity tracking

### 2. **Authentication & Authorization** (`src/core/auth.js` + `src/core/permissions.js`)
- JWT token generation/verification
- Two-factor auth (TOTP + backup codes)
- Role-based access control (RBAC)
- Per-server fine-grained permissions
- Audit logging for sensitive operations

### 3. **Process Management** (`src/core/processManager.js`)
- Spawns and monitors Minecraft server JVM processes
- Tracks PID, memory, CPU via `pidusage`
- Handles graceful shutdown (SIGTERM) before force-kill (SIGKILL)
- Emits process state changes to WebSocket clients
- Supports both native spawning and Docker containerization

### 4. **Execution Manager** (`src/core/executionManager.js`)
- Abstraction layer between API routes and process managers
- Delegates to native `processManager.js` OR Docker `dockerService.js`
- Respects server's `execution_mode` setting (native / docker)
- Provides consistent interface regardless of underlying executor

### 5. **Backup System** (`src/core/update/`)
- `BackupManager`: Archive server world + configs
- `RestoreManager`: Extract from backup ZIP, rebuild state
- Automated backup scheduling (configurable intervals)
- Retention policy enforcement
- Backup integrity validation

### 6. **Software Version Resolution** (`src/core/resolvers/`)
- `PaperMC.js`, `Forge.js`, `Bukkit.js`, `Purpur.js`: Java server versions
- `Bedrock.js`, `PocketMine.js`, `PowerNukkit.js`, `WaterdogPE.js`: Non-Java versions
- Uses GitHub Releases API + RSS feed fallback
- Caches versions in `cache/resolvers/` to minimize API calls
- Provides JAR download capability

### 7. **File System** (`src/core/serverHelper.js` + `src/core/utils/fsRetry.js`)
- `SERVERS_DIR`: Root directory for all server folders
- Helper functions: `getServer()`, `getServerDir()`, `sanitizeDirName()`
- Retry wrappers for concurrent file ops (handle EBUSY on Windows)
- Prevents directory traversal attacks via path validation

### 8. **Real-Time Updates** (`WebSocket` in `src/minepanel.js`)
- Bi-directional communication for console output, stats, process events
- Auth via JWT token in WebSocket headers
- Routes: `server:stats`, `server:console`, `server:process-state`
- Emitted by ProcessManager and StatsCollector

### 9. **Statistics Collector** (`src/core/statsCollector.js`)
- Periodic sampling of server CPU, RAM, player count
- Writes to `ServerStats` table every ~2-10 seconds (configurable)
- Supports thresholds (alerts when CPU/RAM exceeds limits)
- Tracks historical data for trending & analytics

### 10. **FTP Server** (`src/core/ftpServer.js`)
- Per-server FTP access on configurable ports
- Username/password auth (bcrypt-hashed)
- Maps to server directories securely
- Uses `ftp-srv` Node.js package

### 11. **Docker Support** (`src/core/dockerService.js`)
- Abstraction over `dockerode` library
- Per-server container spawning
- Volume mounting for persistence
- Network configuration (port mapping)
- Container state tracking (running/stopped/exited)

---

## Frontend Architecture

### Framework & Build
- **React 18** with **Vite** bundler
- Located in `src/frontend/` (separate workspace in package.json)
- Hot module reloading (HMR) for development
- CSS modular styling (no framework dependencies)

### Page Structure
- **Login.jsx**: Authentication entry point
- **Panel.jsx**: Dashboard (server overview, quick actions)
- **Servers.jsx**: Server list with creation/deletion UI
- **Settings.jsx**: Global panel config, user management
- **Users.jsx**: User account management
- **Ranks.jsx**: Permission group editor
- **Profile.jsx**: User settings, 2FA setup, custom theme colors
- **Discord.jsx**: Discord bot & webhook configuration
- **Docs.jsx**: In-app documentation browser

### Server-Specific Pages (nested under server context)
```
pages/server/
├─ Overview.jsx    // Server status, quick stats
├─ Console.jsx     // Live command line + output
├─ Files.jsx       // File browser, editor, upload
├─ Backup.jsx      // Backup list, create, restore
├─ Plugins.jsx     // Plugin manager
├─ Properties.jsx  // server.properties editor
├─ Players.jsx     // Player list, ban/whitelist
├─ Settings.jsx    // Server-specific config (auto-update, FTP, etc.)
├─ Stats.jsx       // Performance graphs, logs
└─ Logs.jsx        // Error & crash log viewer
```

### Component Hierarchy
- **AppLayout.jsx**: Main nav wrapper, theme provider
- **ServerLayout.jsx**: Server context wrapper (sets :serverId param)
- **RequireAuth.jsx**: Protected route guard
- **CodeEditor.jsx**: Syntax-highlighted code viewer/editor (CodeMirror)
- **Select.jsx**: Reusable dropdown component
- **Toast.jsx**: Notification system

### State Management
- **React Context** (AuthContext.jsx): Global auth state + user info
- **React useState/useReducer**: Per-page component state
- **API client** (lib/api.js): Axios-based HTTP wrapper with token injection

### Styling
- **CSS Variables**: Theming via `--accent`, `--accent-hover`, `--bg-surface`, etc.
- **No external CSS framework**: Pure CSS with custom design system
- **Dark-first**: Default dark theme with optional light mode
- **Strict style rules** (per your requirements):
  - No gradients
  - No emojis in code/UI
  - No marketing language in comments

---

## Request-Response Patterns

### REST API Format
```javascript
// Standard Success Response
{
  success: true,
  data: { /* entity */ }
}

// Standard Error Response
{
  success: false,
  error: "ERROR_CODE",
  message: "Human-readable message"
}

// Validation Error (400)
{
  success: false,
  error: "VALIDATION_ERROR",
  message: "...",
  details: [{ field: "name", message: "..." }]
}

// Auth Error (401)
{
  success: false,
  error: "UNAUTHORIZED",
  message: "Token expired or invalid"
}

// Permission Error (403)
{
  success: false,
  error: "FORBIDDEN",
  message: "Insufficient permissions"
}
```

### WebSocket Messages
```javascript
// Client -> Server: Subscribe to server stats
{
  type: "subscribe",
  channel: "server:stats",
  serverId: 1
}

// Server -> Client: Stats update
{
  type: "server:stats",
  serverId: 1,
  payload: {
    cpu: 25.5,
    memory_mb: 1024,
    players_online: 5,
    timestamp: 1718000000
  }
}

// Client -> Server: Execute console command
{
  type: "console:command",
  serverId: 1,
  command: "say Hello"
}

// Server -> Client: Console output line
{
  type: "server:console",
  serverId: 1,
  line: "[15:30:45] [Server thread/INFO]: Hello"
}
```

---

## Key Dependencies

### Backend
- **express**: HTTP server framework
- **sequelize** + **sqlite3**: ORM + database driver
- **jsonwebtoken**: JWT auth
- **bcrypt**: Password hashing
- **ws**: WebSocket support
- **dockerode**: Docker API client
- **ftp-srv**: FTP server implementation
- **axios**: HTTP client (for resolver version fetching)
- **winston**: Structured logging
- **joi**: Input validation schemas

### Frontend
- **react**: UI framework
- **react-router-dom**: Client-side routing
- **axios**: HTTP client
- **@codemirror**: Code editor component

### Development
- **jest**: Unit & integration testing
- **nodemon**: Dev server auto-reload
- **vite**: Frontend bundler
