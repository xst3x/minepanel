const express = require('express');
const { db, dbRun, dbGet, dbAll } = require('../db/database');
const { authenticateToken, hashPassword } = require('../core/auth');
const { checkGlobalPermission, getEffectivePermissions, AVAILABLE_PERMISSIONS, hasPermission } = require('../core/permissions');

// Middleware to prevent a user from deleting their own logged‑in account
function preventSelfDeletion(req, res, next) {
    // req.user is set by authenticateToken
    if (req.user && Number(req.user.id) === Number(req.params.userId)) {
        return res.status(403).json({ error: 'Cannot delete the account you are currently logged into' });
    }
    next();
}

const router = express.Router();

// Get available permissions list
router.get('/permissions', authenticateToken, (req, res) => {
    res.json(AVAILABLE_PERMISSIONS);
});

// Helper to check if user has a global permission
async function hasGlobalPermission(userId, permission) {
    return hasPermission(userId, null, permission);
}

// List users (managers see all, regular users see only themselves)
router.get('/', authenticateToken, async (req, res) => {
    try {
        const isManager = await hasGlobalPermission(req.user.id, 'account.manage');
        let users;
        if (isManager) {
            users = await dbAll(`
                SELECT u.id, u.username, u.role, u.disabled, u.created_at, u.rank_id, r.name as rank_name, r.color as rank_color
                FROM users u
                LEFT JOIN ranks r ON u.rank_id = r.id
            `);
        } else {
            users = await dbAll(`
                SELECT u.id, u.username, u.role, u.disabled, u.created_at, u.rank_id, r.name as rank_name, r.color as rank_color
                FROM users u
                LEFT JOIN ranks r ON u.rank_id = r.id
                WHERE u.id = ?
            `, [req.user.id]);
        }
        res.json({ users, isCallerManager: isManager });
    } catch (e) {
        console.error(`[userRoutes] List users error (User: ${req.user.id}):`, e);
        res.status(500).json({ error: 'Database error' });
    }
});

// Get a user's permissions (global + server-specific)
// User Accent Color Endpoints
router.get('/me/accent', authenticateToken, async (req, res) => {
    try {
        const key = `accentColor:${req.user.id}`;
        const row = await dbGet('SELECT value FROM settings WHERE key = ?', [key]);
        const accent = row ? row.value : null;
        res.json({ accent });
    } catch (e) {
        console.error('[userRoutes] Get accent error:', e);
        res.status(500).json({ error: 'Database error' });
    }
});

router.post('/me/accent', authenticateToken, async (req, res) => {
    const { accent } = req.body;
    if (!accent) return res.status(400).json({ error: 'Accent value required' });
    try {
        const key = `accentColor:${req.user.id}`;
        await dbRun('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', [key, accent]);
        res.json({ message: 'Accent saved' });
    } catch (e) {
        console.error('[userRoutes] Save accent error:', e);
        res.status(500).json({ error: 'Database error' });
    }
});

// Get a user's permissions (global + server-specific)
router.get('/:userId/permissions', authenticateToken, checkGlobalPermission('account.manage'), async (req, res) => {
    const { userId } = req.params;
    try {
        const user = await dbGet('SELECT rank_id, global_permissions FROM users WHERE id = ?', [userId]);
        if (!user) return res.status(404).json({ error: 'User not found' });

        const globalPerms = JSON.parse(user.global_permissions || '[]');
        
        // Fetch user's server-specific permissions
        const serverPermsRows = await dbAll(
            'SELECT server_id, permission FROM user_server_permissions WHERE user_id = ?',
            [userId]
        );
        const serversPerms = {};
        serverPermsRows.forEach(row => {
            if (!serversPerms[row.server_id]) {
                serversPerms[row.server_id] = [];
            }
            serversPerms[row.server_id].push(row.permission);
        });

        // Fetch rank permissions if user has a rank
        let rankData = null;
        if (user.rank_id) {
            const rank = await dbGet('SELECT id, name, color, permissions, global_permissions FROM ranks WHERE id = ?', [user.rank_id]);
            if (rank) {
                rankData = {
                    id: rank.id,
                    name: rank.name,
                    color: rank.color,
                    global: JSON.parse(rank.global_permissions || '[]'),
                    servers: JSON.parse(rank.permissions || '{}')
                };
            }
        }

        res.json({
            global: globalPerms,
            servers: serversPerms,
            rank: rankData
        });
    } catch (e) {
        console.error(`[userRoutes] Get user permissions error (Target: ${userId}, Caller: ${req.user.id}):`, e);
        res.status(500).json({ error: 'Database error' });
    }
});

// Save per-user global and per-server permissions (does NOT affect rank)
router.put('/:userId/permissions', authenticateToken, checkGlobalPermission('account.manage'), async (req, res) => {
    const { userId } = req.params;
    const { global, servers } = req.body;

    if (!Array.isArray(global) || typeof servers !== 'object' || servers === null) {
        return res.status(400).json({ error: 'Invalid body format' });
    }

    try {
        const user = await dbGet('SELECT id FROM users WHERE id = ?', [userId]);
        if (!user) return res.status(404).json({ error: 'User not found' });

        // Update global permissions
        await dbRun('UPDATE users SET global_permissions = ? WHERE id = ?', [JSON.stringify(global), userId]);

        // Update server permissions
        await dbRun('DELETE FROM user_server_permissions WHERE user_id = ?', [userId]);
        for (const [serverId, perms] of Object.entries(servers)) {
            if (Array.isArray(perms)) {
                for (const perm of perms) {
                    await dbRun(
                        'INSERT INTO user_server_permissions (user_id, server_id, permission) VALUES (?, ?, ?)',
                        [userId, serverId, perm]
                    );
                }
            }
        }

        res.json({ message: 'Permissions saved' });
    } catch (e) {
        console.error(`[userRoutes] Save user permissions error (Target: ${userId}, Caller: ${req.user.id}):`, e);
        res.status(500).json({ error: 'Database error' });
    }
});

// Update global rank assignment for user
router.put('/:userId/rank', authenticateToken, checkGlobalPermission('account.manage'), async (req, res) => {
    const { userId } = req.params;
    const { rankId } = req.body;

    try {
        const user = await dbGet('SELECT id FROM users WHERE id = ?', [userId]);
        if (!user) return res.status(404).json({ error: 'User not found' });

        if (rankId !== null) {
            const rank = await dbGet('SELECT id FROM ranks WHERE id = ?', [rankId]);
            if (!rank) return res.status(404).json({ error: 'Rank not found' });
        }

        await dbRun('UPDATE users SET rank_id = ? WHERE id = ?', [rankId, userId]);
        res.json({ message: 'Rank updated' });
    } catch (e) {
        console.error(`[userRoutes] Update user rank error (Target: ${userId}, Rank: ${rankId}, Caller: ${req.user.id}):`, e);
        res.status(500).json({ error: 'Database error' });
    }
});

// Self-service: Change own username (requires current name verification)
router.post('/change-name', authenticateToken, async (req, res) => {
    const { currentName, newName, confirmNewName } = req.body;

    if (!currentName || !newName || !confirmNewName) {
        return res.status(400).json({ error: 'All fields are required' });
    }

    if (currentName !== req.user.username) {
        return res.status(400).json({ error: 'Current name does not match logged-in user' });
    }

    if (newName !== confirmNewName) {
        return res.status(400).json({ error: 'New name and confirm name do not match' });
    }

    if (newName.length < 3 || newName.length > 32) {
        return res.status(400).json({ error: 'New name must be 3-32 characters' });
    }

    try {
        await dbRun('UPDATE users SET username = ? WHERE id = ?', [newName, req.user.id]);
        res.json({ message: 'Username changed successfully' });
    } catch (e) {
        if (e.message && e.message.includes('UNIQUE')) {
            return res.status(409).json({ error: 'Username already exists' });
        }
        console.error(`[userRoutes] Change username error (User: ${req.user.id}):`, e);
        res.status(500).json({ error: 'Failed to update username' });
    }
});

// Self-service: Change own password (requires old password verification)
router.post('/change-password', authenticateToken, async (req, res) => {
    const { oldPassword, newPassword, newPasswordConfirm } = req.body;

    if (!oldPassword || !newPassword || !newPasswordConfirm) {
        return res.status(400).json({ error: 'All fields are required' });
    }

    if (newPassword !== newPasswordConfirm) {
        return res.status(400).json({ error: 'New passwords do not match' });
    }

    if (newPassword.length < 6) {
        return res.status(400).json({ error: 'New password must be at least 6 characters' });
    }

    try {
        const { comparePassword } = require('../core/auth');
        const user = await dbGet('SELECT password FROM users WHERE id = ?', [req.user.id]);
        if (!user) return res.status(404).json({ error: 'User not found' });

        const match = await comparePassword(oldPassword, user.password);
        if (!match) return res.status(400).json({ error: 'Incorrect current password' });

        const hashed = await hashPassword(newPassword);
        await dbRun('UPDATE users SET password = ? WHERE id = ?', [hashed, req.user.id]);
        res.json({ message: 'Password changed successfully' });
    } catch (e) {
        console.error(`[userRoutes] Change password error (User: ${req.user.id}):`, e);
        res.status(500).json({ error: 'Failed to update password' });
    }
});

// Admin/Manager: Change name of another user
router.post('/:userId/change-name', authenticateToken, checkGlobalPermission('account.manage'), async (req, res) => {
    const { userId } = req.params;
    const { newName, confirmNewName } = req.body;

    if (!newName || !confirmNewName) {
        return res.status(400).json({ error: 'All fields are required' });
    }

    if (newName !== confirmNewName) {
        return res.status(400).json({ error: 'Names do not match' });
    }

    if (newName.length < 3 || newName.length > 32) {
        return res.status(400).json({ error: 'Name must be 3-32 characters' });
    }

    try {
        const user = await dbGet('SELECT role FROM users WHERE id = ?', [userId]);
        if (!user) return res.status(404).json({ error: 'User not found' });

        // Non-admin managers cannot edit admin accounts
        const caller = await dbGet('SELECT role FROM users WHERE id = ?', [req.user.id]);
        if (user.role === 'admin' && caller.role !== 'admin') {
            return res.status(403).json({ error: 'Only administrators can edit admin accounts' });
        }

        await dbRun('UPDATE users SET username = ? WHERE id = ?', [newName, userId]);
        res.json({ message: 'Username updated successfully' });
    } catch (e) {
        if (e.message && e.message.includes('UNIQUE')) {
            return res.status(409).json({ error: 'Username already exists' });
        }
        console.error(`[userRoutes] Change user name error (Target: ${userId}, Caller: ${req.user.id}):`, e);
        res.status(500).json({ error: 'Failed to update username' });
    }
});

// Admin/Manager: Reset password of another user (forget password scenario)
router.post('/:userId/reset-password', authenticateToken, checkGlobalPermission('account.manage'), async (req, res) => {
    const { userId } = req.params;
    const { newPassword, confirmPassword } = req.body;

    if (!newPassword || !confirmPassword) {
        return res.status(400).json({ error: 'All fields are required' });
    }

    if (newPassword !== confirmPassword) {
        return res.status(400).json({ error: 'Passwords do not match' });
    }

    if (newPassword.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    try {
        const user = await dbGet('SELECT role FROM users WHERE id = ?', [userId]);
        if (!user) return res.status(404).json({ error: 'User not found' });

        // Non-admin managers cannot reset admin accounts
        const caller = await dbGet('SELECT role FROM users WHERE id = ?', [req.user.id]);
        if (user.role === 'admin' && caller.role !== 'admin') {
            return res.status(403).json({ error: 'Only administrators can reset admin passwords' });
        }

        const hashed = await hashPassword(newPassword);
        await dbRun('UPDATE users SET password = ? WHERE id = ?', [hashed, userId]);
        res.json({ message: 'Password reset successfully' });
    } catch (e) {
        console.error(`[userRoutes] Reset password error (Target: ${userId}, Caller: ${req.user.id}):`, e);
        res.status(500).json({ error: 'Failed to reset password' });
    }
});

// Admin/Manager: Toggle disabled status of a user
router.patch('/:userId/toggle-disabled', authenticateToken, checkGlobalPermission('account.manage'), async (req, res) => {
    const { userId } = req.params;

    if (Number(userId) === Number(req.user.id)) {
        return res.status(400).json({ error: 'You cannot disable your own account' });
    }

    try {
        const user = await dbGet('SELECT * FROM users WHERE id = ?', [userId]);
        if (!user) return res.status(404).json({ error: 'User not found' });

        // Non-admin managers cannot disable admin accounts
        const caller = await dbGet('SELECT role FROM users WHERE id = ?', [req.user.id]);
        if (user.role === 'admin' && caller.role !== 'admin') {
            return res.status(403).json({ error: 'Only administrators can disable admin accounts' });
        }

        const nextDisabled = user.disabled ? 0 : 1;
        await dbRun('UPDATE users SET disabled = ? WHERE id = ?', [nextDisabled, userId]);

        // Disabled state updated in database. No in-memory blacklist updates needed.
        res.json({
            message: nextDisabled ? 'User account disabled' : 'User account enabled',
            disabled: nextDisabled
        });
    } catch (err) {
        console.error(`[userRoutes] Toggle disabled status error (Target: ${userId}, Caller: ${req.user.id}):`, err);
        res.status(500).json({ error: 'Failed to toggle user status' });
    }
});

// Admin/Manager: Generate invitation token
router.post('/generate-token', authenticateToken, checkGlobalPermission('account.manage'), async (req, res) => {
    const { permissions, ranks } = req.body;

    if (!Array.isArray(permissions) || !Array.isArray(ranks)) {
        return res.status(400).json({ error: 'Permissions and ranks must be arrays' });
    }

    try {
        const crypto = require('crypto');
        const token = crypto.randomBytes(16).toString('hex');
        const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();

        await dbRun(
            'INSERT INTO account_creation_tokens (token, created_by, expires_at, permissions, ranks) VALUES (?, ?, ?, ?, ?)',
            [token, req.user.id, expiresAt, JSON.stringify(permissions), JSON.stringify(ranks)]
        );

        res.json({ token });
    } catch (err) {
        console.error(`[userRoutes] Generate invite token error (Caller: ${req.user.id}):`, err);
        res.status(500).json({ error: 'Failed to generate invite token' });
    }
});

// Admin/Manager: Clear all invitation tokens
router.delete('/tokens/clear-all', authenticateToken, checkGlobalPermission('account.manage'), async (req, res) => {
    try {
        await dbRun('DELETE FROM account_creation_tokens');
        res.json({ message: 'All invite tokens cleared' });
    } catch (err) {
        console.error(`[userRoutes] Clear invite tokens error (Caller: ${req.user.id}):`, err);
        res.status(500).json({ error: 'Failed to clear invite tokens' });
    }
});

// Admin/Manager: Delete a user account
router.post('/:userId/delete', authenticateToken, preventSelfDeletion, checkGlobalPermission('account.manage'), async (req, res) => {
    const { userId } = req.params;
    try {
        const user = await dbGet('SELECT role FROM users WHERE id = ?', [userId]);
        if (!user) return res.status(404).json({ error: 'User not found' });

        // Non-admin managers cannot delete admin accounts
        const caller = await dbGet('SELECT role FROM users WHERE id = ?', [req.user.id]);
        if (user.role === 'admin' && caller.role !== 'admin') {
            return res.status(403).json({ error: 'Only administrators can delete admin accounts' });
        }

        // Clean up associated data
        await dbRun('DELETE FROM user_server_permissions WHERE user_id = ?', [userId]);
        await dbRun('DELETE FROM user_server_ranks WHERE user_id = ?', [userId]);
        await dbRun('DELETE FROM users WHERE id = ?', [userId]);

        res.json({ message: 'User deleted successfully' });
    } catch (err) {
        console.error(`[userRoutes] Delete user error (Target: ${userId}, Caller: ${req.user.id}):`, err);
        res.status(500).json({ error: 'Failed to delete user' });
    }
});

// Admin/Manager: Create a new user directly
router.post('/create', authenticateToken, checkGlobalPermission('account.manage'), async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password required' });
    }

    if (username.length < 3 || username.length > 32) {
        return res.status(400).json({ error: 'Username must be 3-32 characters' });
    }

    if (password.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    try {
        // Check if username is taken
        const existingUser = await dbGet('SELECT * FROM users WHERE username = ?', [username]);
        if (existingUser) {
            return res.status(409).json({ error: 'Username taken' });
        }

        const hashed = await hashPassword(password);
        await dbRun('INSERT INTO users (username, password, role) VALUES (?, ?, ?)', [username, hashed, 'user']);
        
        res.json({ message: 'User created successfully' });
    } catch (e) {
        console.error(`[userRoutes] Direct create user error (Caller: ${req.user.id}, Username: ${username}):`, e);
        res.status(500).json({ error: 'Failed to create user' });
    }
});

module.exports = router;
