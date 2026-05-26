const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { dbGet } = require('../db/database');

const SECRET_KEY = process.env.JWT_SECRET;
if (!SECRET_KEY) {
    console.error('FATAL ERROR: process.env.JWT_SECRET is not set. Please create a .env file with a strong JWT_SECRET.');
    process.exit(1);
}

const hashPassword = async (password) => {
    const salt = await bcrypt.genSalt(10);
    return bcrypt.hash(password, salt);
};

const comparePassword = async (password, hash) => {
    return bcrypt.compare(password, hash);
};

const generateToken = (user) => {
    return jwt.sign({ id: user.id, username: user.username }, SECRET_KEY, { expiresIn: process.env.JWT_EXPIRES_IN || '24h' });
};

const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    let token = authHeader && authHeader.split(' ')[1];

    if (!token && req.query.token) {
        token = req.query.token;
    }

    if (token == null) return res.status(401).json({ error: 'Unauthorized' });

    jwt.verify(token, SECRET_KEY, async (err, user) => {
        if (err) return res.status(401).json({ error: 'Session expired or invalid token' });
        try {
            const dbUser = await dbGet('SELECT disabled FROM users WHERE id = ?', [user.id]);
            if (dbUser && dbUser.disabled === 1) {
                return res.status(401).json({ error: 'Account disabled' });
            }
            req.user = user;
            next();
        } catch (dbErr) {
            return res.status(500).json({ error: 'Database error' });
        }
    });
};

module.exports = {
    hashPassword,
    comparePassword,
    generateToken,
    authenticateToken,
    SECRET_KEY
};

