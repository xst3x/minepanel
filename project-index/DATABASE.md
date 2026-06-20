# MinePanel: Database Schema Map

Complete SQLite3 database schema with all tables, columns, relationships, and JSON field structures.

---

## Database Setup

**Location**: `src/db/database.js`, `src/db/sequelize.js`

**File Path**: `data/minepanel.db` (SQLite3)

**Connection**: Sequelize ORM (v6.37.8)

**Initialization**: 
- Auto-run migrations on app startup
- Default premade ranks created on first run
- Foreign key constraints enabled

---

## Tables

### 1. `users`

**Model**: `src/db/models/User.js`

**Purpose**: Panel user accounts

| Column | Type | Constraints | Description |
|--------|------|-------------|------------|
| `id` | INTEGER | PRIMARY KEY, autoincrement | User ID |
| `username` | STRING | UNIQUE, NOT NULL | Login name |
| `email` | STRING | UNIQUE | Contact email |
| `password` | STRING | NOT NULL | bcrypt-hashed password |
| `password_salt` | STRING | - | Salt for password (legacy) |
| `rank_id` | INTEGER | FOREIGN KEY(ranks.id) | User's role |
| `two_fa_enabled` | INTEGER | DEFAULT 0 | 2FA status (boolean) |
| `two_fa_secret` | STRING | - | TOTP secret (encrypted recommended) |
| `two_fa_backup_codes` | TEXT | - | JSON array of backup codes |
| `created_at` | DATE | DEFAULT NOW | Account creation timestamp |
| `updated_at` | DATE | - | Last modification timestamp |

**Relationships**:
- `User.hasMany(Server, { foreignKey: 'owner_id' })` — Owns servers
- `User.belongsTo(Rank, { foreignKey: 'rank_id' })` — Has role
- `User.hasMany(UserServerPermission)` — Per-server permission overrides
- `User.hasMany(UserServerRank)` — Server-specific rank assignments
- `User.hasMany(UserCustomAccent)` — Theme color customizations
- `User.hasMany(AuditLog)` — Admin action history

**Indexes**: `username`, `email`, `rank_id`

---

### 2. `servers`

**Model**: `src/db/models/Server.js`

**Purpose**: Minecraft server instances

| Column | Type | Constraints | Description |
|--------|------|-------------|------------|
| `id` | INTEGER | PRIMARY KEY, autoincrement | Server ID |
| `uuid` | STRING | UNIQUE, NOT NULL | Unique identifier (UUID v4) |
| `name` | STRING | NOT NULL | Display name |
| `software` | STRING | NOT NULL | Software type (Paper, Spigot, Forge, Bedrock, PocketMine, etc.) |
| `version` | STRING | NOT NULL | Current version (e.g., "1.20.1") |
| `ram_mb` | INTEGER | NOT NULL | Allocated RAM in MB |
| `port` | INTEGER | UNIQUE, NOT NULL | Server port (25565+) |
| `owner_id` | INTEGER | FOREIGN KEY(users.id) | Server owner |
| `auto_backup` | INTEGER | DEFAULT 0 | Auto-backup enabled (boolean) |
| `backup_interval` | INTEGER | DEFAULT 24 | Hours between auto-backups |
| `backup_includes` | STRING | DEFAULT 'all' | 'all', 'world_only', 'plugins_only' |
| `directory_name` | STRING | - | Folder name in servers/ directory |
| `java_path` | STRING | DEFAULT 'java' | Path to Java executable |
| `log_retention_days` | INTEGER | DEFAULT 7 | Days to keep log files |
| `backup_retention_days` | INTEGER | DEFAULT 30 | Days to keep backups |
| `ftp_port` | INTEGER | - | FTP server port |
| `ftp_username` | STRING | - | FTP username (auto-generated) |
| `ftp_password` | STRING | - | FTP password (bcrypt-hashed) |
| `ftp_password_plain` | STRING | - | FTP password (plain, temporary) |
| `ftp_enabled` | INTEGER | DEFAULT 0 | FTP active (boolean) |
| `created_at` | DATE | DEFAULT NOW | Server creation timestamp |
| `throttle_config` | TEXT | - | JSON: `{ cpu_limit, memory_limit, ... }` |
| `threshold_rules` | TEXT | - | JSON: `{ cpu_threshold_percent, memory_threshold_percent }` |
| `statistics_config` | TEXT | - | JSON: `{ enabled, interval_seconds, retention_days }` |
| `autostart` | INTEGER | DEFAULT 0 | Start on panel startup (boolean) |
| `autostart_on_crash` | INTEGER | DEFAULT 0 | Auto-restart if crashes (boolean) |
| `execution_mode` | STRING | DEFAULT 'native' | 'native' or 'docker' |

**Relationships**:
- `Server.belongsTo(User, { foreignKey: 'owner_id' })` — Owned by user
- `Server.hasMany(ServerStats)` — Time-series performance data
- `Server.hasMany(UserServerPermission)` — User permissions per server
- `Server.hasMany(UserServerRank)` — User roles per server
- `Server.belongsToMany(DiscordBot)` → DiscordBotServer junction

**Indexes**: `port`, `owner_id`, `uuid`, `software`, `name`

---

### 3. `server_stats`

**Model**: `src/db/models/ServerStats.js`

**Purpose**: Time-series performance metrics (CPU, RAM, players)

| Column | Type | Constraints | Description |
|--------|------|-------------|------------|
| `id` | INTEGER | PRIMARY KEY, autoincrement | Record ID |
| `server_id` | INTEGER | FOREIGN KEY(servers.id), onDelete CASCADE | Server reference |
| `cpu` | FLOAT | - | CPU usage percentage (0-100) |
| `memory_mb` | INTEGER | - | RAM used in MB |
| `memory_percent` | FLOAT | - | Memory percentage of allocated RAM |
| `players_online` | INTEGER | - | Current player count |
| `tps` | FLOAT | - | Server TPS (ticks per second, if available) |
| `timestamp` | DATE | - | Sample timestamp (when recorded) |
| `created_at` | DATE | DEFAULT NOW | Record creation time |

**Retention**: Auto-deleted after `server.log_retention_days` (default 7 days)

**Sampling**: Every 2-10 seconds (configurable via `statistics_config`)

**Indexing**: `server_id`, `created_at` (for time-range queries)

---

### 4. `ranks`

**Model**: `src/db/models/Rank.js`

**Purpose**: Permission roles/groups

| Column | Type | Constraints | Description |
|--------|------|-------------|------------|
| `id` | INTEGER | PRIMARY KEY, autoincrement | Rank ID |
| `name` | STRING | UNIQUE, NOT NULL | Display name (Owner, Admin, Manager, etc.) |
| `permissions` | TEXT | NOT NULL | JSON array: `["server.start", "server.stop", ...]` |
| `color` | STRING | - | Hex color (#rrggbb) for UI |
| `is_default` | INTEGER | DEFAULT 0 | Set as default for new users |
| `is_system` | INTEGER | DEFAULT 0 | System rank (cannot delete) |
| `created_at` | DATE | DEFAULT NOW | Creation timestamp |
| `updated_at` | DATE | - | Last modification |

**Built-in Ranks** (created on first run):
```javascript
[
  { name: 'Owner', permissions: ['*'], color: '#ef4444', is_system: 1 },
  { name: 'Admin', permissions: ['account.manage', 'server.*', ...], color: '#f59e0b' },
  { name: 'Manager', permissions: ['server.start', 'server.stop', ...], color: '#10b981' },
  { name: 'Moderator', permissions: ['server.console.read', 'player.kick', ...], color: '#3b82f6' },
  { name: 'Guest', permissions: ['server.stats.read', 'server.console.read'], color: '#6b7280' }
]
```

**Relationships**:
- `Rank.hasMany(User, { foreignKey: 'rank_id' })` — Users with this rank

---

### 5. `user_server_permissions`

**Model**: `src/db/models/UserServerPermission.js`

**Purpose**: Fine-grained per-server permission overrides

| Column | Type | Constraints | Description |
|--------|------|-------------|------------|
| `id` | INTEGER | PRIMARY KEY, autoincrement | Record ID |
| `user_id` | INTEGER | FOREIGN KEY(users.id), NOT NULL | User reference |
| `server_id` | INTEGER | FOREIGN KEY(servers.id), NOT NULL | Server reference |
| `permissions` | TEXT | NOT NULL | JSON array of permissions |
| `created_at` | DATE | DEFAULT NOW | Creation timestamp |
| `updated_at` | DATE | - | Last modification |

**Uniqueness**: UNIQUE(user_id, server_id) — One entry per user-server pair

**Use Case**: Override default rank permissions for specific servers
```javascript
// Example: User is Admin globally, but only Guest on specific server
User: { rank_id: 2 } → Admin rank
UserServerPermission: { 
  user_id: 1, 
  server_id: 99, 
  permissions: ["server.stats.read"]  // Guest-level only
}
```

---

### 6. `user_server_ranks`

**Model**: `src/db/models/UserServerRank.js`

**Purpose**: Server-specific rank assignments (alternative/complement to global rank)

| Column | Type | Constraints | Description |
|--------|------|-------------|------------|
| `id` | INTEGER | PRIMARY KEY, autoincrement | Record ID |
| `user_id` | INTEGER | FOREIGN KEY(users.id), NOT NULL | User reference |
| `server_id` | INTEGER | FOREIGN KEY(servers.id), NOT NULL | Server reference |
| `rank_id` | INTEGER | FOREIGN KEY(ranks.id), NOT NULL | Server-specific rank |
| `created_at` | DATE | DEFAULT NOW | Assignment timestamp |

**Use Case**: Different roles per server (admin on server 1, manager on server 2)

---

### 7. `settings`

**Model**: `src/db/models/Setting.js`

**Purpose**: Global panel configuration (persisted key-value pairs)

| Column | Type | Constraints | Description |
|--------|------|-------------|------------|
| `id` | INTEGER | PRIMARY KEY, autoincrement | Record ID |
| `key` | STRING | UNIQUE, NOT NULL | Setting key |
| `value` | TEXT | - | Setting value (any type, stored as text/JSON) |
| `created_at` | DATE | DEFAULT NOW | Creation timestamp |
| `updated_at` | DATE | - | Last modification |

**Example Entries**:
```javascript
{ key: 'panel_name', value: 'My Server Panel' }
{ key: 'panel_theme', value: 'dark' }
{ key: 'panel_logo_url', value: '/assets/logo.png' }
{ key: 'maintenance_mode', value: '0' }
{ key: 'default_server_port_base', value: '25565' }
{ key: 'discord_bot_token', value: '...' }
{ key: 'discord_prefix', value: '!' }
```

---

### 8. `webhooks`

**Model**: `src/db/models/Webhook.js`

**Purpose**: Generic webhook URLs for server events

| Column | Type | Constraints | Description |
|--------|------|-------------|------------|
| `id` | INTEGER | PRIMARY KEY, autoincrement | Webhook ID |
| `server_id` | INTEGER | FOREIGN KEY(servers.id) | Associated server |
| `url` | STRING | NOT NULL | Webhook endpoint URL |
| `event_type` | STRING | NOT NULL | 'server:started', 'server:stopped', 'player:joined', etc. |
| `format` | STRING | DEFAULT 'generic' | 'generic', 'discord', 'slack' |
| `enabled` | INTEGER | DEFAULT 1 | Webhook active (boolean) |
| `created_at` | DATE | DEFAULT NOW | Creation timestamp |
| `updated_at` | DATE | - | Last modification |

**Flow on Event**:
```
StatsCollector detects server:started
  ↓
webhookManager.trigger('server:started', { server, timestamp })
  ↓
Query: SELECT * FROM webhooks WHERE server_id = ? AND event_type = 'server:started' AND enabled = 1
  ↓
For each webhook:
  POST { event: 'server:started', server: {...}, timestamp: ... }
  to webhook.url
```

---

### 9. `discord_bots`

**Model**: `src/db/models/DiscordBot.js`

**Purpose**: Registered Discord bots

| Column | Type | Constraints | Description |
|--------|------|-------------|------------|
| `id` | INTEGER | PRIMARY KEY, autoincrement | Bot ID |
| `bot_id` | STRING | UNIQUE | Discord bot ID (from token) |
| `token` | STRING | NOT NULL | Discord bot token (encrypted recommended) |
| `prefix` | STRING | DEFAULT '!' | Command prefix |
| `enabled` | INTEGER | DEFAULT 1 | Bot active (boolean) |
| `created_at` | DATE | DEFAULT NOW | Registration timestamp |

**Relationships**:
- `DiscordBot.belongsToMany(Server)` → DiscordBotServer junction table

---

### 10. `discord_bot_servers`

**Model**: `src/db/models/DiscordBotServer.js`

**Purpose**: Junction table linking bots to servers (many-to-many)

| Column | Type | Constraints | Description |
|--------|------|-------------|------------|
| `id` | INTEGER | PRIMARY KEY, autoincrement | Record ID |
| `bot_id` | INTEGER | FOREIGN KEY(discord_bots.id) | Bot reference |
| `server_id` | INTEGER | FOREIGN KEY(servers.id) | Server reference |
| `created_at` | DATE | DEFAULT NOW | Link creation timestamp |

**Uniqueness**: UNIQUE(bot_id, server_id)

**Use Case**: Bot can manage multiple servers; server can be managed by multiple bots

---

### 11. `discord_integrations`

**Model**: `src/db/models/DiscordIntegration.js`

**Purpose**: Discord webhook configuration per server

| Column | Type | Constraints | Description |
|--------|------|-------------|------------|
| `id` | INTEGER | PRIMARY KEY, autoincrement | Integration ID |
| `server_id` | INTEGER | FOREIGN KEY(servers.id), UNIQUE | Server reference |
| `webhook_url` | STRING | NOT NULL | Discord webhook URL |
| `enabled` | INTEGER | DEFAULT 1 | Integration active (boolean) |
| `created_at` | DATE | DEFAULT NOW | Setup timestamp |
| `updated_at` | DATE | - | Last modification |

**Use Case**: Post server events (start, stop, crash, player join) to Discord channel

---

### 12. `user_custom_accents`

**Model**: `src/db/models/UserCustomAccent.js`

**Purpose**: Per-user theme color overrides

| Column | Type | Constraints | Description |
|--------|------|-------------|------------|
| `id` | INTEGER | PRIMARY KEY, autoincrement | Record ID |
| `user_id` | INTEGER | FOREIGN KEY(users.id), UNIQUE | User reference |
| `accent_color` | STRING | NOT NULL | Hex color (#rrggbb) |
| `created_at` | DATE | DEFAULT NOW | Creation timestamp |
| `updated_at` | DATE | - | Last modification |

**CSS Integration**:
```css
:root {
  --accent: var(--user-accent-color, #10b981);  /* Falls back to default */
}
```

---

### 13. `account_creation_tokens`

**Model**: `src/db/models/AccountCreationToken.js`

**Purpose**: One-time signup/invitation tokens

| Column | Type | Constraints | Description |
|--------|------|-------------|------------|
| `id` | INTEGER | PRIMARY KEY, autoincrement | Record ID |
| `token` | STRING | UNIQUE, NOT NULL | Unique token (UUID) |
| `email` | STRING | NOT NULL | Email for new account |
| `username` | STRING | - | Pre-filled username (optional) |
| `rank_id` | INTEGER | FOREIGN KEY(ranks.id) | Pre-assigned role |
| `used` | INTEGER | DEFAULT 0 | Token claimed (boolean) |
| `used_by_user_id` | INTEGER | FOREIGN KEY(users.id) | User who claimed it |
| `expires_at` | DATE | NOT NULL | Token expiration timestamp |
| `created_at` | DATE | DEFAULT NOW | Token creation timestamp |

**Flow**:
```
Admin creates account creation token
  ↓
Token link sent to email: https://panel.local/signup?token=abc...
  ↓
User clicks link, fills signup form
  ↓
POST /auth/signup { token, password }
  ├─ Validate token exists & not expired
  ├─ Validate token not already used
  ├─ Create User account
  ├─ Set user.rank_id = token.rank_id
  ├─ Mark token as used
  └─ Return JWT
```

---

### 14. `audit_logs`

**Model**: `src/db/models/AuditLog.js`

**Purpose**: Admin action tracking and compliance

| Column | Type | Constraints | Description |
|--------|------|-------------|------------|
| `id` | INTEGER | PRIMARY KEY, autoincrement | Log entry ID |
| `user_id` | INTEGER | FOREIGN KEY(users.id) | Admin who performed action |
| `action` | STRING | NOT NULL | Action type (CREATE_SERVER, DELETE_USER, etc.) |
| `resource_type` | STRING | - | Resource affected (server, user, rank) |
| `resource_id` | INTEGER | - | ID of affected resource |
| `changes` | TEXT | - | JSON object of what changed |
| `ip_address` | STRING | - | Client IP address |
| `timestamp` | DATE | DEFAULT NOW | When action occurred |

**Example Entry**:
```json
{
  "user_id": 1,
  "action": "UPDATE_SERVER_SETTINGS",
  "resource_type": "server",
  "resource_id": 5,
  "changes": {
    "auto_backup": { "old": 0, "new": 1 },
    "backup_interval": { "old": 24, "new": 12 }
  },
  "ip_address": "192.168.1.100",
  "timestamp": "2024-06-19T15:30:00Z"
}
```

---

## JSON Field Structures

### `server.throttle_config`
```json
{
  "enabled": true,
  "cpu_max_percent": 80,
  "memory_max_percent": 90,
  "action_on_exceed": "warn" | "throttle" | "stop",
  "throttle_duration_seconds": 300
}
```

### `server.threshold_rules`
```json
{
  "cpu_threshold_percent": 80,
  "memory_threshold_percent": 90,
  "alert_webhook_id": 1,
  "alert_cooldown_minutes": 60
}
```

### `server.statistics_config`
```json
{
  "enabled": true,
  "interval_seconds": 5,
  "retention_days": 7,
  "track_players": true,
  "track_tps": false
}
```

### `rank.permissions` (JSON Array)
```json
[
  "server.start",
  "server.stop",
  "server.restart",
  "server.console.read",
  "server.console.write",
  "player.kick",
  "player.ban",
  "*"
]
```

### `user.two_fa_backup_codes` (JSON Array)
```json
[
  "ABC123DEF456",
  "GHI789JKL012",
  "MNO345PQR678",
  "STU901VWX234"
]
```

### `audit_log.changes` (JSON Object)
```json
{
  "auto_backup": {
    "old": false,
    "new": true
  },
  "ram_mb": {
    "old": 1024,
    "new": 2048
  },
  "name": {
    "old": "Old Name",
    "new": "New Name"
  }
}
```

---

## Migrations

**Location**: `src/db/migrations/`

**Runner**: `src/db/migrationRunner.js` (auto-run on startup)

| Migration | Changes |
|-----------|---------|
| `001_init.js` | Initial schema: users, servers, stats, ranks |
| `002_users_2fa.js` | Add 2FA columns to users |
| `003_servers_ftp.js` | Add FTP columns to servers |
| `004_webhooks.js` | Create webhooks table |
| `005_discord_integration.js` | Create discord_integrations table |
| `006_audit_logs.js` | Create audit_logs table |
| `007_user_custom_accents.js` | Create user_custom_accents table |
| `008_account_tokens.js` | Create account_creation_tokens |
| `009_user_server_ranks.js` | Create user_server_ranks (server-specific roles) |
| `010_server_settings_json.js` | Add throttle_config, threshold_rules, statistics_config |
| `011_server_autostart.js` | Add autostart, autostart_on_crash to servers |
| `012_discord_bots.js` | Create discord_bots, discord_bot_servers tables |
| `013_docker_execution_mode.js` | Add execution_mode to servers (native/docker) |

**Adding New Migrations**:
```javascript
// src/db/migrations/014_your_feature.js
module.exports = {
  up: async (queryInterface, DataTypes) => {
    await queryInterface.addColumn('servers', 'new_column', {
      type: DataTypes.STRING,
      allowNull: true,
      defaultValue: null
    });
  },
  down: async (queryInterface) => {
    await queryInterface.removeColumn('servers', 'new_column');
  }
};
```

---

## Querying Patterns

### Get Server with Owner & Stats
```javascript
const server = await Server.findByPk(serverId, {
  include: [
    { model: User, as: 'owner' },
    { model: ServerStats, as: 'stats', limit: 100 }
  ]
});
```

### Get User with Rank & Permissions
```javascript
const user = await User.findByPk(userId, {
  include: [
    { model: Rank, as: 'rank' },
    { model: UserServerPermission }
  ]
});
```

### Get All Servers User Can Access
```javascript
// User's owned servers
const owned = await User.findByPk(userId)
  .then(u => u.getServers());

// Servers where user has explicit permissions
const permitted = await UserServerPermission.findAll({
  where: { user_id: userId }
});

// Combine: all accessible servers
const allServers = [...owned, ...permitted.map(p => p.server_id)];
```

### Get Latest Stats for Server
```javascript
const latestStats = await ServerStats.findOne({
  where: { server_id: serverId },
  order: [['created_at', 'DESC']]
});
```

### Cleanup Old Stats (Retention Policy)
```javascript
// Called by StatsCollector periodically
const cutoff = new Date(Date.now() - server.log_retention_days * 24 * 60 * 60 * 1000);
await ServerStats.destroy({
  where: {
    server_id: serverId,
    created_at: { [Op.lt]: cutoff }
  }
});
```

---

## Foreign Key Relationships Graph

```
users
  ├─ rank_id → ranks
  ├─ id ← servers.owner_id
  ├─ id ← user_server_permissions.user_id
  ├─ id ← user_server_ranks.user_id
  ├─ id ← user_custom_accents.user_id
  ├─ id ← audit_logs.user_id
  └─ id ← account_creation_tokens.used_by_user_id

servers
  ├─ owner_id → users
  ├─ id ← server_stats.server_id
  ├─ id ← user_server_permissions.server_id
  ├─ id ← user_server_ranks.server_id
  ├─ id ← webhooks.server_id
  ├─ id ← discord_integrations.server_id
  ├─ id ← discord_bot_servers.server_id (many-to-many via)
  └─ id ← audit_logs.resource_id (where resource_type='server')

ranks
  ├─ id ← users.rank_id
  ├─ id ← user_server_ranks.rank_id
  ├─ id ← account_creation_tokens.rank_id
  └─ id ← user_server_permissions (implicit, via permissions JSON)

discord_bots
  ├─ id ← discord_bot_servers.bot_id (many-to-many)
  └─ → servers (through discord_bot_servers)
```

---

## Backup & Recovery

**Auto-Database Backups**: `src/db/database.js` → `backupDatabase()`
```javascript
// Called on app startup
const backup = await backupDatabase();
// Creates: data/db/backups/minepanel-2024-06-19T15-30-00-123.db
// Verifies: PRAGMA integrity_check passes
// Keeps: Last 7 backups (retention policy)
```

**Manual Backup**:
```bash
npm run db:backup
# Creates backup and lists location
```

**Restore**:
```bash
# Note: No built-in restore. Manual process:
# 1. Stop application
# 2. cp data/db/backups/minepanel-*.db data/minepanel.db
# 3. Restart application
```

---

## Summary

| Table | Records | Purpose | Retention |
|-------|---------|---------|-----------|
| users | 1-100 | User accounts | Forever |
| servers | 1-50 | Server instances | Forever |
| server_stats | 1000s | Performance time-series | 7 days (config) |
| ranks | 5-20 | Permission groups | Forever |
| user_server_permissions | 0-500 | Per-server ACLs | Forever |
| user_server_ranks | 0-500 | Server-specific roles | Forever |
| settings | 10-50 | Panel config | Forever |
| webhooks | 0-100 | Event webhooks | Forever |
| discord_bots | 0-10 | Discord bots | Forever |
| discord_bot_servers | 0-50 | Bot→Server links | Forever |
| discord_integrations | 0-50 | Discord webhooks | Forever |
| user_custom_accents | 0-100 | Theme colors | Forever |
| account_creation_tokens | 0-500 | Signup tokens | Until expiry (7 days typical) |
| audit_logs | 100s-1000s | Admin action log | 90+ days (policy) |

**Total DB Size**: Typically 10-50 MB (server_stats growth over time is main factor)

**Backup Size**: ~same as DB size (compression reduces to 2-5 MB)
