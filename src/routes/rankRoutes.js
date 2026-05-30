const express = require('express');
const { dbRun, dbGet, dbAll } = require('../db/database');
const { authenticateToken } = require('../core/auth');
const { checkGlobalPermission, AVAILABLE_PERMISSIONS } = require('../core/permissions');
const { validate } = require('../middleware/validation');
const V = require('../middleware/validators');

const router = express.Router();

// List all ranks
router.get('/', authenticateToken, async (req, res) => {
    try {
        const ranks = await dbAll('SELECT * FROM ranks ORDER BY is_builtin DESC, name ASC');
        res.json(ranks.map(r => {
            let parsedPerms = {};
            try {
                parsedPerms = JSON.parse(r.permissions);
            } catch(e) {}
            let parsedGlobal = [];
            try {
                parsedGlobal = JSON.parse(r.global_permissions || '[]');
            } catch(e) {}
            return {
                ...r,
                permissions: parsedPerms,
                global_permissions: parsedGlobal
            };
        }));
    } catch (e) {
        console.error(`[rankRoutes] List ranks error (User: ${req.user.id}):`, e);
        res.status(500).json({ error: 'Database error' });
    }
});

// Get available permissions list
router.get('/permissions', authenticateToken, (req, res) => {
    res.json(AVAILABLE_PERMISSIONS);
});

// Create a new rank
router.post('/create', authenticateToken, checkGlobalPermission('account.manage'), validate(V.createRank), async (req, res) => {
    const { name, color } = req.body;

    if (!name) {
        return res.status(400).json({ error: 'Name required' });
    }
    if (name.length < 2 || name.length > 32) {
        return res.status(400).json({ error: 'Name must be 2-32 characters' });
    }

    try {
        const result = await dbRun(
            'INSERT INTO ranks (name, permissions, global_permissions, is_builtin, color) VALUES (?, ?, ?, 0, ?)',
            [name, '{}', '[]', color || '#3b82f6']
        );
        res.json({ message: 'Rank created', rankId: result.lastID });
    } catch (e) {
        if (e.message && e.message.includes('UNIQUE')) {
            return res.status(409).json({ error: 'Rank name already exists' });
        }
        console.error(`[rankRoutes] Create rank error (User: ${req.user.id}):`, e);
        res.status(500).json({ error: 'Failed to create rank' });
    }
});

// PUT update rank (New spec)
router.put('/:rankId', authenticateToken, checkGlobalPermission('account.manage'), validate(V.updateRank), async (req, res) => {
    const { rankId } = req.params;
    const { name, color, global, servers } = req.body;

    try {
        const rank = await dbGet('SELECT * FROM ranks WHERE id = ?', [rankId]);
        if (!rank) return res.status(404).json({ error: 'Rank not found' });

        const nextName = rank.is_builtin ? rank.name : name;

        await dbRun(
            'UPDATE ranks SET name = ?, color = ?, global_permissions = ?, permissions = ? WHERE id = ?',
            [nextName, color || rank.color, JSON.stringify(global), JSON.stringify(servers), rankId]
        );
        res.json({ message: 'Rank updated' });
    } catch (e) {
        console.error(`[rankRoutes] Update rank PUT error (Rank: ${rankId}, User: ${req.user.id}):`, e);
        res.status(500).json({ error: 'Failed to update rank' });
    }
});

// Update a rank (legacy POST update endpoint, robust to support both formats)
router.post('/:rankId/update', authenticateToken, checkGlobalPermission('account.manage'), async (req, res) => {
    const { rankId } = req.params;
    const { name, color, global, servers } = req.body;

    const finalGlobal = Array.isArray(global) ? global : (Array.isArray(req.body.permissions) ? req.body.permissions : []);
    const finalServers = (typeof servers === 'object' && servers !== null) ? servers : {};

    try {
        const rank = await dbGet('SELECT * FROM ranks WHERE id = ?', [rankId]);
        if (!rank) return res.status(404).json({ error: 'Rank not found' });

        const nextName = rank.is_builtin ? rank.name : (name || rank.name);
        const nextColor = color || rank.color;

        await dbRun(
            'UPDATE ranks SET name = ?, color = ?, global_permissions = ?, permissions = ? WHERE id = ?',
            [nextName, nextColor, JSON.stringify(finalGlobal), JSON.stringify(finalServers), rankId]
        );
        res.json({ message: 'Rank updated' });
    } catch (e) {
        console.error(`[rankRoutes] Update rank POST error (Rank: ${rankId}, User: ${req.user.id}):`, e);
        res.status(500).json({ error: 'Failed to update rank' });
    }
});

// Delete a rank (non-builtin only)
router.post('/:rankId/delete', authenticateToken, checkGlobalPermission('account.manage'), async (req, res) => {
    const { rankId } = req.params;
    try {
        const rank = await dbGet('SELECT * FROM ranks WHERE id = ?', [rankId]);
        if (!rank) return res.status(404).json({ error: 'Rank not found' });
        if (rank.is_builtin) return res.status(403).json({ error: 'Cannot delete built-in ranks' });

        // Update users having this rank globally to null
        await dbRun('UPDATE users SET rank_id = NULL WHERE rank_id = ?', [rankId]);

        await dbRun('DELETE FROM user_server_ranks WHERE rank_id = ?', [rankId]);
        await dbRun('DELETE FROM ranks WHERE id = ?', [rankId]);
        res.json({ message: 'Rank deleted' });
    } catch (e) {
        console.error(`[rankRoutes] Delete rank error (Rank: ${rankId}, User: ${req.user.id}):`, e);
        res.status(500).json({ error: 'Failed to delete rank' });
    }
});

module.exports = router;
