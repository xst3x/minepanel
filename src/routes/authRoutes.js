const express = require('express');
const { db, dbGet, dbRun, dbAll } = require('../db/database');
const { hashPassword, comparePassword, generateToken, invalidateToken, authenticateToken } = require('../core/auth');
const { E, sendError } = require('../core/errors');
const { validate } = require('../middleware/validation');
const V = require('../middleware/validators');
const rateLimit = require('express-rate-limit');
const { validatePasswordStrength } = require('../core/utils/passwordValidator');
const logger = require('../core/utils/logger');
const audit = require('../core/utils/auditLog');
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

// ── Settings ──────────────────────────────────────────────────────────────────

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

// ── Login ─────────────────────────────────────────────────────────────────────

router.post('/login', loginLimiter, validate(V.login), async (req, res) => {
    const { username, password, totpCode } = req.body;
    if (!username || !password) return sendError(res, E.AUTH_INVALID_CREDENTIALS, 400);
    try {
        const user = await dbGet('SELECT * FROM users WHERE LOWER(username) = LOWER(?)', [username]);
        if (!user) {
            await audit.log(req, 'LOGIN_FAILED', { username });
            return sendError(res, E.AUTH_INVALID_CREDENTIALS, 401);
        }
        const match = await comparePassword(password, user.password);
        if (!match) {
            await audit.log(req, 'LOGIN_FAILED', { username, userId: user.id });
            return sendError(res, E.AUTH_INVALID_CREDENTIALS, 401);
        }
        if (user.disabled) {
            await audit.log(req, 'LOGIN_FAILED', { username, userId: user.id, detail: 'account_disabled' });
            return sendError(res, E.AUTH_ACCOUNT_DISABLED, 403);
        }

        // ── 2FA check ────────────────────────────────────────────────────────
        if (user.totp_enabled && user.totp_secret) {
            if (!totpCode) {
                // Tell frontend that 2FA is required (don't issue token yet)
                return res.status(200).json({ requires2FA: true });
            }
            const { authenticator } = require('otplib');
            const isValid = authenticator.verify({ token: String(totpCode), secret: user.totp_secret });
            if (!isValid) {
                await audit.log(req, 'LOGIN_2FA_FAILED', { userId: user.id, username: user.username });
                return sendError(res, E.AUTH_INVALID_CREDENTIALS, 401);
            }
        }

        const token = generateToken(user);
        await audit.log(req, 'LOGIN_SUCCESS', { userId: user.id, username: user.username });
        res.json({ token, userId: user.id, username: user.username, role: user.role });
    } catch (err) {
        logger.error('[authRoutes] Login error:', err);
        return sendError(res, E.INTERNAL_ERROR, 500);
    }
});

// ── Register ──────────────────────────────────────────────────────────────────

router.post('/register', validate(V.register), async (req, res) => {
    const { username, password, confirmPassword, token } = req.body;
    if (!username || !password || !confirmPassword) {
        return sendError(res, E.BAD_REQUEST, 400, 'Username, password, and confirm password are required');
    }

    const passwordValidation = validatePasswordStrength(password);
    if (!passwordValidation.valid) {
        return sendError(res, E.BAD_REQUEST, 400, passwordValidation.error);
    }

    if (username.length < 3) return sendError(res, E.USER_USERNAME_TOO_SHORT, 400);
    if (username.length > 32) return sendError(res, E.USER_USERNAME_TOO_LONG, 400);
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
                    dbToken = null;
                }
            }
            if (!dbToken) {
                const defaultRankId = settings.defaultRankId || null;
                if (defaultRankId) {
                    const rankObj = await dbGet('SELECT id, name FROM ranks WHERE id = ?', [defaultRankId]);
                    if (rankObj) { rankId = rankObj.id; userRank = rankObj.name; }
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
        await audit.log(req, 'REGISTER_SUCCESS', { userId: newUserId, username });
    } catch (err) {
        logger.error('[authRoutes] Register error:', err);
        return sendError(res, E.INTERNAL_ERROR, 500);
    }
});

// ── Logout ────────────────────────────────────────────────────────────────────

router.post('/logout', authenticateToken, async (req, res) => {
    try {
        await invalidateToken(req.user.id);
        await audit.log(req, 'LOGOUT', { userId: req.user.id }).catch(() => {});
        res.json({ success: true, message: 'Logged out successfully' });
    } catch (err) {
        logger.error('[authRoutes] Logout error:', err);
        return sendError(res, E.INTERNAL_ERROR, 500);
    }
});

// ── 2FA Setup ─────────────────────────────────────────────────────────────────

// GET /api/auth/2fa/setup — generate secret + QR code (user must be logged in)
router.get('/2fa/setup', authenticateToken, async (req, res) => {
    try {
        const { authenticator } = require('otplib');
        const QRCode = require('qrcode');

        const user = await dbGet('SELECT username, totp_enabled FROM users WHERE id = ?', [req.user.id]);
        if (user.totp_enabled) {
            return sendError(res, E.BAD_REQUEST, 400, '2FA is already enabled');
        }

        const secret = authenticator.generateSecret();
        const otpauth = authenticator.keyuri(user.username, 'MinePanel', secret);
        const qrDataUrl = await QRCode.toDataURL(otpauth);

        await dbRun('UPDATE users SET totp_secret = ? WHERE id = ?', [secret, req.user.id]);

        res.json({ secret, qrCode: qrDataUrl });
    } catch (err) {
        logger.error('[authRoutes] 2FA setup error:', err);
        return sendError(res, E.INTERNAL_ERROR, 500);
    }
});

// POST /api/auth/2fa/verify — verify code, enable 2FA, return backup codes
router.post('/2fa/verify', authenticateToken, async (req, res) => {
    try {
        const { code } = req.body;
        if (!code) return sendError(res, E.BAD_REQUEST, 400, 'Code is required');

        const { authenticator } = require('otplib');
        const crypto = require('crypto');
        const user = await dbGet('SELECT totp_secret, totp_enabled FROM users WHERE id = ?', [req.user.id]);

        if (!user.totp_secret) return sendError(res, E.BAD_REQUEST, 400, 'Run 2FA setup first');
        if (user.totp_enabled) return sendError(res, E.BAD_REQUEST, 400, '2FA is already enabled');

        const isValid = authenticator.verify({ token: String(code), secret: user.totp_secret });
        if (!isValid) return sendError(res, E.AUTH_INVALID_CREDENTIALS, 400, 'Invalid code');

        // Generate 8 backup codes (XXXXX-XXXXX format)
        const backupCodes = Array.from({ length: 8 }, () => {
            const raw = crypto.randomBytes(5).toString('hex').toUpperCase();
            return raw.slice(0, 5) + '-' + raw.slice(5);
        });

        await dbRun('UPDATE users SET totp_enabled = 1, totp_backup_codes = ? WHERE id = ?',
            [JSON.stringify(backupCodes), req.user.id]);
        await audit.log(req, '2FA_ENABLED', { userId: req.user.id });

        res.json({ success: true, message: '2FA enabled successfully', backupCodes });
    } catch (err) {
        logger.error('[authRoutes] 2FA verify error:', err);
        return sendError(res, E.INTERNAL_ERROR, 500);
    }
});

// POST /api/auth/2fa/disable — disable 2FA (requires password confirmation)
router.post('/2fa/disable', authenticateToken, async (req, res) => {
    try {
        const { password } = req.body;
        if (!password) return sendError(res, E.BAD_REQUEST, 400, 'Password is required');

        const user = await dbGet('SELECT password, totp_enabled FROM users WHERE id = ?', [req.user.id]);
        if (!user.totp_enabled) {
            return sendError(res, E.BAD_REQUEST, 400, '2FA is not enabled');
        }

        const match = await comparePassword(password, user.password);
        if (!match) return sendError(res, E.AUTH_INVALID_CREDENTIALS, 401);

        await dbRun('UPDATE users SET totp_enabled = 0, totp_secret = NULL, totp_backup_codes = NULL WHERE id = ?', [req.user.id]);
        await audit.log(req, '2FA_DISABLED', { userId: req.user.id });

        res.json({ success: true, message: '2FA disabled' });
    } catch (err) {
        logger.error('[authRoutes] 2FA disable error:', err);
        return sendError(res, E.INTERNAL_ERROR, 500);
    }
});

// ── 2FA Status ─────────────────────────────────────────────────────────────────

router.get('/2fa/status', authenticateToken, async (req, res) => {
    try {
        const user = await dbGet('SELECT totp_enabled FROM users WHERE id = ?', [req.user.id]);
        res.json({ enabled: !!user?.totp_enabled });
    } catch (err) {
        return sendError(res, E.INTERNAL_ERROR, 500);
    }
});

// ── Regenerate backup codes (requires current TOTP) ───────────────────────────

router.post('/2fa/regenerate-backup-codes', authenticateToken, async (req, res) => {
    try {
        const { code } = req.body;
        if (!code) return sendError(res, E.BAD_REQUEST, 400, 'Current TOTP code is required');

        const { authenticator } = require('otplib');
        const crypto = require('crypto');
        const user = await dbGet('SELECT totp_secret, totp_enabled FROM users WHERE id = ?', [req.user.id]);

        if (!user.totp_enabled) return sendError(res, E.BAD_REQUEST, 400, '2FA is not enabled');

        const isValid = authenticator.verify({ token: String(code), secret: user.totp_secret });
        if (!isValid) return sendError(res, E.AUTH_INVALID_CREDENTIALS, 401, 'Invalid TOTP code');

        const backupCodes = Array.from({ length: 8 }, () => {
            const raw = crypto.randomBytes(5).toString('hex').toUpperCase();
            return raw.slice(0, 5) + '-' + raw.slice(5);
        });
        await dbRun('UPDATE users SET totp_backup_codes = ? WHERE id = ?', [JSON.stringify(backupCodes), req.user.id]);
        await audit.log(req, '2FA_BACKUP_CODES_REGENERATED', { userId: req.user.id });

        res.json({ success: true, backupCodes });
    } catch (err) {
        logger.error('[authRoutes] regenerate backup codes error:', err);
        return sendError(res, E.INTERNAL_ERROR, 500);
    }
});

// ── Password reset using TOTP (no old password needed) ────────────────────────

router.post('/password-reset-with-totp', async (req, res) => {
    try {
        const { username, totpCode, newPassword, backupCode } = req.body;
        if (!username) return sendError(res, E.BAD_REQUEST, 400, 'Username is required');
        if (!newPassword) return sendError(res, E.BAD_REQUEST, 400, 'New password is required');

        const { validatePasswordStrength } = require('../core/utils/passwordValidator');
        const pwCheck = validatePasswordStrength(newPassword);
        if (!pwCheck.valid) return sendError(res, E.BAD_REQUEST, 400, pwCheck.error);

        const user = await dbGet(
            'SELECT id, username, totp_enabled, totp_secret, totp_backup_codes FROM users WHERE LOWER(username) = LOWER(?)',
            [username]
        );
        if (!user) return sendError(res, E.AUTH_INVALID_CREDENTIALS, 401, 'Invalid credentials');
        if (!user.totp_enabled || !user.totp_secret) {
            return sendError(res, E.BAD_REQUEST, 400, '2FA is not enabled on this account');
        }

        if (backupCode) {
            const codes = JSON.parse(user.totp_backup_codes || '[]');
            const normalised = backupCode.trim().toUpperCase();
            const idx = codes.indexOf(normalised);
            if (idx === -1) return sendError(res, E.AUTH_INVALID_CREDENTIALS, 401, 'Invalid backup code');
            codes.splice(idx, 1);
            await dbRun('UPDATE users SET totp_backup_codes = ? WHERE id = ?', [JSON.stringify(codes), user.id]);
        } else if (totpCode) {
            const { authenticator } = require('otplib');
            const verified = authenticator.verify({ token: String(totpCode), secret: user.totp_secret });
            if (!verified) return sendError(res, E.AUTH_INVALID_CREDENTIALS, 401, 'Invalid authenticator code');
        } else {
            return sendError(res, E.BAD_REQUEST, 400, 'TOTP code or backup code is required');
        }

        const hashed = await hashPassword(newPassword);
        const now = Math.floor(Date.now() / 1000);
        await dbRun('UPDATE users SET password = ?, valid_tokens_from = ? WHERE id = ?', [hashed, now, user.id]);
        await audit.log(req, 'PASSWORD_RESET_WITH_2FA', { userId: user.id, username: user.username });

        res.json({ success: true, message: 'Password reset successfully. Please log in with your new password.' });
    } catch (err) {
        logger.error('[authRoutes] password-reset-with-totp error:', err);
        return sendError(res, E.INTERNAL_ERROR, 500);
    }
});

module.exports = router;
