// src/db/migrationRunner.js
// Runs numbered migrations in order, tracking which have already been applied.
// Each migration file exports:
//   { version: Number, description: String, up: async (dbRun) => {}, down?: async (dbRun) => {} }

const path = require('path');
const fs = require('fs');
const logger = require('../core/utils/logger');

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

const runMigrations = async (dbRun, dbGet, dbAll) => {
    // Create the migrations tracking table if it doesn't exist yet
    await dbRun(`
        CREATE TABLE IF NOT EXISTS _migrations (
            version INTEGER PRIMARY KEY,
            description TEXT,
            applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Load all migration files, sorted by filename (001_, 002_, etc.)
    const files = fs
        .readdirSync(MIGRATIONS_DIR)
        .filter(f => f.endsWith('.js'))
        .sort();

    if (files.length === 0) {
        logger.warn('[Migrations] No migration files found in ' + MIGRATIONS_DIR);
        return;
    }

    let applied = 0;

    for (const file of files) {
        const migration = require(path.join(MIGRATIONS_DIR, file));

        if (typeof migration.version !== 'number' || typeof migration.up !== 'function') {
            logger.warn(`[Migrations] Skipping ${file} — missing version or up()`);
            continue;
        }

        // Check if this version has already been applied
        const already = await dbGet(
            'SELECT version FROM _migrations WHERE version = ?',
            [migration.version]
        );

        if (already) continue; // already applied — skip silently

        logger.info(`[Migrations] Applying v${migration.version}: ${migration.description || file}`);

        try {
            await migration.up(dbRun, dbGet, dbAll);

            await dbRun(
                'INSERT OR IGNORE INTO _migrations (version, description) VALUES (?, ?)',
                [migration.version, migration.description || file]
            );

            logger.info(`[Migrations] v${migration.version} applied successfully`);
            applied++;
        } catch (err) {
            // SQLite does not support IF NOT EXISTS for ALTER TABLE ADD COLUMN.
            // If the column already exists (duplicate column name), treat as already-applied.
            if (err.message && err.message.includes('duplicate column name')) {
                logger.warn(`[Migrations] v${migration.version} skipped — column already exists (idempotent).`);
                await dbRun(
                    'INSERT OR IGNORE INTO _migrations (version, description) VALUES (?, ?)',
                    [migration.version, migration.description || file]
                ).catch(() => {});
                applied++;
                continue;
            }
            logger.error(`[Migrations] FAILED on v${migration.version} (${file}):`, err);
            throw err; // halt startup — a failed migration means the DB is in an unknown state
        }
    }

    if (applied === 0) {
        logger.info('[Migrations] Database is up to date.');
    } else {
        logger.info(`[Migrations] ${applied} migration(s) applied.`);
    }
};

/**
 * Roll back migrations down to (but not including) targetVersion.
 * Only rolls back migrations that have a down() function.
 * Example: rollbackTo(dbRun, dbGet, 3) undoes v6, v5, v4 (stopping before v3).
 */
const rollbackTo = async (dbRun, dbGet, targetVersion) => {
    const files = fs
        .readdirSync(MIGRATIONS_DIR)
        .filter(f => f.endsWith('.js'))
        .sort()
        .reverse(); // apply rollbacks from newest to oldest

    for (const file of files) {
        const migration = require(path.join(MIGRATIONS_DIR, file));
        if (typeof migration.version !== 'number') continue;
        if (migration.version <= targetVersion) break; // stop here

        const row = await dbGet('SELECT version FROM _migrations WHERE version = ?', [migration.version]);
        if (!row) continue; // not applied — skip

        if (typeof migration.down !== 'function') {
            logger.warn(`[Migrations] v${migration.version} has no down() — skipping rollback for this version`);
            continue;
        }

        logger.info(`[Migrations] Rolling back v${migration.version}: ${migration.description || file}`);
        try {
            await migration.down(dbRun);
            await dbRun('DELETE FROM _migrations WHERE version = ?', [migration.version]);
            logger.info(`[Migrations] v${migration.version} rolled back successfully`);
        } catch (err) {
            logger.error(`[Migrations] Rollback FAILED on v${migration.version}:`, err);
            throw err;
        }
    }
};

/**
 * Returns the current applied migration state.
 */
const getMigrationStatus = async (dbGet, dbAll) => {
    const files = fs
        .readdirSync(MIGRATIONS_DIR)
        .filter(f => f.endsWith('.js'))
        .sort();

    const applied = await dbAll('SELECT version, description, applied_at FROM _migrations ORDER BY version').catch(() => []);
    const appliedSet = new Set(applied.map(r => r.version));

    return files.map(file => {
        const m = require(path.join(MIGRATIONS_DIR, file));
        return {
            version:     m.version,
            description: m.description || file,
            applied:     appliedSet.has(m.version),
            hasDown:     typeof m.down === 'function',
            appliedAt:   applied.find(r => r.version === m.version)?.applied_at || null,
        };
    });
};

module.exports = { runMigrations, rollbackTo, getMigrationStatus };
