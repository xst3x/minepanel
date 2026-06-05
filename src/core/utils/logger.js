/**
 * src/core/utils/logger.js
 * Centralized Winston logger for MinePanel.
 * Usage: const logger = require('./logger');
 *        logger.error('[authRoutes] Login error:', err);
 *        logger.warn('[serverRoutes] Non-critical issue');
 *        logger.info('[Server] Started on port 8082');
 */
const { createLogger, format, transports } = require('winston');
const path = require('path');
const fs = require('fs');

// Ensure logs directory exists
const logsDir = path.resolve(__dirname, '../../../logs');
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
}

const { combine, timestamp, printf, colorize, errors } = format;

// Custom log line format: [2025-01-01 12:00:00] [LEVEL] message
const logFormat = printf(({ level, message, timestamp, stack }) => {
    return `[${timestamp}] [${level.toUpperCase()}] ${stack || message}`;
});

const logger = createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: combine(
        timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        errors({ stack: true }),
        logFormat
    ),
    transports: [
        // Console: colorized for readability in dev
        new transports.Console({
            format: combine(
                colorize(),
                timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
                errors({ stack: true }),
                logFormat
            )
        }),
        // File: combined log (all levels)
        new transports.File({
            filename: path.join(logsDir, 'minepanel.log'),
            maxsize: 5 * 1024 * 1024, // 5 MB
            maxFiles: 5,
            tailable: true
        }),
        // File: error-only log
        new transports.File({
            filename: path.join(logsDir, 'error.log'),
            level: 'error',
            maxsize: 5 * 1024 * 1024,
            maxFiles: 5,
            tailable: true
        })
    ]
});

module.exports = logger;
