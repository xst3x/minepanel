import { extractApiErrorMessage } from './errors';
import { withBasePath } from '../basePath';
import type { RequestOptions } from './types';
export { extractApiErrorMessage } from './errors';
export const demoMode = false;
export const accountStorageKey = 'mp_accounts';
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

export async function api(path, opts: RequestOptions = {}) {
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

  const res = await fetch(withBasePath(path), { ...opts, headers, body });
  const ct = res.headers.get('content-type') || '';
  const data = ct.includes('application/json') ? await res.json().catch(() => null) : await res.text();
  if (!res.ok) {
    const message = extractApiErrorMessage(data, res.status);
    const err = new Error(message) as Error & { status: number; code: string; data: unknown };
    err.status = res.status;
    err.code = data?.code;
    err.data = data;
    throw err;
  }
  return data;
}

export const request = (path: string, opts?: RequestInit) => fetch(withBasePath(path), opts);
export const createServerSocket = (url: string) => {
  const socketUrl = new URL(url);
  socketUrl.pathname = withBasePath(socketUrl.pathname);
  return new WebSocket(socketUrl.toString());
};
export const createUploadRequest = () => new XMLHttpRequest();

export const assetUrl = withBasePath;

export const allowBackendAction = () => true;
