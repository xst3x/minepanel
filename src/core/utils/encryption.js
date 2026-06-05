/**
 * AES-256-GCM encryption utility for sensitive data (e.g. Discord bot tokens).
 * Key is derived from the JWT_SECRET environment variable via SHA-256.
 */
const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

/**
 * Derive a 32-byte key from JWT_SECRET using SHA-256.
 */
function getKey() {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
        throw new Error('JWT_SECRET is not set — cannot encrypt/decrypt');
    }
    return crypto.createHash('sha256').update(secret).digest();
}

/**
 * Encrypt a plaintext string.
 * Returns a base64-encoded string containing IV + authTag + ciphertext.
 * @param {string} plaintext
 * @returns {string}
 */
function encrypt(plaintext) {
    const key = getKey();
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    const encrypted = Buffer.concat([
        cipher.update(plaintext, 'utf8'),
        cipher.final()
    ]);
    const authTag = cipher.getAuthTag();

    // Pack: IV (16) + authTag (16) + ciphertext (N)
    const packed = Buffer.concat([iv, authTag, encrypted]);
    return packed.toString('base64');
}

function decryptWithKey(encoded, key) {
    const packed = Buffer.from(encoded, 'base64');
    if (packed.length < IV_LENGTH + AUTH_TAG_LENGTH) {
        throw new Error('Invalid encrypted content length');
    }

    const iv = packed.subarray(0, IV_LENGTH);
    const authTag = packed.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const ciphertext = packed.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([
        decipher.update(ciphertext),
        decipher.final()
    ]);
    return decrypted.toString('utf8');
}

/**
 * Decrypt a base64-encoded encrypted string produced by encrypt().
 * @param {string} encoded
 * @returns {string}
 */
function decrypt(encoded) {
    return decryptAndDetect(encoded).decrypted;
}

/**
 * Decrypt a base64-encoded encrypted string, detecting if fallback key was used.
 * @param {string} encoded
 * @returns {{decrypted: string, migrated: boolean}}
 */
function decryptAndDetect(encoded) {
    try {
        const key = getKey();
        return { decrypted: decryptWithKey(encoded, key), migrated: false };
    } catch (e) {
        // Fallback to the default key
        const defaultSecret = 'minepanel_super_secret_jwt_key_schimba_asta_in_productie_2024';
        const fallbackKey = crypto.createHash('sha256').update(defaultSecret).digest();
        try {
            return { decrypted: decryptWithKey(encoded, fallbackKey), migrated: true };
        } catch (err) {
            throw new Error('Failed to decrypt: invalid key');
        }
    }
}

module.exports = { encrypt, decrypt, decryptAndDetect };

