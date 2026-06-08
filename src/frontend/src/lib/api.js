// Thin fetch wrapper for the existing Express backend.
// All requests are proxied through Vite dev server (see vite.config.js).

const TOKEN_KEY = 'mp_token';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(t) {
  if (t) localStorage.setItem(TOKEN_KEY, t);
  else localStorage.removeItem(TOKEN_KEY);
}

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

export async function api(path, opts = {}) {
  const headers = new Headers(opts.headers || {});
  const token = getToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (opts.body && !(opts.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const body =
    opts.body && !(opts.body instanceof FormData) && typeof opts.body !== 'string'
      ? JSON.stringify(opts.body)
      : opts.body;

  const res = await fetch(path, { ...opts, headers, body });
  const ct = res.headers.get('content-type') || '';
  const data = ct.includes('application/json') ? await res.json().catch(() => null) : await res.text();
  if (!res.ok) {
    const code = data?.code;
    const message =
      (code && ERROR_MESSAGES[code]) ||
      (data?.detail && typeof data.detail === 'string' ? data.detail : null) ||
      (data?.error && !data.error.toLowerCase().includes('internal') ? data.error : null) ||
      (res.status === 403 ? 'You don\'t have permission to do that.' : null) ||
      (res.status === 404 ? 'Resource not found.' : null) ||
      (res.status === 429 ? 'Too many requests. Please slow down.' : null) ||
      (res.status >= 500 ? 'Something went wrong on the server. Please try again.' : null) ||
      res.statusText ||
      'Request failed';
    const err = new Error(message);
    err.status = res.status;
    err.code = code;
    err.data = data;
    throw err;
  }
  return data;
}
