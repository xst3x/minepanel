// ── Demo Mode API ───────────────────────────────────────────────────────────
// This file replaces the real fetch-based API with the mock API service.
// All components import from this file and get mock data transparently.

import { mockApi, getToken, setToken } from '../services/mockApi.js';

export { getToken, setToken };

// Error messages that match the real API interface
const ERROR_MESSAGES = {
  DEMO_RESTRICTION:               'This feature is unavailable in the demo version.',
  AUTH_INVALID_CREDENTIALS:       'Invalid username or password.',
  FORBIDDEN:                      'You don\'t have permission to do that.',
  FILE_ACCESS_DENIED:             'Access denied in demo mode.',
  FILE_TOO_LARGE:                 'File is too large to edit here.',
};

export async function api(path, opts = {}) {
  try {
    const result = await mockApi(path, opts);
    return result;
  } catch (err) {
    // Enhance errors with user-friendly messages matching the real API
    const code = err.code;
    if (code && ERROR_MESSAGES[code]) {
      const enhanced = new Error(ERROR_MESSAGES[code]);
      enhanced.status = err.status || 403;
      enhanced.code = code;
      throw enhanced;
    }
    throw err;
  }
}

export default api;
