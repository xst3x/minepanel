/**
 * Shared Modrinth HTTP helpers used by modpack (and potentially plugin) integrations.
 */
const https = require('https');
const http = require('http');

const USER_AGENT = 'MinePanel/1.0';
const REQUEST_TIMEOUT_MS = 30000;

const fetchJson = (url, options = {}) => new Promise((resolve, reject) => {
    const body = options.body ? JSON.stringify(options.body) : null;
    const parsed = new URL(url);
    const lib = parsed.protocol === 'https:' ? https : http;

    const req = lib.request(url, {
        method: options.method || 'GET',
        headers: {
            'User-Agent': USER_AGENT,
            'Accept': 'application/json',
            ...(body ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } : {}),
            ...(options.headers || {}),
        },
    }, (res) => {
        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => {
            if (res.statusCode >= 200 && res.statusCode < 300) {
                try { resolve(JSON.parse(data)); } catch (e) { reject(new Error('Invalid JSON response from Modrinth')); }
            } else {
                reject(new Error(`Modrinth HTTP ${res.statusCode}`));
            }
        });
    });

    req.setTimeout(REQUEST_TIMEOUT_MS, () => {
        req.destroy(new Error('Modrinth request timed out'));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
});

const fetchText = (url) => new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const lib = parsed.protocol === 'https:' ? https : http;
    const req = lib.get(url, { headers: { 'User-Agent': USER_AGENT } }, (res) => {
        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => {
            if (res.statusCode >= 200 && res.statusCode < 300) resolve(data);
            else reject(new Error(`Modrinth HTTP ${res.statusCode}`));
        });
    });
    req.setTimeout(REQUEST_TIMEOUT_MS, () => {
        req.destroy(new Error('Modrinth request timed out'));
    });
    req.on('error', reject);
});

const downloadFile = (url, dest) => new Promise((resolve, reject) => {
    const fs = require('fs');
    const fileStream = fs.createWriteStream(dest);
    const parsed = new URL(url);
    const lib = parsed.protocol === 'https:' ? https : http;

    const doGet = (targetUrl) => {
        lib.get(targetUrl, { headers: { 'User-Agent': USER_AGENT } }, (response) => {
            if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                fileStream.close();
                try { fs.unlinkSync(dest); } catch (_) {}
                return doGet(response.headers.location);
            }
            if (response.statusCode !== 200) {
                fileStream.close();
                try { fs.unlinkSync(dest); } catch (_) {}
                return reject(new Error(`Download failed: HTTP ${response.statusCode}`));
            }
            response.pipe(fileStream);
            fileStream.on('finish', () => { fileStream.close(); resolve(); });
        }).on('error', (err) => {
            fileStream.close();
            try { fs.unlinkSync(dest); } catch (_) {}
            reject(err);
        });
    };

    doGet(url);
});

module.exports = { fetchJson, fetchText, downloadFile, USER_AGENT };
