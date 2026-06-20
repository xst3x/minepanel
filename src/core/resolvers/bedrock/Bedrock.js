'use strict';

const https = require('https');
const { makeCache } = require('./cache');

const FALLBACK_VER = '1.26.23.1';

const DOWNLOAD_LINKS_URL =
  'https://net-secondary.web.minecraft-services.net/api/v1.0/download/links';

// ─── HTTP JSON helper ─────────────────────────────────────────────────────────
function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': 'MinePanel/1.0',
        'Accept': 'application/json'
      }
    }, (res) => {
      let data = '';

      res.on('data', chunk => (data += chunk));

      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error('Invalid JSON from API'));
        }
      });
    });

    req.on('error', reject);

    req.setTimeout(15000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
  });
}

// ─── extract version from filename ───────────────────────────────────────────
function extractVersion(url) {
  const match = url?.match(/bedrock-server-([\d.]+)\.zip/);
  return match ? match[1] : null;
}

// ─── resolver class ───────────────────────────────────────────────────────────
class BedrockResolver {
  constructor(channel = 'stable') {
    this.channel = channel === 'preview' ? 'preview' : 'stable';

    this._versionCache = makeCache(
      this.channel === 'preview' ? 'bds-preview-version' : 'bds-stable-version',
      2 * 60 * 60 * 1000
    );

    this._buildCache = makeCache(
      this.channel === 'preview' ? 'bds-preview-build' : 'bds-stable-build',
      2 * 60 * 60 * 1000
    );
  }

  // ─── latest version (stable or preview) ────────────────────────────────────
  async getLatestVersion() {
    const cached = this._versionCache.read();
    if (this._versionCache.isFresh(cached)) {
      return cached;
    }

    const data = await fetchJson(DOWNLOAD_LINKS_URL);
    const links = data?.result?.links || [];

    const isWin = process.platform === 'win32';

    const downloadType = this.channel === 'preview'
      ? (isWin ? 'serverBedrockPreviewWindows' : 'serverBedrockPreviewLinux')
      : (isWin ? 'serverBedrockWindows' : 'serverBedrockLinux');

    const entry = links.find(l => l.downloadType === downloadType);

    if (!entry?.downloadUrl) {
      throw new Error(`No download link for ${downloadType}`);
    }

    const version = extractVersion(entry.downloadUrl) || FALLBACK_VER;

    const result = {
      version,
      source: 'mojang',
      lastUpdated: new Date().toISOString()
    };

    this._versionCache.write(result);
    return result;
  }

  // ─── direct build resolver ────────────────────────────────────────────────
  async resolveBuild() {
    const cached = this._buildCache.read();
    if (this._buildCache.isFresh(cached)) {
      return cached;
    }

    const data = await fetchJson(DOWNLOAD_LINKS_URL);
    const links = data?.result?.links || [];

    const isWin = process.platform === 'win32';

    const downloadType = this.channel === 'preview'
      ? (isWin ? 'serverBedrockPreviewWindows' : 'serverBedrockPreviewLinux')
      : (isWin ? 'serverBedrockWindows' : 'serverBedrockLinux');

    const entry = links.find(l => l.downloadType === downloadType);

    if (!entry?.downloadUrl) {
      throw new Error(`No download link for ${downloadType}`);
    }

    const version = extractVersion(entry.downloadUrl);

    const result = {
      type: this.channel === 'preview' ? 'bedrock-preview' : 'bedrock',
      version,
      url: entry.downloadUrl,
      provider: 'mojang',
      isZip: true
    };

    this._buildCache.write(result);
    return result;
  }
}

// ─── exports ──────────────────────────────────────────────────────────────────
module.exports = new BedrockResolver('stable');
module.exports.preview = new BedrockResolver('preview');