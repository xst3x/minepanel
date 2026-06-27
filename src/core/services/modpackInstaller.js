/**
 * Installs Modrinth modpack files (.mrpack / .zip) onto a server directory
 * and orchestrates full modpack server deployment.
 */
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;
const crypto = require('crypto');
const AdmZip = require('adm-zip');
const { downloadFile } = require('./modrinthHttp');
const { resolveTargetVersion, loaderToSoftware, pickMcVersion } = require('./modpackService');
const { resolveJar, downloadJar } = require('../resolvers');
const { SERVERS_DIR, sanitizeDirName, ensureUniqueDirName } = require('../serverHelper');
const { runForgeInstaller, runNeoForgeInstaller } = require('../../routes/modules/serverHelpers');
const processManager = require('../processManager');
const { dbRun } = require('../../db/database');
const logger = require('../utils/logger');

const LOADER_SOFTWARE = new Set(['fabric', 'forge', 'neoforge', 'quilt']);

/**
 * Download and apply a .mrpack index — resolves each file entry and copies overrides.
 */
async function installMrpack(mrpackPath, serverDir) {
    const zip = new AdmZip(mrpackPath);
    const indexEntry = zip.getEntry('modrinth.index.json');
    if (!indexEntry) throw new Error('Invalid .mrpack: missing modrinth.index.json');

    const index = JSON.parse(indexEntry.getData().toString('utf8'));
    const files = index.files || [];

    for (const file of files) {
        const env = file.env || {};
        if (env.server === 'unsupported') continue;

        const destPath = path.join(serverDir, file.path);
        const destDir = path.dirname(destPath);
        await fsp.mkdir(destDir, { recursive: true });

        const url = file.downloads && file.downloads[0];
        if (!url) continue;

        const tempDest = `${destPath}.download`;
        await downloadFile(url, tempDest);
        if (fs.existsSync(destPath)) await fsp.unlink(destPath);
        await fsp.rename(tempDest, destPath);
    }

    // Apply overrides folder (configs, scripts, etc.)
    const overridesPrefix = (index.overrides || 'overrides/').replace(/\\/g, '/');
    for (const entry of zip.getEntries()) {
        const name = entry.entryName.replace(/\\/g, '/');
        if (!name.startsWith(overridesPrefix) || entry.isDirectory) continue;
        const relative = name.slice(overridesPrefix.length);
        if (!relative) continue;

        const destPath = path.join(serverDir, relative);
        await fsp.mkdir(path.dirname(destPath), { recursive: true });
        await fsp.writeFile(destPath, entry.getData());
    }
}

/** Extract a plain server-pack .zip into the server root. */
async function installZipPack(zipPath, serverDir) {
    const zip = new AdmZip(zipPath);
    zip.extractAllTo(serverDir, true);
}

/**
 * Install modpack version files onto an existing server directory.
 */
async function installModpackFiles(versionData, serverDir) {
    const primaryFile = (versionData.files || []).find(f => f.primary) || versionData.files?.[0];
    if (!primaryFile?.url) throw new Error('Modpack version has no downloadable file');

    const ext = path.extname(primaryFile.filename || '').toLowerCase();
    const tempFile = path.join(serverDir, `.modpack-temp${ext || '.mrpack'}`);

    try {
        await downloadFile(primaryFile.url, tempFile);

        if (ext === '.mrpack') {
            await installMrpack(tempFile, serverDir);
        } else if (ext === '.zip') {
            await installZipPack(tempFile, serverDir);
        } else {
            throw new Error(`Unsupported modpack format: ${ext || 'unknown'}`);
        }
    } finally {
        try { if (fs.existsSync(tempFile)) await fsp.unlink(tempFile); } catch (_) {}
    }
}

async function deployBaseServer(software, mcVersion, serverDir, serverId, port) {
    const jarInfo = await resolveJar(software, mcVersion);
    const finalJarInfo = await downloadJar(jarInfo);
    const softwareLower = software.toLowerCase();

    if (softwareLower === 'forge') {
        await runForgeInstaller(finalJarInfo.localPath, serverDir, serverId);
    } else if (softwareLower === 'neoforge') {
        await runNeoForgeInstaller(finalJarInfo.localPath, serverDir, serverId);
    } else {
        const targetJar = path.join(serverDir, 'server.jar');
        await fsp.copyFile(finalJarInfo.localPath, targetJar);
    }

    await fsp.writeFile(path.join(serverDir, 'eula.txt'), 'eula=true\n');
    const propsPath = path.join(serverDir, 'server.properties');
    if (!fs.existsSync(propsPath)) {
        await fsp.writeFile(propsPath, `server-port=${port}\nmotd=${JSON.stringify('A MinePanel Modpack Server')}\n`);
    }
}

/**
 * Create and deploy a new server from a Modrinth modpack.
 */
async function createModpackServer({ name, ram_mb, port, projectId, versionId, userId }) {
    const versionData = await resolveTargetVersion(projectId, { versionId });
    const loaders = (versionData.loaders || []).filter(l => LOADER_SOFTWARE.has(l));
    const software = loaderToSoftware(loaders);

    if (!software) {
        throw new Error(`Unsupported mod loader(s): ${(versionData.loaders || []).join(', ') || 'none'}`);
    }

    const mcVersion = pickMcVersion(versionData);
    if (!mcVersion) throw new Error('Could not determine Minecraft version from modpack');

    const uuid = crypto.randomUUID();
    const dirName = await ensureUniqueDirName(sanitizeDirName(name));
    const serverDir = path.join(SERVERS_DIR, dirName);

    const result = await dbRun(
        'INSERT INTO servers (uuid, name, software, version, ram_mb, port, owner_id, directory_name) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [uuid, name, software, mcVersion, ram_mb, port, userId, dirName]
    );

    const serverId = result.lastID;
    await fsp.mkdir(serverDir, { recursive: true });
    processManager.acquireLock(serverId);

    try {
        // Base loader/server jar first, then modpack content on top.
        await deployBaseServer(software, mcVersion, serverDir, serverId, port);
        await installModpackFiles(versionData, serverDir);

        logger.info(`Modpack server ${serverId} (${dirName}) deployed — ${software} ${mcVersion}, project ${projectId}`);
        return {
            id: serverId,
            uuid,
            directory_name: dirName,
            software,
            version: mcVersion,
            modpack: {
                projectId,
                versionId: versionData.id,
                versionNumber: versionData.version_number,
            },
        };
    } catch (err) {
        try {
            if (fs.existsSync(serverDir)) fs.rmSync(serverDir, { recursive: true, force: true });
        } catch (_) {}
        try {
            await dbRun('DELETE FROM servers WHERE id = ?', [serverId]);
        } catch (_) {}
        throw err;
    } finally {
        processManager.releaseLock(serverId);
    }
}

module.exports = {
    installMrpack,
    installZipPack,
    installModpackFiles,
    createModpackServer,
};
