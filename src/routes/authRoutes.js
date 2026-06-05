const express = require('express');
const { User, Rank, Server, AccountCreationToken, UserServerPermission, UserServerRank } = require('../db/database');
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
const { Op } = require('sequelize');

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

const passwordResetLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: { error: 'Too many password reset attempts. Please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: false,
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
        const user = await User.findOne({
            where: { username: { [Op.eq]: username } }
        });
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
            const { verifySync } = require('otplib');
            const isValid = verifySync({ strategy: 'totp', secret: user.totp_secret, token: String(totpCode), epochTolerance: 1 });
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
            dbToken = await AccountCreationToken.findOne({ where: { token } });
            if (!dbToken) return sendError(res, E.AUTH_INVITE_TOKEN_INVALID, 400);
            if (dbToken.used) return sendError(res, E.AUTH_INVITE_TOKEN_USED, 400);
            if (new Date(dbToken.expires_at).getTime() < Date.now()) return sendError(res, E.AUTH_INVITE_TOKEN_EXPIRED, 400);

            permissions = JSON.parse(dbToken.permissions || '[]');
            ranks = JSON.parse(dbToken.ranks || '[]');
            if (ranks.length > 0) {
                rankId = Number(ranks[0]);
                const rankObj = await Rank.findByPk(rankId, { attributes: ['name'] });
                if (rankObj && rankObj.name) userRank = rankObj.name;
            }
        } else {
            if (token) {
                dbToken = await AccountCreationToken.findOne({ where: { token } });
                if (dbToken && !dbToken.used && new Date(dbToken.expires_at).getTime() >= Date.now()) {
                    permissions = JSON.parse(dbToken.permissions || '[]');
                    ranks = JSON.parse(dbToken.ranks || '[]');
                    if (ranks.length > 0) {
                        rankId = Number(ranks[0]);
                        const rankObj = await Rank.findByPk(rankId, { attributes: ['name'] });
                        if (rankObj && rankObj.name) userRank = rankObj.name;
                    }
                } else {
                    dbToken = null;
                }
            }
            if (!dbToken) {
                const defaultRankId = settings.defaultRankId || null;
                if (defaultRankId) {
                    const rankObj = await Rank.findByPk(defaultRankId, { attributes: ['id', 'name'] });
                    if (rankObj) { rankId = rankObj.id; userRank = rankObj.name; }
                }
            }
        }

        const existingUser = await User.findOne({
            where: { username: { [Op.eq]: username } }
        });
        // Always hash the password even if the user exists, to prevent timing-based
        // username enumeration (i.e., skipping bcrypt would make the 'exists' path faster).
        const hashed = await hashPassword(password);
        if (existingUser) {
            // Respond identically to a successful registration — do not reveal that
            // the username is taken. The user will discover the conflict on first login.
            return res.json({ message: 'Account created successfully' });
        }
        const newUser = await User.create({
            username, password: hashed, role: userRank, rank_id: rankId
        });
        const newUserId = newUser.id;

        if (requireInviteToken && dbToken) {
            await dbToken.update({ used: 1 });
            await dbToken.destroy();
        }

        const servers = await Server.findAll({ attributes: ['id'] });
        for (const sv of servers) {
            for (const perm of permissions) {
                await UserServerPermission.findOrCreate({
                    where: { user_id: newUserId, server_id: sv.id, permission: perm }
                });
            }
            for (const rId of ranks) {
                await UserServerRank.findOrCreate({
                    where: { user_id: newUserId, server_id: sv.id, rank_id: rId }
                });
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
// NOTE: This only saves the secret; it does NOT enable 2FA. Call /2fa/verify to confirm the secret,
// then use /2fa/toggle to turn 2FA on or off independently.
router.get('/2fa/setup', authenticateToken, async (req, res) => {
    try {
        const { generateSecret, generateURI } = require('otplib');
        const QRCode = require('qrcode');

        const user = await User.findByPk(req.user.id, {
            attributes: ['username', 'totp_enabled']
        });
        // Allow re-setup even if totp_enabled — user may want to reconfigure their app

        const secret = generateSecret();
        const otpauth = generateURI({ strategy: 'totp', issuer: 'MinePanel', label: user.username, secret });
        const qrDataUrl = await QRCode.toDataURL(otpauth);

        // Save secret but do NOT enable 2FA yet — user must verify the code first
        await User.update(
            { totp_secret: secret, totp_verified: 0 },
            { where: { id: req.user.id } }
        );

        res.json({ secret, qrCode: qrDataUrl });
    } catch (err) {
        logger.error('[authRoutes] 2FA setup error:', err);
        return sendError(res, E.INTERNAL_ERROR, 500);
    }
});

// POST /api/auth/2fa/verify — verify the code and mark authenticator as configured (does NOT enable 2FA login enforcement)
router.post('/2fa/verify', authenticateToken, async (req, res) => {
    try {
        const { code } = req.body;
        if (!code) return sendError(res, E.BAD_REQUEST, 400, 'Code is required');

        const { verifySync } = require('otplib');
        const crypto = require('crypto');
        const user = await User.findByPk(req.user.id, {
            attributes: ['totp_secret', 'totp_verified']
        });

        if (!user.totp_secret) return sendError(res, E.BAD_REQUEST, 400, 'Run 2FA setup first');

        const isValid = verifySync({ strategy: 'totp', secret: user.totp_secret, token: String(code), epochTolerance: 1 });
        if (!isValid) return sendError(res, E.AUTH_INVALID_CREDENTIALS, 400, 'Invalid code');

        // Generate 8 backup codes (XXXXX-XXXXX format)
        const backupCodes = Array.from({ length: 8 }, () => {
            const raw = crypto.randomBytes(5).toString('hex').toUpperCase();
            return raw.slice(0, 5) + '-' + raw.slice(5);
        });

        // Mark as verified/configured — 2FA login enforcement stays at current totp_enabled value
        await User.update(
            { totp_verified: 1, totp_backup_codes: JSON.stringify(backupCodes) },
            { where: { id: req.user.id } }
        );
        await audit.log(req, '2FA_CONFIGURED', { userId: req.user.id });

        res.json({ success: true, message: 'Authenticator configured successfully', backupCodes });
    } catch (err) {
        logger.error('[authRoutes] 2FA verify error:', err);
        return sendError(res, E.INTERNAL_ERROR, 500);
    }
});

// POST /api/auth/2fa/disable — remove authenticator entirely (requires password confirmation)
router.post('/2fa/disable', authenticateToken, async (req, res) => {
    try {
        const { password } = req.body;
        if (!password) return sendError(res, E.BAD_REQUEST, 400, 'Password is required');

        const user = await User.findByPk(req.user.id, {
            attributes: ['password', 'totp_verified']
        });
        if (!user.totp_verified) {
            return sendError(res, E.BAD_REQUEST, 400, 'No authenticator is configured');
        }

        const match = await comparePassword(password, user.password);
        if (!match) return sendError(res, E.AUTH_INVALID_CREDENTIALS, 401);

        await User.update(
            { totp_enabled: 0, totp_verified: 0, totp_secret: null, totp_backup_codes: null },
            { where: { id: req.user.id } }
        );
        await audit.log(req, '2FA_REMOVED', { userId: req.user.id });

        res.json({ success: true, message: 'Authenticator removed' });
    } catch (err) {
        logger.error('[authRoutes] 2FA disable error:', err);
        return sendError(res, E.INTERNAL_ERROR, 500);
    }
});

// ── 2FA Status ─────────────────────────────────────────────────────────────────

router.get('/2fa/status', authenticateToken, async (req, res) => {
    try {
        const user = await User.findByPk(req.user.id, {
            attributes: ['totp_enabled', 'totp_verified']
        });
        res.json({
            enabled: !!user?.totp_enabled,       // 2FA enforced at login
            configured: !!user?.totp_verified,   // authenticator app is set up
        });
    } catch (err) {
        return sendError(res, E.INTERNAL_ERROR, 500);
    }
});

// ── Toggle 2FA enforcement (on/off) — requires authenticator to be configured first ──

router.post('/2fa/toggle', authenticateToken, async (req, res) => {
    try {
        const { enable } = req.body; // boolean
        if (typeof enable !== 'boolean') return sendError(res, E.BAD_REQUEST, 400, '"enable" must be a boolean');

        const user = await User.findByPk(req.user.id, {
            attributes: ['totp_verified', 'totp_enabled']
        });
        if (enable && !user.totp_verified) {
            return sendError(res, E.BAD_REQUEST, 400, 'Set up your authenticator app first before enabling 2FA');
        }

        await User.update(
            { totp_enabled: enable ? 1 : 0 },
            { where: { id: req.user.id } }
        );
        await audit.log(req, enable ? '2FA_ENABLED' : '2FA_DISABLED', { userId: req.user.id });

        res.json({ success: true, enabled: enable });
    } catch (err) {
        logger.error('[authRoutes] 2FA toggle error:', err);
        return sendError(res, E.INTERNAL_ERROR, 500);
    }
});

// ── Regenerate backup codes (requires current TOTP) ───────────────────────────

router.post('/2fa/regenerate-backup-codes', authenticateToken, async (req, res) => {
    try {
        const { code } = req.body;
        if (!code) return sendError(res, E.BAD_REQUEST, 400, 'Current TOTP code is required');

        const { verifySync } = require('otplib');
        const crypto = require('crypto');
        const user = await User.findByPk(req.user.id, {
            attributes: ['totp_secret', 'totp_enabled']
        });

        if (!user.totp_enabled) return sendError(res, E.BAD_REQUEST, 400, '2FA is not enabled');

        const isValid = verifySync({ strategy: 'totp', secret: user.totp_secret, token: String(code), epochTolerance: 1 });
        if (!isValid) return sendError(res, E.AUTH_INVALID_CREDENTIALS, 401, 'Invalid TOTP code');

        const backupCodes = Array.from({ length: 8 }, () => {
            const raw = crypto.randomBytes(5).toString('hex').toUpperCase();
            return raw.slice(0, 5) + '-' + raw.slice(5);
        });
        await User.update(
            { totp_backup_codes: JSON.stringify(backupCodes) },
            { where: { id: req.user.id } }
        );
        await audit.log(req, '2FA_BACKUP_CODES_REGENERATED', { userId: req.user.id });

        res.json({ success: true, backupCodes });
    } catch (err) {
        logger.error('[authRoutes] regenerate backup codes error:', err);
        return sendError(res, E.INTERNAL_ERROR, 500);
    }
});

// ── Password reset using TOTP (no old password needed) ────────────────────────

router.post('/password-reset-with-totp', passwordResetLimiter, async (req, res) => {
    try {
        const { username, newPassword } = req.body;
        const totpCode   = (req.body.totpCode   || '').trim();
        const backupCode = (req.body.backupCode  || '').trim().toUpperCase();
        if (!username) return sendError(res, E.BAD_REQUEST, 400, 'Username is required');
        if (!newPassword) return sendError(res, E.BAD_REQUEST, 400, 'New password is required');

        const { validatePasswordStrength } = require('../core/utils/passwordValidator');
        const pwCheck = validatePasswordStrength(newPassword);
        if (!pwCheck.valid) return sendError(res, E.BAD_REQUEST, 400, pwCheck.error);

        const user = await User.findOne({
            where: { username: { [Op.eq]: username } },
            attributes: ['id', 'username', 'totp_enabled', 'totp_secret', 'totp_backup_codes']
        });
        if (!user) return sendError(res, E.BAD_REQUEST, 404, 'Account not found');
        if (!user.totp_enabled || !user.totp_secret) {
            return sendError(res, E.BAD_REQUEST, 400, '2FA is not enabled on this account. Password reset via 2FA is unavailable.');
        }

        if (backupCode) {
            const codes = JSON.parse(user.totp_backup_codes || '[]');
            const idx = codes.indexOf(backupCode);
            if (idx === -1) return sendError(res, E.AUTH_INVALID_CREDENTIALS, 401, 'Invalid backup code');
            codes.splice(idx, 1);
            await User.update(
                { totp_backup_codes: JSON.stringify(codes) },
                { where: { id: user.id } }
            );
        } else if (totpCode) {
            const { verifySync } = require('otplib');
            const verified = verifySync({ strategy: 'totp', secret: user.totp_secret, token: String(totpCode), epochTolerance: 1 });
            if (!verified) return sendError(res, E.AUTH_INVALID_CREDENTIALS, 401, 'Invalid authenticator code');
        } else {
            return sendError(res, E.BAD_REQUEST, 400, 'An authenticator code or backup code is required');
        }

        const hashed = await hashPassword(newPassword);
        const now = Math.floor(Date.now() / 1000);
        await User.update(
            { password: hashed, valid_tokens_from: now },
            { where: { id: user.id } }
        );
        await audit.log(req, 'PASSWORD_RESET_WITH_2FA', { userId: user.id, username: user.username });

        res.json({ success: true, message: 'Password reset successfully. Please log in with your new password.' });
    } catch (err) {
        logger.error('[authRoutes] password-reset-with-totp error:', err);
        return sendError(res, E.INTERNAL_ERROR, 500);
    }
});

module.exports = router;
