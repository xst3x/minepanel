// src/core/utils/envHelper.js
const fs = require('fs');
const path = require('path');

const crypto = require('crypto');

/**
 * Safely and atomically updates the PORT environment variable in the .env file.
 * Uses a temp file and atomic rename to prevent partial/incomplete writes.
 * @param {number} newPort - The new port number to save.
 */
function updateEnvPort(newPort) {
    const envPath = path.resolve(__dirname, '../../../.env');
    const tempPath = envPath + '.tmp';
    
    let content = '';
    if (fs.existsSync(envPath)) {
        content = fs.readFileSync(envPath, 'utf8');
    }
    
    const lines = content.split('\n');
    let updated = false;
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].trim().startsWith('PORT=')) {
            lines[i] = `PORT=${newPort}`;
            updated = true;
            break;
        }
    }
    if (!updated) {
        lines.push(`PORT=${newPort}`);
    }
    
    // Write atomically to temp file
    fs.writeFileSync(tempPath, lines.join('\n'), 'utf8');
    // Atomic rename at OS level
    fs.renameSync(tempPath, envPath);
}

/**
 * Checks for default JWT_SECRET and CSRF_SECRET in the .env file.
 * If default or insecurely short keys are detected, replaces them with cryptographically random secrets.
 */
function sanitizeSecrets() {
    if (process.env.NODE_ENV === 'test') return;

    const envPath = path.resolve(__dirname, '../../../.env');
    const tempPath = envPath + '.tmp';
    
    if (!fs.existsSync(envPath)) return;
    
    const content = fs.readFileSync(envPath, 'utf8');
    const lines = content.split('\n');
    let updated = false;
    
    const defaultJwt = 'minepanel_super_secret_jwt_key_schimba_asta_in_productie_2024';
    const defaultCsrf = 'minepanel_csrf_secret_schimba_asta_in_productie_2024';
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.startsWith('JWT_SECRET=')) {
            const val = line.substring('JWT_SECRET='.length).trim();
            if (val === defaultJwt || val.length < 32 || val.startsWith('CHANGEME')) {
                const newSecret = crypto.randomBytes(32).toString('hex');
                lines[i] = `JWT_SECRET=${newSecret}`;
                process.env.JWT_SECRET = newSecret;
                updated = true;
            }
        }
        if (line.startsWith('CSRF_SECRET=')) {
            const val = line.substring('CSRF_SECRET='.length).trim();
            if (val === defaultCsrf || val.length < 32 || val.startsWith('CHANGEME')) {
                const newSecret = crypto.randomBytes(32).toString('hex');
                lines[i] = `CSRF_SECRET=${newSecret}`;
                process.env.CSRF_SECRET = newSecret;
                updated = true;
            }
        }
    }
    
    if (updated) {
        fs.writeFileSync(tempPath, lines.join('\n'), 'utf8');
        fs.renameSync(tempPath, envPath);
        console.log('[Security] Default JWT or CSRF secrets were detected and replaced with cryptographically secure ones.');
    }
}

module.exports = {
    updateEnvPort,
    sanitizeSecrets
};
