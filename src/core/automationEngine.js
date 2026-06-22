// src/core/automationEngine.js
// Parses console logs and process status changes to trigger Python scripts in the sandbox.
'use strict';

const EventEmitter = require('events');
const { dbAll, dbGet } = require('../db/database');
const processManager   = require('./processManager');
const logger           = require('./utils/logger');
const workerManager    = require('./automation/workerManager');

// ─── Log line patterns ──────────────────────────────────────────────────────
// All patterns require a real Minecraft log prefix ("[HH:MM:SS] [Thread/LEVEL]: "
// or "[HH:MM:SS.mmm] [Thread/LEVEL]: ", used by Paper/Vanilla and PocketMine-MP)
// followed by the EXACT rest-of-line shape. This prevents plugin logs, voicechat
// logs, or chat messages that merely *contain* the words "joined the game" from
// firing a false event - the whole remainder of the line must match.
const LOG_PREFIX = String.raw`^\[\d{1,2}:\d{2}:\d{2}(?:\.\d{1,3})?\]\s+\[[^\]/]+/(INFO|WARN)\]:\s+`;

const RE_JOIN  = new RegExp(LOG_PREFIX + String.raw`(\S+) joined the game\s*$`, 'i');
// PocketMine-MP uses "has left the game"; Paper/Vanilla uses "left the game".
const RE_LEAVE = new RegExp(LOG_PREFIX + String.raw`(\S+) (?:has )?left the game\s*$`, 'i');
// Chat: the player name token must immediately follow the log prefix (no extra
// text in between), so a plugin line like "[INFO]: Relaying <Bob> hi" is rejected.
const RE_CHAT  = new RegExp(LOG_PREFIX + String.raw`<(\S+)>\s(.*)$`, 'i');
const RE_READY = new RegExp(LOG_PREFIX + String.raw`Done\s+\(\d+\.\d+s\)!`, 'i');
const RE_STOP  = new RegExp(LOG_PREFIX + String.raw`Stopping (?:the )?server`, 'i');

const CHAT_DEBOUNCE_MS = 200; // per-player minimum gap between player_chat events

class AutomationEngine extends EventEmitter {
    constructor() {
        super();
        this.consoleListener = null;
        this.statusListener = null;
        this.crashListener = null;
        this.lastStopTriggered = new Map(); // serverId -> timestamp of last triggered stop/crash
        this.lineBuffers = new Map();       // serverId -> leftover partial line from last chunk
        this.lastChatTriggered = new Map(); // "serverId:playerName" -> timestamp of last player_chat event
        this.activeCache = new Map();       // serverId -> bool, "does this server have automation worth running"

        // Forward logs from workerManager
        workerManager.on('log', (serverId, logMsg) => {
            this.emit('log', serverId, logMsg);
        });
    }

    // Call this whenever automation_enabled or any automation_rules row changes
    // for a server, so the next console line re-checks the DB instead of using
    // a stale cached value.
    invalidateCache(serverId) {
        this.activeCache.delete(String(serverId));
    }

    // Cheap pre-check so disabled servers skip regex parsing entirely instead of
    // paying for it on every console line. Caches the DB lookup per server and
    // is refreshed by invalidateCache() on any relevant write.
    async isAutomationActive(serverId) {
        const sid = String(serverId);
        if (this.activeCache.has(sid)) return this.activeCache.get(sid);

        let active = false;
        try {
            const server = await dbGet('SELECT automation_enabled FROM servers WHERE id = ?', [serverId]);
            if (server && server.automation_enabled) {
                const row = await dbGet(
                    'SELECT 1 FROM automation_rules WHERE server_id = ? AND enabled = 1 AND script IS NOT NULL LIMIT 1',
                    [serverId]
                );
                active = !!row;
            }
        } catch (err) {
            logger.error(`[AutomationEngine] isAutomationActive check failed for server ${serverId}:`, err);
            active = false;
        }

        this.activeCache.set(sid, active);
        return active;
    }

    async triggerEvent(serverId, eventName, eventData = {}) {
        try {
            const sid = String(serverId);
            
            // Check if automation is active per-server
            const server = await dbGet('SELECT automation_enabled FROM servers WHERE id = ?', [serverId]);
            if (!server || !server.automation_enabled) {
                return; // Automation is disabled globally for this server
            }

            // Fetch enabled python automation scripts
            const rules = await dbAll(
                'SELECT name, script FROM automation_rules WHERE server_id = ? AND enabled = 1 AND script IS NOT NULL',
                [serverId]
            );

            if (rules.length === 0) return;

            // Fetch live metrics to inject as context
            const stats = await processManager.getStats(sid);
            
            const context = {
                server_id: serverId,
                event: eventName,
                data: eventData,
                metrics: {
                    cpu_usage: stats ? Math.round(stats.cpu) : 0,
                    global_ram_usage: Math.round(process.memoryUsage().rss / 1024 / 1024),
                    server_ram_usage: stats ? Math.round(stats.ram / 1024 / 1024) : 0
                }
            };

            for (const rule of rules) {
                workerManager.executeScript(serverId, rule.name, rule.script, context);
            }
        } catch (err) {
            logger.error(`[AutomationEngine] Error triggering event "${eventName}" for server ${serverId}:`, err);
        }
    }

    start() {
        if (this.consoleListener) return;

        logger.info('[Automation] Python automation engine starting...');

        // Real-time console log based detection.
        // `line` from processManager is actually a raw stdout/stderr CHUNK, which
        // may contain zero, one, or many newline-terminated lines, and may end
        // mid-line. We buffer the trailing partial line per server and only run
        // event matching against complete lines.
        this.consoleListener = (serverId, chunk) => {
            if (typeof chunk !== 'string' || chunk.length === 0) return;
            const sid = String(serverId);

            // Fast path: server is known (cached) to have no active automation —
            // skip buffering and parsing entirely. If we don't know yet, fail
            // open (parse this chunk) and kick off a background check so future
            // chunks can take the fast path.
            if (this.activeCache.has(sid)) {
                if (!this.activeCache.get(sid)) {
                    this.lineBuffers.delete(sid);
                    return;
                }
            } else {
                this.isAutomationActive(serverId).catch(() => {});
            }

            const pending = (this.lineBuffers.get(sid) || '') + chunk;
            const parts = pending.split('\n');
            // Last part is either '' (chunk ended cleanly on \n) or a partial line
            // to carry over to the next chunk.
            this.lineBuffers.set(sid, parts.pop());

            for (const rawLine of parts) {
                const line = rawLine.replace(/\r$/, '');
                if (!line.trim()) continue;
                this.processLine(serverId, sid, line);
            }
        };

        // Status change based detection (offline / crash fallback)
        this.statusListener = (serverId, newStatus) => {
            if (newStatus === 'offline') {
                const sid = String(serverId);
                const now = Date.now();
                const lastTime = this.lastStopTriggered.get(sid) || 0;
                if (now - lastTime > 5000) {
                    // Check if it was an intentional stop or a crash
                    const intents = processManager._stopIntents;
                    const wasIntentional = intents && intents.has(sid);
                    
                    this.lastStopTriggered.set(sid, now);
                    this.triggerEvent(serverId, 'server_stop', { crash: !wasIntentional });
                }
            }
        };

        this.crashListener = (serverId) => {
            const sid = String(serverId);
            const now = Date.now();
            const lastTime = this.lastStopTriggered.get(sid) || 0;
            if (now - lastTime > 5000) {
                this.lastStopTriggered.set(sid, now);
                this.triggerEvent(serverId, 'server_stop', { crash: true });
            }
        };

        processManager.on('console', this.consoleListener);
        processManager.on('status', this.statusListener);
        processManager.on('crash', this.crashListener);
    }

    // Runs all event regexes against a single, complete, trimmed log line and
    // fires at most one event per line (a line can't simultaneously be a join,
    // a chat message, and a stop notice).
    processLine(serverId, sid, line) {
        const joinMatch = RE_JOIN.exec(line);
        if (joinMatch) {
            this.triggerEvent(serverId, 'player_join', { player_name: joinMatch[2] });
            return;
        }

        const leaveMatch = RE_LEAVE.exec(line);
        if (leaveMatch) {
            this.triggerEvent(serverId, 'player_leave', { player_name: leaveMatch[2] });
            return;
        }

        const chatMatch = RE_CHAT.exec(line);
        if (chatMatch) {
            const playerName = chatMatch[2];
            const message = chatMatch[3];
            const key = `${sid}:${playerName}`;
            const now = Date.now();
            const lastTime = this.lastChatTriggered.get(key) || 0;
            if (now - lastTime < CHAT_DEBOUNCE_MS) {
                return; // debounced: too soon after this player's last chat event
            }
            this.lastChatTriggered.set(key, now);
            this.triggerEvent(serverId, 'player_chat', { player_name: playerName, message });
            return;
        }

        if (RE_READY.test(line)) {
            this.triggerEvent(serverId, 'server_ready', {});
            return;
        }

        if (RE_STOP.test(line)) {
            const now = Date.now();
            const lastTime = this.lastStopTriggered.get(sid) || 0;
            if (now - lastTime > 5000) {
                this.lastStopTriggered.set(sid, now);
                this.triggerEvent(serverId, 'server_stop', { crash: false });
            }
        }
    }

    stop() {
        if (this.consoleListener) {
            processManager.removeListener('console', this.consoleListener);
            this.consoleListener = null;
        }
        if (this.statusListener) {
            processManager.removeListener('status', this.statusListener);
            this.statusListener = null;
        }
        if (this.crashListener) {
            processManager.removeListener('crash', this.crashListener);
            this.crashListener = null;
        }
        this.lineBuffers.clear();
        logger.info('[Automation] Python automation engine stopped.');
    }
}

module.exports = new AutomationEngine();

