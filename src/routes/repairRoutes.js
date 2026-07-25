"use strict";
const express = require("express");
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const authModule = require("../core/auth");
const { authenticateToken } = authModule;
const permissionsModule = require("../core/permissions");
const { checkPermission } = permissionsModule;
const errorsModule = require("../core/errors");
const { E, sendError } = errorsModule;
const logger = require("../core/utils/logger");
const processManager = require("../core/processManager");
const { getServer, getServerDir } = require('../core/serverHelper');
const serverHelpersModule = require("./modules/serverHelpers");
const { getStartInfo } = serverHelpersModule;
const resolversModule = require("../core/resolvers");
const router = express.Router({ mergeParams: true });
router.post('/:serverId/repair', authenticateToken, checkPermission('server.settings.write'), async (req, res) => {
    const serverId = req.params.serverId;
    const userId = req.user?.id;
    const actions = req.body.actions || [];
    const dryRun = !!req.body.dryRun;
    try {
        const server = await getServer(serverId);
        if (!server)
            return sendError(res, E.SERVER_NOT_FOUND, 404);
        // Verify server is offline
        if (processManager.isActive(serverId.toString())) {
            return sendError(res, E.SERVER_ALREADY_RUNNING, 400, 'Server must be stopped before performing repairs.');
        }
        const serverDir = getServerDir(server);
        const logs = [];
        const rollbacks = [];
        const cleanups = [];
        try {
            // 1. Action: libraries
            if (actions.includes('libraries')) {
                const libPath = path.join(serverDir, 'libraries');
                if (fs.existsSync(libPath)) {
                    if (dryRun) {
                        logs.push({ action: 'libraries', status: 'preview', message: 'Would delete the libraries/ directory.' });
                    }
                    else {
                        const bakPath = path.join(serverDir, 'libraries.repair_bak');
                        await fsp.rename(libPath, bakPath);
                        rollbacks.push(async () => {
                            if (fs.existsSync(bakPath)) {
                                if (fs.existsSync(libPath)) {
                                    await fsp.rm(libPath, { recursive: true, force: true });
                                }
                                await fsp.rename(bakPath, libPath);
                            }
                        });
                        cleanups.push(async () => {
                            if (fs.existsSync(bakPath)) {
                                await fsp.rm(bakPath, { recursive: true, force: true });
                            }
                        });
                        logs.push({ action: 'libraries', status: 'success', message: 'Cleared libraries/ directory.' });
                    }
                }
                else {
                    logs.push({ action: 'libraries', status: 'skipped', message: 'No libraries/ directory found.' });
                }
            }
            // 2. Action: cache
            if (actions.includes('cache')) {
                const cacheDirs = ['cache', '.runtime', '.mixin.out', 'logs'];
                for (const cName of cacheDirs) {
                    const cPath = path.join(serverDir, cName);
                    if (fs.existsSync(cPath)) {
                        if (dryRun) {
                            logs.push({ action: 'cache', status: 'preview', message: `Would delete the ${cName}/ directory.` });
                        }
                        else {
                            const bakPath = path.join(serverDir, `${cName}.repair_bak`);
                            await fsp.rename(cPath, bakPath);
                            rollbacks.push(async () => {
                                if (fs.existsSync(bakPath)) {
                                    if (fs.existsSync(cPath)) {
                                        await fsp.rm(cPath, { recursive: true, force: true });
                                    }
                                    await fsp.rename(bakPath, cPath);
                                }
                            });
                            cleanups.push(async () => {
                                if (fs.existsSync(bakPath)) {
                                    await fsp.rm(bakPath, { recursive: true, force: true });
                                }
                            });
                            logs.push({ action: 'cache', status: 'success', message: `Cleared ${cName}/ directory.` });
                        }
                    }
                }
            }
            // 3. Action: params
            if (actions.includes('params')) {
                if (server.custom_start_command) {
                    if (dryRun) {
                        logs.push({ action: 'params', status: 'preview', message: 'Would reset custom launch parameters.' });
                    }
                    else {
                        const originalCommand = server.custom_start_command;
                        server.custom_start_command = null;
                        await server.save();
                        rollbacks.push(async () => {
                            server.custom_start_command = originalCommand;
                            await server.save();
                        });
                        logs.push({ action: 'params', status: 'success', message: 'Reset custom launch parameters.' });
                    }
                }
                else {
                    logs.push({ action: 'params', status: 'skipped', message: 'No custom launch command configured.' });
                }
            }
            // 4. Action: properties
            if (actions.includes('properties')) {
                const propPath = path.join(serverDir, 'server.properties');
                if (fs.existsSync(propPath)) {
                    if (dryRun) {
                        logs.push({ action: 'properties', status: 'preview', message: 'Would validate and repair server.properties values.' });
                    }
                    else {
                        const originalProps = await fsp.readFile(propPath, 'utf8');
                        rollbacks.push(async () => {
                            await fsp.writeFile(propPath, originalProps, 'utf8');
                        });
                        const lines = originalProps.split('\n');
                        const propMap = new Map();
                        for (const line of lines) {
                            const trimmed = line.trim();
                            if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
                                const idx = trimmed.indexOf('=');
                                const key = trimmed.substring(0, idx).trim();
                                const val = trimmed.substring(idx + 1).trim();
                                propMap.set(key, val);
                            }
                        }
                        // Align ports
                        propMap.set('server-port', String(server.port));
                        if (propMap.has('query.port'))
                            propMap.set('query.port', String(server.port));
                        if (propMap.has('rcon.port'))
                            propMap.set('rcon.port', String(server.port + 10));
                        // Build updated properties
                        let output = '';
                        // Keep header comment if possible, otherwise write new
                        output += '# repaired by MinePanel\n';
                        for (const [k, v] of propMap.entries()) {
                            output += `${k}=${v}\n`;
                        }
                        await fsp.writeFile(propPath, output, 'utf8');
                        logs.push({ action: 'properties', status: 'success', message: 'Repaired server.properties port settings.' });
                    }
                }
                else {
                    logs.push({ action: 'properties', status: 'skipped', message: 'server.properties not found.' });
                }
            }
            // 5. Action: startup
            if (actions.includes('startup')) {
                if (dryRun) {
                    logs.push({ action: 'startup', status: 'preview', message: 'Would recreate default configuration and EULA files if missing.' });
                }
                else {
                    // EULA
                    const eulaPath = path.join(serverDir, 'eula.txt');
                    let createdEula = false;
                    if (!fs.existsSync(eulaPath)) {
                        await fsp.writeFile(eulaPath, 'eula=true\n', 'utf8');
                        createdEula = true;
                        rollbacks.push(async () => {
                            if (createdEula && fs.existsSync(eulaPath)) {
                                await fsp.unlink(eulaPath);
                            }
                        });
                    }
                    // Properties
                    const propPath = path.join(serverDir, 'server.properties');
                    let createdProps = false;
                    if (!fs.existsSync(propPath)) {
                        const defaultProps = `server-port=${server.port}\nlevel-name=world\nonline-mode=true\nview-distance=10\n`;
                        await fsp.writeFile(propPath, defaultProps, 'utf8');
                        createdProps = true;
                        rollbacks.push(async () => {
                            if (createdProps && fs.existsSync(propPath)) {
                                await fsp.unlink(propPath);
                            }
                        });
                    }
                    logs.push({ action: 'startup', status: 'success', message: 'Ensured default config and eula files exist.' });
                }
            }
            // 6. Action: redownload
            if (actions.includes('redownload')) {
                if (dryRun) {
                    logs.push({ action: 'redownload', status: 'preview', message: `Would resolve and re-download ${server.software} (${server.version}) server executable.` });
                }
                else {
                    const startInfo = getStartInfo(server);
                    const jarFile = startInfo.jarFile;
                    const resolved = await resolversModule.resolveJar(server.software, server.version);
                    if (!resolved || !resolved.url) {
                        throw new Error(`Failed to resolve download URL for ${server.software} (${server.version}).`);
                    }
                    const downloaded = await resolversModule.downloadJar(resolved);
                    if (!downloaded || !downloaded.localPath) {
                        throw new Error('Failed to download server binary executable.');
                    }
                    let fileCreated = false;
                    const destPath = jarFile;
                    if (fs.existsSync(destPath)) {
                        const bakDestPath = `${destPath}.repair_bak`;
                        await fsp.rename(destPath, bakDestPath);
                        rollbacks.push(async () => {
                            if (fs.existsSync(bakDestPath)) {
                                if (fs.existsSync(destPath)) {
                                    await fsp.unlink(destPath);
                                }
                                await fsp.rename(bakDestPath, destPath);
                            }
                        });
                        cleanups.push(async () => {
                            if (fs.existsSync(bakDestPath)) {
                                await fsp.unlink(bakDestPath);
                            }
                        });
                    }
                    else {
                        fileCreated = true;
                        rollbacks.push(async () => {
                            if (fileCreated && fs.existsSync(destPath)) {
                                await fsp.unlink(destPath);
                            }
                        });
                    }
                    await fsp.copyFile(downloaded.localPath, destPath);
                    logs.push({ action: 'redownload', status: 'success', message: 'Re-downloaded and replaced server executable binary.' });
                }
            }
            // Execute cleanups on success
            if (!dryRun) {
                for (const cleanup of cleanups) {
                    try {
                        await cleanup();
                    }
                    catch (_) { }
                }
            }
            res.json({ success: true, dryRun, logs });
        }
        catch (err) {
            // Trigger rollbacks on failure
            logger.error(`[repairRoutes] Error during repairs for server ${serverId}:`, err);
            if (!dryRun) {
                for (const rollback of rollbacks) {
                    try {
                        await rollback();
                    }
                    catch (_) { }
                }
            }
            throw err;
        }
    }
    catch (e) {
        logger.error(`[repairRoutes] Repair server error (User: ${userId}, Server: ${serverId}):`, e);
        return sendError(res, E.INTERNAL_ERROR, 500, e.message || null);
    }
});
module.exports = router;
//# sourceMappingURL=repairRoutes.js.map