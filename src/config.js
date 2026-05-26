// src/config.js
// Central configuration module for MinePanel
// Loads environment variables (via dotenv already called in index.js)

const DEFAULT_ALLOWED_ORIGINS = ['*'];
const DEFAULT_RATE_LIMIT = 100; // requests per minute per IP

module.exports = {
  // Array of allowed origin strings for CORS. Empty array disables all origins.
  ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim()) : DEFAULT_ALLOWED_ORIGINS,

  // Rate limit for global API limiter (requests per minute per IP)
  RATE_LIMIT: process.env.RATE_LIMIT ? parseInt(process.env.RATE_LIMIT, 10) : DEFAULT_RATE_LIMIT,

  // FTP configuration (optional)
  FTP_ENABLED: process.env.FTP_ENABLED === 'true',
  FTP_PORT: process.env.FTP_PORT ? parseInt(process.env.FTP_PORT, 10) : 2121,

  // Server port
  PORT: process.env.PORT ? parseInt(process.env.PORT, 10) : 8082,

  // HTTPS configuration
  // Set HTTPS=true in .env to enable HTTPS directly in Node (useful for local dev)
  // In production, leave HTTPS=false and use Nginx as a reverse proxy instead
  HTTPS_ENABLED: process.env.HTTPS === 'true',
  HTTPS_KEY: process.env.HTTPS_KEY || 'certs/key.pem',
  HTTPS_CERT: process.env.HTTPS_CERT || 'certs/cert.pem',
};
