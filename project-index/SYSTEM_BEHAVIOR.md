# MinePanel: System Behavior & Workflows

Step-by-step documentation of critical system flows, state machines, and operational behaviors.

---

## Server Lifecycle State Machine

```
┌──────────────────────────────────────────────────────────────┐
│                    SERVER STATE FLOW                         │
└──────────────────────────────────────────────────────────────┘

     [Stopped] ◄────────────────────────────────────────────┐
         │                                                   │
         │ POST /api/server/:id/start                       │
         │ → Validate JAR, construct JVM args               │
         │ → spawn child_process                            │
         ▼                                                   │
     [Starting]                                              │
         │                                                   │
         │ JVM boots (2-30s depending on size)              │
         │ → Loads libraries                                │
         │ → Loads plugins                                  │
         │ → Initializes world                              │
         │ → Opens port                                     │
         │ → Prints "[Server] Done (X.XXs)!"               │
         ▼                                                   │
     [Running] ◄─────────────────────────────────────────┐  │
         ▲                                                 │  │
         │                                                 │  │
    [Monitoring]          POST /api/server/:id/stop       │  │
    - statsCollector      → SIGTERM (graceful shutdown)   │  │
      samples CPU/RAM      → 30s timeout                   │  │
    - pidusage tracks PID  ├─ Clean exit → [Stopped]      │  │
    - WebSocket broadcasts ├─ Timeout → SIGKILL            │  │
      every 5-10s           ▼                              │  │
                        [Stopping]                         │  │
                           │                               │  │
                           ├─ Normal exit (code 0)         │  │
                           │   → [Stopped] ─────────────────┘
                           │
                           ├─ Abnormal exit (code ≠0)
                           │   → [Crashed]
                           │       │
                           │       │ autostart_on_crash=1?
                           │       ├─ Yes: auto-restart
                           │       │   → [Starting]
                           │       └─ No: stay crashed
                           │           → Manual restart needed
                           │
                           └─ Force kill (SIGKILL)
                               → [Stopped]

     [Crashed]
         │
         │ POST /api/server/:id/start (manual restart)
         ▼
     [Starting] → ... → [Running]
```

### State Transition Events

| From | To | Trigger | WebSocket Event |
|------|----|---------|--------------------|
| Stopped | Starting | `/start` API | `server:process-state` |
| Starting | Running | JVM initialization complete | `server:process-state`, `server:stats` begins |
| Running | Stopping | `/stop` API (SIGTERM) | `server:process-state` |
| Running | Stopped | Process exits (normal) | `server:process-state` |
| Running | Crashed | Process exits (non-zero) | `server:process-state`, webhook trigger |
| Crashed | Starting | `/start` API | `server:process-state` |

---

## Server Startup Flow (Detailed)

```
USER INTERACTION
└─ Browser: POST /api/server/:serverId/start

EXPRESS ROUTE (src/routes/serverRoutes.js)
│
├─ authenticateToken() ─ Verify JWT is valid
├─ checkPermission(userId, 'server.start') ─ User can start?
├─ getServer(serverId) ─ Load from DB
│
└─ executionManager.start(server)

EXECUTION MANAGER (src/core/executionManager.js)
│
├─ Check: server.execution_mode
│  ├─ 'native' → processManager.startServer(server)
│  └─ 'docker' → dockerService.startContainer(server)
│
└─ [Assuming native]

PROCESS MANAGER (src/core/processManager.js)
│
├─ Validation:
│  ├─ JAR exists: fs.statSync(servers/:id/server.jar)
│  ├─ JAR readable: fs.accessSync(..., fs.constants.R_OK)
│  └─ Port available: net.connect() to port (should fail if free)
│
├─ Construct JVM Arguments:
│  ├─ Memory: ['-Xmx' + ram_mb + 'M', '-Xms' + (ram_mb/2) + 'M']
│  ├─ Java flags: [
│  │   '-XX:+UseG1GC',              (garbage collector)
│  │   '-XX:+ParallelRefProcEnabled',
│  │   '-XX:MaxGCPauseMillis=200',
│  │   '-XX:+UnlockExperimentalVMOptions',
│  │   '-XX:G1NewCollectionPercentThreshold=30'
│  │ ]
│  ├─ JVM args from run.bat / user_jvm_args.txt
│  ├─ Classpath: 'server.jar' + libraries/*.jar
│  └─ Main class + 'nogui'
│
├─ Spawn Process:
│  └─ child_process.spawn('java', args, {
│      cwd: 'servers/:id/',
│      stdio: ['pipe', 'pipe', 'pipe']  // stdin, stdout, stderr
│    })
│
├─ Register Handlers:
│  ├─ child.stdout.on('data', chunk => {
│  │   broadcast({
│  │     type: 'server:console',
│  │     serverId: id,
│  │     line: chunk.toString().trim()
│  │   })
│  │ })
│  │
│  ├─ child.stderr.on('data', chunk => {
│  │   // Same as stdout (Minecraft uses stderr for logs too)
│  │ })
│  │
│  └─ child.on('exit', (code) => {
│      broadcast({
│        type: 'server:process-state',
│        serverId: id,
│        state: code === 0 ? 'stopped' : 'crashed'
│      })
│      webhookManager.trigger('server:stopped', {server, exitCode: code})
│    })
│
├─ Store PID:
│  └─ serverProcesses[id] = { pid: child.pid, process: child }
│
├─ Start Monitoring:
│  └─ statsCollector.startSampling(id)
│      ├─ Every 5-10s: pidusage.stat(pid)
│      ├─ Extract: { cpu: %, memory_mb: X }
│      ├─ Query RCON: get player count
│      └─ Broadcast: server:stats event
│
└─ Response:
   └─ { success: true, data: { state: 'running', pid: 1234 } }

MINECRAFT SERVER (JVM Process)
│
├─ Bootstrap (first 0-5 seconds):
│  ├─ [System.out] Loading libraries...
│  ├─ [System.out] Preparing level...
│  ├─ [System.out] Scanning plugins...
│  └─ Each line broadcast via stdout handler
│
├─ Initialization (5-30 seconds, depends on world size):
│  ├─ Load plugins
│  ├─ Load world data
│  ├─ Initialize player database
│  ├─ Setup RCON server (default port 25575 + server.port)
│  └─ Each line broadcast...
│
└─ Ready:
   ├─ [Server thread/INFO]: Done (X.XXs)!
   └─ At this point:
      ├─ Server is listening on server.port
      ├─ RCON available on RCON port
      ├─ Players can connect
      └─ Server state is 'running'

BROWSER UPDATES (React)
│
└─ WebSocket receives events:
   ├─ server:process-state { state: 'running' }
   ├─ server:console lines (streamed as printed)
   ├─ server:stats { cpu, memory, players } (every 5-10s)
   │
   └─ UI updates:
      ├─ Status button changes to "STOP"
      ├─ Console pane fills with output
      ├─ Stats graphs begin plotting
      └─ "Server Online" indicator lights up
```

---

## Server Shutdown Flow

```
USER ACTION
└─ Click "Stop Server"

EXPRESS ROUTE
├─ POST /api/server/:id/stop
├─ checkPermission('server.stop')
└─ executionManager.stop(server)

PROCESS MANAGER
│
├─ Graceful Shutdown (30s timeout):
│  ├─ Send SIGTERM to child process
│  ├─ JVM receives signal:
│  │  ├─ Runs shutdown hooks
│  │  ├─ Saves player data
│  │  ├─ Saves world state
│  │  ├─ Closes databases
│  │  ├─ Stops plugins
│  │  └─ Prints: [Server thread/INFO]: Stopping server...
│  │
│  ├─ Process exits with code 0
│  ├─ exit handler triggered
│  └─ State → [Stopped]
│
├─ Force Kill (if timeout):
│  ├─ After 30s: no response to SIGTERM
│  ├─ Send SIGKILL (force kill)
│  ├─ Process terminates immediately
│  ├─ exit handler triggered
│  └─ State → [Stopped]
│
└─ Cleanup:
   ├─ statsCollector.stopSampling(id)
   ├─ Delete serverProcesses[id]
   └─ Broadcast: server:process-state {state: 'stopped'}

MINECRAFT SERVER
│
├─ Graceful shutdown sequence:
│  ├─ [Server thread/INFO]: Stopping server...
│  ├─ [Server thread/INFO]: Saving players...
│  ├─ [Server thread/INFO]: Saving worlds...
│  ├─ Waits for all I/O to complete
│  ├─ [Server thread/INFO]: Stopping...
│  └─ Process.exit(0)
│
└─ RESULT: Clean shutdown, no corruption
```

### Stop vs Kill
| Aspect | Stop (SIGTERM) | Kill (SIGKILL) |
|--------|---|---|
| Data Saved | Yes | Possibly not |
| Duration | Up to 30s | Immediate |
| Graceful | Yes | No |
| Recommended | Always first | Only if stop hangs |
| Use Case | Normal shutdown | Emergency/stuck |

---

## Backup Flow (Complete Lifecycle)

```
USER ACTION: "Create Backup Now"
└─ POST /api/backup/:serverId

BACKUP MANAGER (BackupManager.js)
│
├─ Pre-flight Checks:
│  ├─ Server exists & accessible
│  ├─ Disk space: need ≥ 2x server size
│  │  └─ If not enough: throw INSUFFICIENT_DISK_SPACE
│  ├─ Backup dir exists: servers/:id/backups/
│  │  └─ Create if missing: fs.mkdirSync(..., {recursive: true})
│  └─ Server state:
│     └─ If running: optionally stop (config-dependent)
│
├─ Create Timestamp:
│  └─ name = "2024-06-19_15-30-45"
│
├─ Archive Process:
│  ├─ Include directories:
│  │  ├─ world/           (main world)
│  │  ├─ world_nether/    (nether)
│  │  ├─ world_the_end/   (end)
│  │  ├─ plugins/         (except ignored)
│  │  ├─ config/          (configuration files)
│  │  └─ *.(properties, yml, yaml, json) root files
│  │
│  ├─ Exclude:
│  │  ├─ server.jar (can re-download)
│  │  ├─ libraries/ (can regenerate)
│  │  ├─ cache/ (transient)
│  │  ├─ logs/ (transient)
│  │  ├─ crash-reports/ (transient)
│  │  └─ .lock, .DS_Store, thumbs.db (system files)
│  │
│  ├─ Use archiver package:
│  │  ├─ archiver.create('zip', {
│  │  │   gzip: false,
│  │  │   zlib: { level: 6 }
│  │  │ })
│  │  ├─ archive.directory(dir, false)
│  │  ├─ archive.pipe(fs.createWriteStream(backupPath))
│  │  └─ archive.finalize()
│  │
│  └─ Monitor:
│     ├─ Show progress bar on UI
│     └─ Emit events: {type: 'backup:progress', percent: 45}
│
├─ Post-Archive Validation:
│  ├─ Check ZIP integrity:
│  │  ├─ Reopen ZIP file
│  │  ├─ Run CRC32 check on all entries
│  │  └─ If any fail: delete backup, throw error
│  │
│  └─ Verify file created:
│     └─ fs.statSync(backupPath) → check size > 0
│
├─ Resume Server (if was running):
│  └─ executionManager.start(server) [async, no wait]
│
├─ Enforce Retention Policy:
│  ├─ List all backups: fs.readdirSync('servers/:id/backups/')
│  ├─ Sort by created timestamp
│  ├─ Delete oldest backups beyond retention_days
│  └─ Log: "Deleted old backup: backup_2024-05-20_10-00-00.zip"
│
└─ Response:
   ├─ { success: true, data: { backupId: "2024-06-19_15-30-45" } }
   └─ WebSocket broadcast: {
      type: 'backup:created',
      backupId: "...",
      size: 234567890,
      timestamp: "2024-06-19T15:30:45Z"
    }
```

### Restore Backup

```
USER ACTION: "Restore Backup" on 2024-06-19_15-30-45
└─ POST /api/backup/:serverId/restore

RESTORE MANAGER (RestoreManager.js)
│
├─ Validation:
│  ├─ Backup file exists: servers/:id/backups/backup_name.zip
│  ├─ Backup readable: fs.accessSync(..., fs.constants.R_OK)
│  ├─ ZIP valid: can read central directory
│  └─ If any fail: throw BACKUP_NOT_FOUND or BACKUP_CORRUPTED
│
├─ Safety Backup (backup current before overwrite):
│  ├─ Create: servers/:id/backups/safety_2024-06-19_15-31-00.zip
│  ├─ Copy current state in case restore fails
│  └─ Can be deleted manually after confirm success
│
├─ Stop Server (kill process):
│  └─ if server.state === 'running':
│     └─ processManager.killServer(server) [SIGKILL, immediate]
│
├─ Clear Server Directory:
│  ├─ Delete all subdirs EXCEPT libraries/ and logs/
│  ├─ Reason:
│  │  ├─ libraries/ can be regenerated by server
│  │  └─ logs/ are transient and backup-independent
│  │
│  └─ Algorithm:
│     ├─ fs.readdirSync(servers/:id/)
│     ├─ For each entry:
│     │  └─ if not in ['.cache', 'libraries', 'logs']:
│     │     └─ retryDelete(entry)  [handles Windows EBUSY]
│     │
│     └─ Keep: backups/, libraries/, logs/
│
├─ Extract Backup:
│  ├─ Open ZIP file: new StreamZip({file: backupPath})
│  ├─ For each entry in ZIP:
│  │  ├─ Validate entry path (no ../ escapes)
│  │  ├─ Create parent dirs: fs.mkdirSync(dir, {recursive: true})
│  │  └─ Extract file: zip.entryDataAsync(entry) → fs.writeFileSync()
│  │
│  └─ Close ZIP: zip.close()
│
├─ Validate Extracted Files:
│  ├─ Check critical files exist:
│  │  ├─ eula.txt
│  │  ├─ server.properties
│  │  └─ world/ folder
│  │
│  ├─ Spot-check file integrity:
│  │  ├─ Can read eula.txt
│  │  ├─ Can parse server.properties
│  │  └─ world/level.dat exists and readable
│  │
│  └─ If any check fail: restore safety backup, throw error
│
├─ Restart Server:
│  └─ executionManager.start(server)
│     └─ Server initializes with restored world
│
└─ Response:
   ├─ { success: true, data: { backupId: "...", restored: true } }
   ├─ WebSocket: {type: 'backup:restored', backupId: "..."}
   └─ Safety backup remains (user can delete manually)
```

---

## Auto-Backup Scheduled Task

```
APP STARTUP (src/minepanel.js)
│
└─ Initialize Scheduler (cron-like)

SCHEDULER (hypothetical, or via node-schedule)
│
└─ For each server where auto_backup = 1:
   │
   ├─ Calculate next run:
   │  ├─ last_backup_time = read from DB
   │  ├─ interval_hours = server.backup_interval
   │  └─ next_run = last_backup_time + interval_hours
   │
   └─ On interval elapsed:
      │
      ├─ Check: Is server running?
      │  └─ If yes, stop it first (config-dependent)
      │
      ├─ BackupManager.createBackup(server)
      │
      ├─ If successful:
      │  ├─ Update DB: server.last_backup_time = now()
      │  ├─ Webhook: trigger 'backup:auto_created'
      │  └─ Logger: info(`Auto-backup created for ${server.name}`)
      │
      └─ If failed:
         ├─ Webhook: trigger 'backup:auto_failed'
         ├─ Logger: error(`Auto-backup failed: ${error}`)
         └─ Alert user in UI (next login)
```

---

## Player Join/Leave Detection

```
MINECRAFT SERVER (running)
│
└─ Player joins world

SERVER LOGS
│
└─ Prints: "[ServerListPlus] PlayerName joined"
   or "[Server thread/INFO]: PlayerName joined"

PROCESS MANAGER (stdout handler)
│
└─ Detects regex match: /(\w+) joined/
   │
   ├─ Extract player name: "PlayerName"
   ├─ Query current player list via RCON
   │  └─ Command: "list" → "§c1§r/§c20§r players online: PlayerName"
   │
   └─ Broadcast: {
      type: 'server:player-event',
      serverId: 1,
      event: 'joined',
      playerName: 'PlayerName',
      onlineCount: 1,
      timestamp: '2024-06-19T15:30:45Z'
    }

WEBHOOK MANAGER (if webhook configured)
│
└─ Trigger: 'player:joined'
   │
   ├─ Format message (plain or Discord embed)
   ├─ POST to webhook URL
   └─ Example Discord embed:
      {
        "embeds": [{
          "title": "Player Joined",
          "description": "PlayerName joined the server",
          "color": 65280,
          "fields": [{
            "name": "Online Players",
            "value": "1/20"
          }]
        }]
      }

BROWSER (WebSocket)
│
└─ Receives: server:player-event
   │
   ├─ Update player count in UI
   ├─ Log to console: "PlayerName joined"
   └─ Optional notification: Toast
```

---

## Permission Check Flow

```
USER ACTION: Attempt to POST /api/server/5/start
│
└─ Express Route Handler (serverRoutes.js)

ROUTE HANDLER
│
├─ Extract from request:
│  ├─ JWT token (from Authorization header)
│  ├─ serverId = 5 (from URL param)
│  └─ Action = 'server.start' (implicit in route)
│
├─ Call: checkPermission(userId, serverId, 'server.start')

PERMISSION MANAGER (permissions.js)
│
├─ Fetch user:
│  └─ User.findByPk(userId, { include: Rank })
│
├─ Check Rank Permissions:
│  ├─ rank.permissions = ['server.start', 'server.stop', ...]
│  ├─ Is 'server.start' in array?
│  │  ├─ Yes → ALLOW (return true)
│  │  └─ No → Continue to next check
│  │
│  └─ Is '*' (wildcard) in permissions?
│     ├─ Yes → ALLOW (return true)
│     └─ No → Continue to next check
│
├─ Check Server-Specific Overrides:
│  ├─ UserServerPermission.findOne({
│  │   user_id: userId,
│  │   server_id: serverId
│  │ })
│  │
│  ├─ If found:
│  │  └─ Is 'server.start' in override.permissions?
│  │     ├─ Yes → ALLOW (return true)
│  │     └─ No → DENY (return false)
│  │
│  └─ If not found: Continue
│
└─ Default: DENY (return false)

ROUTE HANDLER CONTINUED
│
├─ If checkPermission returned true:
│  └─ Proceed with server start
│
└─ If checkPermission returned false:
   └─ sendError(res, {error: 'FORBIDDEN', message: 'Insufficient permissions'}, 403)
      │
      └─ Browser receives: 403 Forbidden
         │
         └─ Show toast: "You don't have permission to start this server"
```

---

## Version Update Workflow

```
USER ACTION: POST /api/server/:id/update/version
Input: { version: "1.20.2" }

ROUTE HANDLER (serverRoutes.js)
│
├─ Current version check:
│  ├─ server.version = "1.20.1"
│  ├─ New version = "1.20.1"
│  └─ If same: throw VERSION_ALREADY_RUNNING
│
├─ Check Compatibility:
│  └─ versionManager.isCompatible(server.software, oldVersion, newVersion)
│     ├─ Validates version exists
│     ├─ Checks breaking changes
│     └─ If incompatible: throw INCOMPATIBLE_VERSION
│
├─ If server running: Stop it first
│  └─ processManager.stopServer(server) [with timeout]
│
├─ Create backup (safety):
│  └─ createBackup(server)
│     └─ servers/:id/backups/pre_update_*.zip

VERSION FETCHER
│
├─ versionFetcher.resolveJar(server.software, newVersion)
│  ├─ Check cache: cache/resolvers/papermc.json
│  │  ├─ If fresh (< 1h): return cached URL
│  │  └─ If stale: query API
│  │
│  ├─ GitHub API (for PaperMC):
│  │  ├─ GET /repos/PaperMC/Paper/releases/tags/1.20.2
│  │  ├─ Parse download URL
│  │  └─ Return: { url, sha256, size }
│  │
│  └─ Cache result with timestamp
│
├─ Download JAR:
│  ├─ HTTP GET to resolved URL with streaming
│  ├─ Save to: cache/jars/papermc/paper-1.20.2.jar
│  ├─ Verify hash (if provided): sha256sum match
│  ├─ Monitor download progress: emit 'download:progress'
│  │  └─ UI shows progress bar
│  │
│  └─ Verify JAR integrity:
│     ├─ Can read JAR (ZIP format)
│     ├─ Contains META-INF/MANIFEST.MF
│     └─ If corrupt: throw INVALID_JAR, keep old version

FILE REPLACEMENT
│
├─ Backup old server.jar:
│  └─ fs.renameSync(
│      'servers/:id/server.jar',
│      'servers/:id/server.jar.old'
│    )
│
├─ Copy new JAR:
│  └─ fs.copyFileSync(
│      'cache/jars/papermc/paper-1.20.2.jar',
│      'servers/:id/server.jar'
│    )
│
├─ Update DB:
│  └─ Server.update({ version: '1.20.2' }, {where: {id}})
│
├─ Delete old JAR:
│  └─ fs.unlinkSync('servers/:id/server.jar.old')

RESTART SERVER
│
├─ executionManager.start(server)
│  ├─ JVM loads new server.jar
│  ├─ Runs any initialization migrations
│  └─ Server comes online
│
├─ Monitor startup:
│  ├─ WebSocket: console output
│  ├─ WebSocket: stats begin
│  └─ Detect: "[Server] Done" message
│
└─ Success Response:
   └─ {
      success: true,
      data: {
        oldVersion: '1.20.1',
        newVersion: '1.20.2',
        updated: true,
        backupCreated: 'servers/:id/backups/pre_update_*.zip'
      }
    }
```

### Rollback on Failure

```
If new version fails to start:
│
├─ Detect: Process exits with error code within 30s
├─ Automatic rollback:
│  ├─ server.jar.old exists?
│  │  └─ Yes: fs.renameSync(server.jar.old, server.jar)
│  ├─ Restart server with old JAR
│  └─ Notify user: "Update failed, rolled back to X.X.X"
│
└─ Safety backup remains (manual recovery option)
```

---

## Console Command Execution

```
USER ACTION: Type "/say Hello" in console → Press Enter

BROWSER (Console.jsx)
│
├─ Input value: "/say Hello"
├─ POST /api/server/:id/console/command
│  └─ Body: { command: "/say Hello" }

EXPRESS ROUTE (serverRoutes.js)
│
├─ Validate:
│  ├─ Server running?
│  ├─ User has 'server.console.write' permission?
│  └─ Command not blacklisted? (some commands disabled)
│
└─ Call: processManager.writeToConsole(serverId, "/say Hello")

PROCESS MANAGER
│
├─ Get child process from registry: serverProcesses[serverId]
├─ Write to stdin:
│  └─ child.stdin.write("/say Hello\n")
│
└─ Immediately return (don't wait for output)

MINECRAFT SERVER
│
├─ Reads from stdin: "/say Hello"
├─ Executes command
├─ Outputs: "[Server] Hello"
├─ Prints to stdout

PROCESS MANAGER (stdout handler)
│
├─ Detects line: "[Server] Hello"
├─ Broadcasts:
│  └─ WebSocket: {
│    type: 'server:console',
│    serverId: 1,
│    line: '[Server] Hello'
│  }

BROWSER (WebSocket listener)
│
├─ Receives console line
├─ Appends to console output
├─ Auto-scrolls to bottom
└─ User sees: "[Server] Hello" in console
```

---

## Error Recovery & Resilience

### Network Disconnection (Planned Maintenance)

```
System Behavior:
├─ Express server restarts
├─ Minecraft servers continue running (independent processes)
├─ WebSocket connections drop for clients
├─ On reconnect:
│  ├─ Browser requests GET /api/server (list)
│  ├─ Detects running servers (via DB + pidusage)
│  ├─ Resumes WebSocket subscriptions
│  └─ No data loss, servers unaffected
```

### Database Corruption

```
Detection: On app startup
├─ PRAGMA integrity_check runs
├─ If fail: alert logged, fallback to backup
│
Recovery:
├─ Restore from: data/db/backups/minepanel-*.db (latest)
├─ Or manual: npm run db:backup + restore
├─ Worst case: Reset with default data
```

### Process Crash (Server JVM Crashes)

```
Detection:
├─ child.on('exit', handler)
├─ Exit code ≠ 0
├─ Marks server as 'crashed'

Handling:
├─ If autostart_on_crash = 1:
│  └─ Auto-restart in 10 seconds
├─ Otherwise: Manual restart required
├─ Webhook: trigger 'server:crashed'
├─ Keep logs for debugging: crash-reports/*.txt
```

---

## Summary: Critical Flows

| Flow | Duration | Failure Points | Recovery |
|------|----------|---|---|
| Server Start | 2-30s | JAR missing, port taken, no RAM | Rollback, use different port |
| Server Stop | <1s (graceful) / instant (kill) | Process hangs | Use Kill after timeout |
| Backup | 10-300s (size-dependent) | Disk full, corruption | Retry, check disk space |
| Restore | 5-60s | Backup corrupted, extraction fails | Use safety backup |
| Update | 30-600s (includes DL) | Download fail, incompatible version | Rollback to previous JAR |
| Console Command | <1s | Permission denied, server offline | Validate permissions, server state |
| Player Detection | <5s | RCON unavailable, log parsing fail | Fallback to player query protocol |

