// src/core/errors.js
// Centralized error codes and AppError class.
// Usage: throw new AppError(E.SERVER_NOT_FOUND, 404)
//        res.status(err.status).json(err.toResponse())

const E = {
    // Auth
    AUTH_INVALID_CREDENTIALS:       'AUTH_INVALID_CREDENTIALS',
    AUTH_ACCOUNT_DISABLED:          'AUTH_ACCOUNT_DISABLED',
    AUTH_TOKEN_INVALID:             'AUTH_TOKEN_INVALID',
    AUTH_TOKEN_EXPIRED:             'AUTH_TOKEN_EXPIRED',
    AUTH_UNAUTHORIZED:              'AUTH_UNAUTHORIZED',
    AUTH_TOKEN_REQUIRED:            'AUTH_TOKEN_REQUIRED',

    // Registration / Account
    AUTH_INVITE_TOKEN_REQUIRED:     'AUTH_INVITE_TOKEN_REQUIRED',
    AUTH_INVITE_TOKEN_INVALID:      'AUTH_INVITE_TOKEN_INVALID',
    AUTH_INVITE_TOKEN_EXPIRED:      'AUTH_INVITE_TOKEN_EXPIRED',
    AUTH_INVITE_TOKEN_USED:         'AUTH_INVITE_TOKEN_USED',
    USER_ALREADY_EXISTS:            'USER_ALREADY_EXISTS',
    USER_NOT_FOUND:                 'USER_NOT_FOUND',
    USER_SELF_DELETE:               'USER_SELF_DELETE',
    USER_SELF_DISABLE:              'USER_SELF_DISABLE',
    USER_PASSWORD_INCORRECT:        'USER_PASSWORD_INCORRECT',
    USER_PASSWORD_TOO_SHORT:        'USER_PASSWORD_TOO_SHORT',
    USER_USERNAME_TOO_SHORT:        'USER_USERNAME_TOO_SHORT',
    USER_USERNAME_TOO_LONG:         'USER_USERNAME_TOO_LONG',

    // Permissions
    FORBIDDEN:                      'FORBIDDEN',
    FORBIDDEN_ADMIN_ONLY:           'FORBIDDEN_ADMIN_ONLY',

    // Server
    SERVER_NOT_FOUND:               'SERVER_NOT_FOUND',
    SERVER_ALREADY_RUNNING:         'SERVER_ALREADY_RUNNING',
    SERVER_NOT_RUNNING:             'SERVER_NOT_RUNNING',
    SERVER_LOCKED:                  'SERVER_LOCKED',
    SERVER_NAME_TAKEN:              'SERVER_NAME_TAKEN',
    SERVER_PORT_TAKEN:              'SERVER_PORT_TAKEN',
    SERVER_RAM_INVALID:             'SERVER_RAM_INVALID',
    SERVER_PORT_INVALID:            'SERVER_PORT_INVALID',
    SERVER_FIELDS_REQUIRED:         'SERVER_FIELDS_REQUIRED',
    SERVER_JAVA_PATH_INVALID:       'SERVER_JAVA_PATH_INVALID',
    SERVER_MUST_BE_STOPPED:         'SERVER_MUST_BE_STOPPED',

    // Files
    FILE_NOT_FOUND:                 'FILE_NOT_FOUND',
    FILE_PATH_REQUIRED:             'FILE_PATH_REQUIRED',
    FILE_ACCESS_DENIED:             'FILE_ACCESS_DENIED',
    FILE_TOO_LARGE:                 'FILE_TOO_LARGE',
    FILE_INVALID_NAME:              'FILE_INVALID_NAME',
    FILE_ALREADY_EXISTS:            'FILE_ALREADY_EXISTS',
    DIRECTORY_NOT_FOUND:            'DIRECTORY_NOT_FOUND',

    // Backups
    BACKUP_NOT_FOUND:               'BACKUP_NOT_FOUND',
    BACKUP_INVALID_FILENAME:        'BACKUP_INVALID_FILENAME',
    BACKUP_FAILED:                  'BACKUP_FAILED',

    // Discord Bot management (global bots panel)
    BOT_NOT_FOUND:                  'BOT_NOT_FOUND',

    // Threshold
    THRESHOLD_VALIDATION_FAILED:    'THRESHOLD_VALIDATION_FAILED',

    // Plugins
    PLUGIN_NOT_FOUND:               'PLUGIN_NOT_FOUND',
    PLUGIN_INSTALL_FAILED:          'PLUGIN_INSTALL_FAILED',
    PLUGIN_INCOMPATIBLE:            'PLUGIN_INCOMPATIBLE',
    PLUGIN_INVALID_FILENAME:        'PLUGIN_INVALID_FILENAME',

    // Players
    PLAYER_NOT_FOUND:               'PLAYER_NOT_FOUND',
    PLAYER_USERNAME_UNRESOLVABLE:   'PLAYER_USERNAME_UNRESOLVABLE',
    PLAYER_ACTION_INVALID:          'PLAYER_ACTION_INVALID',
    PLAYER_LIST_INVALID:            'PLAYER_LIST_INVALID',
    PLAYER_SERVER_OFFLINE:          'PLAYER_SERVER_OFFLINE',

    // Ranks
    RANK_NOT_FOUND:                 'RANK_NOT_FOUND',
    RANK_NAME_TAKEN:                'RANK_NAME_TAKEN',
    RANK_BUILTIN_PROTECTED:         'RANK_BUILTIN_PROTECTED',
    RANK_FIELDS_INVALID:            'RANK_FIELDS_INVALID',

    // FTP
    FTP_CONFIG_INCOMPLETE:          'FTP_CONFIG_INCOMPLETE',
    FTP_PORT_TAKEN:                 'FTP_PORT_TAKEN',

    // Discord
    DISCORD_TOKEN_REQUIRED:         'DISCORD_TOKEN_REQUIRED',
    DISCORD_GUILD_INVALID:          'DISCORD_GUILD_INVALID',
    DISCORD_CONNECT_FAILED:         'DISCORD_CONNECT_FAILED',

    // System
    SYSTEM_PORT_INVALID:            'SYSTEM_PORT_INVALID',
    SYSTEM_PORT_IN_USE:             'SYSTEM_PORT_IN_USE',
    SYSTEM_PORT_SAME:               'SYSTEM_PORT_SAME',
    SYSTEM_PORT_SWITCH_IN_PROGRESS: 'SYSTEM_PORT_SWITCH_IN_PROGRESS',

    // Generic
    VALIDATION_ERROR:               'VALIDATION_ERROR',
    INTERNAL_ERROR:                 'INTERNAL_ERROR',
    NOT_FOUND:                      'NOT_FOUND',
    BAD_REQUEST:                    'BAD_REQUEST',
};

const MESSAGES = {
    [E.AUTH_INVALID_CREDENTIALS]:       'Invalid username or password.',
    [E.AUTH_ACCOUNT_DISABLED]:          'This account has been disabled.',
    [E.AUTH_TOKEN_INVALID]:             'Session expired or invalid token.',
    [E.AUTH_TOKEN_EXPIRED]:             'Session expired. Please log in again.',
    [E.AUTH_UNAUTHORIZED]:              'Unauthorized.',
    [E.AUTH_TOKEN_REQUIRED]:            'Authentication token required.',

    [E.AUTH_INVITE_TOKEN_REQUIRED]:     'An invite token is required to create an account.',
    [E.AUTH_INVITE_TOKEN_INVALID]:      'Invite token is invalid.',
    [E.AUTH_INVITE_TOKEN_EXPIRED]:      'Invite token has expired.',
    [E.AUTH_INVITE_TOKEN_USED]:         'Invite token has already been used.',
    [E.USER_ALREADY_EXISTS]:            'Username is already taken.',
    [E.USER_NOT_FOUND]:                 'User not found.',
    [E.USER_SELF_DELETE]:               'You cannot delete your own account.',
    [E.USER_SELF_DISABLE]:              'You cannot disable your own account.',
    [E.USER_PASSWORD_INCORRECT]:        'Current password is incorrect.',
    [E.USER_PASSWORD_TOO_SHORT]:        'Password must be at least 8 characters.',
    [E.USER_USERNAME_TOO_SHORT]:        'Username must be at least 3 characters.',
    [E.USER_USERNAME_TOO_LONG]:         'Username must be at most 32 characters.',

    [E.FORBIDDEN]:                      'You do not have permission to perform this action.',
    [E.FORBIDDEN_ADMIN_ONLY]:           'Only administrators can perform this action.',

    [E.SERVER_NOT_FOUND]:               'Server not found.',
    [E.SERVER_ALREADY_RUNNING]:         'Server is already running.',
    [E.SERVER_NOT_RUNNING]:             'Server is not running.',
    [E.SERVER_LOCKED]:                  'Another lifecycle action is in progress for this server.',
    [E.SERVER_NAME_TAKEN]:              'A server with this name already exists.',
    [E.SERVER_PORT_TAKEN]:              'This port is already in use by another server.',
    [E.SERVER_RAM_INVALID]:             'RAM must be between 512 and 16384 MB.',
    [E.SERVER_PORT_INVALID]:            'Port must be between 1024 and 65535.',
    [E.SERVER_FIELDS_REQUIRED]:         'All fields are required: name, software, version, ram_mb, port.',
    [E.SERVER_JAVA_PATH_INVALID]:       'Invalid Java path. Must be "java" or an absolute path ending in java/java.exe.',
    [E.SERVER_MUST_BE_STOPPED]:         'Stop the server before performing this action.',

    [E.FILE_NOT_FOUND]:                 'File not found.',
    [E.FILE_PATH_REQUIRED]:             'File path is required.',
    [E.FILE_ACCESS_DENIED]:             'Access denied: path is outside server directory.',
    [E.FILE_TOO_LARGE]:                 'File is too large. Use the download endpoint instead.',
    [E.FILE_INVALID_NAME]:              'Invalid filename.',
    [E.FILE_ALREADY_EXISTS]:            'A file with this name already exists.',
    [E.DIRECTORY_NOT_FOUND]:            'Directory not found.',

    [E.BACKUP_NOT_FOUND]:               'Backup not found.',
    [E.BACKUP_INVALID_FILENAME]:        'Invalid backup filename.',
    [E.BACKUP_FAILED]:                  'Backup operation failed.',

    [E.BOT_NOT_FOUND]:                   'Discord bot not found.',
    [E.THRESHOLD_VALIDATION_FAILED]:     'Threshold validation failed.',

    [E.PLUGIN_NOT_FOUND]:               'Plugin not found.',
    [E.PLUGIN_INSTALL_FAILED]:          'Plugin installation failed.',
    [E.PLUGIN_INCOMPATIBLE]:            'This plugin is not compatible with your server version or software.',
    [E.PLUGIN_INVALID_FILENAME]:        'Invalid plugin filename.',

    [E.PLAYER_NOT_FOUND]:               'Player data not found.',
    [E.PLAYER_USERNAME_UNRESOLVABLE]:   'Cannot resolve username for this player UUID.',
    [E.PLAYER_ACTION_INVALID]:          'Invalid player action.',
    [E.PLAYER_LIST_INVALID]:            'Invalid list name.',
    [E.PLAYER_SERVER_OFFLINE]:          'The server is offline. Start it before running player commands.',

    [E.RANK_NOT_FOUND]:                 'Rank not found.',
    [E.RANK_NAME_TAKEN]:                'A rank with this name already exists.',
    [E.RANK_BUILTIN_PROTECTED]:         'Built-in ranks cannot be deleted.',
    [E.RANK_FIELDS_INVALID]:            'Name, global permissions, and server permissions are required.',

    [E.FTP_CONFIG_INCOMPLETE]:          'Configure FTP credentials and port before enabling.',
    [E.FTP_PORT_TAKEN]:                 'This FTP port is already in use by another server.',

    [E.DISCORD_TOKEN_REQUIRED]:         'botToken and guildId are required.',
    [E.DISCORD_GUILD_INVALID]:          'Invalid Discord guild ID format.',
    [E.DISCORD_CONNECT_FAILED]:         'Failed to connect Discord bot.',

    [E.SYSTEM_PORT_INVALID]:            'Port must be between 1 and 65535.',
    [E.SYSTEM_PORT_IN_USE]:             'Port is already in use or restricted.',
    [E.SYSTEM_PORT_SAME]:               'New port must be different from the current port.',
    [E.SYSTEM_PORT_SWITCH_IN_PROGRESS]: 'A port change is already in progress.',

    [E.VALIDATION_ERROR]:               'Validation error.',
    [E.INTERNAL_ERROR]:                 'An internal error occurred. Please try again.',
    [E.NOT_FOUND]:                      'Resource not found.',
    [E.BAD_REQUEST]:                    'Bad request.',
};

class AppError extends Error {
    constructor(code, status = 500, detail = null) {
        const message = MESSAGES[code] || 'An error occurred.';
        super(message);
        this.code = code;
        this.status = status;
        this.detail = detail;
        this.timestamp = new Date().toISOString();
    }

    toResponse() {
        const body = {
            error:     MESSAGES[this.code] || 'An error occurred.',
            code:      this.code,
            timestamp: this.timestamp,
        };
        if (this.detail != null) {
            body.detail = this.detail;
            body.details = this.detail;
        }
        return body;
    }
}

// Convenience: send an error response directly
// Usage: sendError(res, E.SERVER_NOT_FOUND, 404)
// Usage: sendError(res, E.VALIDATION_ERROR, 400, 'Field X is required')
function sendError(res, code, status = 500, detail = null) {
    const err = new AppError(code, status, detail);
    return res.status(status).json(err.toResponse());
}

module.exports = { E, AppError, sendError, MESSAGES };
