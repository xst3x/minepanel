"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.importUpload = void 0;
exports.createImportStorage = createImportStorage;
exports.receiveServerImport = receiveServerImport;
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const promises_1 = require("stream/promises");
const paths_1 = require("../paths");
const importResources_1 = require("../core/importResources");
const logger = require("../core/utils/logger");
// A private folder on the server volume avoids filling an OS tmpfs with a large
// archive. Never use the client filename as a filesystem path.
function createImportStorage(directory = path.join(paths_1.SERVERS_DIR, '.imports')) {
    return {
        _handleFile(req, file, callback) {
            req.importWrite = (async () => {
                let folder;
                try {
                    await fs.promises.mkdir(directory, { recursive: true });
                    req.importSignal?.throwIfAborted();
                    const length = req.headers['content-length'];
                    await (0, importResources_1.requireDiskSpace)(directory, length === undefined ? 0 : (0, importResources_1.safeBytes)(Number(length)));
                    folder = await fs.promises.mkdtemp(path.join(directory, 'upload-'));
                    req.importTemp = folder;
                    const target = path.join(folder, 'archive.zip');
                    const guard = new importResources_1.ImportByteGuard(directory);
                    await (0, promises_1.pipeline)(file.stream, guard, fs.createWriteStream(target, { flags: 'wx', mode: 0o600 }), { signal: req.importSignal });
                    callback(null, { destination: folder, filename: 'archive.zip', path: target, size: guard.bytes });
                }
                catch (error) {
                    if (folder)
                        await fs.promises.rm(folder, { recursive: true, force: true }).catch(e => logger.error('Import upload cleanup failed:', e));
                    callback(error);
                }
            })();
        },
        _removeFile(_req, file, callback) {
            fs.promises.unlink(file.path).then(() => callback(null), error => callback(error.code === 'ENOENT' ? null : error));
        },
    };
}
exports.importUpload = multer({
    storage: createImportStorage(),
    // Bound multipart metadata; payload size is governed by disk availability.
    limits: { files: 1, fields: 16, parts: 18, fieldSize: 16 * 1024 },
    fileFilter: (_req, file, callback) => {
        if (file.mimetype === 'application/zip' || file.mimetype === 'application/x-zip-compressed' || file.originalname.toLowerCase().endsWith('.zip'))
            callback(null, true);
        else
            callback(new Error('Only .zip files are accepted for server import'));
    },
});
let activeImports = 0;
/** Called only after authentication and server.create authorization. Slots are
 * held through cleanup, even when the client disconnects during extraction. */
function receiveServerImport(req, res, next) {
    if (activeImports >= 2) {
        res.status(503).json({ error: 'IMPORT_BUSY', message: 'Other server imports are running. Please try again shortly.' });
        return;
    }
    activeImports++;
    const controller = new AbortController();
    req.importSignal = controller.signal;
    const abort = () => controller.abort();
    req.once('aborted', abort);
    res.once('close', abort);
    req.setTimeout(0);
    res.setTimeout(0);
    let cleaned = false;
    req.importCleanup = async () => {
        if (cleaned)
            return;
        cleaned = true;
        try {
            await req.importWrite;
            if (req.importTemp)
                await fs.promises.rm(req.importTemp, { recursive: true, force: true });
        }
        catch (error) {
            logger.error('Import temporary-file cleanup failed:', error);
        }
        finally {
            req.removeListener('aborted', abort);
            res.removeListener('close', abort);
            activeImports--;
        }
    };
    exports.importUpload.single('archive')(req, res, error => {
        if (!error) {
            next();
            return;
        }
        void req.importCleanup().then(() => {
            if (!res.destroyed)
                res.status(error.code === 'ENOSPC' ? 507 : 400).json({ error: 'IMPORT_UPLOAD_FAILED', message: error.message });
        });
    });
}
//# sourceMappingURL=serverImportUpload.js.map