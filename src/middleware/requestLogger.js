const { v4: uuidv4 } = require('uuid');
const client = require('prom-client');
const logger = require('../core/utils/logger');

// Collect default metrics (CPU, memory, GC, etc.)
if (process.env.NODE_ENV !== 'test') { client.collectDefaultMetrics(); }

const showRequests = process.argv.includes('--show-requests');

/**
 * Request logger middleware – adds a unique request ID and sets X-Request-ID header.
 * Request logging is only active when --show-requests CLI flag is passed.
 */
module.exports = (req, res, next) => {
  const id = uuidv4();
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
