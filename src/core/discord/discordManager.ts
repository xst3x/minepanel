/**
 * Discord Bot Manager — thin wrapper that re-exports all Discord functionality
 * from modular sub-modules. Keeps the exact same API for backwards compatibility.
 *
 * This file intentionally contains NO business logic. All logic lives in:
 *   - state.js              — shared state (clients, integrationMap)
 *   - client-lifecycle.js   — startAll, startBot, stopBot, destroyAll
 *   - provisioner.js        — provisionIfNeeded
 *   - crud.js               — validateToken, createBot, updateBot, deleteBot, toggleBot, reprovisionServer
 *   - bot-queries.js        — listBots, getBot
 *   - interactions.js       — handleInteraction, handleButton, checkRole, findServerMatch, buildServerListString
 *   - command-registrar.js  — registerCommands
 *   - legacy-api.js         — getStatusForServer, getStatus, connect, disconnect, toggleEnabled, reprovision
 */

const lifecycle = require('./client-lifecycle')
import provisioner = require('./provisioner')
import crud = require('./crud')
import queries = require('./bot-queries')
import interactions = require('./interactions')
import registrar = require('./command-registrar')
import legacy = require('./legacy-api')

// Merge all modules into a single object that preserves the original API
const discordManager = {
    ...lifecycle,
    ...provisioner,
    ...crud,
    ...queries,
    ...interactions,
    ...registrar,
    ...legacy
};

export = discordManager;
