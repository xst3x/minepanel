const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dbDir = path.join(__dirname, '../../data');
if (process.env.NODE_ENV !== 'test' && !fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
}

const dbPath = process.env.NODE_ENV === 'test' ? ':memory:' : path.join(dbDir, 'minepanel.db');
const db = new sqlite3.Database(dbPath);

// Promise wrappers
const dbRun = (sql, params = []) => new Promise((resolve, reject) => {
    db.run(sql, params, function(err) { err ? reject(err) : resolve(this); });
});
const dbGet = (sql, params = []) => new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => { err ? reject(err) : resolve(row); });
});
const dbAll = (sql, params = []) => new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => { err ? reject(err) : resolve(rows || []); });
});

const PREMADE_RANKS = [
    {
        name: 'Owner',
        permissions: ['*'],
        color: '#ef4444'
    },
    {
        name: 'Admin',
        permissions: [
            'account.manage',
            'server.start', 'server.stop', 'server.restart', 'server.kill',
            'server.console.read', 'server.console.write',
            'server.files.read', 'server.files.write', 'server.files.delete',
            'server.players.read', 'server.players.kick', 'server.players.ban', 'server.players.op',
            'server.plugins.read', 'server.plugins.manage',
            'server.backups.read', 'server.backups.create', 'server.backups.restore', 'server.backups.delete',
            'server.properties.read', 'server.properties.write', 'server.logs.read'
        ],
        color: '#f59e0b'
    },
    {
        name: 'Manager',
        permissions: [
            'server.start', 'server.stop', 'server.restart', 'server.kill',
            'server.console.read', 'server.console.write',
            'server.files.read', 'server.files.write', 'server.files.delete',
            'server.players.read', 'server.players.kick', 'server.players.ban', 'server.players.op',
            'server.plugins.read', 'server.plugins.manage',
            'server.backups.read', 'server.backups.create', 'server.backups.restore', 'server.backups.delete',
            'server.properties.read', 'server.properties.write', 'server.logs.read'
        ],
        color: '#3b82f6'
    },
    {
        name: 'Helper',
        permissions: [
            'server.console.read',
            'server.files.read',
            'server.players.read', 'server.players.kick', 'server.players.ban'
        ],
        color: '#10b981'
    },
    {
        name: 'Player',
        permissions: [
            'server.console.read',
            'server.players.read'
        ],
        color: '#8b5cf6'
    }
];

const initDb = () => {
    return new Promise((resolve, reject) => {
        const runMigration = (sql) => {
            db.run(sql, (err) => {
                if (err) {
                    if (err.message.includes('duplicate column name') || err.message.includes('already exists') || err.message.includes('no such table')) {
                        // Safe to ignore: column/table already migrated or doesn't exist yet (will be created in a new db setup)
                    } else {
                        console.error(`Migration error running SQL "${sql}":`, err);
                        reject(err);
                    }
                }
            });
        };

        db.serialize(() => {
            // Users Table
            db.run(`
                CREATE TABLE IF NOT EXISTS users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    username TEXT UNIQUE NOT NULL,
                    password TEXT NOT NULL,
                    role TEXT DEFAULT 'user',
                    disabled INTEGER DEFAULT 0,
                    global_permissions TEXT DEFAULT '[]',
                    rank_id INTEGER,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `);

            // Servers Table
            db.run(`
                CREATE TABLE IF NOT EXISTS servers (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    uuid TEXT UNIQUE NOT NULL,
                    name TEXT NOT NULL,
                    software TEXT NOT NULL,
                    version TEXT NOT NULL,
                    ram_mb INTEGER NOT NULL,
                    port INTEGER UNIQUE NOT NULL,
                    owner_id INTEGER,
                    auto_backup INTEGER DEFAULT 0,
                    backup_interval INTEGER DEFAULT 24,
                    backup_includes TEXT DEFAULT 'all',
                    directory_name TEXT,
                    java_path TEXT DEFAULT 'java',
                    log_retention_days INTEGER DEFAULT 7,
                    backup_retention_days INTEGER DEFAULT 30,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY(owner_id) REFERENCES users(id)
                )
            `);

            // Permissions Table (Individual)
            db.run(`
                CREATE TABLE IF NOT EXISTS user_server_permissions (
                    user_id INTEGER,
                    server_id INTEGER,
                    permission TEXT,
                    PRIMARY KEY (user_id, server_id, permission),
                    FOREIGN KEY(user_id) REFERENCES users(id),
                    FOREIGN KEY(server_id) REFERENCES servers(id)
                )
            `);

            // Ranks Table
            db.run(`
                CREATE TABLE IF NOT EXISTS ranks (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT UNIQUE NOT NULL,
                    permissions TEXT NOT NULL,
                    global_permissions TEXT DEFAULT '[]',
                    is_builtin INTEGER DEFAULT 0,
                    color TEXT DEFAULT '#3b82f6',
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `);

            // User-Server-Rank assignments (retained for DB backwards compatibility, but not used actively)
            db.run(`
                CREATE TABLE IF NOT EXISTS user_server_ranks (
                    user_id INTEGER,
                    server_id INTEGER,
                    rank_id INTEGER,
                    PRIMARY KEY (user_id, server_id, rank_id),
                    FOREIGN KEY(user_id) REFERENCES users(id),
                    FOREIGN KEY(server_id) REFERENCES servers(id),
                    FOREIGN KEY(rank_id) REFERENCES ranks(id)
                )
            `);

            // Global Settings Table
            db.run(`
                CREATE TABLE IF NOT EXISTS settings (
                    key TEXT PRIMARY KEY,
                    value TEXT
                )
            `);

            // Fallback Migrations for existing DBs (ignore errors if columns already exist)
            runMigration(`ALTER TABLE users ADD COLUMN disabled INTEGER DEFAULT 0`);
            runMigration(`ALTER TABLE servers ADD COLUMN auto_backup INTEGER DEFAULT 0`);
            runMigration(`ALTER TABLE servers ADD COLUMN directory_name TEXT`);
            runMigration(`ALTER TABLE servers ADD COLUMN backup_interval INTEGER DEFAULT 24`);
            runMigration(`ALTER TABLE servers ADD COLUMN backup_includes TEXT DEFAULT 'all'`);
            runMigration(`ALTER TABLE users ADD COLUMN global_permissions TEXT DEFAULT '[]'`);
            runMigration(`ALTER TABLE ranks ADD COLUMN global_permissions TEXT DEFAULT '[]'`);
            runMigration(`ALTER TABLE users ADD COLUMN rank_id INTEGER`);
            runMigration(`ALTER TABLE servers ADD COLUMN ftp_port INTEGER DEFAULT NULL`);
            runMigration(`ALTER TABLE servers ADD COLUMN ftp_username TEXT DEFAULT NULL`);
            runMigration(`ALTER TABLE servers ADD COLUMN ftp_password TEXT DEFAULT NULL`);
            runMigration(`ALTER TABLE servers ADD COLUMN ftp_password_plain TEXT DEFAULT NULL`);
            runMigration(`ALTER TABLE servers ADD COLUMN ftp_enabled INTEGER DEFAULT 0`);
            runMigration(`ALTER TABLE servers ADD COLUMN java_path TEXT DEFAULT 'java'`);
            runMigration(`ALTER TABLE servers ADD COLUMN log_retention_days INTEGER DEFAULT 7`);
            runMigration(`ALTER TABLE servers ADD COLUMN backup_retention_days INTEGER DEFAULT 30`);
            runMigration(`ALTER TABLE discord_integrations ADD COLUMN bot_id INTEGER`);
            runMigration(`ALTER TABLE discord_integrations ADD COLUMN category_id TEXT`);

            // Account Creation Tokens Table
            db.run(`
                CREATE TABLE IF NOT EXISTS account_creation_tokens (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    token TEXT UNIQUE NOT NULL,
                    created_by INTEGER NOT NULL,
                    expires_at DATETIME NOT NULL,
                    permissions TEXT NOT NULL,
                    ranks TEXT NOT NULL,
                    used INTEGER DEFAULT 0,
                    FOREIGN KEY(created_by) REFERENCES users(id)
                )
            `);

            // Discord Bots Table (multi-bot support)
            db.run(`
                CREATE TABLE IF NOT EXISTS discord_bots (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    bot_token_encrypted TEXT NOT NULL,
                    guild_id TEXT NOT NULL,
                    enabled INTEGER DEFAULT 1,
                    bot_user_id TEXT,
                    bot_username TEXT,
                    bot_avatar TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `);

            // Bot ↔ Server assignments (many-to-many)
            db.run(`
                CREATE TABLE IF NOT EXISTS discord_bot_servers (
                    bot_id INTEGER NOT NULL,
                    server_id INTEGER NOT NULL,
                    PRIMARY KEY (bot_id, server_id),
                    FOREIGN KEY(bot_id) REFERENCES discord_bots(id) ON DELETE CASCADE,
                    FOREIGN KEY(server_id) REFERENCES servers(id) ON DELETE CASCADE
                )
            `);

            // Discord Integrations Table (per-server bot config)
            db.run(`
                CREATE TABLE IF NOT EXISTS discord_integrations (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    bot_id INTEGER,
                    server_id INTEGER NOT NULL,
                    guild_id TEXT NOT NULL,
                    admin_role_id TEXT,
                    viewer_role_id TEXT,
                    category_id TEXT,
                    log_channel_id TEXT,
                    console_channel_id TEXT,
                    status_channel_id TEXT,
                    provisioned INTEGER DEFAULT 0,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY(bot_id) REFERENCES discord_bots(id) ON DELETE CASCADE,
                    FOREIGN KEY(server_id) REFERENCES servers(id) ON DELETE CASCADE
                )
            `);

            // User Custom Accent Colors
            db.run(`
                CREATE TABLE IF NOT EXISTS user_custom_accents (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL,
                    label TEXT NOT NULL,
                    value TEXT NOT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
                )
            `, (err) => {
                if (err) return reject(err);
                seedRanks()
                    .then(() => migratePermissionsData())
                    .then(resolve)
                    .catch(reject);
            });
        });
    });
};

const seedRanks = async () => {
    for (const rank of PREMADE_RANKS) {
        try {
            const existing = await dbGet('SELECT * FROM ranks WHERE name = ?', [rank.name]);
            if (existing) {
                // For built-in premade ranks, they grant global_permissions, server permissions are default {}
                await dbRun(
                    'UPDATE ranks SET global_permissions = ?, permissions = ?, is_builtin = 1, color = ? WHERE id = ?',
                    [JSON.stringify(rank.permissions), '{}', rank.color, existing.id]
                );
            } else {
                await dbRun(
                    'INSERT INTO ranks (name, permissions, global_permissions, is_builtin, color) VALUES (?, ?, ?, 1, ?)',
                    [rank.name, '{}', JSON.stringify(rank.permissions), rank.color]
                );
            }
        } catch (e) { /* ignore */ }
    }
};

const migratePermissionsData = async () => {
    try {
        // 1. Migrate old JSON array ranks.permissions to global_permissions column
        const ranks = await dbAll('SELECT id, name, permissions, global_permissions FROM ranks');
        for (const r of ranks) {
            if ((!r.global_permissions || r.global_permissions === '[]') && r.permissions && r.permissions.startsWith('[')) {
                console.log(`Migrating permissions array for rank '${r.name}' (ID ${r.id}) to global_permissions`);
                await dbRun(
                    'UPDATE ranks SET global_permissions = ?, permissions = ? WHERE id = ?',
                    [r.permissions, '{}', r.id]
                );
            }
        }

        // 2. Migrate user server-specific rank assignments to a global rank_id in users table
        const users = await dbAll('SELECT id, username, rank_id FROM users');
        for (const u of users) {
            if (!u.rank_id) {
                const usrRank = await dbGet('SELECT rank_id FROM user_server_ranks WHERE user_id = ? LIMIT 1', [u.id]);
                if (usrRank) {
                    console.log(`Migrating user '${u.username}' (ID ${u.id}) global rank_id to ${usrRank.rank_id}`);
                    await dbRun('UPDATE users SET rank_id = ? WHERE id = ?', [usrRank.rank_id, u.id]);
                }
            }
        }
    } catch (e) {
        console.error('Permission migration error:', e);
    }
};

module.exports = { db, dbRun, dbGet, dbAll, initDb, PREMADE_RANKS };

