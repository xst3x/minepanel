#!/usr/bin/env node
/**
 * MinePanel DB CLI
 * Usage:
 *   node db-cli.js status
 *   node db-cli.js migrate
 *   node db-cli.js rollback <targetVersion>
 *   node db-cli.js integrity
 *   node db-cli.js backup
 *   node db-cli.js backups
 */

'use strict';

const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');

const dbDir = path.join(__dirname, 'data');
const dbPath = path.join(dbDir, 'minepanel.db');

if (!fs.existsSync(dbPath)) {
    console.error(`[ERROR] Database not found at: ${dbPath}`);
    console.error('Run the app first to initialise the database.');
    process.exit(1);
}

const db = new sqlite3.Database(dbPath);

const dbRun = (sql, params = []) => new Promise((resolve, reject) => {
    db.run(sql, params, function(err) { err ? reject(err) : resolve(this); });
});
const dbGet = (sql, params = []) => new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => { err ? reject(err) : resolve(row); });
});
const dbAll = (sql, params = []) => new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => { err ? reject(err) : resolve(rows || []); });
});

const { runMigrations, rollbackTo, getMigrationStatus } = require('./src/db/migrationRunner');
const { checkIntegrity, backupDatabase, listBackups } = require('./src/db/database');

const cmd = process.argv[2];

async function main() {
    switch (cmd) {

        case 'status': {
            const rows = await getMigrationStatus(dbGet, dbAll).catch(() => {
                console.error('[ERROR] Could not read migration status (DB may not be initialised yet).');
                process.exit(1);
            });
            console.log('\nMigration Status:\n');
            for (const m of rows) {
                const state  = m.applied ? '✔ applied' : '✘ pending';
                const rollback = m.hasDown ? '(rollback ✔)' : '(rollback ✘)';
                const when   = m.appliedAt ? `  @ ${m.appliedAt}` : '';
                console.log(`  v${String(m.version).padStart(3, '0')}  ${state.padEnd(12)} ${rollback}  — ${m.description}${when}`);
            }
            console.log('');
            break;
        }

        case 'migrate': {
            console.log('\nRunning pending migrations...\n');
            await runMigrations(dbRun, dbGet);
            console.log('\nDone.\n');
            break;
        }

        case 'rollback': {
            const target = parseInt(process.argv[3], 10);
            if (isNaN(target)) {
                console.error('Usage: node db-cli.js rollback <targetVersion>');
                console.error('Example: node db-cli.js rollback 3  — rolls back v6, v5, v4 (keeps v3 and below)');
                process.exit(1);
            }
            console.log(`\nRolling back to version ${target}...\n`);
            await rollbackTo(dbRun, dbGet, target);
            console.log('\nRollback complete.\n');
            break;
        }

        case 'integrity': {
            console.log('\nRunning integrity check...\n');
            const result = await checkIntegrity();
            if (result.ok) {
                console.log('  ✔ Database integrity: OK\n');
            } else {
                console.error('  ✘ INTEGRITY ERRORS FOUND:');
                result.errors.forEach(e => console.error(`    - ${e}`));
                console.error('');
                process.exit(1);
            }
            break;
        }

        case 'backup': {
            console.log('\nCreating backup...\n');
            const { backupPath } = await backupDatabase();
            console.log(`  ✔ Backup saved and verified: ${backupPath}\n`);
            break;
        }

        case 'backups': {
            const list = listBackups();
            if (list.length === 0) {
                console.log('\n  No backups found in data/backups/\n');
            } else {
                console.log(`\nBackups (${list.length}):\n`);
                list.forEach(b => {
                    const kb = (b.size / 1024).toFixed(1);
                    console.log(`  ${b.filename}  (${kb} KB)`);
                });
                console.log('');
            }
            break;
        }

        default: {
            console.log(`
MinePanel DB CLI

Commands:
  status              Show migration status (applied / pending)
  migrate             Apply all pending migrations
  rollback <version>  Roll back to target version (e.g. rollback 3)
  integrity           Run SQLite integrity check
  backup              Create a timestamped backup (verified)
  backups             List existing backups
`);
            break;
        }
    }
}

main()
    .catch(err => {
        console.error('\n[ERROR]', err.message || err);
        process.exit(1);
    })
    .finally(() => db.close());
