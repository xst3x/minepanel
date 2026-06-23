/**
 * Shared mutable state for Discord modules.
 * All discord/* modules import this to share clients and integrationMap.
 * @type {{ clients: Map<string, import('discord.js').Client>, integrationMap: Map<string, object> }}
 */
const clients = new Map();
const integrationMap = new Map();

module.exports = { clients, integrationMap };
