/**
 * bedrock/index.js
 * ─────────────────
 * Public entry point for all Bedrock server resolvers.
 *
 * Exports:
 *   getAll()   → Promise<object[]>   — all five resolvers in parallel
 *   bedrock    — vanilla BDS resolver   (.getLatestVersion())
 *   pocketmine — PocketMine-MP          (.getLatestRelease())
 *   nukkit     — NukkitX                (.getLatestRelease())
 *   powerNukkit— PowerNukkitX           (.getLatestRelease())
 *   waterdog   — WaterdogPE             (.getLatestRelease())
 */

'use strict';

const bedrock     = require('./Bedrock');
const pocketmine  = require('./PocketMine');
const nukkit      = require('./Nukkit');
const powerNukkit = require('./PowerNukkit');
const waterdog    = require('./Waterdog');

/**
 * Fetch all Bedrock resolver results in parallel.
 * Individual failures resolve to null so one bad source never blocks the rest.
 *
 * Returns an array of five entries (in stable order):
 *   [ bedrockResult, pocketmineResult, nukkitResult, powerNukkitResult, waterdogResult ]
 *
 * Each entry is either the resolver's output object, or null on failure.
 */
async function getAll() {
    const [
        bedrockResult,
        pocketmineResult,
        nukkitResult,
        powerNukkitResult,
        waterdogResult,
    ] = await Promise.all([
        bedrock.getLatestVersion().catch(e => {
            console.warn('[bedrock/index] Bedrock (vanilla) failed:', e.message);
            return null;
        }),
        pocketmine.getLatestRelease().catch(e => {
            console.warn('[bedrock/index] PocketMine failed:', e.message);
            return null;
        }),
        nukkit.getLatestRelease().catch(e => {
            console.warn('[bedrock/index] NukkitX failed:', e.message);
            return null;
        }),
        powerNukkit.getLatestRelease().catch(e => {
            console.warn('[bedrock/index] PowerNukkitX failed:', e.message);
            return null;
        }),
        waterdog.getLatestRelease().catch(e => {
            console.warn('[bedrock/index] WaterdogPE failed:', e.message);
            return null;
        }),
    ]);

    return [
        bedrockResult,
        pocketmineResult,
        nukkitResult,
        powerNukkitResult,
        waterdogResult,
    ];
}

module.exports = {
    getAll,
    // Named exports for callers that only need one resolver
    bedrock,
    pocketmine,
    nukkit,
    powerNukkit,
    waterdog,
};
