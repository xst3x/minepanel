const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { dbGet } = require('../db/database');
const { E, sendError } = require('./errors');

const SECRET_KEY = process.env.JWT_SECRET;
if (!SECRET_KEY) {
    console.error('FATAL ERROR: process.env.JWT_SECRET is not set. Please create a .env file with a strong JWT_SECRET.');
    process.exit(1);
}

// In-memory store for invalidated tokens
const invalidatedTokens = new Set();

const hashPassword = async (password) => {
    const salt = await bcrypt.genSalt(10);
    return bcrypt.hash(password, salt);
};

const comparePassword = async (password, hash) => {
    return bcrypt.compare(password, hash);
};

const generateToken = (user) => {
    return jwt.sign({ id: user.id, username: user.username, role: user.role }, SECRET_KEY, { expiresIn: process.env.JWT_EXPIRES_IN || '24h' });
};

const invalidateToken = (token) => {
    invalidatedTokens.add(token);
    // Remove after expiry window to prevent memory leak
    setTimeout(() => {
        invalidatedTokens.delete(token);
    }, 24 * 60 * 60 * 1000); // matches JWT_EXPIRES_IN default of 24h
};

const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token == null) return sendError(res, E.AUTH_UNAUTHORIZED, 401);

    // Check if token has been explicitly invalidated (logged out)
    if (invalidatedTokens.has(token)) {
        return sendError(res, E.AUTH_TOKEN_INVALID, 401);
    }

    jwt.verify(token, SECRET_KEY, async (err, user) => {
        if (err) {
            // Distinguish between an expired token and a tampered/invalid one
            if (err.name === 'TokenExpiredError') {
                return sendError(res, E.AUTH_TOKEN_EXPIRED, 401);
            }
            return sendError(res, E.AUTH_TOKEN_INVALID, 401);
        }
        try {
            const dbUser = await dbGet('SELECT disabled FROM users WHERE id = ?', [user.id]);
            if (dbUser && dbUser.disabled === 1) {
                return sendError(res, E.AUTH_ACCOUNT_DISABLED, 403);
            }
            req.user = user;
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
    invalidateToken
};
