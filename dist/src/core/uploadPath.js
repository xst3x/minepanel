"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadDirectory = uploadDirectory;
exports.validateUploadName = validateUploadName;
exports.uploadRelativePath = uploadRelativePath;
const safeServerPath_1 = require("./safeServerPath");
/** A leading slash denotes the server root, never the host filesystem root. */
function uploadDirectory(root, value) {
    if (typeof value !== 'string' || /[\\:\x00-\x1f]/.test(value) || value.startsWith('//') || value.split('/').includes('..')) {
        throw new Error('Invalid upload path');
    }
    return (0, safeServerPath_1.safeServerPath)(root, value);
}
function validateUploadName(name) {
    if (typeof name !== 'string' || !name || name === '.' || name === '..' || /[/\\:\x00-\x1f]/.test(name) || /[. ]$/.test(name)) {
        throw new Error('Invalid filename');
    }
}
/** Folder upload names are relative to the chosen directory, never absolute. */
function uploadRelativePath(value, name) {
    if (value === undefined)
        return name;
    if (typeof value !== 'string' || !value || value.startsWith('/'))
        throw new Error('Invalid upload path');
    const parts = value.split('/');
    for (const part of parts)
        validateUploadName(part);
    if (parts[parts.length - 1] !== name)
        throw new Error('Invalid upload path');
    return parts.join('/');
}
//# sourceMappingURL=uploadPath.js.map