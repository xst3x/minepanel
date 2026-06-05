// Password strength validator
/**
 * Validates password strength
 * @param {string} password - The password to validate
 * @returns {Object} - Result with valid boolean and error message if invalid
 */
const validatePasswordStrength = (password) => {
    if (!password || typeof password !== 'string') {
        return { valid: false, error: 'Password must be a string' };
    }

    if (password.length < 8) {
        return { valid: false, error: 'Password must be at least 8 characters long' };
    }

    if (password.length > 128) {
        return { valid: false, error: 'Password must not exceed 128 characters' };
    }

    if (!/[A-Z]/.test(password)) {
        return { valid: false, error: 'Password must contain at least one uppercase letter' };
    }

    if (!/[a-z]/.test(password)) {
        return { valid: false, error: 'Password must contain at least one lowercase letter' };
    }

    if (!/[0-9]/.test(password)) {
        return { valid: false, error: 'Password must contain at least one digit' };
    }

    if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
        return { valid: false, error: 'Password must contain at least one special character (!@#$%^&*(),.?":{}|<>)' };
    }

    const weakPasswords = [
        'password', '123456', '12345678', '123456789', '1234567890',
        'qwerty', 'abc123', 'password1', 'admin', 'letmein',
        'welcome', 'monkey', 'dragon', 'baseball', 'iloveyou',
        'trustno1', 'sunshine', 'master', 'hello', 'freedom',
        'whatever', 'qazwsx', 'password123'
    ];

    if (weakPasswords.includes(password.toLowerCase())) {
        return { valid: false, error: 'Password is too weak and commonly used' };
    }

    // Block only long sequential runs (5+) to avoid rejecting common strong passwords like Admin123!
    const hasLongSequential = (str) => {
        const lower = str.toLowerCase();
        for (let i = 0; i < lower.length - 4; i++) {
            const c = lower.charCodeAt(i);
            if (
                lower.charCodeAt(i + 1) === c + 1 &&
                lower.charCodeAt(i + 2) === c + 2 &&
                lower.charCodeAt(i + 3) === c + 3 &&
                lower.charCodeAt(i + 4) === c + 4
            ) return true;
        }
        return false;
    };

    if (hasLongSequential(password)) {
        return { valid: false, error: 'Password must not contain long sequential characters (e.g., abcde, 12345)' };
    }

    if (/(.)\1\1\1/.test(password)) {
        return { valid: false, error: 'Password must not contain 4 or more repeated characters (e.g., aaaa, 1111)' };
    }

    return { valid: true, error: null };
};

module.exports = { validatePasswordStrength };
