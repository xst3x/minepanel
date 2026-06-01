const argon2 = require('argon2');
const jwt = require('jsonwebtoken');
const { dbGet, dbRun } = require('../db/database');
const { E, sendError } = require('./errors');

const SECRET_KEY = process.env.JWT_SECRET;
if (!SECRET_KEY) {
    console.error('FATAL ERROR: process.env.JWT_SECRET is not set. Please create a .env file with a strong JWT_SECRET.');
    process.exit(1);
}

// ── Password hashing (Argon2id) ───────────────────────────────────────────────

const hashPassword = async (password) => {
    return argon2.hash(password, { type: argon2.argon2id });
};

const comparePassword = async (password, hash) => {
    // Support legacy bcrypt hashes during transition
    if (hash.startsWith('$2b$') || hash.startsWith('$2a$')) {
        const bcrypt = require('bcrypt');
        const match = await bcrypt.compare(password, hash);
        return match;
    }
    return argon2.verify(hash, password);
};

// ── JWT ───────────────────────────────────────────────────────────────────────

const generateToken = (user) => {
    return jwt.sign(
        { id: user.id, username: user.username, role: user.role, iat: Math.floor(Date.now() / 1000) },
        SECRET_KEY,
        { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
    );
};

// ── JWT Revocation (persistent via DB) ───────────────────────────────────────
// On logout we set valid_tokens_from = now (unix seconds).
// On every request we check token.iat >= valid_tokens_from.
// If server restarts, DB persists — no tokens sneak back in.

const invalidateToken = async (userId) => {
    const now = Math.floor(Date.now() / 1000);
    await dbRun('UPDATE users SET valid_tokens_from = ? WHERE id = ?', [now, userId]);
};

const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) return sendError(res, E.AUTH_UNAUTHORIZED, 401);

    jwt.verify(token, SECRET_KEY, async (err, decoded) => {
        if (err) {
            if (err.name === 'TokenExpiredError') return sendError(res, E.AUTH_TOKEN_EXPIRED, 401);
            return sendError(res, E.AUTH_TOKEN_INVALID, 401);
        }

        try {
            const dbUser = await dbGet(
                'SELECT disabled, valid_tokens_from, totp_enabled FROM users WHERE id = ?',
                [decoded.id]
            );

            if (!dbUser) return sendError(res, E.AUTH_TOKEN_INVALID, 401);
            if (dbUser.disabled === 1) return sendError(res, E.AUTH_ACCOUNT_DISABLED, 403);

            // Persistent JWT revocation check
            const validFrom = dbUser.valid_tokens_from || 0;
            if (decoded.iat < validFrom) {
                return sendError(res, E.AUTH_TOKEN_INVALID, 401);
            }

            req.user = decoded;
            next();
        } catch (dbErr) {
            return sendError(res, E.INTERNAL_ERROR, 500);
        }
    });
};

module.exports = {
    hashPassword,
    comparePassword,
    generateToken,
    authenticateToken,
    invalidateToken,
};
