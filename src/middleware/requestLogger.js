const { v4: uuidv4 } = require('uuid');
const client = require('prom-client');
const logger = require('../core/utils/logger'); // Added logger import
// Collect default metrics (CPU, memory, GC, etc.)
if (process.env.NODE_ENV !== 'test') { client.collectDefaultMetrics(); }

/**
 * Request logger middleware – adds a unique request ID, logs start/end of each request,
 * and sets the X-Request-ID response header.
 */
module.exports = (req, res, next) => {
  const id = uuidv4();
  req.id = id;
  const start = Date.now();
  logger.info(`[${id}] ${req.method} ${req.originalUrl} from ${req.ip}`);
  res.setHeader('X-Request-ID', id);
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info(`[${id}] ${req.method} ${req.originalUrl} ${res.statusCode} ${duration}ms`);
  });
  next();
};
