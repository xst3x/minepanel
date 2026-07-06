/**
 * Slash command registration for Discord bots.
 * Extracted from discordManager.js — single responsibility.
 */
import { REST, Routes } from 'discord.js'
import commands = require('./commands')
import logger = require('../utils/logger')

/**
 * Register all slash commands for a bot's guild.
 * @param {string} token Bot token
 * @param {string} clientId Discord client/user ID
 * @param {string} guildId Target guild ID
 */
async function registerCommands(token, clientId, guildId) {
    const rest = new REST({ version: '10' }).setToken(token);
    const commandData = commands.map((cmd: any) => cmd.data.toJSON());
    await rest.put(
        Routes.applicationGuildCommands(clientId, guildId),
        { body: commandData }
    );
    logger.info(`[Discord] Registered ${commandData.length} slash commands for guild ${guildId}`);
}

export = { registerCommands };
