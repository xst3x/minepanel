/**
 * javaManager.js
 * Ensures Java 26 is available, downloading it if needed.
 * Returns the path to the java executable.
 *
 * Java 26 is downloaded from Adoptium (Eclipse Temurin) if not found.
 * Stored in <project_root>/runtime/java26/
 */

'use strict';

const path  = require('path');
const fs    = require('fs');
const https = require('https');
const { execFileSync } = require('child_process');
const logger = require('./utils/logger');

const JAVA_VERSION   = 26;
const RUNTIME_DIR    = path.resolve(__dirname, '../../runtime');
const JAVA_DIR       = path.join(RUNTIME_DIR, `java${JAVA_VERSION}`);
const JAVA_EXE       = process.platform === 'win32'
    ? path.join(JAVA_DIR, 'bin', 'java.exe')
    : path.join(JAVA_DIR, 'bin', 'java');

// Adoptium API — latest GA release for the given major version
const ADOPTIUM_API = (version, os, arch) =>
    `https://api.adoptium.net/v3/binary/latest/${version}/ga/${os}/${arch}/jdk/hotspot/normal/eclipse`;

function detectArch() {
    const a = process.arch;
    if (a === 'x64')   return 'x64';
    if (a === 'arm64') return 'aarch64';
    return 'x64';
}

function detectOS() {
    const p = process.platform;
    if (p === 'win32')  return 'windows';
    if (p === 'darwin') return 'mac';
    return 'linux';
}

/**
 * Check if the given java executable reports version >= JAVA_VERSION.
 */
function checkJavaVersion(javaExe) {
    try {
        // java -version writes to stderr; capture both streams
        const out = execFileSync(javaExe, ['-version'], {
            encoding: 'utf8',
            stdio: ['pipe', 'pipe', 'pipe'],
            stderr: 'pipe'
        });
        const combined = out;
        const m = combined.match(/version "(\d+)/);
        if (m) return parseInt(m[1], 10);
    } catch (err) {
        // On most JVMs -version goes to stderr, which ends up in err.stderr
        const stderr = (err && err.stderr) ? err.stderr.toString() : '';
        const m = stderr.match(/version "(\d+)/);
        if (m) return parseInt(m[1], 10);
    }
    return 0;
}

/**
 * Download a URL to a file, following redirects.
 */
function download(url, dest) {
    return new Promise((resolve, reject) => {
        const doGet = (u) => {
            https.get(u, { headers: { 'User-Agent': 'MinePanel/1.0' } }, (res) => {
                if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307 || res.statusCode === 308) {
                    return doGet(res.headers.location);
                }
                if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode} for ${u}`));
                const out = fs.createWriteStream(dest);
                res.pipe(out);
                out.on('finish', () => out.close(resolve));
                out.on('error', reject);
            }).on('error', reject);
        };
        doGet(url);
    });
}

/**
 * Extract a .zip (Windows) or .tar.gz (Linux/Mac) into JAVA_DIR.
 * The archive has a single top-level folder — we strip it.
 */
async function extract(archivePath) {
    fs.mkdirSync(JAVA_DIR, { recursive: true });
    const tmpDir = JAVA_DIR + '_tmp';
    if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true });
    fs.mkdirSync(tmpDir, { recursive: true });

    if (archivePath.endsWith('.zip')) {
        const AdmZip = require('adm-zip');
        const zip = new AdmZip(archivePath);
        zip.extractAllTo(tmpDir, true);
    } else {
        // .tar.gz — use tar command (available on all platforms since Node 18+ ships with it on Windows too)
        execFileSync('tar', ['-xzf', archivePath, '-C', tmpDir]);
    }

    // Strip top-level folder
    const entries = fs.readdirSync(tmpDir);
    if (entries.length !== 1) throw new Error('Unexpected archive structure');
    const inner = path.join(tmpDir, entries[0]);

    if (fs.existsSync(JAVA_DIR)) fs.rmSync(JAVA_DIR, { recursive: true });
    fs.renameSync(inner, JAVA_DIR);
    fs.rmSync(tmpDir, { recursive: true });
}

let _resolvedPath = null; // cache after first resolution

async function ensureJava26() {
    // 1. Already resolved this session
    if (_resolvedPath) return _resolvedPath;

    // 2. Already downloaded
    if (fs.existsSync(JAVA_EXE)) {
        const v = checkJavaVersion(JAVA_EXE);
        if (v >= JAVA_VERSION) {
            logger.info(`[JavaManager] Using bundled Java ${v} at ${JAVA_EXE}`);
            _resolvedPath = JAVA_EXE;
            return _resolvedPath;
        }
        // Corrupt/wrong version — redownload
        logger.warn(`[JavaManager] Bundled Java reports version ${v}, expected ${JAVA_VERSION}. Re-downloading.`);
        fs.rmSync(JAVA_DIR, { recursive: true });
    }

    // 3. Download
    const os   = detectOS();
    const arch = detectArch();
    const ext  = os === 'windows' ? 'zip' : 'tar.gz';
    const url  = ADOPTIUM_API(JAVA_VERSION, os, arch);
    const archivePath = path.join(RUNTIME_DIR, `java${JAVA_VERSION}.${ext}`);

    fs.mkdirSync(RUNTIME_DIR, { recursive: true });

    logger.info(`[JavaManager] Downloading Java ${JAVA_VERSION} (${os}/${arch}) from Adoptium…`);
    logger.info(`[JavaManager] URL: ${url}`);
    logger.info(`[JavaManager] This may take a minute — servers will start normally after download.`);

    try {
        await download(url, archivePath);
        logger.info(`[JavaManager] Download complete, extracting…`);
        await extract(archivePath);
        fs.unlinkSync(archivePath); // cleanup archive
    } catch (e) {
        logger.error(`[JavaManager] Failed to download/extract Java ${JAVA_VERSION}: ${e.message}`);
        logger.warn(`[JavaManager] Falling back to system 'java'. Install Java ${JAVA_VERSION} manually for best results.`);
        _resolvedPath = 'java';
        return _resolvedPath;
    }

    const v = checkJavaVersion(JAVA_EXE);
    if (v < JAVA_VERSION) {
        logger.error(`[JavaManager] Extracted Java reports version ${v}, expected ${JAVA_VERSION}. Falling back.`);
        _resolvedPath = 'java';
        return _resolvedPath;
    }

    logger.info(`[JavaManager] Java ${v} ready at ${JAVA_EXE}`);
    _resolvedPath = JAVA_EXE;
    return _resolvedPath;
}

/**
 * Returns the java path for a server.
 * If server has a custom java_path set (not 'java'), use that.
 * Otherwise use the managed Java 26 install.
 */
async function getJavaPath(serverJavaPath) {
    if (serverJavaPath && serverJavaPath !== 'java') return serverJavaPath;
    return ensureJava26();
}

module.exports = { getJavaPath, ensureJava26 };
