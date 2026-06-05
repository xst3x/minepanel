/**
 * src/core/utils/auditLog.js
 * Writes security-relevant events to the audit_log table.
 *
 * Usage:
 *   const audit = require('./auditLog');
 *   await audit.log(req, 'LOGIN_SUCCESS', { userId: 1, username: 'admin' });
 *   await audit.log(req, 'LOGIN_FAILED',  { username: 'unknown' });
 *
 * Events:
 *   LOGIN_SUCCESS, LOGIN_FAILED, LOGOUT,
 *   REGISTER_SUCCESS, REGISTER_FAILED,
 *   PASSWORD_CHANGED, PASSWORD_RESET,
 *   USER_CREATED, USER_DELETED, USER_DISABLED, USER_ENABLED,
 *   PERMISSION_DENIED
 */

const { dbRun } = require('../../db/database');
const logger = require('./logger');

/**
 * @param {import('express').Request|null} req  - Express request (for IP extraction), or null
 * @param {string} event                         - Event name (see list above)
 * @param {Object} [meta]                        - Optional: { userId, username, detail }
 */
const log = async (req, event, meta = {}) => {
    try {
        const ip = req
            ? (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || null)
            : null;

        await dbRun(
            `INSERT INTO audit_log (event, user_id, username, ip, detail) VALUES (?, ?, ?, ?, ?)`,
            [
                event,
                meta.userId || null,
                meta.username || null,
                ip,
                meta.detail ? JSON.stringify(meta.detail) : null,
            ]
        );
    } catch (err) {
        // Audit log failures must never crash the application
        logger.error('[AuditLog] Failed to write audit event:', err);
    }
};

module.exports = { log };
