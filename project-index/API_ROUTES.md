# MinePanel: API Routes Index

Complete mapping of all HTTP API endpoints with method, path, handler location, purpose, and dependencies.

---

## Authentication Routes (`src/routes/authRoutes.js`)

### POST /auth/login
- **Location**: `src/routes/authRoutes.js` → `router.post('/login')`
- **Purpose**: Authenticate user with username/password
- **Input Schema**: `{ username: string, password: string }`
- **Output**: `{ success: true, data: { token: string, user: {...} } }`
- **Dependencies**: `User` model, `auth.js` (JWT generation), `bcrypt`
- **Notes**: Returns JWT token for subsequent requests

### POST /auth/logout
- **Location**: `src/routes/authRoutes.js`
- **Purpose**: Client-side token invalidation (server-side: no-op)
- **Auth Required**: Yes (JWT)
- **Dependencies**: None

### POST /auth/verify
- **Location**: `src/routes/authRoutes.js`
- **Purpose**: Verify JWT token validity
- **Input**: JWT in Authorization header
- **Output**: `{ success: true, data: { user: {...} } }`
- **Dependencies**: `auth.js`

### POST /auth/totp/setup
- **Location**: `src/routes/authRoutes.js`
- **Purpose**: Generate TOTP secret for 2FA setup
- **Input Schema**: `{ password: string }`
- **Output**: `{ success: true, data: { secret: string, qrCode: string } }`
- **Dependencies**: `otplib`, `qrcode`
- **Notes**: User must confirm with TOTP token before enabling

### POST /auth/totp/confirm
- **Location**: `src/routes/authRoutes.js`
- **Purpose**: Confirm TOTP setup with valid token
- **Input Schema**: `{ secret: string, token: string }`
- **Output**: `{ success: true, data: { backupCodes: [string] } }`
- **Dependencies**: `otplib`

### POST /auth/totp/disable
- **Location**: `src/routes/authRoutes.js`
- **Purpose**: Disable TOTP 2FA
- **Auth Required**: Yes + TOTP verification
- **Input Schema**: `{ password: string, totpToken: string }`
- **Dependencies**: `auth.js`, `User` model

### POST /auth/totp/verify
- **Location**: `src/routes/authRoutes.js`
- **Purpose**: Verify TOTP token during login
- **Input Schema**: `{ token: string }`
- **Output**: `{ success: true, data: { token: string } }`
- **Dependencies**: `otplib`, JWT generation

---

## Server Management Routes (`src/routes/serverRoutes.js`)

### GET /api/server
- **Purpose**: List all servers user can access
- **Output**: `{ success: true, data: Server[] }`
- **Permissions**: User's server list (owner or permission-granted)
- **Dependencies**: `Server` model, `checkPermission()`

### POST /api/server
- **Purpose**: Create new Minecraft server instance
- **Input Schema**: `{ name, software, version, ram_mb, port, directory_name }`
- **Output**: `{ success: true, data: Server }`
- **Permissions**: `server.create`
- **Dependencies**: `resolveJar()`, `processManager`, `ServerHelper`
- **Side Effects**: 
  - Calls software version resolver to download JAR
  - Creates server directory
  - Initializes Minecraft files (eula.txt, server.properties)
  - Registers server in database

### GET /api/server/:id
- **Purpose**: Fetch single server details
- **Output**: `{ success: true, data: Server }`
- **Permissions**: Can access server
- **Dependencies**: `getServer()`

### PATCH /api/server/:id
- **Purpose**: Update server metadata (name, RAM, Java path)
- **Input Schema**: `{ name, ram_mb, java_path }`
- **Permissions**: `server.settings.write`
- **Dependencies**: `Server` model, validation

### DELETE /api/server/:id
- **Purpose**: Delete server and all associated data
- **Permissions**: `server.delete` (owner only typically)
- **Side Effects**: 
  - Kills running process (if active)
  - Removes server directory
  - Deletes DB record
  - Cascades: stats, permissions, backups, webhooks
- **Dependencies**: `processManager`, `retryDelete()`

### POST /api/server/:id/start
- **Purpose**: Start server JVM process
- **Permissions**: `server.start`
- **Output**: `{ success: true, data: { state: 'starting' } }`
- **Side Effects**: 
  - Validates JAR exists and is valid
  - Constructs JVM command line (args, flags, memory)
  - Spawns child process via `executionManager`
  - Registers WebSocket handlers for console output
- **Dependencies**: `executionManager`, `processManager`, `getStartInfo()`
- **Notes**: Bedrock/PocketMine use native binaries, not JVM

### POST /api/server/:id/stop
- **Purpose**: Gracefully stop server (SIGTERM)
- **Permissions**: `server.stop`
- **Timeout**: 30 seconds; then force-kill (SIGKILL)
- **Dependencies**: `executionManager`, `processManager`

### POST /api/server/:id/restart
- **Purpose**: Stop then start server
- **Permissions**: `server.restart`
- **Dependencies**: stop + start endpoints

### POST /api/server/:id/kill
- **Purpose**: Force-kill server immediately (SIGKILL)
- **Permissions**: `server.kill`
- **Dependencies**: `executionManager`

### GET /api/server/:id/status
- **Purpose**: Get current server process state
- **Output**: `{ success: true, data: { state: 'running'|'stopped'|'crashed', pid: number } }`
- **Dependencies**: `processManager.getServerState()`

### POST /api/server/:id/update/version
- **Purpose**: Update server software to new version
- **Input Schema**: `{ version: string }`
- **Permissions**: `server.update`
- **Side Effects**: 
  - Downloads new JAR
  - Backs up old server state
  - Replaces JAR file
  - Does NOT restart server
- **Dependencies**: `resolveJar()`, `versionManager`, `createBackup()`

### PATCH /api/server/:id/update/settings
- **Purpose**: Update server-specific settings (auto-backup, FTP, etc.)
- **Input Schema**: `{ auto_backup: 0|1, backup_interval, backup_retention_days, ftp_enabled, ... }`
- **Permissions**: `server.settings.write`
- **Side Effects**: Updates DB record only (process-affecting changes require restart)
- **Dependencies**: `Server` model

### POST /api/server/:id/console/command
- **Purpose**: Execute command on server (sent to console)
- **Input Schema**: `{ command: string }`
- **Permissions**: `server.console.write`
- **Output**: `{ success: true }`
- **Side Effects**: Command buffered to stdin; output received via WebSocket
- **Dependencies**: `processManager.writeToConsole()`

### POST /api/server/:id/import
- **Purpose**: Import server from ZIP archive
- **Input**: Multipart form-data with ZIP file
- **Permissions**: `server.import`
- **Side Effects**: 
  - Extracts ZIP to server directory
  - Validates structure
  - Registers in DB
- **Dependencies**: `multer`, `StreamZip`, `serverHelper`

### GET /api/server/:id/stats
- **Purpose**: Get current server stats (CPU, RAM, players)
- **Output**: `{ success: true, data: { cpu, memory_mb, players_online, timestamp } }`
- **Dependencies**: `statsCollector`, `processManager` (pidusage)

### GET /api/server/:id/docker-mode
- **Purpose**: Check if server is in Docker execution mode
- **Output**: `{ success: true, data: { enabled: boolean, container_id?: string } }`
- **Dependencies**: `executionManager`, `dockerService`

### PATCH /api/server/:id/docker-mode
- **Purpose**: Enable/disable Docker execution for server
- **Input Schema**: `{ enabled: boolean }`
- **Permissions**: `server.docker.manage`
- **Side Effects**: 
  - Requires restart to take effect
  - Migrates execution context
- **Dependencies**: `dockerService`, `migrationService`

---

## File Management Routes (`src/routes/fileRoutes.js`)

### GET /api/files/:serverId
- **Purpose**: List server directory contents
- **Query Params**: `?path=/path/to/dir` (optional, defaults to root)
- **Output**: `{ success: true, data: { files: [...], currentPath: string } }`
- **Permissions**: `server.files.read`
- **Dependencies**: `getServerDir()`, `fs.readdirSync()`, `sanitizePath()`
- **Security**: Path traversal validation to prevent escaping server directory

### GET /api/files/:serverId/download
- **Purpose**: Download file from server
- **Query Params**: `?file=/path/to/file`
- **Output**: Binary file data
- **Permissions**: `server.files.read`
- **Dependencies**: `fs.createReadStream()`, path validation

### POST /api/files/:serverId/upload
- **Purpose**: Upload file to server
- **Input**: Multipart form-data
- **Query Params**: `?path=/path/to/dir`
- **Permissions**: `server.files.write`
- **Side Effects**: File written to disk
- **Dependencies**: `multer`, file validation
- **Limits**: 5 GB per file (configured in multer)

### GET /api/files/:serverId/read
- **Purpose**: Read text file contents
- **Query Params**: `?file=/path/to/file`
- **Output**: `{ success: true, data: { content: string } }`
- **Permissions**: `server.files.read`
- **Dependencies**: `fs.readFileSync()`

### POST /api/files/:serverId/write
- **Purpose**: Write/overwrite text file
- **Input Schema**: `{ file: string, content: string }`
- **Permissions**: `server.files.write`
- **Dependencies**: `fs.writeFileSync()`, encoding handling
- **Security**: Path validation, no symlinks

### POST /api/files/:serverId/delete
- **Purpose**: Delete file or directory
- **Input Schema**: `{ file: string }`
- **Permissions**: `server.files.delete`
- **Side Effects**: File/dir removed from disk (non-recoverable)
- **Dependencies**: `retryDelete()` (handles Windows EBUSY)

### POST /api/files/:serverId/rename
- **Purpose**: Rename file or directory
- **Input Schema**: `{ file: string, newName: string }`
- **Permissions**: `server.files.write`
- **Dependencies**: `retryRename()`

### POST /api/files/:serverId/createdir
- **Purpose**: Create new directory
- **Input Schema**: `{ path: string }`
- **Permissions**: `server.files.write`
- **Dependencies**: `fs.mkdirSync()`

---

## Backup Routes (`src/routes/backupRoutes.js`)

### GET /api/backup/:serverId
- **Purpose**: List backups for server
- **Output**: `{ success: true, data: Backup[] }`
- **Permissions**: `server.backups.read`
- **Dependencies**: `fs.readdirSync()` on server backup dir
- **Returns**: `[{ id, name, size, created_at, ...}]`

### POST /api/backup/:serverId
- **Purpose**: Create backup of server
- **Input Schema**: `{ includeWorlds: boolean }`
- **Permissions**: `server.backups.create`
- **Output**: `{ success: true, data: { backupId: string } }`
- **Side Effects**: 
  - Stops server (configurable)
  - Archives server directory to ZIP
  - Resumes server
  - Stores in `servers/:id/backups/`
- **Dependencies**: `BackupManager`, `processManager`, `archiver`
- **Duration**: Depends on server size; can take minutes

### POST /api/backup/:serverId/restore
- **Purpose**: Restore server from backup
- **Input Schema**: `{ backupId: string }`
- **Permissions**: `server.backups.restore`
- **Side Effects**: 
  - Backs up current state first (safety)
  - Kills server
  - Replaces server files with backup contents
  - Restarts server
- **Dependencies**: `RestoreManager`, `processManager`
- **Duration**: Similar to backup creation

### DELETE /api/backup/:serverId/:backupId
- **Purpose**: Delete backup permanently
- **Permissions**: `server.backups.delete`
- **Dependencies**: `retryDelete()`

### POST /api/backup/:serverId/auto-configure
- **Purpose**: Set auto-backup schedule
- **Input Schema**: `{ enabled: boolean, interval_hours: number, retention_days: number }`
- **Permissions**: `server.backups.manage`
- **Side Effects**: Updates server DB record, enables cron job
- **Dependencies**: `Scheduler` (from core/update)

---

## Player Management Routes (`src/routes/playerRoutes.js`)

### GET /api/players/:serverId
- **Purpose**: List online players
- **Output**: `{ success: true, data: { players: [{ name, uuid, ...}] } }`
- **Permissions**: `server.players.read`
- **Dependencies**: `processManager.getPlayerList()` (queries server via RCON/query protocol)

### POST /api/players/:serverId/kick
- **Purpose**: Kick player from server
- **Input Schema**: `{ playerName: string, reason?: string }`
- **Permissions**: `server.players.kick`
- **Dependencies**: RCON command execution

### POST /api/players/:serverId/ban
- **Purpose**: Ban player from server
- **Input Schema**: `{ playerName: string, reason?: string }`
- **Permissions**: `server.players.ban`
- **Side Effects**: 
  - Adds to server ban-list
  - Kicks if online
- **Dependencies**: `fs` (ban-list JSON), RCON

### POST /api/players/:serverId/unban
- **Purpose**: Remove ban
- **Input Schema**: `{ playerName: string }`
- **Permissions**: `server.players.ban`
- **Dependencies**: ban-list JSON manipulation

### POST /api/players/:serverId/op
- **Purpose**: Grant OP status to player
- **Input Schema**: `{ playerName: string }`
- **Permissions**: `server.players.op`
- **Dependencies**: ops.json manipulation

### POST /api/players/:serverId/deop
- **Purpose**: Revoke OP status
- **Input Schema**: `{ playerName: string }`
- **Permissions**: `server.players.op`
- **Dependencies**: ops.json manipulation

### GET /api/players/:serverId/whitelist
- **Purpose**: Get whitelist
- **Output**: `{ success: true, data: [{ name, uuid }] }`
- **Permissions**: `server.players.read`
- **Dependencies**: whitelist.json parsing

### POST /api/players/:serverId/whitelist/add
- **Purpose**: Add player to whitelist
- **Input Schema**: `{ playerName: string }`
- **Permissions**: `server.players.ban`
- **Dependencies**: Mojang API (UUID lookup), whitelist.json

### POST /api/players/:serverId/whitelist/remove
- **Purpose**: Remove from whitelist
- **Input Schema**: `{ playerName: string }`
- **Permissions**: `server.players.ban`
- **Dependencies**: whitelist.json

---

## Plugin Management Routes (`src/routes/pluginRoutes.js`)

### GET /api/plugins/:serverId
- **Purpose**: List installed plugins
- **Output**: `{ success: true, data: { plugins: [{ name, version, ...}], ignored: [...] } }`
- **Permissions**: `server.plugins.read`
- **Dependencies**: `fs.readdirSync()` on plugins dir, plugin.yml parsing

### POST /api/plugins/:serverId/upload
- **Purpose**: Upload plugin JAR
- **Input**: Multipart form-data with JAR file
- **Permissions**: `server.plugins.manage`
- **Side Effects**: 
  - Validates JAR structure
  - Copies to plugins directory
  - Does NOT reload plugins (requires server restart)
- **Dependencies**: `multer`, JAR validation

### DELETE /api/plugins/:serverId/:pluginName
- **Purpose**: Delete plugin
- **Permissions**: `server.plugins.manage`
- **Dependencies**: `retryDelete()`

### PATCH /api/plugins/:serverId/ignore
- **Purpose**: Update plugin ignore list
- **Input Schema**: `{ ignored: [string] }`
- **Permissions**: `server.plugins.manage`
- **Side Effects**: Plugins in list won't be reloaded on restart
- **Dependencies**: Server model update

### GET /api/plugins/:serverId/load
- **Purpose**: Reload plugins (if server supports)
- **Permissions**: `server.plugins.manage`
- **Dependencies**: RCON `/reload` or equivalent command
- **Server Support**: Bukkit/Spigot/Paper only

---

## Server Properties Routes (`src/routes/propertiesRoutes.js`)

### GET /api/properties/:serverId
- **Purpose**: Parse and return server.properties as key-value object
- **Output**: `{ success: true, data: { motd: "...", max-players: 20, ... } }`
- **Permissions**: `server.properties.read`
- **Dependencies**: Properties file parser

### PATCH /api/properties/:serverId
- **Purpose**: Update server.properties
- **Input Schema**: `{ [key]: value, ... }`
- **Permissions**: `server.properties.write`
- **Side Effects**: 
  - Updates server.properties file
  - Does NOT restart server (restart required for most changes)
- **Dependencies**: Properties file writer

### POST /api/properties/:serverId/backup
- **Purpose**: Create backup of properties before bulk edit
- **Permissions**: `server.properties.write`
- **Dependencies**: File copy

---

## Logs Routes (`src/routes/logRoutes.js`)

### GET /api/logs/:serverId
- **Purpose**: List log files
- **Output**: `{ success: true, data: [{ name, size, modified }] }`
- **Permissions**: `server.logs.read`
- **Dependencies**: `fs.readdirSync()` on server logs dir

### GET /api/logs/:serverId/:logFile
- **Purpose**: Read log file contents
- **Query Params**: `?tail=100` (last N lines)
- **Output**: `{ success: true, data: { content: string } }`
- **Permissions**: `server.logs.read`
- **Dependencies**: `fs.readFileSync()` with line limit

### POST /api/logs/:serverId/clear
- **Purpose**: Delete log files
- **Permissions**: `server.logs.write` (inferred)
- **Dependencies**: `retryUnlink()`

---

## User Management Routes (`src/routes/userRoutes.js`)

### GET /api/users
- **Purpose**: List all users (admin only)
- **Output**: `{ success: true, data: User[] }`
- **Permissions**: Admin privilege
- **Dependencies**: `User` model

### POST /api/users
- **Purpose**: Create new user account
- **Input Schema**: `{ username, email, password, role_id }`
- **Permissions**: `account.manage`
- **Side Effects**: 
  - Hashes password with bcrypt
  - Creates DB record
  - Generates account creation token if email specified
- **Dependencies**: `User` model, `bcrypt`, `AccountCreationToken`

### GET /api/users/:userId
- **Purpose**: Get user details
- **Permissions**: Admin or self
- **Dependencies**: `User` model

### PATCH /api/users/:userId
- **Purpose**: Update user (username, email, role)
- **Input Schema**: `{ username, email, role_id }`
- **Permissions**: Admin or self (self-limited to non-role fields)
- **Dependencies**: `User` model

### DELETE /api/users/:userId
- **Purpose**: Delete user account
- **Permissions**: Admin
- **Side Effects**: 
  - Cascades: permissions, custom accents, audit logs
  - Does NOT delete servers (reassigned to NULL or admin)
- **Dependencies**: `User` model cascade delete

### PATCH /api/users/:userId/password
- **Purpose**: Change user password
- **Input Schema**: `{ currentPassword, newPassword }`
- **Permissions**: Self or admin
- **Dependencies**: `bcrypt` verification & hashing

### GET /api/users/:userId/avatar
- **Purpose**: Download user avatar image
- **Output**: Binary image data
- **Dependencies**: `data/avatars/` file lookup

### POST /api/users/:userId/avatar
- **Purpose**: Upload user avatar
- **Input**: Multipart form-data with image
- **Permissions**: Self or admin
- **Dependencies**: `multer` with image filter

### GET /api/users/:userId/custom-accent
- **Purpose**: Get user's theme color override
- **Output**: `{ success: true, data: { accentColor: "#rrggbb" } }`
- **Permissions**: Self
- **Dependencies**: `UserCustomAccent` model

### PATCH /api/users/:userId/custom-accent
- **Purpose**: Set theme color override
- **Input Schema**: `{ accentColor: "#rrggbb" }`
- **Permissions**: Self
- **Dependencies**: Color validation

---

## Rank Management Routes (`src/routes/rankRoutes.js`)

### GET /api/ranks
- **Purpose**: List all permission roles
- **Output**: `{ success: true, data: Rank[] }`
- **Permissions**: Anyone can view
- **Dependencies**: `Rank` model

### POST /api/ranks
- **Purpose**: Create new rank
- **Input Schema**: `{ name, permissions: [...], color: "#rrggbb" }`
- **Permissions**: `account.manage`
- **Side Effects**: Creates DB record
- **Dependencies**: `Rank` model, permission validation

### PATCH /api/ranks/:rankId
- **Purpose**: Update rank permissions/name/color
- **Input Schema**: `{ name, permissions: [...], color }`
- **Permissions**: `account.manage`
- **Dependencies**: `Rank` model

### DELETE /api/ranks/:rankId
- **Purpose**: Delete rank
- **Permissions**: `account.manage`
- **Constraints**: Cannot delete built-in ranks (Owner, Admin, etc.)
- **Side Effects**: 
  - Users with deleted rank reassigned to default
- **Dependencies**: `Rank` model, `User` cascade update

---

## Statistics Routes (`src/routes/statsRoutes.js`)

### GET /api/stats/:serverId
- **Purpose**: Get server stats time-series (last 24 hours)
- **Query Params**: `?period=1h|6h|24h|7d`
- **Output**: `{ success: true, data: [{ timestamp, cpu, memory_mb, players }] }`
- **Permissions**: `server.stats.read`
- **Dependencies**: `ServerStats` model, aggregation

### GET /api/stats/:serverId/latest
- **Purpose**: Get most recent stats sample
- **Output**: `{ success: true, data: { cpu, memory_mb, players, timestamp } }`
- **Permissions**: `server.stats.read`
- **Dependencies**: `ServerStats` model

### PATCH /api/stats/:serverId/config
- **Purpose**: Configure stats collection (interval, retention)
- **Input Schema**: `{ collection_interval_sec: number, retention_days: number }`
- **Permissions**: `server.settings.write`
- **Dependencies**: `StatsCollector` reconfiguration

---

## System Routes (`src/routes/systemRoutes.js`)

### GET /api/system/info
- **Purpose**: Get panel system info (version, uptime, etc.)
- **Output**: `{ success: true, data: { version, uptime, nodeVersion, platform } }`
- **Permissions**: Authenticated
- **Dependencies**: `process.uptime()`, `os` module

### GET /api/system/java-versions
- **Purpose**: List detected Java installations
- **Output**: `{ success: true, data: [{ version, path, available }] }`
- **Permissions**: Admin
- **Dependencies**: `javaManager.detectJavaVersions()`

### GET /api/system/usage
- **Purpose**: Panel resource usage (CPU, RAM)
- **Output**: `{ success: true, data: { cpu: %, memory_mb: number } }`
- **Permissions**: Admin
- **Dependencies**: `pidusage`

---

## Discord Routes (`src/routes/discordRoutes.js`)

### POST /api/discord/webhook
- **Purpose**: Register Discord webhook for server events
- **Input Schema**: `{ webhookUrl: string }`
- **Permissions**: `server.discord.manage`
- **Side Effects**: 
  - Validates webhook URL
  - Stores in DB
  - Server start/stop/crash events now post to webhook
- **Dependencies**: `Webhook` model, axios (test POST)

### DELETE /api/discord/webhook/:webhookId
- **Purpose**: Unregister webhook
- **Permissions**: `server.discord.manage`
- **Dependencies**: `Webhook` model

---

## Discord Bot Routes (`src/routes/discordBotsRoutes.js`)

### GET /api/discord-bots
- **Purpose**: List registered Discord bots
- **Output**: `{ success: true, data: DiscordBot[] }`
- **Permissions**: Admin
- **Dependencies**: `DiscordBot` model

### POST /api/discord-bots
- **Purpose**: Register new Discord bot
- **Input Schema**: `{ token: string, prefix: string }`
- **Permissions**: Admin
- **Side Effects**: 
  - Validates token
  - Initializes Discord.js client
  - Registers command handlers
  - Connects to Discord
- **Dependencies**: `discord.js`, `DiscordBot` model

### POST /api/discord-bots/:botId/link-server
- **Purpose**: Link bot to server for command support
- **Input Schema**: `{ serverId: number }`
- **Permissions**: `server.discord.manage`
- **Dependencies**: `DiscordBotServer` pivot table

---

## Docs Routes (`src/routes/docsRoutes.js`)

### GET /api/docs
- **Purpose**: List available documentation pages
- **Output**: `{ success: true, data: [{ id, title, category }] }`
- **Permissions**: Anyone
- **Dependencies**: Docs file discovery

### GET /api/docs/:docId
- **Purpose**: Get document content (markdown)
- **Output**: `{ success: true, data: { content: string, title: string } }`
- **Permissions**: Anyone
- **Dependencies**: Markdown file reading from `src/docs/`

---

## Docker Routes (`src/routes/dockerRoutes.js`)

### GET /api/docker/status
- **Purpose**: Check Docker daemon availability
- **Output**: `{ success: true, data: { available: boolean, version?: string } }`
- **Permissions**: Admin
- **Dependencies**: `dockerService.ping()`

### GET /api/docker/:serverId/containers
- **Purpose**: List containers for server
- **Output**: `{ success: true, data: [{ id, status, image, ...}] }`
- **Permissions**: `server.docker.manage`
- **Dependencies**: `dockerode.listContainers()`

### POST /api/docker/:serverId/container/start
- **Purpose**: Start server container
- **Permissions**: `server.start`
- **Dependencies**: `dockerService.startContainer()`

### POST /api/docker/:serverId/container/stop
- **Purpose**: Stop server container
- **Permissions**: `server.stop`
- **Dependencies**: `dockerService.stopContainer()`

---

## PocketMine Routes (`src/routes/pocketmineRoutes.js`)

### GET /api/pocketmine/:serverId/plugins
- **Purpose**: List PocketMine plugins with extended metadata
- **Output**: `{ success: true, data: [{ name, version, authors, ...}] }`
- **Permissions**: `server.plugins.read`
- **Dependencies**: PocketMine plugin.yml parser (different format than Bukkit)

---

## Threshold Routes (`src/routes/thresholdRoutes.js`)

### GET /api/thresholds/:serverId
- **Purpose**: Get CPU/RAM alert thresholds
- **Output**: `{ success: true, data: { cpu_percent: 80, memory_percent: 90 } }`
- **Permissions**: `server.settings.read`
- **Dependencies**: `Server` model

### PATCH /api/thresholds/:serverId
- **Purpose**: Update alert thresholds
- **Input Schema**: `{ cpu_percent: number, memory_percent: number }`
- **Permissions**: `server.settings.write`
- **Dependencies**: `Server` model, `ThresholdManager`

---

## Error Responses

All error responses follow this format:

```json
{
  "success": false,
  "error": "ERROR_CODE",
  "message": "Human-readable message",
  "statusCode": 400
}
```

### Common Error Codes
- `SERVER_NOT_FOUND` (404)
- `UNAUTHORIZED` (401)
- `FORBIDDEN` (403)
- `VALIDATION_ERROR` (400)
- `RESOURCE_IN_USE` (409)
- `SERVER_RUNNING` (409) — Can't delete/modify running server
- `INSUFFICIENT_DISK_SPACE` (507)
- `PORT_ALREADY_IN_USE` (409)
- `INVALID_JAR` (400)
- `DOWNLOAD_FAILED` (502)
- `FILE_NOT_FOUND` (404)
- `PATH_TRAVERSAL_ATTEMPT` (403)
- `DOCKER_NOT_AVAILABLE` (503)

---

## WebSocket Message Types

See `src/minepanel.js` WebSocket handler section:

- `server:stats` — Real-time CPU/RAM/players
- `server:console` — Console output line
- `server:process-state` — Process started/stopped/crashed
- `server:log` — Log file updates

---

## Rate Limiting

Express-rate-limit middleware applied globally:
- **Window**: 15 minutes
- **Limit**: 100 requests per IP
- **Exclude**: `/auth/*` (has custom limits)

---

## Authentication Header Format

```
Authorization: Bearer <JWT_TOKEN>
```

JWT payload contains:
```json
{
  "userId": 1,
  "username": "admin",
  "iat": 1234567890,
  "exp": 1234571490
}
```

Token expiry: 1 hour (configurable in auth.js)

---

## Summary

| Route Group | Count | Purpose |
|---|---|---|
| Auth | 7 | Login, JWT, 2FA |
| Server Management | 18 | CRUD, start/stop, update |
| Files | 8 | Browser, upload, download, edit |
| Backups | 4 | Create, restore, list, delete |
| Players | 8 | Ban, whitelist, OP, kick |
| Plugins | 4 | List, upload, delete, ignore |
| Properties | 3 | Read, write, backup |
| Logs | 3 | List, read, clear |
| Users | 9 | CRUD, password, avatar, theme |
| Ranks | 4 | CRUD permission groups |
| Stats | 3 | Time-series, sampling config |
| System | 3 | Info, Java detection, usage |
| Discord | 5 | Webhooks, bot integration |
| Docs | 2 | List, read |
| Docker | 4 | Status, containers, control |
| Other | 5 | PocketMine, thresholds, etc. |
| **TOTAL** | **~115+** | Comprehensive API coverage |
