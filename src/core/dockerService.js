/**
 * DockerService — wraps the Docker socket/HTTP API via dockerode.
 * All Minecraft server containers run itzg/minecraft-server (Java 21 by default).
 *
 * Container naming convention:  minepanel_server_<serverId>
 * Volume naming convention:     minepanel_vol_<serverId>
 *
 * The server directory on the HOST is bind-mounted into /data inside the container.
 * This ensures files are always on the host filesystem — no data loss ever.
 */

const path = require('path');
const fs = require('fs');
const os = require('os');
const logger = require('./utils/logger');

let Docker;
let dockerInstance = null;

function getDockerClass() {
    if (!Docker) {
        try {
            Docker = require('dockerode');
        } catch (e) {
            throw new Error('dockerode is not installed. Run: npm install dockerode');
        }
    }
    return Docker;
}

/**
 * Return a list of connection configs to try, in priority order.
 * On Windows, Docker Desktop exposes several endpoints — we try all of them.
 */
function getConnectionCandidates() {
    if (process.platform === 'win32') {
        return [
            // Docker Desktop default named pipe (correct Win32 UNC path for dockerode)
            { socketPath: '\\\\.\\pipe\\docker_engine' },
            // Docker Desktop may also expose a second pipe
            { socketPath: '\\\\.\\pipe\\dockerDesktopLinuxEngine' },
            // Docker Desktop WSL2 backend pipe variant
            { socketPath: '\\\\.\\pipe\\docker_engine_windows' },
            // Docker Desktop TCP endpoint (must be enabled: Settings > General > Expose daemon on tcp://localhost:2375)
            { host: '127.0.0.1', port: 2375, protocol: 'http' },
            { host: 'localhost',  port: 2375, protocol: 'http' },
            // Docker Desktop sometimes uses 2376 for TLS
            { host: '127.0.0.1', port: 2376, protocol: 'https' },
        ];
    }
    return [
        { socketPath: '/var/run/docker.sock' },
        { socketPath: '/run/docker.sock' },
        { host: '127.0.0.1', port: 2375, protocol: 'http' },
    ];
}

/**
 * Try each candidate connection and return the first Docker instance
 * that successfully responds to a ping.
 * Caches the working instance for subsequent calls.
 */
async function resolveDocker() {
    if (dockerInstance) return dockerInstance;
    const DockerClass = getDockerClass();
    const candidates = getConnectionCandidates();
    const errors = [];

    for (const cfg of candidates) {
        try {
            const d = new DockerClass(cfg);
            await d.ping();
            logger.info(`[DockerService] Connected via: ${JSON.stringify(cfg)}`);
            dockerInstance = d;
            return dockerInstance;
        } catch (e) {
            errors.push(`${JSON.stringify(cfg)}: ${e.message}`);
        }
    }

    const msg = `Docker daemon not reachable. Tried:\n  ${errors.join('\n  ')}`;
    logger.warn(`[DockerService] ${msg}`);
    throw new Error(msg);
}

/**
 * Synchronous getter — only safe after resolveDocker() has been called.
 * Falls back to the first candidate for non-ping operations (they'll
 * fail on their own if Docker is genuinely unavailable).
 */
function getDocker() {
    if (dockerInstance) return dockerInstance;
    // Not yet resolved — create with first candidate so callers get a usable object
    // (they'll get a real error from the operation itself if Docker is down)
    const DockerClass = getDockerClass();
    const [first] = getConnectionCandidates();
    return new DockerClass(first);
}

/**
 * Ping Docker daemon. Returns true if available, false otherwise.
 * Always uses the auto-discovery path so it finds the right endpoint.
 */
async function pingDocker() {
    try {
        await resolveDocker();
        return true;
    } catch (e) {
        return false;
    }
}

/**
 * Derive a safe container name from a server id.
 */
function containerName(serverId) {
    return `minepanel_server_${serverId}`;
}

/**
 * Ensure a Docker image is present locally, pulling it if not.
 * Streams pull progress to the logger so you can see download status.
 * @param {string} image — full image reference e.g. 'itzg/minecraft-server:java21'
 */
async function ensureImage(image) {
    const docker = await resolveDocker();

    // Check if image already exists locally
    try {
        await docker.getImage(image).inspect();
        logger.info(`[DockerService] Image already present: ${image}`);
        return; // already have it
    } catch (e) {
        if (e.statusCode !== 404) throw e; // unexpected error
    }

    // Image not found locally — pull it
    logger.info(`[DockerService] Pulling image: ${image} (this may take a few minutes…)`);
    await new Promise((resolve, reject) => {
        docker.pull(image, (err, stream) => {
            if (err) return reject(err);
            // Log each progress event so users/logs can see download progress
            docker.modem.followProgress(stream, (pullErr, output) => {
                if (pullErr) return reject(pullErr);
                logger.info(`[DockerService] Pull complete: ${image}`);
                resolve(output);
            }, (event) => {
                if (event.status && event.progress) {
                    logger.info(`[DockerService] Pull ${image}: ${event.status} ${event.progress}`);
                } else if (event.status) {
                    logger.info(`[DockerService] Pull ${image}: ${event.status}`);
                }
            });
        });
    });
}

/**
 * Create (but do NOT start) a Docker container for a Minecraft server.
 * The host serverDir is bind-mounted into /data inside the container.
 *
 * @param {object} server  — row from servers table
 * @param {string} serverDir — absolute path to the server files on the host
 */
async function createContainer(server, serverDir) {
    const docker = await resolveDocker();
    const name = containerName(server.id);

    // Pull image if not already present locally (first migration will download it)
    const image = 'itzg/minecraft-server:java21';
    await ensureImage(image);

    // Remove stale container if it exists
    await removeContainer(server.id, { force: true, silent: true });

    // CPU quota: Docker uses cpu_period (100000µs) and cpu_quota.
    // We allow each server up to 2 cores worth of CPU by default.
    // Adjust if server has a cpu_limit field; fall back to 2 cores.
    const cpuCores = server.cpu_limit || 2;
    const cpuPeriod = 100000;
    const cpuQuota = Math.round(cpuCores * cpuPeriod);

    // Memory in bytes from ram_mb
    const memBytes = (server.ram_mb || 2048) * 1024 * 1024;

    // Normalize the host path to use forward slashes for Docker on Windows
    const hostPath = serverDir.replace(/\\/g, '/');

    // Detect voicechat UDP port from plugin config if present
    let voicechatPort = null;
    try {
        const vcConfig = path.join(serverDir, 'plugins', 'voicechat', 'voicechat-server.properties');
        if (fs.existsSync(vcConfig)) {
            const vcContent = fs.readFileSync(vcConfig, 'utf8');
            const match = vcContent.match(/^port=(-?\d+)/m);
            if (match) {
                const p = parseInt(match[1]);
                // -1 means use same port as MC server (not recommended but handle it)
                voicechatPort = p === -1 ? server.port : p;
            }
        }
    } catch (_) {}

    const mcPort = server.port || 25565;

    const exposedPorts = {
        [`${mcPort}/tcp`]: {},
        [`${mcPort}/udp`]: {},
    };
    const portBindings = {
        [`${mcPort}/tcp`]: [{ HostPort: String(mcPort) }],
        [`${mcPort}/udp`]: [{ HostPort: String(mcPort) }],
    };
    if (voicechatPort && voicechatPort !== mcPort) {
        exposedPorts[`${voicechatPort}/udp`] = {};
        portBindings[`${voicechatPort}/udp`] = [{ HostPort: String(voicechatPort) }];
    }

    const containerConfig = {
        name,
        Image: image,
        Env: [
            'EULA=TRUE',
            `MEMORY=${server.ram_mb || 2048}M`,
            'TYPE=CUSTOM',
            'CUSTOM_SERVER=/data/server.jar',
            `SERVER_PORT=${mcPort}`,
            'SKIP_SERVER_PROPERTIES=false',
            'OVERRIDE_SERVER_PROPERTIES=false',
            'ENABLE_AUTOPAUSE=false',
            'ENABLE_ROLLING_LOGS=false',
        ],
        ExposedPorts: exposedPorts,
        HostConfig: {
            Binds: [`${hostPath}:/data`],
            PortBindings: portBindings,
            Memory: memBytes,
            MemorySwap: memBytes * 2,
            CpuPeriod: cpuPeriod,
            CpuQuota: cpuQuota,
            RestartPolicy: { Name: 'no' },
            NetworkMode: 'bridge',
        },
        Labels: {
            'minepanel.managed': 'true',
            'minepanel.server_id': String(server.id),
        },
        AttachStdin: true,
        AttachStdout: false,
        AttachStderr: false,
        OpenStdin: true,
        StdinOnce: false,
        Tty: false,
    };

    logger.info(`[DockerService] Creating container: ${name}`);
    const container = await docker.createContainer(containerConfig);
    logger.info(`[DockerService] Container created: ${container.id}`);
    return { containerId: container.id, containerName: name };
}

/**
 * Start a container by server id.
 */
async function startContainer(serverId) {
    const docker = await resolveDocker();
    const name = containerName(serverId);
    const container = docker.getContainer(name);
    logger.info(`[DockerService] Starting container: ${name}`);
    await container.start();
    logger.info(`[DockerService] Container started: ${name}`);
}

/**
 * Stop a container gracefully (sends SIGTERM, waits up to timeoutSecs).
 */
async function stopContainer(serverId, timeoutSecs = 30) {
    const docker = await resolveDocker();
    const name = containerName(serverId);
    try {
        const container = docker.getContainer(name);
        const info = await container.inspect().catch(() => null);
        if (!info) {
            logger.info(`[DockerService] Container ${name} not found, skip stop.`);
            return;
        }
        if (!info.State.Running) {
            logger.info(`[DockerService] Container ${name} already stopped.`);
            return;
        }
        logger.info(`[DockerService] Stopping container: ${name}`);
        await container.stop({ t: timeoutSecs });
        logger.info(`[DockerService] Container stopped: ${name}`);
    } catch (e) {
        // 304 = not modified (already stopped), 404 = not found — both fine
        if (e.statusCode !== 304 && e.statusCode !== 404) {
            logger.warn(`[DockerService] stopContainer error for ${name}: ${e.message}`);
        }
    }
}

/**
 * Remove a container. Pass { force: true } to remove even if running.
 */
async function removeContainer(serverId, opts = {}) {
    const docker = await resolveDocker();
    const name = containerName(serverId);
    try {
        const container = docker.getContainer(name);
        await container.remove({ force: !!opts.force });
        logger.info(`[DockerService] Container removed: ${name}`);
    } catch (e) {
        if (e.statusCode !== 404) {
            if (!opts.silent) {
                logger.warn(`[DockerService] removeContainer error for ${name}: ${e.message}`);
            }
        }
    }
}

/**
 * Get container status for a server.
 * Returns 'running', 'stopped', 'notfound', or 'error'.
 */
async function getContainerStatus(serverId) {
    const docker = await resolveDocker();
    const name = containerName(serverId);
    try {
        const container = docker.getContainer(name);
        const info = await container.inspect();
        if (info.State.Running) return 'running';
        if (info.State.Paused) return 'paused';
        return 'stopped';
    } catch (e) {
        if (e.statusCode === 404) return 'notfound';
        return 'error';
    }
}

/**
 * Attach live log stream from a container and forward lines to onData().
 *
 * Strategy:
 *   1. Try container.attach() — real-time, zero latency (preferred)
 *   2. Fall back to container.logs({follow:true}) if attach fails
 *
 * Both APIs return a multiplexed Docker stream that must be demuxed with
 * PassThrough streams (passing plain objects to demuxStream silently breaks on Windows).
 *
 * Returns a handle with a destroy() method.
 */
async function attachLogs(serverId, onData) {
    const { PassThrough } = require('stream');
    const docker = await resolveDocker();
    const name = containerName(serverId);
    let destroyed = false;

    const handle = {
        _stream: null,
        destroy() {
            destroyed = true;
            if (this._stream) {
                try { this._stream.destroy(); } catch (_) {}
                this._stream = null;
            }
        },
    };

    function wireStream(stream) {
        handle._stream = stream;
        const stdout = new PassThrough();
        const stderr = new PassThrough();
        docker.modem.demuxStream(stream, stdout, stderr);

        let buf = '';
        function flush(chunk) {
            if (destroyed) return;
            buf += chunk.toString('utf8');
            const lines = buf.split('\n');
            buf = lines.pop(); // keep partial last line
            for (const line of lines) {
                try { onData(line + '\n'); } catch (_) {}
            }
        }

        stdout.on('data', flush);
        stderr.on('data', flush);
        stream.on('end', () => {
            if (buf) { try { onData(buf + '\n'); } catch (_) {} buf = ''; }
        });
        stream.on('error', (e) => {
            logger.warn(`[DockerService] log stream error for ${name}: ${e.message}`);
        });
    }

    const container = docker.getContainer(name);

    // Attempt 1: attach (real-time, zero-lag)
    try {
        const stream = await new Promise((resolve, reject) => {
            container.attach(
                { stream: true, stdout: true, stderr: true, stdin: false },
                (err, s) => { if (err) return reject(err); resolve(s); }
            );
        });
        wireStream(stream);
        logger.info(`[DockerService] Log stream attached (attach) for: ${name}`);
        return handle;
    } catch (e) {
        logger.warn(`[DockerService] attach() failed for ${name}: ${e.message} — trying logs()`);
    }

    // Attempt 2: logs with follow (slightly lagged but always works)
    try {
        const stream = await new Promise((resolve, reject) => {
            container.logs(
                { follow: true, stdout: true, stderr: true, tail: 200 },
                (err, s) => { if (err) return reject(err); resolve(s); }
            );
        });
        wireStream(stream);
        logger.info(`[DockerService] Log stream attached (logs) for: ${name}`);
        return handle;
    } catch (e) {
        logger.warn(`[DockerService] logs() also failed for ${name}: ${e.message}`);
    }

    return handle; // no stream but handle is safe to call destroy() on
}

/**
 * Fetch the last N lines from a container's logs as a single string.
 * Used to restore console history after a panel restart.
 */
async function getLogsTail(serverId, lines = 200) {
    const docker = await resolveDocker();
    const name = containerName(serverId);
    try {
        const container = docker.getContainer(name);
        const stream = await new Promise((resolve, reject) => {
            container.logs(
                { follow: false, stdout: true, stderr: true, tail: lines },
                (err, s) => { if (err) return reject(err); resolve(s); }
            );
        });

        // Collect the full buffer then demux
        const chunks = [];
        await new Promise((resolve) => {
            stream.on('data', (chunk) => chunks.push(chunk));
            stream.on('end', resolve);
            stream.on('error', resolve);
        });

        const raw = Buffer.concat(chunks);

        // Demux manually: each frame is 8 bytes header + payload
        // Header: [stream_type(1), 0, 0, 0, size(4 BE)]
        let output = '';
        let i = 0;
        while (i + 8 <= raw.length) {
            const size = raw.readUInt32BE(i + 4);
            if (size > 0 && i + 8 + size <= raw.length) {
                output += raw.slice(i + 8, i + 8 + size).toString('utf8');
            }
            i += 8 + size;
        }
        // Fallback: if demux produced nothing, treat raw as plain text
        if (!output && raw.length > 0) {
            output = raw.toString('utf8');
        }
        return output || null;
    } catch (e) {
        logger.warn(`[DockerService] getLogsTail error for ${name}: ${e.message}`);
        return null;
    }
}

/**
 * Send a command to the Minecraft server's stdin inside the container.
 *
 * The correct approach for containers created with OpenStdin:true is to
 * attach a stdin stream and write to it — identical to child.stdin.write()
 * in native mode.  The /proc/1/fd/0 exec trick does NOT work reliably
 * because the Java process stdin is a blocking pipe and exec cannot write to it.
 */
async function sendStdin(serverId, cmd) {
    const docker = await resolveDocker();
    const name = containerName(serverId);
    const container = docker.getContainer(name);

    // Attach with stdin=true, stdout/stderr=false — we only need the write end
    const stream = await new Promise((resolve, reject) => {
        container.attach(
            { stream: true, stdin: true, stdout: false, stderr: false, hijack: true },
            (err, s) => { if (err) return reject(err); resolve(s); }
        );
    });

    // Write the command followed by a newline (just like pressing Enter)
    await new Promise((resolve, reject) => {
        stream.write(cmd + '\n', 'utf8', (err) => {
            stream.end();
            if (err) return reject(err);
            resolve();
        });
    });

    logger.info(`[DockerService] sendStdin → ${name}: ${cmd}`);
}

/**
 * @deprecated Use sendStdin instead â€” rcon-cli is not available in all containers.
 */
async function execInContainer(serverId, cmd) {
    return sendStdin(serverId, cmd);
}

/**
 * Get CPU & memory stats for a running container.
 * Returns { cpu, ram } similar to ProcessManager.getStats().
 */
async function getContainerStats(serverId) {
    const docker = await resolveDocker();
    const name = containerName(serverId);
    try {
        const container = docker.getContainer(name);
        const stats = await container.stats({ stream: false });
        // CPU calculation
        const cpuDelta = stats.cpu_stats.cpu_usage.total_usage - stats.precpu_stats.cpu_usage.total_usage;
        const systemDelta = stats.cpu_stats.system_cpu_usage - stats.precpu_stats.system_cpu_usage;
        const numCpus = stats.cpu_stats.online_cpus || os.cpus().length;
        const cpuPercent = systemDelta > 0 ? (cpuDelta / systemDelta) * numCpus * 100 : 0;
        const ram = stats.memory_stats.usage || 0;
        return { cpu: Math.round(cpuPercent * 10) / 10, ram };
    } catch (e) {
        return { cpu: 0, ram: 0 };
    }
}

module.exports = {
    pingDocker,
    containerName,
    createContainer,
    startContainer,
    stopContainer,
    removeContainer,
    getContainerStatus,
    attachLogs,
    getLogsTail,
    sendStdin,
    execInContainer,
    getContainerStats,
    // Reset the cached connection (e.g. after Docker Desktop restarts)
    resetConnection: () => { dockerInstance = null; },
};
