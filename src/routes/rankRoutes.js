const express = require('express');
const { dbRun, dbGet, dbAll } = require('../db/database');
const { authenticateToken } = require('../core/auth');
const { checkGlobalPermission, AVAILABLE_PERMISSIONS } = require('../core/permissions');
const { E, sendError } = require('../core/errors');
const { validate } = require('../middleware/validation');
const V = require('../middleware/validators');
const logger = require('../core/utils/logger');

const router = express.Router();

// List all ranks
router.get('/', authenticateToken, async (req, res) => {
    try {
        const ranks = await dbAll('SELECT * FROM ranks ORDER BY is_builtin DESC, name ASC');
        res.json(ranks.map(r => {
            let parsedPerms = {};
            try { parsedPerms = JSON.parse(r.permissions); } catch(e) {}
            let parsedGlobal = [];
            try { parsedGlobal = JSON.parse(r.global_permissions || '[]'); } catch(e) {}
            return { ...r, permissions: parsedPerms, global_permissions: parsedGlobal };
        }));
    } catch (e) {
        logger.error(`[rankRoutes] List ranks error (User: ${req.user.id}):`, e);
        return sendError(res, E.INTERNAL_ERROR, 500);
    }
});

// Get available permissions list
router.get('/permissions', authenticateToken, (req, res) => {
    res.json(AVAILABLE_PERMISSIONS);
});

// Create a new rank
router.post('/create', authenticateToken, checkGlobalPermission('account.manage'), validate(V.createRank), async (req, res) => {
    const { name, color } = req.body;

    if (!name) return sendError(res, E.RANK_FIELDS_INVALID, 400);
    if (name.length < 2 || name.length > 32) return sendError(res, E.BAD_REQUEST, 400, 'Name must be 2-32 characters');

    try {
        const result = await dbRun(
            'INSERT INTO ranks (name, permissions, global_permissions, is_builtin, color) VALUES (?, ?, ?, 0, ?)',
            [name, '{}', '[]', color || '#3b82f6']
        );
        res.json({ message: 'Rank created', rankId: result.lastID });
    } catch (e) {
        if (e.message && e.message.includes('UNIQUE')) {
            return sendError(res, E.RANK_NAME_TAKEN, 409);
        }
        logger.error(`[rankRoutes] Create rank error (User: ${req.user.id}):`, e);
        return sendError(res, E.INTERNAL_ERROR, 500);
    }
});

// PUT update rank
router.put('/:rankId', authenticateToken, checkGlobalPermission('account.manage'), validate(V.updateRank), async (req, res) => {
    const { rankId } = req.params;
    const { name, color, global, servers } = req.body;

    try {
        const rank = await dbGet('SELECT * FROM ranks WHERE id = ?', [rankId]);
        if (!rank) return sendError(res, E.RANK_NOT_FOUND, 404);

        const nextName = rank.is_builtin ? rank.name : name;

        await dbRun(
            'UPDATE ranks SET name = ?, color = ?, global_permissions = ?, permissions = ? WHERE id = ?',
            [nextName, color || rank.color, JSON.stringify(global), JSON.stringify(servers), rankId]
        );
        res.json({ message: 'Rank updated' });
    } catch (e) {
        logger.error(`[rankRoutes] Update rank PUT error (Rank: ${rankId}, User: ${req.user.id}):`, e);
        return sendError(res, E.INTERNAL_ERROR, 500);
    }
});

// Update a rank (legacy POST update endpoint)
router.post('/:rankId/update', authenticateToken, checkGlobalPermission('account.manage'), async (req, res) => {
    const { rankId } = req.params;
    const { name, color, global, servers } = req.body;

    const finalGlobal = Array.isArray(global) ? global : (Array.isArray(req.body.permissions) ? req.body.permissions : []);
    const finalServers = (typeof servers === 'object' && servers !== null) ? servers : {};

    try {
        const rank = await dbGet('SELECT * FROM ranks WHERE id = ?', [rankId]);
        if (!rank) return sendError(res, E.RANK_NOT_FOUND, 404);

        const nextName = rank.is_builtin ? rank.name : (name || rank.name);
        const nextColor = color || rank.color;

        await dbRun(
            'UPDATE ranks SET name = ?, color = ?, global_permissions = ?, permissions = ? WHERE id = ?',
            [nextName, nextColor, JSON.stringify(finalGlobal), JSON.stringify(finalServers), rankId]
        );
        res.json({ message: 'Rank updated' });
    } catch (e) {
        logger.error(`[rankRoutes] Update rank POST error (Rank: ${rankId}, User: ${req.user.id}):`, e);
        return sendError(res, E.INTERNAL_ERROR, 500);
    }
});

// Delete a rank (non-builtin only)
router.post('/:rankId/delete', authenticateToken, checkGlobalPermission('account.manage'), async (req, res) => {
    const { rankId } = req.params;
    try {
        const rank = await dbGet('SELECT * FROM ranks WHERE id = ?', [rankId]);
        if (!rank) return sendError(res, E.RANK_NOT_FOUND, 404);
        if (rank.is_builtin) return sendError(res, E.RANK_BUILTIN_PROTECTED, 403);

        await dbRun('UPDATE users SET rank_id = NULL WHERE rank_id = ?', [rankId]);
        await dbRun('DELETE FROM user_server_ranks WHERE rank_id = ?', [rankId]);
        await dbRun('DELETE FROM ranks WHERE id = ?', [rankId]);
        res.json({ message: 'Rank deleted' });
    } catch (e) {
        logger.error(`[rankRoutes] Delete rank error (Rank: ${rankId}, User: ${req.user.id}):`, e);
        return sendError(res, E.INTERNAL_ERROR, 500);
    }
});

module.exports = router;
