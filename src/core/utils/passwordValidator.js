// Password strength validator
const validatePasswordStrength = (password) => {
    if (!password || typeof password !== 'string') {
        return { valid: false, error: 'Password must be a string' };
    }
    if (password.length < 6) {
        return { valid: false, error: 'Password must be at least 6 characters long' };
    }
    if (password.length > 128) {
        return { valid: false, error: 'Password must not exceed 128 characters' };
    }
    if (!/[0-9]/.test(password)) {
        return { valid: false, error: 'Password must contain at least one number' };
    }
    return { valid: true, error: null };
};

module.exports = { validatePasswordStrength };
