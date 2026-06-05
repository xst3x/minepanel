// src/core/webhookManager.js
const axios = require('axios');
const { dbRun, dbAll } = require('../db/database');
const logger = require('./utils/logger');

const ALLOWED_EVENTS = [
  'server_start',
  'server_stop',
  'crash',
  'backup_completed'
];

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000; // base delay, multiplied by attempt number

class WebhookManager {
  async create({ serverId, event, url }) {
    if (!ALLOWED_EVENTS.includes(event)) {
      throw new Error(`Invalid event "${event}". Allowed: ${ALLOWED_EVENTS.join(', ')}`);
    }
    if (!/^https?:\/\/.+/.test(url)) {
      throw new Error('Invalid URL: must start with http:// or https://');
    }
    await dbRun(
      `INSERT INTO webhooks (server_id, event, url, active) VALUES (?,?,?,1)`,
      [serverId, event, url]
    );
    return { serverId, event, url };
  }

  async delete(id) {
    await dbRun(`DELETE FROM webhooks WHERE id = ?`, [id]);
  }

  async list(serverId) {
    return dbAll(`SELECT * FROM webhooks WHERE server_id = ?`, [serverId]);
  }

  async trigger(event, payload) {
    if (!ALLOWED_EVENTS.includes(event)) return;
    const { serverId } = payload;
    const hooks = await dbAll(
      `SELECT id, url FROM webhooks WHERE server_id = ? AND event = ? AND active = 1`,
      [serverId, event]
    );
    for (const hook of hooks) {
      let attempt = 0;
      const send = async () => {
        attempt++;
        try {
          await axios.post(hook.url, payload, { timeout: 5000 });
          logger.info(`[Webhook] Delivered ${event} to ${hook.url}`);
        } catch (err) {
          if (attempt < MAX_RETRIES) {
            logger.warn(`[Webhook] Retry ${attempt}/${MAX_RETRIES} for ${hook.url}: ${err.message}`);
            await new Promise(r => setTimeout(r, RETRY_DELAY_MS * attempt));
            await send();
          } else {
            logger.error(`[Webhook] Failed after ${MAX_RETRIES} attempts for ${hook.url}: ${err.message}`);
          }
        }
      };
      await send();
    }
  }
}

module.exports = new WebhookManager();
