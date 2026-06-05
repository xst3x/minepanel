// Migration 001: Initial Schema
// Captures the full baseline schema as it existed before the migration system was introduced.
// Safe to run on both fresh installs and existing databases (uses IF NOT EXISTS + ALTER TABLE
// with error-swallowing for columns that already exist).

module.exports = {
    version: 1,
    description: 'Initial schema — users, servers, permissions, ranks, discord, tokens',

    up: async (dbRun) => {

        // ── Users ─────────────────────────────────────────────────────────────
        await dbRun(`
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

        // ── Servers ───────────────────────────────────────────────────────────
        await dbRun(`
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
                ftp_port INTEGER DEFAULT NULL,
                ftp_username TEXT DEFAULT NULL,
                ftp_password TEXT DEFAULT NULL,
                ftp_password_plain TEXT DEFAULT NULL,
                ftp_enabled INTEGER DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(owner_id) REFERENCES users(id)
            )
        `);

        // ── User-Server Permissions ───────────────────────────────────────────
        await dbRun(`
            CREATE TABLE IF NOT EXISTS user_server_permissions (
                user_id INTEGER,
                server_id INTEGER,
                permission TEXT,
                PRIMARY KEY (user_id, server_id, permission),
                FOREIGN KEY(user_id) REFERENCES users(id),
                FOREIGN KEY(server_id) REFERENCES servers(id)
            )
        `);

        // ── Ranks ─────────────────────────────────────────────────────────────
        await dbRun(`
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

        // ── User-Server-Rank Assignments ──────────────────────────────────────
        await dbRun(`
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

        // ── Global Settings ───────────────────────────────────────────────────
        await dbRun(`
            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT
            )
        `);

        // ── Account Creation Tokens ───────────────────────────────────────────
        await dbRun(`
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

        // ── Discord Bots ──────────────────────────────────────────────────────
        await dbRun(`
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

        // ── Discord Bot-Server Assignments ────────────────────────────────────
        await dbRun(`
            CREATE TABLE IF NOT EXISTS discord_bot_servers (
                bot_id INTEGER NOT NULL,
                server_id INTEGER NOT NULL,
                PRIMARY KEY (bot_id, server_id),
                FOREIGN KEY(bot_id) REFERENCES discord_bots(id) ON DELETE CASCADE,
                FOREIGN KEY(server_id) REFERENCES servers(id) ON DELETE CASCADE
            )
        `);

        // ── Discord Integrations ──────────────────────────────────────────────
        await dbRun(`
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

        // ── User Custom Accent Colors ─────────────────────────────────────────
        await dbRun(`
            CREATE TABLE IF NOT EXISTS user_custom_accents (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                label TEXT NOT NULL,
                value TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `);

        // ── Backfill columns for existing databases ───────────────────────────
        const backfill = [
            `ALTER TABLE users ADD COLUMN disabled INTEGER DEFAULT 0`,
            `ALTER TABLE users ADD COLUMN global_permissions TEXT DEFAULT '[]'`,
            `ALTER TABLE users ADD COLUMN rank_id INTEGER`,
            `ALTER TABLE servers ADD COLUMN auto_backup INTEGER DEFAULT 0`,
            `ALTER TABLE servers ADD COLUMN directory_name TEXT`,
            `ALTER TABLE servers ADD COLUMN backup_interval INTEGER DEFAULT 24`,
            `ALTER TABLE servers ADD COLUMN backup_includes TEXT DEFAULT 'all'`,
            `ALTER TABLE servers ADD COLUMN ftp_port INTEGER DEFAULT NULL`,
            `ALTER TABLE servers ADD COLUMN ftp_username TEXT DEFAULT NULL`,
            `ALTER TABLE servers ADD COLUMN ftp_password TEXT DEFAULT NULL`,
            `ALTER TABLE servers ADD COLUMN ftp_password_plain TEXT DEFAULT NULL`,
            `ALTER TABLE servers ADD COLUMN ftp_enabled INTEGER DEFAULT 0`,
            `ALTER TABLE servers ADD COLUMN java_path TEXT DEFAULT 'java'`,
            `ALTER TABLE servers ADD COLUMN log_retention_days INTEGER DEFAULT 7`,
            `ALTER TABLE servers ADD COLUMN backup_retention_days INTEGER DEFAULT 30`,
            `ALTER TABLE ranks ADD COLUMN global_permissions TEXT DEFAULT '[]'`,
            `ALTER TABLE discord_integrations ADD COLUMN bot_id INTEGER`,
            `ALTER TABLE discord_integrations ADD COLUMN category_id TEXT`,
        ];

        for (const sql of backfill) {
            await dbRun(sql).catch(() => {}); // column already exists — safe to ignore
        }
    },

    down: async (dbRun) => {
        // Drop tables in reverse dependency order
        await dbRun(`DROP TABLE IF EXISTS user_custom_accents`);
        await dbRun(`DROP TABLE IF EXISTS discord_integrations`);
        await dbRun(`DROP TABLE IF EXISTS discord_bot_servers`);
        await dbRun(`DROP TABLE IF EXISTS discord_bots`);
        await dbRun(`DROP TABLE IF EXISTS account_creation_tokens`);
        await dbRun(`DROP TABLE IF EXISTS settings`);
        await dbRun(`DROP TABLE IF EXISTS user_server_ranks`);
        await dbRun(`DROP TABLE IF EXISTS user_server_permissions`);
        await dbRun(`DROP TABLE IF EXISTS ranks`);
        await dbRun(`DROP TABLE IF EXISTS servers`);
        await dbRun(`DROP TABLE IF EXISTS users`);
    },
};
