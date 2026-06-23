/**
 * Slash command registration for Discord bots.
 * Extracted from discordManager.js — single responsibility.
 */
const { REST, Routes } = require('discord.js');
const commands = require('./commands');
const logger = require('../utils/logger');

/**
 * Register all slash commands for a bot's guild.
 * @param {string} token Bot token
 * @param {string} clientId Discord client/user ID
 * @param {string} guildId Target guild ID
 */
async function registerCommands(token, clientId, guildId) {
    const rest = new REST({ version: '10' }).setToken(token);
    const commandData = commands.map(cmd => cmd.data.toJSON());
    await rest.put(
        Routes.applicationGuildCommands(clientId, guildId),
        { body: commandData }
    );
    logger.info(`[Discord] Registered ${commandData.length} slash commands for guild ${guildId}`);
}

module.exports = { registerCommands };
