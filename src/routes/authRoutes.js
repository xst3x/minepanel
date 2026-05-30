const express = require('express');
const { db, dbGet, dbRun, dbAll } = require('../db/database');
const { hashPassword, comparePassword, generateToken } = require('../core/auth');
const { E, sendError } = require('../core/errors');
const { validate } = require('../middleware/validation');
const V = require('../middleware/validators');
const rateLimit = require('express-rate-limit');
const fs = require('fs');
const path = require('path');

let _settingsCache = null;
let _settingsCacheTime = 0;

const getSettings = () => {
    const now = Date.now();
    if (_settingsCache && (now - _settingsCacheTime < 30000)) return _settingsCache;
    try {
        if (fs.existsSync(path.resolve(__dirname, '../../settings.json'))) {
            _settingsCache = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../settings.json'), 'utf8'));
            _settingsCacheTime = now;
            return _settingsCache;
        }
    } catch (_) {}
    _settingsCache = {};
    _settingsCacheTime = now;
    return _settingsCache;
};

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: () => getSettings().maxAttempts || 5,
    message: { error: 'Too many login attempts. Please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
});

const router = express.Router();

router.get('/settings', async (req, res) => {
    try {
        const settings = getSettings();
        const requireInviteToken = settings.requireInviteTokenToCreateAccount !== undefined
            ? settings.requireInviteTokenToCreateAccount : true;
        res.json({ requireInviteToken });
    } catch (err) {
        return sendError(res, E.INTERNAL_ERROR, 500);
    }
});

router.post('/login', loginLimiter, validate(V.login), async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return sendError(res, E.AUTH_INVALID_CREDENTIALS, 400);
    try {
        const user = await dbGet('SELECT * FROM users WHERE LOWER(username) = LOWER(?)', [username]);
        if (!user) return sendError(res, E.AUTH_INVALID_CREDENTIALS, 401);
        const match = await comparePassword(password, user.password);
        if (!match) return sendError(res, E.AUTH_INVALID_CREDENTIALS, 401);
        if (user.disabled) return sendError(res, E.AUTH_ACCOUNT_DISABLED, 403);
        const token = generateToken(user);
        res.json({ token, userId: user.id, username: user.username, role: user.role });
    } catch (err) {
        console.error('[authRoutes] Login error:', err);
        return sendError(res, E.INTERNAL_ERROR, 500);
    }
});

router.post('/register', validate(V.register), async (req, res) => {
    const { username, password, confirmPassword, token } = req.body;
    if (!username || !password || !confirmPassword) {
        return sendError(res, E.BAD_REQUEST, 400, 'Username, password, and confirm password are required');
    }
    if (username.length < 3) return sendError(res, E.USER_USERNAME_TOO_SHORT, 400);
    if (username.length > 32) return sendError(res, E.USER_USERNAME_TOO_LONG, 400);
    if (password.length < 8) return sendError(res, E.USER_PASSWORD_TOO_SHORT, 400);
    if (password !== confirmPassword) return sendError(res, E.BAD_REQUEST, 400, "Passwords don't match");

    try {
        const settings = getSettings();
        const requireInviteToken = settings.requireInviteTokenToCreateAccount !== undefined
            ? settings.requireInviteTokenToCreateAccount : true;

        let dbToken = null;
        let permissions = [];
        let ranks = [];
        let userRank = 'user';
        let rankId = null;

        if (requireInviteToken) {
            if (!token) return sendError(res, E.AUTH_INVITE_TOKEN_REQUIRED, 400);
            dbToken = await dbGet('SELECT * FROM account_creation_tokens WHERE token = ?', [token]);
            if (!dbToken) return sendError(res, E.AUTH_INVITE_TOKEN_INVALID, 400);
            if (dbToken.used) return sendError(res, E.AUTH_INVITE_TOKEN_USED, 400);
            if (new Date(dbToken.expires_at).getTime() < Date.now()) return sendError(res, E.AUTH_INVITE_TOKEN_EXPIRED, 400);

            permissions = JSON.parse(dbToken.permissions || '[]');
            ranks = JSON.parse(dbToken.ranks || '[]');
            if (ranks.length > 0) {
                rankId = Number(ranks[0]);
                const rankObj = await dbGet('SELECT name FROM ranks WHERE id = ?', [rankId]);
                if (rankObj && rankObj.name) userRank = rankObj.name;
            }
        } else {
            // Token not required — still allow optional token use
            if (token) {
                dbToken = await dbGet('SELECT * FROM account_creation_tokens WHERE token = ?', [token]);
                if (dbToken && !dbToken.used && new Date(dbToken.expires_at).getTime() >= Date.now()) {
                    permissions = JSON.parse(dbToken.permissions || '[]');
                    ranks = JSON.parse(dbToken.ranks || '[]');
                    if (ranks.length > 0) {
                        rankId = Number(ranks[0]);
                        const rankObj = await dbGet('SELECT name FROM ranks WHERE id = ?', [rankId]);
                        if (rankObj && rankObj.name) userRank = rankObj.name;
                    }
                } else {
                    dbToken = null; // invalid/used token — ignore silently
                }
            }
            // If no valid token used, apply default rank from settings
            if (!dbToken) {
                const defaultRankId = settings.defaultRankId || null;
                if (defaultRankId) {
                    const rankObj = await dbGet('SELECT id, name FROM ranks WHERE id = ?', [defaultRankId]);
                    if (rankObj) {
                        rankId = rankObj.id;
                        userRank = rankObj.name;
                    }
                }
            }
        }

        const existingUser = await dbGet('SELECT * FROM users WHERE LOWER(username) = LOWER(?)', [username]);
        if (existingUser) return sendError(res, E.USER_ALREADY_EXISTS, 409);

        const hashed = await hashPassword(password);
        const result = await dbRun(
            'INSERT INTO users (username, password, role, rank_id) VALUES (?, ?, ?, ?)',
            [username, hashed, userRank, rankId]
        );
        const newUserId = result.lastID;

        if (requireInviteToken && dbToken) {
            await dbRun('UPDATE account_creation_tokens SET used = 1 WHERE id = ?', [dbToken.id]);
            await dbRun('DELETE FROM account_creation_tokens WHERE id = ?', [dbToken.id]);
        }

        const servers = await dbAll('SELECT id FROM servers');
        for (const sv of servers) {
            for (const perm of permissions) {
                await dbRun('INSERT OR IGNORE INTO user_server_permissions (user_id, server_id, permission) VALUES (?, ?, ?)', [newUserId, sv.id, perm]);
            }
            for (const rId of ranks) {
                await dbRun('INSERT OR IGNORE INTO user_server_ranks (user_id, server_id, rank_id) VALUES (?, ?, ?)', [newUserId, sv.id, rId]);
            }
        }

        res.json({ message: 'Account created successfully' });
    } catch (err) {
        console.error('[authRoutes] Register error:', err);
        return sendError(res, E.INTERNAL_ERROR, 500);
    }
});

router.post('/logout', (req, res) => {
    res.json({ success: true, message: 'Logged out successfully' });
});

module.exports = router;
