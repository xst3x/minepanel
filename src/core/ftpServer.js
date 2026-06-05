// src/core/ftpServer.js
// Per-server SFTP (SSH File Transfer Protocol) using the ssh2 library.
// Each server gets its own SFTP daemon on its configured port.
// Credentials are stored hashed (bcrypt) in the DB; plaintext is cached in memory
// during the current session so the "Show password" button works after Save & Apply.

'use strict';

const ssh2     = require('ssh2');
const fs       = require('fs');
const fsp      = fs.promises;
const path     = require('path');
const crypto   = require('crypto');
const bcrypt   = require('bcryptjs');
const os       = require('os');
const { dbGet, dbRun } = require('../db/database');
const { getServerDir } = require('./serverHelper');
const logger = require('./utils/logger');

// ── Password cache (pentru show password feature) ──────────────────────────────
const passwordCache = new Map(); // serverId → plaintext password

function storePasswordCache(serverId, password) {
    const key = String(serverId);
    passwordCache.set(key, password);
    // Auto-clear after 1 hour. Keeping plaintext in memory longer than needed
    // increases exposure if a crash dump or heap inspection occurs.
    setTimeout(() => {
        passwordCache.delete(key);
        logger.info(`[SFTP] Password cache cleared for server ${serverId}`);
    }, 60 * 60 * 1000); // 1 hour
}

function getPasswordCache(serverId) {
    return passwordCache.get(String(serverId)) || null;
}

// ── In-memory state ───────────────────────────────────────────────────────────
// serverId (string) → { server: ssh2.Server, port: number }
const runningServers = new Map();

// ── Host key (auto-generated once per process, kept in memory) ────────────────
let HOST_KEY = null;
function getHostKey() {
    if (HOST_KEY) return HOST_KEY;
    // Try to load from data dir so the key survives restarts (avoids host-key warnings)
    const keyPath = path.join(__dirname, '../../data/sftp_host_key');
    try {
        if (fs.existsSync(keyPath)) {
            const candidate = fs.readFileSync(keyPath);
            // Validate that it's a usable key (pkcs1 PEM); skip if old/invalid format
            if (candidate.length > 0 && candidate.toString().includes('RSA PRIVATE KEY')) {
                HOST_KEY = candidate;
                return HOST_KEY;
            }
            // Old key exists but wrong format — delete and regenerate
            try { fs.unlinkSync(keyPath); } catch (_) {}
        }
    } catch (_) {}
    // Generate a new RSA key pair (ssh2 requires openssh or pkcs1/pem format, NOT pkcs8)
    const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    HOST_KEY = privateKey.export({ type: 'pkcs1', format: 'pem' });
    try {
        fs.mkdirSync(path.dirname(keyPath), { recursive: true });
        fs.writeFileSync(keyPath, HOST_KEY, { mode: 0o600 });
    } catch (_) {}
    return HOST_KEY;
}

// ── SFTP session handler ──────────────────────────────────────────────────────
// ── SFTP session handler ──────────────────────────────────────────────────────
function createSftpSession(root) {
    // We use the built-in SFTPStream from ssh2
    return (accept) => {
        const sftp = accept();

        // Normalise a client path to an absolute FS path and prevent path traversal
        const resolvePath = (clientPath) => {
            // clientPath comes in as POSIX (forward slashes)
            const rel = clientPath.startsWith('/') ? clientPath.slice(1) : clientPath;
            const resolved = path.resolve(root, rel);
            const relative = path.relative(root, resolved);
            if (relative.startsWith('..') || path.isAbsolute(relative)) {
                throw new Error('Access denied: path outside server directory');
            }
            return resolved;
        };

        const handles = new Map(); // handle (Buffer) → { fd?, dirHandle? }
        let nextHandle = 0;

        function newHandle(obj) {
            const h = Buffer.alloc(4);
            h.writeUInt32BE(++nextHandle, 0);
            handles.set(nextHandle, obj);
            return h;
        }

        // ── OPEN ──────────────────────────────────────────────────────────────
        sftp.on('OPEN', (reqId, filename, flags, attrs) => {
            let fpath;
            try {
                fpath = resolvePath(filename);
            } catch (err) {
                return sftp.status(reqId, ssh2.utils.sftp.STATUS_CODE.PERMISSION_DENIED);
            }

            // Convert SFTP flags to fs flags
            let fsFlags = 'r';
            const O = ssh2.utils.sftp.OPEN_MODE;
            if (flags & O.WRITE) {
                if (flags & O.CREAT) {
                    fsFlags = (flags & O.TRUNC) ? 'w' : 'a';
                } else {
                    fsFlags = 'r+';
                }
            }
            fs.open(fpath, fsFlags, attrs.mode || 0o644, (err, fd) => {
                if (err) return sftp.status(reqId, statusCode(err));
                sftp.handle(reqId, newHandle({ fd, path: fpath }));
            });
        });

        // ── READ ──────────────────────────────────────────────────────────────
        sftp.on('READ', (reqId, handle, offset, length) => {
            const hId = handle.readUInt32BE(0);
            const obj = handles.get(hId);
            if (!obj || obj.fd === undefined) return sftp.status(reqId, ssh2.utils.sftp.STATUS_CODE.FAILURE);
            const buf = Buffer.alloc(length);
            fs.read(obj.fd, buf, 0, length, offset, (err, bytesRead) => {
                if (err) return sftp.status(reqId, statusCode(err));
                if (bytesRead === 0) return sftp.status(reqId, ssh2.utils.sftp.STATUS_CODE.EOF);
                sftp.data(reqId, buf.slice(0, bytesRead));
            });
        });

        // ── WRITE ─────────────────────────────────────────────────────────────
        sftp.on('WRITE', (reqId, handle, offset, data) => {
            const hId = handle.readUInt32BE(0);
            const obj = handles.get(hId);
            if (!obj || obj.fd === undefined) return sftp.status(reqId, ssh2.utils.sftp.STATUS_CODE.FAILURE);
            fs.write(obj.fd, data, 0, data.length, offset, (err) => {
                sftp.status(reqId, err ? statusCode(err) : ssh2.utils.sftp.STATUS_CODE.OK);
            });
        });

        // ── CLOSE ─────────────────────────────────────────────────────────────
        sftp.on('CLOSE', (reqId, handle) => {
            const hId = handle.readUInt32BE(0);
            const obj = handles.get(hId);
            if (!obj) return sftp.status(reqId, ssh2.utils.sftp.STATUS_CODE.FAILURE);
            handles.delete(hId);
            if (obj.fd !== undefined) {
                fs.close(obj.fd, (err) => {
                    sftp.status(reqId, err ? statusCode(err) : ssh2.utils.sftp.STATUS_CODE.OK);
                });
            } else if (obj.dir) {
                sftp.status(reqId, ssh2.utils.sftp.STATUS_CODE.OK);
            } else {
                sftp.status(reqId, ssh2.utils.sftp.STATUS_CODE.OK);
            }
        });

        // ── OPENDIR ───────────────────────────────────────────────────────────
        sftp.on('OPENDIR', (reqId, dirPath) => {
            let dpath;
            try {
                dpath = resolvePath(dirPath);
            } catch (err) {
                return sftp.status(reqId, ssh2.utils.sftp.STATUS_CODE.PERMISSION_DENIED);
            }

            fs.readdir(dpath, (err, list) => {
                if (err) return sftp.status(reqId, statusCode(err));
                sftp.handle(reqId, newHandle({ dir: dpath, list, idx: 0 }));
            });
        });

        // ── READDIR ───────────────────────────────────────────────────────────
        sftp.on('READDIR', (reqId, handle) => {
            const hId = handle.readUInt32BE(0);
            const obj = handles.get(hId);
            if (!obj || !obj.dir) return sftp.status(reqId, ssh2.utils.sftp.STATUS_CODE.FAILURE);

            const batch = [];
            const names = obj.list;
            const BATCH = 32;

            const processBatch = async () => {
                const slice = names.slice(obj.idx, obj.idx + BATCH);
                if (slice.length === 0) return sftp.status(reqId, ssh2.utils.sftp.STATUS_CODE.EOF);
                obj.idx += slice.length;

                const entries = [];
                for (const name of slice) {
                    const full = path.join(obj.dir, name);
                    try {
                        const st = fs.statSync(full);
                        entries.push({ filename: name, longname: lsLine(name, st), attrs: statToAttrs(st) });
                    } catch (_) {}
                }
                sftp.name(reqId, entries);
            };
            processBatch().catch(() => sftp.status(reqId, ssh2.utils.sftp.STATUS_CODE.FAILURE));
        });

        // ── LSTAT / STAT / FSTAT ──────────────────────────────────────────────
        const doStat = (reqId, fspath, useLstat) => {
            const statFn = useLstat ? fs.lstat : fs.stat;
            statFn(fspath, (err, st) => {
                if (err) return sftp.status(reqId, statusCode(err));
                sftp.attrs(reqId, statToAttrs(st));
            });
        };
        sftp.on('LSTAT', (reqId, p) => {
            let fspath;
            try {
                fspath = resolvePath(p);
            } catch (err) {
                return sftp.status(reqId, ssh2.utils.sftp.STATUS_CODE.PERMISSION_DENIED);
            }
            doStat(reqId, fspath, true);
        });
        sftp.on('STAT',  (reqId, p) => {
            let fspath;
            try {
                fspath = resolvePath(p);
            } catch (err) {
                return sftp.status(reqId, ssh2.utils.sftp.STATUS_CODE.PERMISSION_DENIED);
            }
            doStat(reqId, fspath, false);
        });
        sftp.on('FSTAT', (reqId, handle) => {
            const hId = handle.readUInt32BE(0);
            const obj = handles.get(hId);
            if (!obj || obj.fd === undefined) return sftp.status(reqId, ssh2.utils.sftp.STATUS_CODE.FAILURE);
            fs.fstat(obj.fd, (err, st) => {
                if (err) return sftp.status(reqId, statusCode(err));
                sftp.attrs(reqId, statToAttrs(st));
            });
        });

        // ── SETSTAT ───────────────────────────────────────────────────────────
        sftp.on('SETSTAT', (reqId, p, attrs) => {
            // We just acknowledge — full chmod/chown not needed for basic use
            sftp.status(reqId, ssh2.utils.sftp.STATUS_CODE.OK);
        });

        // ── MKDIR ─────────────────────────────────────────────────────────────
        sftp.on('MKDIR', (reqId, dirPath, attrs) => {
            let dpath;
            try {
                dpath = resolvePath(dirPath);
            } catch (err) {
                return sftp.status(reqId, ssh2.utils.sftp.STATUS_CODE.PERMISSION_DENIED);
            }

            fs.mkdir(dpath, { recursive: false }, (err) => {
                sftp.status(reqId, err ? statusCode(err) : ssh2.utils.sftp.STATUS_CODE.OK);
            });
        });

        // ── RMDIR ─────────────────────────────────────────────────────────────
        sftp.on('RMDIR', (reqId, dirPath) => {
            let dpath;
            try {
                dpath = resolvePath(dirPath);
            } catch (err) {
                return sftp.status(reqId, ssh2.utils.sftp.STATUS_CODE.PERMISSION_DENIED);
            }

            fs.rmdir(dpath, (err) => {
                sftp.status(reqId, err ? statusCode(err) : ssh2.utils.sftp.STATUS_CODE.OK);
            });
        });

        // ── REMOVE (unlink) ───────────────────────────────────────────────────
        sftp.on('REMOVE', (reqId, filePath) => {
            let fpath;
            try {
                fpath = resolvePath(filePath);
            } catch (err) {
                return sftp.status(reqId, ssh2.utils.sftp.STATUS_CODE.PERMISSION_DENIED);
            }

            fs.unlink(fpath, (err) => {
                sftp.status(reqId, err ? statusCode(err) : ssh2.utils.sftp.STATUS_CODE.OK);
            });
        });

        // ── RENAME ────────────────────────────────────────────────────────────
        sftp.on('RENAME', (reqId, oldPath, newPath) => {
            let oldFpath, newFpath;
            try {
                oldFpath = resolvePath(oldPath);
                newFpath = resolvePath(newPath);
            } catch (err) {
                return sftp.status(reqId, ssh2.utils.sftp.STATUS_CODE.PERMISSION_DENIED);
            }

            fs.rename(oldFpath, newFpath, (err) => {
                sftp.status(reqId, err ? statusCode(err) : ssh2.utils.sftp.STATUS_CODE.OK);
            });
        });

        // ── REALPATH ──────────────────────────────────────────────────────────
        sftp.on('REALPATH', (reqId, reqPath) => {
            let resolved;
            try {
                resolved = resolvePath(reqPath);
            } catch (err) {
                return sftp.status(reqId, ssh2.utils.sftp.STATUS_CODE.PERMISSION_DENIED);
            }

            const clientPath = '/' + path.relative(root, resolved).replace(/\\/g, '/');
            sftp.name(reqId, [{ filename: clientPath, longname: clientPath, attrs: {} }]);
        });

        // ── READLINK ──────────────────────────────────────────────────────────
        sftp.on('READLINK', (reqId, linkPath) => {
            let resolved;
            try {
                resolved = resolvePath(linkPath);
            } catch (err) {
                return sftp.status(reqId, ssh2.utils.sftp.STATUS_CODE.PERMISSION_DENIED);
            }

            fs.readlink(resolved, (err, target) => {
                if (err) return sftp.status(reqId, statusCode(err));
                sftp.name(reqId, [{ filename: target, longname: target, attrs: {} }]);
            });
        });

        // ── SYMLINK ───────────────────────────────────────────────────────────
        sftp.on('SYMLINK', (reqId, linkPath, targetPath) => {
            let linkFpath, targetFpath;
            try {
                linkFpath = resolvePath(linkPath);
                targetFpath = resolvePath(targetPath);
            } catch (err) {
                return sftp.status(reqId, ssh2.utils.sftp.STATUS_CODE.PERMISSION_DENIED);
            }

            fs.symlink(targetFpath, linkFpath, (err) => {
                sftp.status(reqId, err ? statusCode(err) : ssh2.utils.sftp.STATUS_CODE.OK);
            });
        });
    };
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function statusCode(err) {
    const S = ssh2.utils.sftp.STATUS_CODE;
    if (!err) return S.OK;
    switch (err.code) {
        case 'ENOENT': return S.NO_SUCH_FILE;
        case 'EPERM':
        case 'EACCES': return S.PERMISSION_DENIED;
        case 'EEXIST': return S.FAILURE;
        default:       return S.FAILURE;
    }
}

function statToAttrs(st) {
    return {
        mode:  st.mode,
        uid:   st.uid  || 0,
        gid:   st.gid  || 0,
        size:  st.size,
        atime: Math.floor(st.atimeMs / 1000),
        mtime: Math.floor(st.mtimeMs / 1000),
    };
}

function lsLine(name, st) {
    const mode  = st.isDirectory() ? 'd' : '-';
    const size  = String(st.size).padStart(10);
    const mtime = st.mtime.toDateString().slice(4);
    return `${mode}rw-r--r-- 1 owner group ${size} ${mtime} ${name}`;
}

// ── Public API ────────────────────────────────────────────────────────────────
async function startServerFtp(serverId) {
    const key = String(serverId);
    const serverRow = await dbGet('SELECT * FROM servers WHERE id = ?', [serverId]);
    if (!serverRow)               throw new Error('Server not found');
    if (!serverRow.ftp_enabled)   throw new Error('SFTP not enabled for this server');
    if (!serverRow.ftp_port)      throw new Error('SFTP port not configured');
    if (!serverRow.ftp_username || !serverRow.ftp_password)
        throw new Error('SFTP credentials not configured');

    // Stop any existing instance first
    await stopServerFtp(serverId);

    const port     = serverRow.ftp_port;
    const username = serverRow.ftp_username;
    const hashedPw = serverRow.ftp_password;
    const root     = getServerDir(serverRow);

    if (!fs.existsSync(root)) fs.mkdirSync(root, { recursive: true });

    const hostKey = getHostKey();

    return new Promise((resolve, reject) => {
        const srv = new ssh2.Server({ hostKeys: [hostKey] }, (client) => {
            let authUser = null;

            client.on('authentication', async (ctx) => {
                if (ctx.method !== 'password') return ctx.reject(['password']);
                if (ctx.username !== username) return ctx.reject();

                try {
                    const ok = await bcrypt.compare(ctx.password, hashedPw);
                    if (!ok) return ctx.reject();
                    authUser = ctx.username;
                    ctx.accept();
                } catch (_) {
                    ctx.reject();
                }
            });

            client.on('ready', () => {
                client.on('session', (acceptSession) => {
                    const session = acceptSession();
                    session.on('sftp', createSftpSession(root));
                });
            });

            client.on('error', () => {});
        });

        srv.on('error', (err) => {
            logger.error(`[SFTP] Server ${serverId} error:`, err.message);
            reject(err);
        });

        srv.listen(port, '0.0.0.0', () => {
            runningServers.set(key, { server: srv, port });
            logger.info(`[SFTP] Server ${serverId} listening on port ${port}`);
            resolve();
        });
    });
}

async function stopServerFtp(serverId) {
    const key = String(serverId);
    if (!runningServers.has(key)) return;
    const { server } = runningServers.get(key);
    await new Promise((res) => server.close(res));
    runningServers.delete(key);
    logger.info(`[SFTP] Server ${serverId} stopped`);
}

function isServerFtpRunning(serverId) {
    return runningServers.has(String(serverId));
}

// Legacy stubs (kept so index.js doesn't break)
async function initFtpServer() {
    logger.info('[SFTP] Global SFTP disabled — use per-server SFTP instead');
}
function stopFtpServer() {}
function isFtpRunning() { return false; }

module.exports = {
    initFtpServer,
    stopFtpServer,
    isFtpRunning,
    startServerFtp,
    stopServerFtp,
    isServerFtpRunning,
    storePasswordCache,
    getPasswordCache,
};
