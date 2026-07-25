"use strict";
const uuid_1 = require("uuid");
const client = require("prom-client");
const logger = require("../core/utils/logger");
// Collect default metrics (CPU, memory, GC, etc.)
if (process.env.NODE_ENV !== 'test') {
    client.collectDefaultMetrics();
}
const showRequests = process.argv.includes('--show-requests');
module.exports = (req, res, next) => {
    const id = (0, uuid_1.v4)();
    req.id = id;
    res.setHeader('X-Request-ID', id);
    if (showRequests) {
        const start = Date.now();
        logger.info(`[REQ] [${id}] ${req.method} ${req.originalUrl} from ${req.ip}`);
        res.on('finish', () => {
            const duration = Date.now() - start;
            logger.info(`[REQ] [${id}] ${req.method} ${req.originalUrl} → ${res.statusCode} (${duration}ms)`);
        });
    }
    next();
};
//# sourceMappingURL=requestLogger.js.map