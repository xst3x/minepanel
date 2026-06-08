/**
 * Docker & Migration Routes
 * 
 * POST /api/docker/check          — check if Docker daemon is available
 * GET  /api/docker/migration      — get current migration status
 * POST /api/docker/migrate        — trigger migration (called when toggle changes)
 * GET  /api/docker/server-modes   — get execution mode for all servers
 */

const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../core/auth');
const { hasPermission } = require('../core/permissions');
const { E, sendError } = require('../core/errors');
const { dbAll, dbGet } = require('../db/database');
const dockerService = require('../core/dockerService');
const migrationService = require('../core/migrationService');
const logger = require('../core/utils/logger');
const path = require('path');
const fs = require('fs');

const SETTINGS_FILE = path.resolve(__dirname, '../../settings.json');

async function getSettings() {
    const defaults = { dockerMode: false };
    try {
        if (fs.existsSync(SETTINGS_FILE)) {
            const data = fs.readFileSync(SETTINGS_FILE, 'utf8');
            const parsed = JSON.parse(data);
            return { ...defaults, ...parsed };
        }
    } catch (_) {}
    return defaults;
}

async function saveDockerMode(enabled) {
    let current = {};
    try {
        if (fs.existsSync(SETTINGS_FILE)) {
            current = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
        }
    } catch (_) {}
    const updated = { ...current, dockerMode: enabled };
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(updated, null, 2), 'utf8');
}

// ── Check Docker availability ─────────────────────────────────────────────────
router.get('/check', authenticateToken, async (req, res) => {
    try {
        const isAllowed = await hasPermission(req.user.id, null, 'panel.settings');
        if (!isAllowed) return sendError(res, E.FORBIDDEN, 403);

        // Reset cached connection so every check does a fresh probe
        dockerService.resetConnection();
        const available = await dockerService.pingDocker();
        res.json({ available });
    } catch (e) {
        logger.error('[dockerRoutes] /check error:', e);
        res.json({ available: false, error: e.message });
    }
});

// ── Get current migration progress ───────────────────────────────────────────
router.get('/migration', authenticateToken, async (req, res) => {
    try {
        const isAllowed = await hasPermission(req.user.id, null, 'panel.settings');
        if (!isAllowed) return sendError(res, E.FORBIDDEN, 403);

        res.json({
            migrating: migrationService.isMigrating(),
            status: migrationService.getStatus(),
        });
    } catch (e) {
        logger.error('[dockerRoutes] /migration GET error:', e);
        return sendError(res, E.INTERNAL_ERROR, 500);
    }
});

// ── Trigger migration (toggle Docker mode) ───────────────────────────────────
router.post('/migrate', authenticateToken, async (req, res) => {
    try {
        const isAllowed = await hasPermission(req.user.id, null, 'panel.settings');
        if (!isAllowed) return sendError(res, E.FORBIDDEN, 403);

        if (migrationService.isMigrating()) {
            return res.status(409).json({ error: 'A migration is already in progress.' });
        }

        const { enable } = req.body;
        if (typeof enable !== 'boolean') {
            return res.status(400).json({ error: 'enable (boolean) is required.' });
        }

        // If enabling Docker mode, verify Docker is available first
        if (enable) {
            const available = await dockerService.pingDocker();
            if (!available) {
                return res.status(503).json({
                    error: 'Docker daemon is not available. Please ensure Docker is installed and running.'
                });
            }
        }

        const targetMode = enable ? 'docker' : 'native';

        // Save the new setting immediately (before migration starts)
        // If migration fails for some servers, they'll be reverted individually
        await saveDockerMode(enable);

        // Start migration in background — respond immediately so UI can poll
        res.json({ message: `Migration to ${targetMode} mode started.`, migrating: true });

        // Run migration asynchronously
        migrationService.migrateAllServers(targetMode).then(result => {
            logger.info(`[dockerRoutes] Migration to ${targetMode} complete:`, JSON.stringify(result));
        }).catch(err => {
            logger.error('[dockerRoutes] Migration error:', err);
        });

    } catch (e) {
        logger.error('[dockerRoutes] /migrate POST error:', e);
        return sendError(res, E.INTERNAL_ERROR, 500, e.message);
    }
});

// ── Get execution modes for all servers ──────────────────────────────────────
router.get('/server-modes', authenticateToken, async (req, res) => {
    try {
        const servers = await dbAll('SELECT id, name, execution_mode FROM servers');
        const settings = await getSettings();
        res.json({
            dockerMode: !!settings.dockerMode,
            servers: (servers || []).map(s => ({
                id: s.id,
                name: s.name,
                mode: s.execution_mode || 'native',
            }))
        });
    } catch (e) {
        logger.error('[dockerRoutes] /server-modes error:', e);
        return sendError(res, E.INTERNAL_ERROR, 500);
    }
});

module.exports = router;
