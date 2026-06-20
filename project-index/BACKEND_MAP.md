# MinePanel: Backend Architecture Map

Comprehensive guide to core services, data flow, and system interactions.

---

## Core Services Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Express Server                          │
│              (src/minepanel.js main app)                    │
└────────────┬──────────────────────────────┬─────────────────┘
             │                              │
             ▼                              ▼
    ┌───────────────────┐        ┌──────────────────────┐
    │  HTTP Requests    │        │  WebSocket Events    │
    │  REST API Routes  │        │  Real-time Updates   │
    └─────────┬─────────┘        └──────────┬───────────┘
              │                             │
              ▼                             ▼
    ┌───────────────────────────────────────────────┐
    │          Middleware & Authentication          │
    │  - authenticateToken (JWT validation)         │
    │  - checkPermission (RBAC enforcement)         │
    │  - validate (Joi schema validation)           │
    │  - requestLogger (HTTP logging)               │
    └─────────────────────────────────────────────┘
              │
    ┌─────────┴──────────────────────────────────────┐
    │                                                │
    ▼                                                ▼
┌─────────────────────────────┐    ┌─────────────────────────┐
│   Business Logic Layer      │    │   Database Layer        │
│   (src/core/*)              │    │   (src/db/*)            │
│                             │    │                         │
│ - ProcessManager            │    │ - Sequelize Models      │
│ - ExecutionManager          │    │ - SQLite3 Connection    │
│ - VersionManager            │    │ - Migrations            │
│ - BackupManager             │    │ - Query Helpers         │
│ - StatsCollector            │    │                         │
│ - FtpServer                 │    │ Tables:                 │
│ - DockerService             │    │ - users                 │
│ - VersionFetcher            │    │ - servers               │
│ - WebhookManager            │    │ - server_stats          │
│ - ServerHelper              │    │ - ranks                 │
│                             │    │ - permissions           │
│                             │    │ - discord_*             │
│                             │    │ - webhooks              │
│                             │    │ - audit_logs            │
└─────────────────────────────┘    └─────────────────────────┘
    │
    ├─────────────────────┬───────────────────────┤
    ▼                     ▼                       ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────────┐
│  Process     │  │   File       │  │  External APIs   │
│  Management  │  │  Operations  │  │  & Services      │
│              │  │              │  │                  │
│ - JVM spawn  │  │ - fs ops     │  │ - GitHub API     │
│ - PID track  │  │ - FTP mount  │  │ - Mojang API     │
│ - Signal     │  │ - ZIP create │  │ - Jenkins API    │
│   handling   │  │ - Backups    │  │ - Discord API    │
│ - Monitor    │  │              │  │ - Docker API     │
│   pidusage   │  │              │  │                  │
└──────────────┘  └──────────────┘  └──────────────────┘
    │                 │                     │
    ├─────────────────┴─────────────────────┤
    ▼
┌───────────────────────────────────────────┐
│         File System & External             │
│                                           │
│ - servers/*/                              │
│ - cache/resolvers/, cache/jars/          │
│ - data/minepanel.db                      │
│ - logs/                                   │
│ - Docker sockets                         │
└───────────────────────────────────────────┘
```

---

## ProcessManager Service

**File**: `src/core/processManager.js`

### Responsibility
Manages the **lifecycle** of Minecraft server JVM processes (Java servers only). Handles spawn, monitor, signal, and event emission.

### Key Methods
```javascript
// Spawn server process
startServer(server) → { pid, state: 'running' }

// Monitor running process
getServerState(serverId) → { state, pid, cpu, memory }

// Gracefully shutdown (SIGTERM)
stopServer(serverId) → waits up to 30s for graceful exit

// Force kill (SIGKILL)
killServer(serverId) → immediate termination

// Write to console stdin
writeToConsole(serverId, command) → sends to process stdin

// Get all running servers
getRunningServers() → [{ serverId, pid, state }]

// Monitor via pidusage for CPU/RAM
pollServerStats(serverId) → { cpu%, memory_mb, timestamp }
```

### State Transitions
```
Stopped
  ↓ [startServer called]
Starting
  ↓ [JVM spawned & listening]
Running
  ├─ [stopServer called]
  │   ↓ [SIGTERM sent]
  │   Stopping (30s timeout)
  │   ├─ [Clean exit received]
  │   └─ [Timeout → SIGKILL]
  ▼ [Process exits]
Stopped

  ├─ [Process crashes]
  └─ [Exit code non-zero]
  ▼
Crashed ← detectable via exit handler
```

### WebSocket Events Emitted
```javascript
ws.send(JSON.stringify({
  type: 'server:process-state',
  serverId: 1,
  payload: { state: 'running', pid: 1234 }
}))

ws.send(JSON.stringify({
  type: 'server:console',
  serverId: 1,
  line: '[15:30:45] [Server thread/INFO]: Server started'
}))
```

### Flow: Starting a Server
```
API: POST /api/server/:id/start
  ↓
serverRoutes.js calls: executionManager.start(server)
  ↓
executionManager checks: server.execution_mode
  ├─ 'native' → processManager.startServer()
  └─ 'docker' → dockerService.startContainer()
  ↓
processManager.startServer():
  1. Validate JAR exists & is executable
  2. Construct JVM args (memory, flags, classpath)
  3. child_process.spawn('java', args, { stdio: 'pipe' })
  4. Register stdout/stderr/exit handlers
  5. Subscribe to WebSocket "server:stats" channel
  6. Update DB: server.state = 'running'
  ↓
JVM startup
  1. Loads libraries
  2. Initializes world
  3. Opens port (RCON, query)
  4. Prints "[Server] Done (X.XXs)!"
  ↓
statsCollector begins sampling CPU/RAM every 2-10s
  ↓
Client receives WebSocket events: process-state, stats, console
```

---

## ExecutionManager Service

**File**: `src/core/executionManager.js`

### Responsibility
**Abstraction layer** between API routes and actual executors (ProcessManager OR DockerService). Provides unified interface regardless of execution mode.

### Why Needed
- Routes don't care if server runs natively or in Docker
- Server can switch execution modes without route refactor
- Simplifies testing (mock executionManager)

### Key Methods
```javascript
// Unified start across execution modes
start(server) → delegates based on server.execution_mode

// Unified stop
stop(server) → delegates based on server.execution_mode

// Unified kill
kill(server) → delegates based on server.execution_mode

// Get state from correct executor
getState(server) → { state, pid/containerId, ... }

// Write console command
writeConsole(server, command) → delegates
```

### Delegation Logic
```javascript
async start(server) {
  const mode = server.execution_mode || 'native';
  
  if (mode === 'native') {
    return processManager.startServer(server);
  } else if (mode === 'docker') {
    return dockerService.startContainer(server);
  }
  
  throw new Error(`Unknown execution mode: ${mode}`);
}
```

---

## StatsCollector Service

**File**: `src/core/statsCollector.js`

### Responsibility
Periodically sample server **CPU, RAM, player count** and broadcast via WebSocket. Store time-series in `ServerStats` table.

### Architecture
```
Timer Interval (every 2-10 seconds)
  ↓
For each running server:
  1. Query pidusage for CPU/RAM
  2. Query RCON for player count
  3. Create ServerStats DB record
  4. Emit WebSocket event to all subscribers
  ↓
statsCollector.broadcast('server:stats', { ... })
  ↓
WebSocket handler sends to connected clients
```

### Configuration
```javascript
// From server.statistics_config JSON:
{
  enabled: true,
  interval_seconds: 5,        // Sampling frequency
  retention_days: 7,          // How long to keep in DB
  track_players: true,        // Include player count
  track_tps: false            // Track server TPS (if available)
}
```

### Data Stored
```javascript
ServerStats {
  id,
  server_id,
  cpu: 25.5,                  // Percentage
  memory_mb: 1024,            // Absolute value
  memory_percent: 50,         // Relative to max_ram
  players_online: 5,
  tps: 19.8,                  // Optional
  timestamp: 2024-06-19T15:30:00Z,
  created_at
}
```

### Thresholds & Alerts
```javascript
// From server.threshold_rules JSON:
{
  cpu_threshold_percent: 80,
  memory_threshold_percent: 90
}

// On sample collection:
if (cpu > threshold) {
  webhookManager.trigger('cpu_alert', { cpu, server });
}
if (memory > threshold) {
  webhookManager.trigger('memory_alert', { memory, server });
}
```

---

## VersionManager & VersionFetcher

**Files**: `src/core/versionManager.js`, `src/core/versionFetcher.js`

### Responsibility
- **VersionFetcher**: Contact external APIs (GitHub, Jenkins, Mojang) to get latest release versions
- **VersionManager**: Validate compatibility, compare versions, suggest compatible updates

### Supported Software
```
Java Servers:
  - PaperMC (Bukkit fork, highly optimized)
  - Spigot (Original plugin server)
  - CraftBukkit (Original Bukkit)
  - Forge (Mod framework)
  - Purpur (PaperMC fork with more options)
  - Magma (Forge + Spigot hybrid)

Bedrock:
  - Bedrock Dedicated Server (Microsoft)
  - Nukkit (PHP port)
  - PowerNukkit (Nukkit fork)
  
Non-Standard:
  - PocketMine-MP (PHP Phar)
  - WaterdogPE (Proxy)
```

### Resolver System
```
versionFetcher.getVersions(software)
  ↓ routes to correct resolver
  
Resolver (e.g., PaperMC.js)
  ├─ Check cache in cache/resolvers/papermc.json
  │   └─ If fresh (< 1 hour), return cached
  ├─ If stale or missing, query API:
  │   ├─ GitHub API: GET /repos/PaperMC/Paper/releases
  │   ├─ Parse releases, extract build numbers
  │   └─ Cache result
  └─ Return: [{ version: '1.20.1', build: 123, url: '...' }]
```

### Cache System
```
cache/resolvers/
├─ papermc.json          // { versions: [...], updated_at: timestamp }
├─ forge.json
├─ pocketmine.json
└─ ... (other software)

Cache invalidation: 1 hour TTL per resolver
Manual refresh: User clicks "Check for Updates"
```

### Versioning Semantics
```javascript
// Java servers: "1.20.1" (Minecraft version)
// Forge: "26.1.2-64.0.9" (Forge version format)
// PaperMC: "1.20.1-123" (MC version + build number)
// Bedrock: "1.14.0" (Microsoft semantic versioning)
```

---

## BackupManager & RestoreManager

**Files**: `src/core/update/BackupManager.js`, `src/core/update/RestoreManager.js`

### Backup Flow
```
POST /api/backup/:serverId
  ↓
BackupManager.createBackup(server)
  1. Check disk space (need 2x server size)
  2. Optional: gracefully stop server (SIGTERM)
  3. Create timestamp: 2024-06-19_15-30-45
  4. Archive server directory → servers/:id/backups/timestamp.zip
     - Include: world/, plugins/, config/, server.properties
     - Exclude: cache/, logs/, .lock files
  5. Verify backup integrity (check CRC32)
  6. Resume server (if was running)
  7. Enforce retention policy (delete old backups beyond retention_days)
  ↓
Response: { success: true, backupId: "2024-06-19_15-30-45" }
```

### Restore Flow
```
POST /api/backup/:serverId/restore
  ↓
RestoreManager.restoreBackup(server, backupId)
  1. Validate backup file exists & is readable
  2. Create safety backup of current state (in case restore fails)
  3. Kill server (SIGKILL)
  4. Clear server directory
  5. Extract backup ZIP to server directory
  6. Validate extracted files (check for corruption)
  7. Restart server
  ↓
Response: { success: true, backupId }
```

### Data Included in Backup
```
servers/testtt/
├─ world/                  ✓ Included (world data)
├─ world_nether/           ✓ Included
├─ world_the_end/          ✓ Included
├─ plugins/                ✓ Included (except ignored)
├─ config/                 ✓ Included
├─ server.jar              ✗ NOT included (can re-download)
├─ server.properties       ✓ Included
├─ logs/                   ✗ NOT included (transient)
├─ crash-reports/          ✗ NOT included (transient)
├─ .cache/                 ✗ NOT included (transient)
└─ libraries/              ✗ NOT included (can regenerate)
```

### Configuration Per Server
```javascript
// From server DB record:
{
  auto_backup: 1,              // Enable auto-backup
  backup_interval: 24,         // Every 24 hours
  backup_retention_days: 30,   // Keep last 30 days
  backup_includes: 'all'       // 'all' | 'world_only' | 'plugins_only'
}
```

---

## FtpServer Service

**File**: `src/core/ftpServer.js`

### Responsibility
Per-server FTP access for file transfers. Uses `ftp-srv` Node.js package.

### Architecture
```
Per Server:
  - FTP port: 2121 + server.id (configurable)
  - Username: "server_<serverId>"
  - Password: bcrypt-hashed, stored in server.ftp_password
  - Root: servers/<serverId>/
  - Read/Write: Full access to server directory
```

### Flow
```
User enables FTP on server:
  1. Generate random password
  2. bcrypt hash it
  3. Store in DB: server.ftp_password
  4. Assign port: base_port + server.id
  5. Start FTP server on that port
  
User connects via FTP client:
  ftp://server_1:password@localhost:2121
  ↓
Credentials validated against DB
  ↓
FTP server mounts: servers/1/ as root
  ↓
User can upload/download/delete files
```

### Security
```javascript
// Password cache (in-memory only):
const passwordCache = {
  'server_1': bcrypt.hashSync('password123', 10)
};

// On each connection:
if (bcrypt.compareSync(providedPassword, cache.hash)) {
  // Allow access
}

// Password NOT stored plain-text anywhere
// FTP connection NOT encrypted (use SFTP or VPN in production)
```

---

## DockerService

**File**: `src/core/dockerService.js`

### Responsibility
Manage Minecraft server containers via Docker API. Alternative to native ProcessManager.

### Container Setup
```
Per Server Container:
  - Image: openjdk:17 (or custom)
  - Volumes:
    ├─ servers/<serverId>/ → /minecraft/
    └─ cache/jars/ → /cache/ (read-only)
  - Ports: server.port:25565 (mapped)
  - Memory: server.ram_mb (set via docker --memory)
  - Environment:
    ├─ MC_RAM: server.ram_mb
    ├─ MC_EULA: true
    └─ Custom: from server.docker_env JSON
  - Network: bridge (auto-assigned IP)
```

### Key Methods
```javascript
startContainer(server)      // docker run
stopContainer(server)       // docker stop
killContainer(server)       // docker kill
getContainerState(server)   // docker inspect
listContainers()            // docker ps
getContainerLogs(server)    // docker logs
```

### Migration from Native to Docker
```
1. Server runs natively (execution_mode: 'native')
2. User clicks "Enable Docker Mode"
3. executionManager calls migrationService
4. Migration:
   a. Stop native process (if running)
   b. Update server.execution_mode = 'docker'
   c. Copy server files to Docker volume
   d. Start container instead
5. From now on, all commands use dockerService
```

### Advantages vs Native
```
Native:
  + Direct JVM control
  + Better performance (no VM overhead)
  - Requires Java installed
  - Easier to leak processes

Docker:
  + Isolation (security)
  + Resource limits enforced
  - Slight performance overhead
  + Easier cleanup (kill container = kill everything)
  + Can run any Java version (image-based)
```

---

## WebhookManager Service

**File**: `src/core/webhookManager.js`

### Responsibility
Trigger webhooks on server lifecycle events (start, stop, crash, backup).

### Events
```javascript
{
  'server:started': { server, timestamp },
  'server:stopped': { server, exitCode, reason },
  'server:crashed': { server, error, logs },
  'server:updated': { server, oldVersion, newVersion },
  'backup:created': { server, backupId, size },
  'backup:restored': { server, backupId },
  'player:joined': { server, player, timestamp },
  'player:left': { server, player, timestamp },
  'threshold:exceeded': { server, metric, value, threshold }
}
```

### Webhook Delivery
```
webhookManager.trigger('server:started', payload)
  ↓
Query Webhook table for matching event types
  ↓
For each webhook:
  POST payload to webhook.url
  with headers: { 'X-MinePanel-Event': 'server:started', ... }
  ↓
Retry logic: 3 attempts with exponential backoff
  on timeout or 5xx error
```

### Discord Webhook Integration
```javascript
// Discord webhook URL:
// https://discord.com/api/webhooks/123/abc...

webhookManager.trigger('server:started', { server })
  ↓
FormatToDiscordEmbed({
  title: `Server "${server.name}" Started`,
  color: 0x00FF00,
  fields: [
    { name: 'Port', value: server.port },
    { name: 'Version', value: server.version },
    { name: 'Time', value: new Date().toISOString() }
  ]
})
  ↓
POST to Discord Webhook URL
  ↓
Message appears in Discord channel
```

---

## Permission System (RBAC)

**File**: `src/core/permissions.js`

### Architecture
```
User
  ├─ rank_id → Rank (e.g., "Admin")
  │   ├─ permissions: [
  │   │   'server.start',
  │   │   'server.stop',
  │   │   'server.console.write',
  │   │   '*' (wildcard = all)
  │   │ ]
  │   └─ color: '#f59e0b'
  │
  └─ UserServerPermission (per-server overrides)
      ├─ server_id: 1
      ├─ permissions: [
      │   'server.start' (explicitly granted)
      │ ]
      └─ Can add/remove specific perms per server
```

### Permission Check Flow
```
checkPermission(userId, serverId, requiredPermission)
  ↓
1. Fetch user + rank
  ↓
2. Check rank permissions:
   if (rank.permissions.includes(requiredPermission)) return true
   if (rank.permissions.includes('*')) return true
  ↓
3. Check server-specific overrides:
   userServerPerm = UserServerPermission.findOne(userId, serverId)
   if (userServerPerm.permissions.includes(requiredPermission)) return true
  ↓
4. Return false (denied) if no match
```

### Built-in Roles
```
Owner:
  - permissions: ['*']
  - Can do everything
  
Admin:
  - permissions: [
      'account.manage',
      'server.*',           // Wildcard
      'player.*',
      'backup.*',
      'discord.*'
    ]
  
Manager:
  - permissions: [
      'server.start',
      'server.stop',
      'server.restart',
      'server.console.*',
      'server.files.*',
      'player.*'
    ]
    
Moderator:
  - permissions: [
      'server.console.read',
      'server.console.write',
      'player.kick',
      'player.ban'
    ]
    
Guest:
  - permissions: [
      'server.stats.read',
      'server.console.read'
    ]
```

### Custom Permissions Pattern
```
Format: "resource.action" or "resource.action.subaction"

Examples:
  'server.start'              // Start any server
  'server.stop'               // Stop any server
  'server.console.read'       // Read console
  'server.console.write'      // Write to console
  'server.files.read'         // Read file system
  'server.files.write'        // Write file system
  'server.files.delete'       // Delete files
  'player.kick'               // Kick players
  'player.ban'                // Ban players
  'player.op'                 // OP/deOP
  'backup.create'             // Create backup
  'backup.restore'            // Restore backup
  'backup.delete'             // Delete backup
  'plugins.manage'            // Manage plugins
  'account.manage'            // User management
  'server.settings.write'     // Modify settings
  'discord.manage'            // Discord config

Wildcard:
  '*'                         // All permissions
  'server.*'                  // All server actions
  'player.*'                  // All player actions
```

---

## Data Flow Diagram: Server Startup to Console Output

```
User clicks "Start Server" in UI
  ↓
Browser: POST /api/server/:id/start
  ↓
Express Route Handler (serverRoutes.js)
  ├─ authenticateToken() → Verify JWT
  ├─ checkPermission() → Verify 'server.start' perm
  ├─ validate() → Validate request body
  │
  ├─ Call: executionManager.start(server)
  │   ├─ Check: server.execution_mode
  │   ├─ Call: processManager.startServer(server)
  │   │   ├─ Validate JAR at servers/:id/server.jar
  │   │   ├─ Read JVM args from run.bat / user_jvm_args.txt
  │   │   ├─ Construct: [
  │   │   │   '-Xmx1024M',
  │   │   │   '-Xms512M',
  │   │   │   '-jar', 'server.jar',
  │   │   │   'nogui'
  │   │   │ ]
  │   │   ├─ child_process.spawn('java', args, {
  │   │   │   cwd: 'servers/1/',
  │   │   │   stdio: ['pipe', 'pipe', 'pipe']  // stdin, stdout, stderr
  │   │   │ })
  │   │   ├─ child.stdout.on('data', (chunk) => {
  │   │   │   // Forward to WebSocket clients
  │   │   │   broadcast({ type: 'server:console', line: chunk })
  │   │   │ })
  │   │   ├─ child.on('exit', (code) => {
  │   │   │   // Handle crash/stop
  │   │   │   updateServerState(server, 'stopped')
  │   │   │   webhookManager.trigger('server:stopped')
  │   │   │ })
  │   │   └─ Register statsCollector sampling
  │   │
  │   └─ Return: { state: 'running', pid: 1234 }
  │
  └─ Response: { success: true, data: {...} }

Browser receives response
  └─ UI shows "Server starting..."

JVM process loads...
  ↓
JVM prints to stdout:
  "[15:30:45] Loading libraries..."
  "[15:30:46] [Server] Preparing level..."
  "[15:30:48] [Server] Done (3.2s)!"
  ↓
processManager.stdout handler captures each line
  ↓
broadcast({ type: 'server:console', line: "..." })
  ↓
WebSocket sends to all subscribed clients
  ↓
Browser receives message
  └─ UI renders console output

statsCollector begins periodic sampling
  ├─ Every 5s: pidusage.stat(pid) → { cpu: 25.5, memory_mb: 512 }
  ├─ Store: INSERT INTO server_stats (...)
  └─ broadcast({ type: 'server:stats', payload: {...} })
    └─ UI updates graphs
```

---

## Summary: Service Dependencies

| Service | Depends On | Used By |
|---------|-----------|---------|
| ProcessManager | fs, child_process, pidusage | executionManager, routes |
| ExecutionManager | processManager, dockerService | All routes |
| StatsCollector | pidusage, ServerStats model | WebSocket, routes |
| VersionFetcher | axios, GitHub API | versionManager, routes |
| VersionManager | VersionFetcher, Resolver* | serverRoutes |
| BackupManager | fs, archiver, processManager | backupRoutes |
| RestoreManager | fs, archiver, processManager | backupRoutes |
| FtpServer | ftp-srv, bcryptjs | serverRoutes, ftpServer handler |
| DockerService | dockerode | executionManager, routes |
| WebhookManager | axios, Webhook model | ProcessManager, StatsCollector, routes |
| PermissionManager | User, Rank, UserServerPerm models | All routes |
| Auth | jsonwebtoken, bcryptjs, User model | All routes |

---

## Common Patterns & Conventions

### Error Handling
```javascript
// Standard try-catch pattern
try {
  const server = await getServer(serverId);
  if (!server) throw new ErrorCode('SERVER_NOT_FOUND', 'Server does not exist');
  
  const result = await processManager.startServer(server);
  return res.json({ success: true, data: result });
} catch (err) {
  return sendError(res, err, 500);
}
```

### Database Operations
```javascript
// Use promise-wrapped methods
const server = await dbGet('SELECT * FROM servers WHERE id = ?', [serverId]);
await dbRun('UPDATE servers SET state = ? WHERE id = ?', ['running', serverId]);
const stats = await dbAll('SELECT * FROM server_stats WHERE server_id = ? ORDER BY created_at DESC LIMIT 100', [serverId]);
```

### File System Safety
```javascript
// Always use retry wrappers on Windows
const { retryDelete, retryRename, retryUnlink } = require('../utils/fsRetry');
await retryDelete(path);  // Handles EBUSY

// Always validate paths
const safePath = sanitizePath(userProvidedPath);
```

### WebSocket Broadcasting
```javascript
// Send to all connected clients
wss.broadcast(JSON.stringify({
  type: 'server:stats',
  serverId: 1,
  payload: { cpu: 25, memory_mb: 512 }
}));

// Send to specific client
socket.send(JSON.stringify({ ... }));
```
