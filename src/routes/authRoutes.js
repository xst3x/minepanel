const express = require('express');
const { db, dbGet, dbRun, dbAll } = require('../db/database');
const { hashPassword, comparePassword, generateToken } = require('../core/auth');
const rateLimit = require('express-rate-limit');
const fs = require('fs');
const path = require('path');

const getSettings = () => {
    try {
        if (fs.existsSync(path.resolve(__dirname, '../../settings.json'))) {
            return JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../settings.json'), 'utf8'));
        }
    } catch (_) {}
    return {};
};

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: () => getSettings().maxAttempts || 5,
    message: { error: 'Too many login attempts. Please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
});

const router = express.Router();

// Route to get panel settings for frontend (public)
router.get('/settings', async (req, res) => {
    try {
        const settings = getSettings();
        // We only need to send the account creation token requirement setting
        const requireInviteToken = settings.requireInviteTokenToCreateAccount !== undefined ?
            settings.requireInviteTokenToCreateAccount : true; // default to true
        res.json({ requireInviteToken });
    } catch (err) {
        res.status(500).json({ error: 'Failed to get settings' });
    }
});

router.post('/login', loginLimiter, async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password required' });
    }

    try {
        const user = await dbGet('SELECT * FROM users WHERE username = ?', [username]);
        if (!user) return res.status(401).json({ error: 'Invalid credentials' });

        const match = await comparePassword(password, user.password);
        if (!match) return res.status(401).json({ error: 'Invalid credentials' });

        if (user.disabled) {
            return res.status(403).json({ error: 'Account disabled' });
        }

        const token = generateToken(user);
        res.json({ token, userId: user.id, username: user.username, role: user.role });
    } catch (err) {
        res.status(500).json({ error: 'Database error: ' + err.message });
    }
});

router.post('/register', async (req, res) => {
    const { username, password, confirmPassword, token } = req.body;

    if (!username || !password || !confirmPassword) {
        return res.status(400).json({ error: 'Username, password, and confirm password are required' });
    }

    if (username.length < 3 || username.length > 32) {
        return res.status(400).json({ error: 'Username must be 3-32 characters' });
    }

    if (password.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    if (password !== confirmPassword) {
        return res.status(400).json({ error: "Passwords don't match" });
    }

    try {
        // Get settings to check if token is required
        const settings = getSettings();
        const requireInviteToken = settings.requireInviteTokenToCreateAccount !== undefined ?
            settings.requireInviteTokenToCreateAccount : true; // default to true

        let dbToken = null;
        let permissions = [];
        let ranks = [];
        let userRank = 'player';
        let rankId = null;

        if (requireInviteToken) {
            // Token is required
            if (!token) {
                return res.status(400).json({ error: 'Account creation token is required' });
            }

            // Validate token
            dbToken = await dbGet('SELECT * FROM account_creation_tokens WHERE token = ?', [token]);
            if (!dbToken) {
                return res.status(400).json({ error: 'Token invalid' });
            }

            if (dbToken.used) {
                return res.status(400).json({ error: 'Token invalid' });
            }

            const isExpired = new Date(dbToken.expires_at).getTime() < Date.now();
            if (isExpired) {
                return res.status(400).json({ error: 'Token expired' });
            }

            // Assign permissions and ranks from token
            permissions = JSON.parse(dbToken.permissions || '[]');
            ranks = JSON.parse(dbToken.ranks || '[]');

            // Determine user rank based on token ranks
            if (ranks.length > 0) {
                rankId = Number(ranks[0]);
                const rankObj = await dbGet('SELECT name FROM ranks WHERE id = ?', [rankId]);
                if (rankObj && rankObj.name) {
                    userRank = rankObj.name;
                }
            }
        } else {
            // Token is not required, use default rank (player)
            // Permissions and ranks remain empty
        }

        // Check if username is taken
        const existingUser = await dbGet('SELECT * FROM users WHERE username = ?', [username]);
        if (existingUser) {
            return res.status(409).json({ error: 'Username taken' });
        }

        // Hash password and create user with their assigned rank
        const hashed = await hashPassword(password);
        const result = await dbRun('INSERT INTO users (username, password, role, rank_id) VALUES (?, ?, ?, ?)', [username, hashed, userRank, rankId]);
        const newUserId = result.lastID;

        // If token was used, mark it as used and delete it
        if (requireInviteToken && dbToken) {
            await dbRun('UPDATE account_creation_tokens SET used = 1 WHERE id = ?', [dbToken.id]);
            await dbRun('DELETE FROM account_creation_tokens WHERE id = ?', [dbToken.id]);
        }

        const servers = await dbAll('SELECT id FROM servers');
        for (const sv of servers) {
            for (const perm of permissions) {
                await dbRun('INSERT OR IGNORE INTO user_server_permissions (user_id, server_id, permission) VALUES (?, ?, ?)', [newUserId, sv.id, perm]);
            }
            for (const rankId of ranks) {
                await dbRun('INSERT OR IGNORE INTO user_server_ranks (user_id, server_id, rank_id) VALUES (?, ?, ?)', [newUserId, sv.id, rankId]);
            }
        }

        res.json({ message: 'Account created successfully' });
    } catch (err) {
        res.status(500).json({ error: 'Database error: ' + err.message });
    }
});

module.exports = router;
