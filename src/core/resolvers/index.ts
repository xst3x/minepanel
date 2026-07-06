import fs = require('fs')
import path = require('path')
import https = require('https')
import crypto = require('crypto')
import vanillaResolver = require('./vanilla')
import PaperResolver = require('./paper')
import PurpurResolver = require('./purpur')
import fabricResolver = require('./fabric')
import forgeResolver = require('./forge')
import quiltResolver = require('./quilt')
import magmaResolver = require('./magma')
import foliaResolver = require('./folia')
import velocityResolver = require('./velocity')
import waterfallResolver = require('./waterfall')
import leavesResolver = require('./leaves')
import pufferfishResolver = require('./pufferfish')
import arclightResolver = require('./arclight')
import mohistResolver = require('./mohist')
import spongevanillaResolver = require('./spongevanilla')
import neoforgeResolver = require('./neoforge')
import bedrockFamily = require('./bedrock')
const bedrockResolver        = bedrockFamily.bedrock;
const bedrockPreviewResolver = bedrockFamily.bedrockPreview;
const pocketmineResolver     = bedrockFamily.pocketmine;

const paperResolver = new PaperResolver('paper');
const purpurResolver = new PurpurResolver();

const fetchJson = (url: string): Promise<any> => {
    return new Promise<any>((resolve, reject) => {
        https.get(url, { headers: { 'User-Agent': 'MinePanel/1.0' } }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode === 200) {
                    try { resolve(JSON.parse(data)); } 
                    catch (e) { reject(new Error('Invalid JSON')); }
                } else {
                    reject(new Error(`HTTP ${res.statusCode}`));
                }
            });
        }).on('error', reject);
    });
};

const CACHE_DIR = path.join(__dirname, '../../../cache/jars');

if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
}

const getProvider = (software) => {
    switch(software.toLowerCase()) {
        case 'vanilla': return vanillaResolver;
        case 'snapshots': return vanillaResolver;
        case 'paper': return paperResolver;
        case 'purpur': return purpurResolver;
        case 'fabric': return fabricResolver;
        case 'forge': return forgeResolver;
        case 'quilt': return quiltResolver;
        case 'magma': return magmaResolver;
        case 'folia': return foliaResolver;
        case 'velocity': return velocityResolver;
        case 'waterfall': return waterfallResolver;
        case 'leaves': return leavesResolver;
        case 'pufferfish': return pufferfishResolver;
        case 'arclight': return arclightResolver;
        case 'mohist': return mohistResolver;
        case 'spongevanilla': return spongevanillaResolver;
        case 'neoforge': return neoforgeResolver;
        case 'bedrock': return bedrockResolver;
        case 'bedrock-preview': return bedrockPreviewResolver;
        case 'pocketmine': return pocketmineResolver;
        default: throw new Error(`Unsupported software: ${software}`);
    }
};

function compareVersions(a, b) {
    const pa = String(a).split('-')[0].split('.').map(num => parseInt(num, 10) || 0);
    const pb = String(b).split('-')[0].split('.').map(num => parseInt(num, 10) || 0);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
        const na = pa[i] || 0;
        const nb = pb[i] || 0;
        if (na !== nb) return nb - na;
    }
    return 0;
}

const resolveJar = async (software, version, build = 'latest') => {
    const provider = getProvider(software);

    if (version === 'latest') {
        if (typeof provider.getLatestVersion === 'function') {
            const res = await provider.getLatestVersion();
            version = res.version;
        } else if (typeof provider.listVersions === 'function') {
            let versions = await provider.listVersions();
            if (versions && typeof versions === 'object' && !Array.isArray(versions)) {
                versions = versions.versions;
            }
            if (Array.isArray(versions) && versions.length > 0) {
                if (software.toLowerCase() === 'vanilla' || software.toLowerCase() === 'snapshots') {
                    const type = software.toLowerCase() === 'snapshots' ? 'snapshot' : 'release';
                    const found = versions.find(v => v.type === type);
                    if (found) version = found.version;
                } else {
                    const first = versions[0];
                    if (typeof first === 'string') {
                        const sorted = versions.filter(v => typeof v === 'string').sort(compareVersions);
                        version = sorted[0];
                    } else if (first && typeof first === 'object' && first.version) {
                        version = first.version;
                    }
                }
            }
        }
    }

    return await provider.resolveBuild(version, build);
};

const downloadJar = (jarInfo: any, onProgress?: any): Promise<any> => {
    return new Promise<any>((resolve, reject) => {
        const providerDir = path.join(CACHE_DIR, jarInfo.provider, jarInfo.version);
        if (!fs.existsSync(providerDir)) {
            fs.mkdirSync(providerDir, { recursive: true });
        }

        const fileName = jarInfo.isZip
            ? `${jarInfo.type}-${jarInfo.version}-${jarInfo.build}.zip`
            : jarInfo.isPhar
                ? `${jarInfo.type}-${jarInfo.version}-${jarInfo.build}.phar`
                : `${jarInfo.type}-${jarInfo.version}-${jarInfo.build}.jar`;
        const filePath = path.join(providerDir, fileName);

        if (fs.existsSync(filePath)) {
            jarInfo.cached = true;
            jarInfo.localPath = filePath;
            return resolve(jarInfo);
        }

        const fileStream = fs.createWriteStream(filePath);

        // Follow redirects (GitHub releases use 302 → CDN)
        function doGet(url, redirectsLeft) {
            const lib = url.startsWith('http://') ? require('http') : https;
            lib.get(url, { headers: { 'User-Agent': 'MinePanel/1.0' } }, (res) => {
                const isRedirect = res.statusCode === 301 || res.statusCode === 302 ||
                                   res.statusCode === 307 || res.statusCode === 308;
                if (isRedirect && res.headers.location && redirectsLeft > 0) {
                    res.resume(); // discard body
                    return doGet(res.headers.location, redirectsLeft - 1);
                }
                if (res.statusCode !== 200) {
                    res.resume();
                    fileStream.close(() => {
                        try { fs.unlinkSync(filePath); } catch (_) {}
                    });
                    return reject(new Error(`Failed to download jar. Status code: ${res.statusCode}`));
                }

                const totalSize = parseInt(res.headers['content-length'], 10);
                let downloadedSize = 0;

                res.on('data', (chunk) => {
                    downloadedSize += chunk.length;
                    if (onProgress && totalSize) {
                        onProgress(downloadedSize, totalSize);
                    }
                });

                res.pipe(fileStream);

                fileStream.on('finish', () => {
                    fileStream.close(() => {
                        jarInfo.cached = false;
                        jarInfo.localPath = filePath;

                        const hasSha1 = !!jarInfo.sha1;
                        const hasSha256 = !!jarInfo.sha256;
                        if (hasSha1 || hasSha256) {
                            try {
                                const algorithm = hasSha256 ? 'sha256' : 'sha1';
                                const expected = hasSha256 ? jarInfo.sha256 : jarInfo.sha1;

                                const hash = crypto.createHash(algorithm);
                                const stream = fs.createReadStream(filePath);
                                stream.on('data', chunk => hash.update(chunk));
                                stream.on('end', () => {
                                    const actual = hash.digest('hex');
                                    if (actual !== expected) {
                                        try { fs.unlinkSync(filePath); } catch (_) {}
                                        reject(new Error(`JAR checksum verification failed for ${fileName}. Expected ${expected}, got ${actual}.`));
                                    } else {
                                        resolve(jarInfo);
                                    }
                                });
                                stream.on('error', (streamErr) => {
                                    try { fs.unlinkSync(filePath); } catch (_) {}
                                    reject(streamErr);
                                });
                            } catch (err) {
                                try { fs.unlinkSync(filePath); } catch (_) {}
                                reject(err);
                            }
                        } else {
                            console.warn(`[Resolver] No checksum available for ${fileName}, skipping verification.`);
                            resolve(jarInfo);
                        }
                    });
                });
            }).on('error', (err) => {
                fileStream.close(() => {
                    try { fs.unlinkSync(filePath); } catch (_) {}
                });
                reject(err);
            });
        }

        doGet(jarInfo.url, 5);
    });
};

export = {
    resolveJar,
    downloadJar,
    getProvider,
    fetchJson
};
