/**
 * Live Session Manager — tracks active live console and stats Discord sessions.
 * Prevents duplicate sessions per server and exposes cleanup handles
 * so button handlers (in discordManager) can stop them on demand.
 */

class LiveSessionManager {
    constructor() {
        /**
         * serverId -> {
         *   stopped, interaction, buildEmbed(isStopped, timedOut), cleanup()
         * }
         */
        this.consoleSessions = new Map();

        /**
         * serverId -> {
         *   stopped, interaction, server,
         *   cpu, ram, ramMax, playerCount, maxPlayers, tickCount,
         *   buildEmbed(isStopped, timedOut), cleanup()
         * }
         */
        this.statsSessions = new Map();
    }

    // ── Console ──────────────────────────────────────────

    getConsole(serverId)          { return this.consoleSessions.get(serverId.toString()); }
    setConsole(serverId, session) { this.consoleSessions.set(serverId.toString(), session); }
    delConsole(serverId)          { this.consoleSessions.delete(serverId.toString()); }
    hasConsole(serverId)          { return this.consoleSessions.has(serverId.toString()); }

    // ── Stats ─────────────────────────────────────────────

    getStats(serverId)          { return this.statsSessions.get(serverId.toString()); }
    setStats(serverId, session) { this.statsSessions.set(serverId.toString(), session); }
    delStats(serverId)          { this.statsSessions.delete(serverId.toString()); }
    hasStats(serverId)          { return this.statsSessions.has(serverId.toString()); }
}

module.exports = new LiveSessionManager();
