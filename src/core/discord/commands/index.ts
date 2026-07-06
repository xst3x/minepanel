/**
 * Discord slash command registry.
 * Loads all command files from this directory and exports them as a Collection.
 */
import { Collection } from 'discord.js'
import path = require('path')
import fs = require('fs')

const commands = new Collection();

const commandFiles = fs.readdirSync(__dirname)
    .filter(file => file.endsWith('.js') && file !== 'index.js');

for (const file of commandFiles) {
    const command = require(path.join(__dirname, file));
    if (command.data && command.execute) {
        commands.set(command.data.name, command);
    }
}

export = commands;
