const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const logger = require('../core/utils/logger');

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

const { runMigrations } = require('./migrationRunner');

const initDb = async () => {
    await runMigrations(dbRun, dbGet);
    await seedRanks();
    await migratePermissionsData();
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
                logger.info(`Migrating permissions array for rank '${r.name}' (ID ${r.id}) to global_permissions`);
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
                    logger.info(`Migrating user '${u.username}' (ID ${u.id}) global rank_id to ${usrRank.rank_id}`);
                    await dbRun('UPDATE users SET rank_id = ? WHERE id = ?', [usrRank.rank_id, u.id]);
                }
            }
        }
    } catch (e) {
        logger.error('Permission migration error:', e);
    }
};

module.exports = { db, dbRun, dbGet, dbAll, initDb, PREMADE_RANKS };

