const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcrypt');
const logger = require('../core/utils/logger');
const sequelize = require('./sequelize');
const User = require('./models/User');
const Server = require('./models/Server');
const ServerStats = require('./models/ServerStats');
const Rank = require('./models/Rank');
const UserServerPermission = require('./models/UserServerPermission');
const UserServerRank = require('./models/UserServerRank');
const Setting = require('./models/Setting');
const AccountCreationToken = require('./models/AccountCreationToken');
const DiscordBot = require('./models/DiscordBot');
const DiscordBotServer = require('./models/DiscordBotServer');
const DiscordIntegration = require('./models/DiscordIntegration');
const UserCustomAccent = require('./models/UserCustomAccent');
const Webhook = require('./models/Webhook');
const AuditLog = require('./models/AuditLog');

// Setup Associations
User.hasMany(Server, { foreignKey: 'owner_id', as: 'servers' });
Server.belongsTo(User, { foreignKey: 'owner_id', as: 'owner' });

User.belongsTo(Rank, { foreignKey: 'rank_id', as: 'rank' });
Rank.hasMany(User, { foreignKey: 'rank_id', as: 'users' });

Server.hasMany(ServerStats, { foreignKey: 'server_id', as: 'stats', onDelete: 'CASCADE' });
ServerStats.belongsTo(Server, { foreignKey: 'server_id', as: 'server' });

User.hasMany(UserCustomAccent, { foreignKey: 'user_id', as: 'customAccents', onDelete: 'CASCADE' });
UserCustomAccent.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

DiscordBot.belongsToMany(Server, { through: DiscordBotServer, foreignKey: 'bot_id', otherKey: 'server_id', as: 'servers' });
Server.belongsToMany(DiscordBot, { through: DiscordBotServer, foreignKey: 'server_id', otherKey: 'bot_id', as: 'discordBots' });

const dbDir = process.env.DATA_DIR
    ? require('path').join(process.env.DATA_DIR, 'db')
    : path.join(__dirname, '../../data');
if (process.env.NODE_ENV !== 'test' && !fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
}

if (process.env.NODE_ENV === 'test' && !process.env.MINEPANEL_TEST_DB) {
    process.env.MINEPANEL_TEST_DB = `file:memdb-${process.pid}-${Math.random().toString(36).substring(7)}?mode=memory&cache=shared`;
}
const dbPath = process.env.NODE_ENV === 'test' ? process.env.MINEPANEL_TEST_DB : path.join(dbDir, 'minepanel.db');
const db = process.env.NODE_ENV === 'test'
    ? new sqlite3.Database(dbPath, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE | sqlite3.OPEN_URI)
    : new sqlite3.Database(dbPath);

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

// ── Integrity Check ───────────────────────────────────────────────────────────
const checkIntegrity = () => new Promise((resolve, reject) => {
    db.all('PRAGMA integrity_check', [], (err, rows) => {
        if (err) return reject(err);
        const messages = rows.map(r => r.integrity_check);
        if (messages.length === 1 && messages[0] === 'ok') {
            resolve({ ok: true, errors: [] });
        } else {
            resolve({ ok: false, errors: messages });
        }
    });
});

// ── Backup ────────────────────────────────────────────────────────────────────
const backupDatabase = async () => {
    if (process.env.NODE_ENV === 'test') return { success: true, backupPath: ':memory:' };

    const backupDir = path.join(dbDir, 'backups');
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(backupDir, `minepanel-${ts}.db`);

    await dbRun(`VACUUM INTO ?`, [backupPath]);

    const backupDb = new sqlite3.Database(backupPath, sqlite3.OPEN_READONLY);
    const integrityOk = await new Promise((resolve, reject) => {
        backupDb.all('PRAGMA integrity_check', [], (err, rows) => {
            backupDb.close();
            if (err) return reject(err);
            const msgs = rows.map(r => r.integrity_check);
            resolve(msgs.length === 1 && msgs[0] === 'ok');
        });
    });

    if (!integrityOk) {
        fs.unlinkSync(backupPath);
        throw new Error(`Backup integrity check failed — backup discarded: ${backupPath}`);
    }

    logger.info(`[DB] Backup created and verified: ${backupPath}`);
    return { success: true, backupPath };
};

const listBackups = () => {
    const backupDir = path.join(dbDir, 'backups');
    if (!fs.existsSync(backupDir)) return [];
    return fs.readdirSync(backupDir)
        .filter(f => f.endsWith('.db'))
        .sort()
        .reverse()
        .map(f => ({
            filename: f,
            path: path.join(backupDir, f),
            size: fs.statSync(path.join(backupDir, f)).size,
        }));
};

// ── Premade Ranks ─────────────────────────────────────────────────────────────
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
            'server.properties.read', 'server.properties.write', 'server.logs.read',
            'server.stats.read'
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
            'server.properties.read', 'server.properties.write', 'server.logs.read',
            'server.stats.read'
        ],
        color: '#3b82f6'
    },
    {
        name: 'Helper',
        permissions: [
            'server.console.read',
            'server.files.read',
            'server.players.read', 'server.players.kick', 'server.players.ban',
            'server.stats.read'
        ],
        color: '#10b981'
    },
    {
        name: 'Player',
        permissions: [
            'server.console.read',
            'server.players.read',
            'server.stats.read'
        ],
        color: '#8b5cf6'
    }
];

const { runMigrations } = require('./migrationRunner');

const ADMIN_CREDS_FILE = path.join(__dirname, '../../ADMIN_CREDENTIALS.txt');

const ensureAdminAccount = async () => {
    try {
        const userCount = await dbGet('SELECT COUNT(*) as count FROM users');
        if (userCount && userCount.count > 0) return;

        // No accounts — generate admin
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%&*';
        let password = '';
        for (let i = 0; i < 15; i++) password += chars[Math.floor(Math.random() * chars.length)];

        const hash = await bcrypt.hash(password, 12);
        await dbRun(
            'INSERT INTO users (username, password, role) VALUES (?, ?, ?)',
            ['admin', hash, 'admin']
        );

        const msg = [
            '╔══════════════════════════════════════════╗',
            '║         MINEPANEL DEFAULT ADMIN          ║',
            '║                                          ║',
            `║  Username : admin                        ║`,
            `║  Password : ${password.padEnd(28)}║`,
            '║                                          ║',
            '║  Credentials saved to:                   ║',
            '║  ADMIN_CREDENTIALS.txt                   ║',
            '║  Change your password after first login! ║',
            '╚══════════════════════════════════════════╝',
        ].join('\n');

        logger.warn('\n' + msg);

        const fileContent = [
            'MinePanel — Auto-generated Admin Account',
            '========================================',
            `Username : admin`,
            `Password : ${password}`,
            '',
            'IMPORTANT: Delete this file and change your password after logging in!',
            `Generated: ${new Date().toISOString()}`,
        ].join('\n');

        fs.writeFileSync(ADMIN_CREDS_FILE, fileContent, 'utf8');
    } catch (e) {
        logger.error('[DB] ensureAdminAccount failed:', e.message);
    }
};

const initDb = async () => {
    // Integrity check before migrations
    if (process.env.NODE_ENV !== 'test') {
        try {
            const integrity = await checkIntegrity();
            if (!integrity.ok) {
                logger.error('[DB] INTEGRITY CHECK FAILED — database may be corrupt!');
                integrity.errors.forEach(e => logger.error(`[DB]   ${e}`));
            } else {
                logger.info('[DB] Integrity check passed.');
            }
        } catch (e) {
            logger.warn('[DB] Could not run integrity check:', e.message);
        }
    }

    // Sync Sequelize schema first (this creates the tables if they don't exist, which is critical for tests using :memory:)
    await sequelize.sync();

    await runMigrations(dbRun, dbGet);
    await seedRanks();
    await migratePermissionsData();
    if (process.env.NODE_ENV !== 'test') await ensureAdminAccount();
};

const seedRanks = async () => {
    for (const rank of PREMADE_RANKS) {
        try {
            const existing = await dbGet('SELECT * FROM ranks WHERE name = ?', [rank.name]);
            if (existing) {
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
        const ranks = await dbAll('SELECT id, name, permissions, global_permissions FROM ranks');
        for (const r of ranks) {
            if ((!r.global_permissions || r.global_permissions === '[]') && r.permissions && r.permissions.startsWith('[')) {
                logger.info(`Migrating permissions array for rank '${r.name}' (ID ${r.id}) to global_permissions`);
                await dbRun(
                    'UPDATE ranks SET global_permissions = ?, permissions = ? WHERE id = ?',
                    [r.permissions, '{}', r.id]
                );
            }
        }

        const users = await dbAll('SELECT id, username, rank_id FROM users');
        for (const u of users) {
            if (!u.rank_id) {
                const usrRank = await dbGet('SELECT rank_id FROM user_server_ranks WHERE user_id = ? LIMIT 1', [u.id]);
                if (usrRank) {
                    logger.info(`Migrating user '${u.username}' (ID ${u.id}) global rank_id to ${usrRank.rank_id}`);
                    await dbRun('UPDATE users SET rank_id = ? WHERE id = ?', [usrRank.rank_id, u.id]);
                }
            }
        }
    } catch (e) {
        logger.error('Permission migration error:', e);
    }
};

module.exports = { 
    db, dbRun, dbGet, dbAll, initDb, checkIntegrity, backupDatabase, listBackups, PREMADE_RANKS,
    sequelize, User, Server, ServerStats, Rank, UserServerPermission, UserServerRank, Setting, 
    AccountCreationToken, DiscordBot, DiscordBotServer, DiscordIntegration, UserCustomAccent, Webhook, AuditLog
};
