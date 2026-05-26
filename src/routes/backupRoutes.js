const express = require('express');
const fs = require('fs');
const fsp = require('fs').promises;
const path = require('path');
const archiver = require('archiver');
const { dbAll } = require('../db/database');
const { authenticateToken } = require('../core/auth');
const { checkPermission } = require('../core/permissions');
const { getServer, getServerDir, SERVERS_DIR, createBackup } = require('../core/serverHelper');

const router = express.Router({ mergeParams: true });

router.get('/', authenticateToken, checkPermission('server.backups.read'), async (req, res) => {
    try {
        const server = await getServer(req.params.serverId);
        if (!server) return res.status(404).json({ error: 'Server not found' });
        const backupsDir = path.join(getServerDir(server), 'backups');
        if (!fs.existsSync(backupsDir)) return res.json([]);
        const files = fs.readdirSync(backupsDir).filter(f => f.endsWith('.zip')).map(f => {
            const stats = fs.statSync(path.join(backupsDir, f));
            return { name: f, size: stats.size, date: stats.mtime };
        }).sort((a, b) => b.date - a.date);
        res.json(files);
    } catch (e) {
        console.error(`[backupRoutes] List error (Server: ${req.params.serverId}, User: ${req.user.id}):`, e);
        res.status(500).json({ error: 'Failed to list backups' });
    }
});

router.post('/create', authenticateToken, checkPermission('server.backups.create'), async (req, res) => {
    try {
        const server = await getServer(req.params.serverId);
        if (!server) return res.status(404).json({ error: 'Server not found' });
        const serverDir = getServerDir(server);
        const includes = req.body.includes || 'all';
        const result = await createBackup(serverDir, 'backup', includes);
        res.json({ message: 'Backup created', filename: result.filename, size: result.size });
    } catch (e) {
        console.error(`[backupRoutes] Create error (Server: ${req.params.serverId}, User: ${req.user.id}):`, e);
        res.status(500).json({ error: 'Failed to create backup' });
    }
});

router.get('/:filename/download', authenticateToken, checkPermission('server.backups.read'), async (req, res) => {
    const { filename } = req.params;
    if (!filename.endsWith('.zip') || filename.includes('..') || filename.includes('/') || filename.includes('\\')) return res.status(400).json({ error: 'Invalid filename' });
    try {
        const server = await getServer(req.params.serverId);
        if (!server) return res.status(404).json({ error: 'Server not found' });
        const backupPath = path.join(getServerDir(server), 'backups', filename);
        if (fs.existsSync(backupPath)) res.download(backupPath);
        else res.status(404).json({ error: 'Backup not found' });
    } catch (e) {
        console.error(`[backupRoutes] Download error (Server: ${req.params.serverId}, User: ${req.user.id}):`, e);
        res.status(500).json({ error: 'Failed to download backup' });
    }
});

router.post('/:filename/delete', authenticateToken, checkPermission('server.backups.delete'), async (req, res) => {
    const { filename } = req.params;
    if (!filename.endsWith('.zip') || filename.includes('..') || filename.includes('/') || filename.includes('\\')) return res.status(400).json({ error: 'Invalid filename' });
    try {
        const server = await getServer(req.params.serverId);
        if (!server) return res.status(404).json({ error: 'Server not found' });
        const backupPath = path.join(getServerDir(server), 'backups', filename);
        if (fs.existsSync(backupPath)) { fs.unlinkSync(backupPath); res.json({ message: 'Backup deleted' }); }
        else res.status(404).json({ error: 'Backup not found' });
    } catch (e) {
        console.error(`[backupRoutes] Delete error (Server: ${req.params.serverId}, User: ${req.user.id}):`, e);
        res.status(500).json({ error: 'Failed to delete backup' });
    }
});

router.post('/:filename/restore', authenticateToken, checkPermission('server.backups.restore'), async (req, res) => {
    const { filename } = req.params;
    if (!filename.endsWith('.zip') || filename.includes('..') || filename.includes('/') || filename.includes('\\')) return res.status(400).json({ error: 'Invalid filename' });
    try {
        const server = await getServer(req.params.serverId);
        if (!server) return res.status(404).json({ error: 'Server not found' });
        const processManager = require('../core/processManager');
        if (processManager.getStatus(server.id.toString()) === 'online') {
            return res.status(400).json({ error: 'Stop the server before restoring a backup' });
        }

        const serverDir = getServerDir(server);
        const backupPath = path.join(serverDir, 'backups', filename);
        if (!fs.existsSync(backupPath)) return res.status(404).json({ error: 'Backup not found' });

        const unzipper = require('unzipper');

        await new Promise((resolvePromise, rejectPromise) => {
            let done = false;
            const handleSuccess = () => {
                if (!done) {
                    done = true;
                    resolvePromise();
                }
            };
            const handleError = (err) => {
                if (!done) {
                    done = true;
                    rejectPromise(err);
                }
            };

            fs.createReadStream(backupPath)
                .pipe(unzipper.Extract({ path: serverDir }))
                .on('close', handleSuccess)
                .on('finish', handleSuccess)
                .on('error', handleError);
        });
        res.json({ message: `Backup ${filename} restored. Restart server to apply.` });
    } catch (e) {
        console.error(`[backupRoutes] Restore error (Server: ${req.params.serverId}, User: ${req.user.id}):`, e);
        res.status(500).json({ error: 'Failed to restore backup' });
    }
});

// Scheduled backups
const runScheduledBackups = () => {
    dbAll('SELECT * FROM servers WHERE auto_backup = 1').then(servers => {
        servers.forEach(async s => {
            const serverDir = path.join(SERVERS_DIR, s.directory_name || s.id.toString());
            const backupsDir = path.join(serverDir, 'backups');
            if (!fs.existsSync(serverDir)) return;
            if (!fs.existsSync(backupsDir)) fs.mkdirSync(backupsDir, { recursive: true });
            try {
                const existing = fs.readdirSync(backupsDir).filter(f => f.endsWith('.zip'));
                if (existing.length > 0) {
                    const latest = existing.map(f => ({ name: f, time: fs.statSync(path.join(backupsDir, f)).mtime })).sort((a, b) => b.time - a.time)[0];
                    const intervalMs = (s.backup_interval || 24) * 3600000;
                    if (latest.time.getTime() > Date.now() - intervalMs) return;
                }
            } catch (_) {}
            
            try {
                await createBackup(serverDir, 'auto', s.backup_includes || 'all');
                console.log(`[Backup] Auto backup completed for server ${s.id}`);
            } catch (err) {
                console.error(`[Backup] Auto backup failed for server ${s.id}:`, err);
            }
        });
    }).catch(() => {});

    // Run retention cleanups alongside scheduled backups
    runRetentionCleanups();
};

// Retention cleanups for logs & backups
const runRetentionCleanups = () => {
    dbAll('SELECT * FROM servers').then(servers => {
        servers.forEach(s => {
            const serverDir = path.join(SERVERS_DIR, s.directory_name || s.id.toString());
            if (!fs.existsSync(serverDir)) return;

            // 1. Clean logs
            const logsDir = path.join(serverDir, 'logs');
            if (fs.existsSync(logsDir)) {
                try {
                    const logRetention = s.log_retention_days !== null && s.log_retention_days !== undefined ? s.log_retention_days : 7;
                    if (logRetention > 0) {
                        const cutoff = Date.now() - (logRetention * 24 * 3600 * 1000);
                        const files = fs.readdirSync(logsDir).filter(f => (f.endsWith('.log') || f.endsWith('.log.gz')) && f !== 'latest.log');
                        files.forEach(f => {
                            const fp = path.join(logsDir, f);
                            try {
                                const stats = fs.statSync(fp);
                                if (stats.mtimeMs < cutoff) {
                                    fs.unlinkSync(fp);
                                    console.log(`[Retention] Deleted old log ${f} for server ${s.id} (older than ${logRetention} days)`);
                                }
                            } catch (_) {}
                        });
                    }
                } catch (err) {
                    console.error(`[Retention] Failed to clean logs for server ${s.id}:`, err);
                }
            }

            // 2. Clean backups
            const backupsDir = path.join(serverDir, 'backups');
            if (fs.existsSync(backupsDir)) {
                try {
                    const backupRetention = s.backup_retention_days !== null && s.backup_retention_days !== undefined ? s.backup_retention_days : 30;
                    if (backupRetention > 0) {
                        const cutoff = Date.now() - (backupRetention * 24 * 3600 * 1000);
                        const files = fs.readdirSync(backupsDir).filter(f => f.endsWith('.zip'));
                        files.forEach(f => {
                            const fp = path.join(backupsDir, f);
                            try {
                                const stats = fs.statSync(fp);
                                if (stats.mtimeMs < cutoff) {
                                    fs.unlinkSync(fp);
                                    console.log(`[Retention] Deleted old backup ${f} for server ${s.id} (older than ${backupRetention} days)`);
                                }
                            } catch (_) {}
                        });
                    }
                } catch (err) {
                    console.error(`[Retention] Failed to clean backups for server ${s.id}:`, err);
                }
            }
        });
    }).catch(err => {
        console.error(`[Retention] Failed to fetch servers for cleanup:`, err);
    });
};

setInterval(runScheduledBackups, 3600000);

module.exports = router;
