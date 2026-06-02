const express = require('express');
const { db, dbRun, dbGet, dbAll } = require('../db/database');
const { authenticateToken, hashPassword } = require('../core/auth');
const { checkGlobalPermission, getEffectivePermissions, AVAILABLE_PERMISSIONS, hasPermission } = require('../core/permissions');
const { E, sendError } = require('../core/errors');
const { validate } = require('../middleware/validation');
const logger = require('../core/utils/logger');
const { validatePasswordStrength } = require('../core/utils/passwordValidator');
const V = require('../middleware/validators');

function preventSelfDeletion(req, res, next) {
    if (req.user && Number(req.user.id) === Number(req.params.userId)) {
        return sendError(res, E.USER_SELF_DELETE, 403);
    }
    next();
}

const router = express.Router();

router.get('/permissions', authenticateToken, (req, res) => {
    res.json(AVAILABLE_PERMISSIONS);
});

async function hasGlobalPermission(userId, permission) {
    return hasPermission(userId, null, permission);
}

router.get('/', authenticateToken, async (req, res) => {
    try {
        const isManager = await hasGlobalPermission(req.user.id, 'account.manage');
        let users;
        if (isManager) {
            users = await dbAll(`SELECT u.id, u.username, u.role, u.disabled, u.created_at, u.rank_id, r.name as rank_name, r.color as rank_color FROM users u LEFT JOIN ranks r ON u.rank_id = r.id`);
        } else {
            users = await dbAll(`SELECT u.id, u.username, u.role, u.disabled, u.created_at, u.rank_id, r.name as rank_name, r.color as rank_color FROM users u LEFT JOIN ranks r ON u.rank_id = r.id WHERE u.id = ?`, [req.user.id]);
        }
        res.json({ users, isCallerManager: isManager });
    } catch (e) {
        logger.error(`[userRoutes] List users error (User: ${req.user.id}):`, e);
        return sendError(res, E.INTERNAL_ERROR, 500);
    }
});

router.get('/me/accent', authenticateToken, async (req, res) => {
    try {
        const key = `accentColor:${req.user.id}`;
        const row = await dbGet('SELECT value FROM settings WHERE key = ?', [key]);
        res.json({ accent: row ? row.value : null });
    } catch (e) {
        logger.error('[userRoutes] Get accent error:', e);
        return sendError(res, E.INTERNAL_ERROR, 500);
    }
});

router.post('/me/accent', authenticateToken, validate(V.accentColor), async (req, res) => {
    const { accent } = req.body;
    try {
        const key = `accentColor:${req.user.id}`;
        await dbRun('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', [key, accent]);
        res.json({ message: 'Accent saved' });
    } catch (e) {
        logger.error('[userRoutes] Save accent error:', e);
        return sendError(res, E.INTERNAL_ERROR, 500);
    }
});

// Custom accent colors - list
router.get('/me/custom-accents', authenticateToken, async (req, res) => {
    try {
        const rows = await dbAll('SELECT id, label, value FROM user_custom_accents WHERE user_id = ? ORDER BY created_at ASC', [req.user.id]);
        res.json({ colors: rows });
    } catch (e) {
        logger.error('[userRoutes] Get custom accents error:', e);
        return sendError(res, E.INTERNAL_ERROR, 500);
    }
});

// Custom accent colors - create (max 5)
router.post('/me/custom-accents', authenticateToken, validate(V.customAccentCreate), async (req, res) => {
    const { label, value } = req.body;
    try {
        const existing = await dbAll('SELECT id FROM user_custom_accents WHERE user_id = ?', [req.user.id]);
        if (existing.length >= 5) return sendError(res, E.BAD_REQUEST, 400, 'Maximum 5 custom colors allowed');
        const result = await dbRun('INSERT INTO user_custom_accents (user_id, label, value) VALUES (?, ?, ?)', [req.user.id, label.trim(), value]);
        res.json({ id: result.lastID, label: label.trim(), value });
    } catch (e) {
        logger.error('[userRoutes] Create custom accent error:', e);
        return sendError(res, E.INTERNAL_ERROR, 500);
    }
});

// Custom accent colors - delete
router.delete('/me/custom-accents/:colorId', authenticateToken, async (req, res) => {
    const { colorId } = req.params;
    try {
        const row = await dbGet('SELECT id FROM user_custom_accents WHERE id = ? AND user_id = ?', [colorId, req.user.id]);
        if (!row) return sendError(res, E.BAD_REQUEST, 404, 'Color not found');
        await dbRun('DELETE FROM user_custom_accents WHERE id = ?', [colorId]);
        res.json({ message: 'Color deleted' });
    } catch (e) {
        logger.error('[userRoutes] Delete custom accent error:', e);
        return sendError(res, E.INTERNAL_ERROR, 500);
    }
});

router.get('/:userId/permissions', authenticateToken, checkGlobalPermission('account.manage'), async (req, res) => {
    const { userId } = req.params;
    try {
        const user = await dbGet('SELECT rank_id, global_permissions FROM users WHERE id = ?', [userId]);
        if (!user) return sendError(res, E.USER_NOT_FOUND, 404);
        const globalPerms = JSON.parse(user.global_permissions || '[]');
        const serverPermsRows = await dbAll('SELECT server_id, permission FROM user_server_permissions WHERE user_id = ?', [userId]);
        const serversPerms = {};
        serverPermsRows.forEach(row => {
            if (!serversPerms[row.server_id]) serversPerms[row.server_id] = [];
            serversPerms[row.server_id].push(row.permission);
        });
        let rankData = null;
        if (user.rank_id) {
            const rank = await dbGet('SELECT id, name, color, permissions, global_permissions FROM ranks WHERE id = ?', [user.rank_id]);
            if (rank) {
                rankData = {
                    id: rank.id, name: rank.name, color: rank.color,
                    global: JSON.parse(rank.global_permissions || '[]'),
                    servers: JSON.parse(rank.permissions || '{}')
                };
            }
        }
        res.json({ global: globalPerms, servers: serversPerms, rank: rankData });
    } catch (e) {
        logger.error(`[userRoutes] Get user permissions error (Target: ${userId}, Caller: ${req.user.id}):`, e);
        return sendError(res, E.INTERNAL_ERROR, 500);
    }
});

router.put('/:userId/permissions', authenticateToken, checkGlobalPermission('account.manage'), validate(V.userPermissions), async (req, res) => {
    const { userId } = req.params;
    const { global, servers } = req.body;
    try {
        const user = await dbGet('SELECT id FROM users WHERE id = ?', [userId]);
        if (!user) return sendError(res, E.USER_NOT_FOUND, 404);
        await dbRun('UPDATE users SET global_permissions = ? WHERE id = ?', [JSON.stringify(global), userId]);
        await dbRun('DELETE FROM user_server_permissions WHERE user_id = ?', [userId]);
        for (const [serverId, perms] of Object.entries(servers)) {
            if (Array.isArray(perms)) {
                for (const perm of perms) {
                    await dbRun('INSERT INTO user_server_permissions (user_id, server_id, permission) VALUES (?, ?, ?)', [userId, serverId, perm]);
                }
            }
        }
        res.json({ message: 'Permissions saved' });
    } catch (e) {
        logger.error(`[userRoutes] Save user permissions error (Target: ${userId}, Caller: ${req.user.id}):`, e);
        return sendError(res, E.INTERNAL_ERROR, 500);
    }
});

router.put('/:userId/rank', authenticateToken, checkGlobalPermission('account.manage'), validate(V.setUserRank), async (req, res) => {
    const { userId } = req.params;
    const { rankId } = req.body;
    try {
        const user = await dbGet('SELECT id FROM users WHERE id = ?', [userId]);
        if (!user) return sendError(res, E.USER_NOT_FOUND, 404);
        if (rankId !== null) {
            const rank = await dbGet('SELECT id FROM ranks WHERE id = ?', [rankId]);
            if (!rank) return sendError(res, E.RANK_NOT_FOUND, 404);
        }
        await dbRun('UPDATE users SET rank_id = ? WHERE id = ?', [rankId, userId]);
        res.json({ message: 'Rank updated' });
    } catch (e) {
        logger.error(`[userRoutes] Update user rank error (Target: ${userId}, Caller: ${req.user.id}):`, e);
        return sendError(res, E.INTERNAL_ERROR, 500);
    }
});

router.post('/change-name', authenticateToken, validate(V.changeName), async (req, res) => {
    const { currentName, newName, confirmNewName } = req.body;
    if (!currentName || !newName || !confirmNewName) return sendError(res, E.BAD_REQUEST, 400, 'All fields are required');
    if (currentName !== req.user.username) return sendError(res, E.BAD_REQUEST, 400, 'Current name does not match logged-in user');
    if (newName !== confirmNewName) return sendError(res, E.BAD_REQUEST, 400, 'New name and confirm name do not match');
    if (newName.length < 3) return sendError(res, E.USER_USERNAME_TOO_SHORT, 400);
    if (newName.length > 32) return sendError(res, E.USER_USERNAME_TOO_LONG, 400);
    try {
        await dbRun('UPDATE users SET username = ? WHERE id = ?', [newName, req.user.id]);
        res.json({ message: 'Username changed successfully' });
    } catch (e) {
        if (e.message && e.message.includes('UNIQUE')) return sendError(res, E.USER_ALREADY_EXISTS, 409);
        logger.error(`[userRoutes] Change username error (User: ${req.user.id}):`, e);
        return sendError(res, E.INTERNAL_ERROR, 500);
    }
});

router.post('/change-password', authenticateToken, validate(V.changePassword), async (req, res) => {
    const { oldPassword, newPassword, newPasswordConfirm } = req.body;
    if (!oldPassword || !newPassword || !newPasswordConfirm) return sendError(res, E.BAD_REQUEST, 400, 'All fields are required');
    if (newPassword !== newPasswordConfirm) return sendError(res, E.BAD_REQUEST, 400, 'New passwords do not match');

    // Validate password strength
    const passwordValidation = validatePasswordStrength(newPassword);
    if (!passwordValidation.valid) {
        return sendError(res, E.BAD_REQUEST, 400, passwordValidation.error);
    }

    try {
        const { comparePassword } = require('../core/auth');
        const user = await dbGet('SELECT password FROM users WHERE id = ?', [req.user.id]);
        if (!user) return sendError(res, E.USER_NOT_FOUND, 404);
        const match = await comparePassword(oldPassword, user.password);
        if (!match) return sendError(res, E.USER_PASSWORD_INCORRECT, 400);
        const hashed = await hashPassword(newPassword);
        await dbRun('UPDATE users SET password = ? WHERE id = ?', [hashed, req.user.id]);
        res.json({ message: 'Password changed successfully' });
    } catch (e) {
        logger.error(`[userRoutes] Change password error (User: ${req.user.id}):`, e);
        return sendError(res, E.INTERNAL_ERROR, 500);
    }
});

router.post('/:userId/change-name', authenticateToken, checkGlobalPermission('account.manage'), validate(V.adminChangeName), async (req, res) => {
    const { userId } = req.params;
    const { newName, confirmNewName } = req.body;
    if (!newName || !confirmNewName) return sendError(res, E.BAD_REQUEST, 400, 'All fields are required');
    if (newName !== confirmNewName) return sendError(res, E.BAD_REQUEST, 400, 'Names do not match');
    if (newName.length < 3) return sendError(res, E.USER_USERNAME_TOO_SHORT, 400);
    if (newName.length > 32) return sendError(res, E.USER_USERNAME_TOO_LONG, 400);
    try {
        const user = await dbGet('SELECT role FROM users WHERE id = ?', [userId]);
        if (!user) return sendError(res, E.USER_NOT_FOUND, 404);
        const caller = await dbGet('SELECT role FROM users WHERE id = ?', [req.user.id]);
        if (user.role === 'admin' && caller.role !== 'admin') return sendError(res, E.FORBIDDEN_ADMIN_ONLY, 403);
        await dbRun('UPDATE users SET username = ? WHERE id = ?', [newName, userId]);
        res.json({ message: 'Username updated successfully' });
    } catch (e) {
        if (e.message && e.message.includes('UNIQUE')) return sendError(res, E.USER_ALREADY_EXISTS, 409);
        logger.error(`[userRoutes] Change user name error (Target: ${userId}, Caller: ${req.user.id}):`, e);
        return sendError(res, E.INTERNAL_ERROR, 500);
    }
});

router.post('/:userId/reset-password', authenticateToken, checkGlobalPermission('account.manage'), validate(V.resetPassword), async (req, res) => {
    const { userId } = req.params;
    const { newPassword, confirmPassword } = req.body;
    if (!newPassword || !confirmPassword) return sendError(res, E.BAD_REQUEST, 400, 'All fields are required');
    if (newPassword !== confirmPassword) return sendError(res, E.BAD_REQUEST, 400, 'Passwords do not match');

    // Validate password strength
    const passwordValidation = validatePasswordStrength(newPassword);
    if (!passwordValidation.valid) {
        return sendError(res, E.BAD_REQUEST, 400, passwordValidation.error);
    }

    try {
        const user = await dbGet('SELECT role FROM users WHERE id = ?', [userId]);
        if (!user) return sendError(res, E.USER_NOT_FOUND, 404);
        const caller = await dbGet('SELECT role FROM users WHERE id = ?', [req.user.id]);
        if (user.role === 'admin' && caller.role !== 'admin') return sendError(res, E.FORBIDDEN_ADMIN_ONLY, 403);
        const hashed = await hashPassword(newPassword);
        await dbRun('UPDATE users SET password = ? WHERE id = ?', [hashed, userId]);
        res.json({ message: 'Password reset successfully' });
    } catch (e) {
        logger.error(`[userRoutes] Reset password error (Target: ${userId}, Caller: ${req.user.id}):`, e);
        return sendError(res, E.INTERNAL_ERROR, 500);
    }
});

router.patch('/:userId/toggle-disabled', authenticateToken, checkGlobalPermission('account.manage'), async (req, res) => {
    const { userId } = req.params;
    if (Number(userId) === Number(req.user.id)) return sendError(res, E.USER_SELF_DISABLE, 400);
    try {
        const user = await dbGet('SELECT * FROM users WHERE id = ?', [userId]);
        if (!user) return sendError(res, E.USER_NOT_FOUND, 404);
        const caller = await dbGet('SELECT role FROM users WHERE id = ?', [req.user.id]);
        if (user.role === 'admin' && caller.role !== 'admin') return sendError(res, E.FORBIDDEN_ADMIN_ONLY, 403);
        const nextDisabled = user.disabled ? 0 : 1;
        await dbRun('UPDATE users SET disabled = ? WHERE id = ?', [nextDisabled, userId]);
        res.json({ message: nextDisabled ? 'User account disabled' : 'User account enabled', disabled: nextDisabled });
    } catch (err) {
        logger.error(`[userRoutes] Toggle disabled error (Target: ${userId}, Caller: ${req.user.id}):`, err);
        return sendError(res, E.INTERNAL_ERROR, 500);
    }
});

router.post('/generate-token', authenticateToken, checkGlobalPermission('account.manage'), validate(V.generateToken), async (req, res) => {
    const { permissions, ranks } = req.body;
    if (!Array.isArray(permissions) || !Array.isArray(ranks)) {
        return sendError(res, E.VALIDATION_ERROR, 400, 'Permissions and ranks must be arrays');
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
        logger.error(`[userRoutes] Generate invite token error (Caller: ${req.user.id}):`, err);
        return sendError(res, E.INTERNAL_ERROR, 500);
    }
});

router.delete('/tokens/clear-all', authenticateToken, checkGlobalPermission('account.manage'), async (req, res) => {
    try {
        await dbRun('DELETE FROM account_creation_tokens');
        res.json({ message: 'All invite tokens cleared' });
    } catch (err) {
        logger.error(`[userRoutes] Clear invite tokens error (Caller: ${req.user.id}):`, err);
        return sendError(res, E.INTERNAL_ERROR, 500);
    }
});

router.post('/:userId/delete', authenticateToken, preventSelfDeletion, checkGlobalPermission('account.manage'), async (req, res) => {
    const { userId } = req.params;
    try {
        const user = await dbGet('SELECT role FROM users WHERE id = ?', [userId]);
        if (!user) return sendError(res, E.USER_NOT_FOUND, 404);
        const caller = await dbGet('SELECT role FROM users WHERE id = ?', [req.user.id]);
        if (user.role === 'admin' && caller.role !== 'admin') return sendError(res, E.FORBIDDEN_ADMIN_ONLY, 403);
        await dbRun('DELETE FROM user_server_permissions WHERE user_id = ?', [userId]);
        await dbRun('DELETE FROM user_server_ranks WHERE user_id = ?', [userId]);
        await dbRun('DELETE FROM users WHERE id = ?', [userId]);
        res.json({ message: 'User deleted successfully' });
    } catch (err) {
        logger.error(`[userRoutes] Delete user error (Target: ${userId}, Caller: ${req.user.id}):`, err);
        return sendError(res, E.INTERNAL_ERROR, 500);
    }
});

router.post('/create', authenticateToken, checkGlobalPermission('account.manage'), validate(V.createUser), async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return sendError(res, E.BAD_REQUEST, 400, 'Username and password required');
    if (username.length < 3) return sendError(res, E.USER_USERNAME_TOO_SHORT, 400);
    if (username.length > 32) return sendError(res, E.USER_USERNAME_TOO_LONG, 400);
    if (password.length < 8) return sendError(res, E.USER_PASSWORD_TOO_SHORT, 400);
    try {
        const existingUser = await dbGet('SELECT * FROM users WHERE LOWER(username) = LOWER(?)', [username]);
        if (existingUser) return sendError(res, E.USER_ALREADY_EXISTS, 409);
        const hashed = await hashPassword(password);
        await dbRun('INSERT INTO users (username, password, role) VALUES (?, ?, ?)', [username, hashed, 'user']);
        res.json({ message: 'User created successfully' });
    } catch (e) {
        logger.error(`[userRoutes] Direct create user error (Caller: ${req.user.id}, Username: ${username}):`, e);
        return sendError(res, E.INTERNAL_ERROR, 500);
    }
});

// ── Change own password ───────────────────────────────────────────────────────

router.post('/me/password', authenticateToken, async (req, res) => {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
        return sendError(res, E.BAD_REQUEST, 400, 'currentPassword and newPassword are required');
    }

    const pwCheck = validatePasswordStrength(newPassword);
    if (!pwCheck.valid) return sendError(res, E.BAD_REQUEST, 400, pwCheck.error);

    try {
        const { comparePassword } = require('../core/auth');
        const user = await dbGet('SELECT password FROM users WHERE id = ?', [req.user.id]);
        if (!user) return sendError(res, E.USER_NOT_FOUND, 404);

        const match = await comparePassword(currentPassword, user.password);
        if (!match) return sendError(res, E.AUTH_INVALID_CREDENTIALS, 401, 'Current password is incorrect');

        const hashed = await hashPassword(newPassword);
        const now = Math.floor(Date.now() / 1000);
        await dbRun('UPDATE users SET password = ?, valid_tokens_from = ? WHERE id = ?', [hashed, now, req.user.id]);
        res.json({ success: true, message: 'Password updated. Please log in again.' });
    } catch (err) {
        logger.error(`[userRoutes] Change password error (User: ${req.user.id}):`, err);
        return sendError(res, E.INTERNAL_ERROR, 500);
    }
});

module.exports = router;
