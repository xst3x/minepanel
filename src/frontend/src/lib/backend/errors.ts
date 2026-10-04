// Human-readable overrides for known backend error codes
const ERROR_MESSAGES = {
  PLAYER_SERVER_OFFLINE:        'The server is offline. Start it before running player commands.',
  SERVER_MUST_BE_STOPPED:       'Stop the server before performing this action.',
  SERVER_NOT_RUNNING:           'The server is not running.',
  SERVER_ALREADY_RUNNING:       'The server is already running.',
  SERVER_LOCKED:                'Another action is already in progress for this server.',
  SERVER_NOT_FOUND:             'Server not found.',
  PLAYER_USERNAME_UNRESOLVABLE: 'Cannot resolve username for this player. Have they joined at least once?',
  PLAYER_ACTION_INVALID:        'Invalid player action.',
  FILE_ACCESS_DENIED:           'Access denied — path is outside the server directory.',
  FILE_TOO_LARGE:               'File is too large to edit here. Download it instead.',
  FILE_ALREADY_EXISTS:          'A file with this name already exists.',
  BACKUP_FAILED:                'Backup failed. Check server logs for details.',
  FORBIDDEN:                    'You don\'t have permission to do that.',
  FORBIDDEN_ADMIN_ONLY:         'Only administrators can do that.',
  AUTH_INVALID_CREDENTIALS:     'Invalid username or password.',
  USER_ALREADY_EXISTS:          'That username is already taken.',
  USER_PASSWORD_TOO_SHORT:      'Password must be at least 8 characters.',
};

// Shared error-message extraction, so any request path (fetch-based api()
// or a raw XMLHttpRequest like the server-import uploader) surfaces the
// same real, human-readable reason instead of a generic "unknown error".
export function extractApiErrorMessage(data, status) {
  const code = data?.code;
  return (
    (code && ERROR_MESSAGES[code]) ||
    (data?.detail && typeof data.detail === 'string' ? data.detail : null) ||
    (data?.details && typeof data.details === 'string' ? data.details : null) ||
    (data?.error && typeof data.error === 'string' && !data.error.toLowerCase().includes('internal') ? data.error : null) ||
    (data?.message && typeof data.message === 'string' ? data.message : null) ||
    (status === 403 ? 'You don\'t have permission to do that.' : null) ||
    (status === 404 ? 'Resource not found.' : null) ||
    (status === 409 ? 'This conflicts with an existing resource (name or port already in use).' : null) ||
    (status === 429 ? 'Too many requests. Please slow down.' : null) ||
    (status >= 500 ? 'Something went wrong on the server. Please try again.' : null) ||
    'Request failed.'
  );
}

