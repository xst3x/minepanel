const express = require('express');
const { User, Rank, Setting, UserCustomAccent, UserServerPermission, UserServerRank, AccountCreationToken } = require('../db/database');
const { authenticateToken, hashPassword } = require('../core/auth');
const { checkGlobalPermission, getEffectivePermissions, AVAILABLE_PERMISSIONS, hasPermission } = require('../core/permissions');
const { E, sendError } = require('../core/errors');
const { validate } = require('../middleware/validation');
const logger = require('../core/utils/logger');
const { validatePasswordStrength } = require('../core/utils/passwordValidator');
const V = require('../middleware/validators');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { Op } = require('sequelize');

// ── Avatar upload config ──────────────────────────────────────────────────────
const AVATARS_DIR = path.resolve(__dirname, '../../data/avatars');
if (!fs.existsSync(AVATARS_DIR)) fs.mkdirSync(AVATARS_DIR, { recursive: true });

const avatarStorage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, AVATARS_DIR),
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
        cb(null, `avatar_${req.user.id}${ext}`);
    },
});
const avatarUpload = multer({
    storage: avatarStorage,
    limits: { fileSize: 2 * 1024 * 1024 }, // 2 MB max
    fileFilter: (req, file, cb) => {
        if (/^image\/(jpeg|png|gif|webp)$/.test(file.mimetype)) cb(null, true);
        else cb(new Error('Only image files are allowed (jpg, png, gif, webp)'));
    },
});

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
        const whereClause = isManager ? {} : { id: req.user.id };
        const users = await User.findAll({
            where: whereClause,
            attributes: ['id', 'username', 'role', 'disabled', 'created_at', 'rank_id'],
            include: [{
                model: Rank,
                as: 'rank',
                attributes: ['name', 'color'],
                required: false
            }]
        });
        const formatted = users.map(u => ({
            id: u.id,
            username: u.username,
            role: u.role,
            disabled: u.disabled,
            created_at: u.created_at,
            rank_id: u.rank_id,
            rank_name: u.rank?.name || null,
            rank_color: u.rank?.color || null
        }));
        res.json({ users: formatted, isCallerManager: isManager });
    } catch (e) {
        logger.error(`[userRoutes] List users error (User: ${req.user.id}):`, e);
        return sendError(res, E.INTERNAL_ERROR, 500);
    }
});

router.get('/me/accent', authenticateToken, async (req, res) => {
    try {
        const key = `accentColor:${req.user.id}`;
        const row = await Setting.findByPk(key);
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
        await Setting.upsert({ key, value: accent });
        res.json({ message: 'Accent saved' });
    } catch (e) {
        logger.error('[userRoutes] Save accent error:', e);
        return sendError(res, E.INTERNAL_ERROR, 500);
    }
});

// Custom accent colors - list
router.get('/me/custom-accents', authenticateToken, async (req, res) => {
    try {
        const rows = await UserCustomAccent.findAll({
            where: { user_id: req.user.id },
            attributes: ['id', 'label', 'value'],
            order: [['created_at', 'ASC']]
        });
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
        const count = await UserCustomAccent.count({ where: { user_id: req.user.id } });
        if (count >= 5) return sendError(res, E.BAD_REQUEST, 400, 'Maximum 5 custom colors allowed');
        const accent = await UserCustomAccent.create({ user_id: req.user.id, label: label.trim(), value });
        res.json({ id: accent.id, label: label.trim(), value });
    } catch (e) {
        logger.error('[userRoutes] Create custom accent error:', e);
        return sendError(res, E.INTERNAL_ERROR, 500);
    }
});

// Custom accent colors - delete
router.delete('/me/custom-accents/:colorId', authenticateToken, async (req, res) => {
    const { colorId } = req.params;
    try {
        const row = await UserCustomAccent.findOne({
            where: { id: colorId, user_id: req.user.id }
        });
        if (!row) return sendError(res, E.BAD_REQUEST, 404, 'Color not found');
        await row.destroy();
        res.json({ message: 'Color deleted' });
    } catch (e) {
        logger.error('[userRoutes] Delete custom accent error:', e);
        return sendError(res, E.INTERNAL_ERROR, 500);
    }
});

router.get('/:userId/permissions', authenticateToken, checkGlobalPermission('account.manage'), async (req, res) => {
    const { userId } = req.params;
    try {
        const user = await User.findByPk(userId, {
            attributes: ['rank_id', 'global_permissions']
        });
        if (!user) return sendError(res, E.USER_NOT_FOUND, 404);
        const globalPerms = JSON.parse(user.global_permissions || '[]');
        const serverPermsRows = await UserServerPermission.findAll({
            where: { user_id: userId },
            attributes: ['server_id', 'permission']
        });
        const serversPerms = {};
        serverPermsRows.forEach(row => {
            if (!serversPerms[row.server_id]) serversPerms[row.server_id] = [];
            serversPerms[row.server_id].push(row.permission);
        });
        let rankData = null;
        if (user.rank_id) {
            const rank = await Rank.findByPk(user.rank_id, {
                attributes: ['id', 'name', 'color', 'permissions', 'global_permissions']
            });
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
        const user = await User.findByPk(userId, { attributes: ['id'] });
        if (!user) return sendError(res, E.USER_NOT_FOUND, 404);
        await User.update(
            { global_permissions: JSON.stringify(global) },
            { where: { id: userId } }
        );
        await UserServerPermission.destroy({ where: { user_id: userId } });
        for (const [serverId, perms] of Object.entries(servers)) {
            if (Array.isArray(perms)) {
                for (const perm of perms) {
                    await UserServerPermission.create({ user_id: userId, server_id: serverId, permission: perm });
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
        const user = await User.findByPk(userId, { attributes: ['id'] });
        if (!user) return sendError(res, E.USER_NOT_FOUND, 404);
        if (rankId !== null) {
            const rank = await Rank.findByPk(rankId, { attributes: ['id'] });
            if (!rank) return sendError(res, E.RANK_NOT_FOUND, 404);
        }
        await User.update({ rank_id: rankId }, { where: { id: userId } });
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
        await User.update({ username: newName }, { where: { id: req.user.id } });
        res.json({ message: 'Username changed successfully' });
    } catch (e) {
        if (e.name === 'SequelizeUniqueConstraintError') return sendError(res, E.USER_ALREADY_EXISTS, 409);
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
        const user = await User.findByPk(req.user.id, { attributes: ['password'] });
        if (!user) return sendError(res, E.USER_NOT_FOUND, 404);
        const match = await comparePassword(oldPassword, user.password);
        if (!match) return sendError(res, E.USER_PASSWORD_INCORRECT, 400);
        const hashed = await hashPassword(newPassword);
        await User.update({ password: hashed }, { where: { id: req.user.id } });
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
        const user = await User.findByPk(userId, { attributes: ['role'] });
        if (!user) return sendError(res, E.USER_NOT_FOUND, 404);
        const caller = await User.findByPk(req.user.id, { attributes: ['role'] });
        if (user.role === 'admin' && caller.role !== 'admin') return sendError(res, E.FORBIDDEN_ADMIN_ONLY, 403);
        await User.update({ username: newName }, { where: { id: userId } });
        res.json({ message: 'Username updated successfully' });
    } catch (e) {
        if (e.name === 'SequelizeUniqueConstraintError') return sendError(res, E.USER_ALREADY_EXISTS, 409);
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
        const user = await User.findByPk(userId, { attributes: ['role'] });
        if (!user) return sendError(res, E.USER_NOT_FOUND, 404);
        const caller = await User.findByPk(req.user.id, { attributes: ['role'] });
        if (user.role === 'admin' && caller.role !== 'admin') return sendError(res, E.FORBIDDEN_ADMIN_ONLY, 403);
        const hashed = await hashPassword(newPassword);
        const now = Math.floor(Date.now() / 1000);
        await User.update(
            { password: hashed, valid_tokens_from: now },
            { where: { id: userId } }
        );
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
        const user = await User.findByPk(userId);
        if (!user) return sendError(res, E.USER_NOT_FOUND, 404);
        const caller = await User.findByPk(req.user.id, { attributes: ['role'] });
        if (user.role === 'admin' && caller.role !== 'admin') return sendError(res, E.FORBIDDEN_ADMIN_ONLY, 403);
        const nextDisabled = user.disabled ? 0 : 1;
        await User.update({ disabled: nextDisabled }, { where: { id: userId } });
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
        await AccountCreationToken.create({
            token,
            created_by: req.user.id,
            expires_at: expiresAt,
            permissions: JSON.stringify(permissions),
            ranks: JSON.stringify(ranks)
        });
        res.json({ token });
    } catch (err) {
        logger.error(`[userRoutes] Generate invite token error (Caller: ${req.user.id}):`, err);
        return sendError(res, E.INTERNAL_ERROR, 500);
    }
});

router.delete('/tokens/clear-all', authenticateToken, checkGlobalPermission('account.manage'), async (req, res) => {
    try {
        await AccountCreationToken.destroy({ where: {} });
        res.json({ message: 'All invite tokens cleared' });
    } catch (err) {
        logger.error(`[userRoutes] Clear invite tokens error (Caller: ${req.user.id}):`, err);
        return sendError(res, E.INTERNAL_ERROR, 500);
    }
});

router.post('/:userId/delete', authenticateToken, preventSelfDeletion, checkGlobalPermission('account.manage'), async (req, res) => {
    const { userId } = req.params;
    try {
        const user = await User.findByPk(userId, { attributes: ['role'] });
        if (!user) return sendError(res, E.USER_NOT_FOUND, 404);
        const caller = await User.findByPk(req.user.id, { attributes: ['role'] });
        if (user.role === 'admin' && caller.role !== 'admin') return sendError(res, E.FORBIDDEN_ADMIN_ONLY, 403);
        await UserServerPermission.destroy({ where: { user_id: userId } });
        await UserServerRank.destroy({ where: { user_id: userId } });
        await User.destroy({ where: { id: userId } });
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
        const existingUser = await User.findOne({
            where: { username: { [Op.eq]: username } }
        });
        if (existingUser) return sendError(res, E.USER_ALREADY_EXISTS, 409);
        const hashed = await hashPassword(password);
        await User.create({ username, password: hashed, role: 'user' });
        res.json({ message: 'User created successfully' });
    } catch (e) {
        logger.error(`[userRoutes] Direct create user error (Caller: ${req.user.id}, Username: ${username}):`, e);
        return sendError(res, E.INTERNAL_ERROR, 500);
    }
});

// ── Get own profile (username + avatar) ──────────────────────────────────────

router.get('/me', authenticateToken, async (req, res) => {
    try {
        const user = await User.findByPk(req.user.id, {
            attributes: ['id', 'username', 'role', 'avatar_url']
        });
        if (!user) return sendError(res, E.USER_NOT_FOUND, 404);
        const globalPerms = await getEffectivePermissions(req.user.id, null);
        res.json({
            id: user.id,
            username: user.username,
            role: user.role,
            avatarUrl: user.avatar_url || null,
            globalPermissions: globalPerms,
        });
    } catch (err) {
        logger.error(`[userRoutes] GET /me error (User: ${req.user.id}):`, err);
        return sendError(res, E.INTERNAL_ERROR, 500);
    }
});

// ── Upload / update own avatar ────────────────────────────────────────────────

router.post('/me/avatar', authenticateToken, (req, res, next) => {
    avatarUpload.single('avatar')(req, res, (err) => {
        if (err) return sendError(res, E.BAD_REQUEST, 400, err.message);
        next();
    });
}, async (req, res) => {
    if (!req.file) return sendError(res, E.BAD_REQUEST, 400, 'No image file provided');
    try {
        const avatarUrl = `/avatars/${req.file.filename}`;
        await User.update({ avatar_url: avatarUrl }, { where: { id: req.user.id } });
        res.json({ success: true, avatarUrl });
    } catch (err) {
        logger.error(`[userRoutes] Avatar upload error (User: ${req.user.id}):`, err);
        return sendError(res, E.INTERNAL_ERROR, 500);
    }
});

// ── Delete own avatar ─────────────────────────────────────────────────────────

router.delete('/me/avatar', authenticateToken, async (req, res) => {
    try {
        const user = await User.findByPk(req.user.id, { attributes: ['avatar_url'] });
        if (user?.avatar_url) {
            const filePath = path.join(AVATARS_DIR, path.basename(user.avatar_url));
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        }
        await User.update({ avatar_url: null }, { where: { id: req.user.id } });
        res.json({ success: true });
    } catch (err) {
        logger.error(`[userRoutes] Delete avatar error (User: ${req.user.id}):`, err);
        return sendError(res, E.INTERNAL_ERROR, 500);
    }
});

// ── Change own username (from account page) ───────────────────────────────────

router.post('/me/username', authenticateToken, async (req, res) => {
    const { newUsername } = req.body;
    if (!newUsername || typeof newUsername !== 'string') {
        return sendError(res, E.BAD_REQUEST, 400, 'newUsername is required');
    }
    const trimmed = newUsername.trim();
    if (trimmed.length < 3) return sendError(res, E.USER_USERNAME_TOO_SHORT, 400);
    if (trimmed.length > 32) return sendError(res, E.USER_USERNAME_TOO_LONG, 400);
    if (!/^[a-zA-Z0-9_-]+$/.test(trimmed)) {
        return sendError(res, E.BAD_REQUEST, 400, 'Username may only contain letters, numbers, underscores, and hyphens');
    }
    try {
        await User.update({ username: trimmed }, { where: { id: req.user.id } });
        res.json({ success: true, username: trimmed });
    } catch (err) {
        if (err.name === 'SequelizeUniqueConstraintError') return sendError(res, E.USER_ALREADY_EXISTS, 409);
        logger.error(`[userRoutes] Change own username error (User: ${req.user.id}):`, err);
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
        const user = await User.findByPk(req.user.id, { attributes: ['password'] });
        if (!user) return sendError(res, E.USER_NOT_FOUND, 404);

        const match = await comparePassword(currentPassword, user.password);
        if (!match) return sendError(res, E.AUTH_INVALID_CREDENTIALS, 401, 'Current password is incorrect');

        const hashed = await hashPassword(newPassword);
        const now = Math.floor(Date.now() / 1000);
        await User.update(
            { password: hashed, valid_tokens_from: now },
            { where: { id: req.user.id } }
        );
        res.json({ success: true, message: 'Password updated. Please log in again.' });
    } catch (err) {
        logger.error(`[userRoutes] Change password error (User: ${req.user.id}):`, err);
        return sendError(res, E.INTERNAL_ERROR, 500);
    }
});

module.exports = router;
