const { dbRun, dbGet, dbAll } = require('../db/database');
const path = require('path');
const fs = require('fs');
const { ZipArchive: _ZipArchive } = require('archiver');
// archiver v8 replaced archiver('zip', opts) factory with new ZipArchive(opts)
function archiver(_fmt, opts) { return new _ZipArchive(opts); }

const SERVERS_DIR = path.resolve(__dirname, '../../servers');

if (!fs.existsSync(SERVERS_DIR)) {
    fs.mkdirSync(SERVERS_DIR, { recursive: true });
}

function sanitizeDirName(name) {
    return name.toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .substring(0, 50) || 'server';
}

async function ensureUniqueDirName(baseName, excludeServerId = null) {
    let dirName = baseName;
    let counter = 1;
    while (true) {
        const existing = await dbGet(
            'SELECT id FROM servers WHERE directory_name = ? AND id != ?',
            [dirName, excludeServerId || -1]
        );
        if (!existing) break;
        dirName = `${baseName}-${counter}`;
        counter++;
    }
    return dirName;
}

async function getServer(serverId) {
    return dbGet('SELECT * FROM servers WHERE id = ?', [serverId]);
}

function getServerDir(server) {
    return path.join(SERVERS_DIR, server.directory_name || server.id.toString());
}

function createBackup(serverDir, label = 'backup', includes = 'all') {
    return new Promise((resolve, reject) => {
        const backupsDir = path.join(serverDir, 'backups');
        if (!fs.existsSync(backupsDir)) {
            fs.mkdirSync(backupsDir, { recursive: true });
        }
        // Limit total backups to 10
        try {
            const existing = fs.readdirSync(backupsDir)
                .filter(f => f.endsWith('.zip'))
                .map(f => ({ name: f, time: fs.statSync(path.join(backupsDir, f)).mtime }))
                .sort((a, b) => b.time - a.time);
            if (existing.length >= 10) {
                existing.slice(9).forEach(b => {
                    try { fs.unlinkSync(path.join(backupsDir, b.name)); } catch (_) {}
                });
            }
        } catch (_) {}

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupFile = path.join(backupsDir, `${label}-${timestamp}.zip`);
        const output = fs.createWriteStream(backupFile);
        const archive = archiver('zip', { zlib: { level: 6 } });

        output.on('close', () => {
            resolve({ filename: `${label}-${timestamp}.zip`, size: archive.pointer() });
        });
        archive.on('error', err => {
            reject(err);
        });
        archive.pipe(output);

        // Recursive walker that skips locked files to prevent EPERM/EBUSY errors on active servers
        const addFilesRecursively = (dir, currentPath = '') => {
            const files = fs.readdirSync(dir);
            for (const file of files) {
                const fullPath = path.join(dir, file);
                const relPath = currentPath ? path.join(currentPath, file) : file;
                const relPathPosix = relPath.replace(/\\/g, '/');
                
                // Exclude backups, server jars, session.locks, etc.
                if (relPathPosix.startsWith('backups/') || relPathPosix === 'backups') continue;
                if (relPathPosix === 'server.jar' || relPathPosix.endsWith('.jar.tmp') || relPathPosix.endsWith('session.lock')) continue;
                
                if (includes !== 'all') {
                    const topLevel = relPathPosix.split('/')[0];
                    const includeList = includes.split(',').map(s => s.trim()).filter(Boolean);
                    if (!includeList.includes(topLevel)) continue;
                }
                
                try {
                    const stat = fs.statSync(fullPath);
                    if (stat.isDirectory()) {
                        addFilesRecursively(fullPath, relPath);
                    } else if (stat.isFile()) {
                        try {
                            const fd = fs.openSync(fullPath, 'r');
                            fs.closeSync(fd);
                            archive.file(fullPath, { name: relPathPosix });
                        } catch (err) {
                            console.warn(`[Backup] Skipping locked or inaccessible file: ${relPathPosix}`, err.message);
                        }
                    }
                } catch (_) {}
            }
        };

        try {
            addFilesRecursively(serverDir);
            archive.finalize();
        } catch (walkErr) {
            reject(walkErr);
        }
    });
}

async function migrateServerDirectories() {
    const servers = await dbAll('SELECT * FROM servers WHERE directory_name IS NULL');
    for (const server of servers) {
        const baseName = sanitizeDirName(server.name);
        const dirName = await ensureUniqueDirName(baseName, server.id);

        const oldDir = path.join(SERVERS_DIR, server.id.toString());
        const newDir = path.join(SERVERS_DIR, dirName);

        if (fs.existsSync(oldDir) && oldDir !== newDir) {
            try {
                fs.renameSync(oldDir, newDir);
                console.log(`[Migration] Renamed server dir: ${server.id} → ${dirName}`);
            } catch (e) {
                console.error(`[Migration] Failed to rename ${oldDir}:`, e.message);
                await dbRun('UPDATE servers SET directory_name = ? WHERE id = ?', [server.id.toString(), server.id]);
                continue;
            }
        }
        await dbRun('UPDATE servers SET directory_name = ? WHERE id = ?', [dirName, server.id]);
    }
}

module.exports = { SERVERS_DIR, sanitizeDirName, ensureUniqueDirName, getServer, getServerDir, createBackup, migrateServerDirectories };
