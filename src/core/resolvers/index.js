const fs = require('fs');
const path = require('path');
const https = require('https');
const crypto = require('crypto');
const vanillaResolver = require('./vanilla');
const PaperResolver = require('./paper');
const PurpurResolver = require('./purpur');
const fabricResolver = require('./fabric');
const forgeResolver = require('./forge');
const quiltResolver = require('./quilt');
const magmaResolver = require('./magma');
const bedrockFamily = require('./bedrock');
const bedrockResolver        = bedrockFamily.bedrock;
const bedrockPreviewResolver = bedrockFamily.bedrockPreview;
const pocketmineResolver     = bedrockFamily.pocketmine;

const paperResolver = new PaperResolver('paper');
const purpurResolver = new PurpurResolver();

const fetchJson = (url) => {
    return new Promise((resolve, reject) => {
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
        case 'bedrock': return bedrockResolver;
        case 'bedrock-preview': return bedrockPreviewResolver;
        case 'pocketmine': return pocketmineResolver;
        default: throw new Error(`Unsupported software: ${software}`);
    }
};

const resolveJar = async (software, version, build = 'latest') => {
    const provider = getProvider(software);
    return await provider.resolveBuild(version, build);
};

const downloadJar = (jarInfo, onProgress) => {
    return new Promise((resolve, reject) => {
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

module.exports = {
    resolveJar,
    downloadJar,
    getProvider,
    fetchJson
};
