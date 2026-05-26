const fs = require('fs');
const fsp = fs.promises;

/**
 * Retry an async operation with configurable attempts and delay.
 * Handles EPERM, EBUSY, EACCES errors common on Windows when files are locked.
 */
async function retryOperation(operation, { retries = 10, delay = 500, label = 'fs operation' } = {}) {
    let lastError;
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            return await operation();
        } catch (err) {
            lastError = err;
            const retryable = ['EPERM', 'EBUSY', 'EACCES', 'ENOTEMPTY'].includes(err.code);
            if (!retryable || attempt === retries) {
                throw err;
            }
            console.warn(`[fsRetry] ${label} failed (attempt ${attempt}/${retries}, code: ${err.code}), retrying in ${delay}ms...`);
            await new Promise(r => setTimeout(r, delay));
        }
    }
    throw lastError;
}

/**
 * Rename a file/directory with retry logic for locked files on Windows.
 */
async function retryRename(oldPath, newPath, opts = {}) {
    return retryOperation(
        () => fsp.rename(oldPath, newPath),
        { ...opts, label: `rename ${oldPath} -> ${newPath}` }
    );
}

/**
 * Delete a file/directory recursively with retry logic.
 */
async function retryDelete(targetPath, opts = {}) {
    return retryOperation(
        () => fsp.rm(targetPath, { recursive: true, force: true }),
        { ...opts, label: `delete ${targetPath}` }
    );
}

/**
 * Copy a file with retry logic.
 */
async function retryCopy(src, dest, opts = {}) {
    return retryOperation(
        () => fsp.copyFile(src, dest),
        { ...opts, label: `copy ${src} -> ${dest}` }
    );
}

/**
 * Unlink a single file with retry logic.
 */
async function retryUnlink(filePath, opts = {}) {
    return retryOperation(
        () => fsp.unlink(filePath),
        { ...opts, label: `unlink ${filePath}` }
    );
}

module.exports = {
    retryOperation,
    retryRename,
    retryDelete,
    retryCopy,
    retryUnlink
};
