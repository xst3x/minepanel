import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as demo from './mock';
import * as real from './real';

describe('demo backend boundary', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('mp_token', 'real-secret');
    vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Network escaped'); }));
    vi.stubGlobal('WebSocket', vi.fn(() => { throw new Error('Socket escaped'); }));
    vi.stubGlobal('XMLHttpRequest', vi.fn(() => { throw new Error('Upload escaped'); }));
  });
  afterEach(() => {
    expect(fetch).not.toHaveBeenCalled();
    expect(WebSocket).not.toHaveBeenCalled();
    expect(XMLHttpRequest).not.toHaveBeenCalled();
  });
  it('isolates production credentials and provides an explorable administrator', async () => {
    expect(demo.getToken()).toBe('local-demo-session');
    demo.setToken(null);
    expect(localStorage.getItem('mp_token')).toBe('real-secret');
    expect(demo.accountStorageKey).not.toBe(real.accountStorageKey);
    expect((await demo.api('/api/users/me')).user.role).toBe('admin');
  });
  it.each([
    '/api/servers', '/api/users', '/api/users/permissions', '/api/ranks', '/api/docs', '/api/system/settings', '/api/system/metrics', '/api/discord/bots', '/api/system/versions?refresh=true',
    ...['', '/my-permissions', '/properties', '/stats?range=1h', '/files/list?path=/', '/files/read?path=/server.properties', '/backups', '/backup-config', '/logs', '/logs/read?file=latest.log', '/ftp', '/players/list', '/players/lists/whitelist', '/players/lists/ops', '/plugins/installed', '/plugins/modrinth/search?q=luck', '/plugins/datapacks/installed', '/automation', '/start-command', '/update/settings'].map(p => '/api/servers/1' + p),
  ])('serves %s locally', async path => { expect(await demo.api(path)).toBeDefined(); });
  it.each([
    ['POST', '/api/servers/create'], ['POST', '/api/servers/import'], ['DELETE', '/api/servers/1'], ['POST', '/api/servers/1/kill'],
    ['POST', '/api/servers/1/files/upload'], ['POST', '/api/servers/1/files/write'], ['POST', '/api/servers/1/backups/create'], ['POST', '/api/servers/1/backups/sample/restore'],
    ['POST', '/api/servers/1/plugins/install'], ['POST', '/api/servers/1/ftp/toggle'], ['GET', '/api/servers/1/ftp/password'], ['POST', '/api/servers/1/automation/run-test'],
    ['POST', '/api/servers/1/switch-software'], ['POST', '/api/servers/1/update/run'], ['POST', '/api/users/create'], ['POST', '/api/users/2/delete'], ['PUT', '/api/ranks/2'],
    ['POST', '/api/system/settings'], ['POST', '/api/discord/bots/validate-token'], ['GET', '/api/auth/2fa/setup'], ['POST', '/api/auth/login'],
    ['GET', '/api/servers/1/backups/sample/download'], ['GET', '/api/servers/1/files/download?path=/server.properties'], ['GET', '/api/future-route'], ['GET', 'https://real.example/api/servers'],
  ])('restricts %s %s with a consistent notice', async (method, path) => {
    const notice = vi.fn(); window.addEventListener('minepanel:demo-unavailable', notice);
    await expect(demo.api(path, { method })).rejects.toMatchObject({ code: 'DEMO_UNAVAILABLE' });
    expect(notice).toHaveBeenCalledOnce(); window.removeEventListener('minepanel:demo-unavailable', notice);
  });
  it('never falls back for downloads or multipart uploads', async () => {
    await expect(demo.request('/api/download')).rejects.toMatchObject({ code: 'DEMO_UNAVAILABLE' });
    expect(demo.createUploadRequest()).toBeNull();
    await expect(demo.api('/api/servers/1/files/upload', { method: 'POST', body: new FormData() })).rejects.toMatchObject({ code: 'DEMO_UNAVAILABLE' });
  });
  it('uses current docs without visible frontmatter', async () => {
    const docs = await demo.api('/api/docs'); expect(docs.length).toBeGreaterThan(5);
    expect(docs[0].category).toBe('getting-started'); expect(docs.every(d => !d.content.startsWith('---'))).toBe(true);
  });
  it('simulates lifecycle and console events locally and cancels closed sockets', async () => {
    vi.useFakeTimers();
    const socket = demo.createServerSocket('ws://real.example/ws?serverId=1');
    const events: any[] = []; socket.onmessage = e => events.push(JSON.parse(e.data));
    socket.onopen = () => socket.send(JSON.stringify({ type: 'auth', token: 'ignored' }));
    await vi.advanceTimersByTimeAsync(1);
    expect(events.find(e => e.type === 'history').data.length).toBeGreaterThan(0);
    await demo.api('/api/servers/1/stop', { method: 'POST' });
    expect((await demo.api('/api/servers/1')).status).toBe('offline');
    await demo.api('/api/servers/1/restart', { method: 'POST' });
    expect((await demo.api('/api/servers/1')).status).toBe('online');
    socket.send(JSON.stringify({ type: 'command', data: 'list' })); await Promise.resolve();
    expect(events.some(e => e.type === 'console' && e.data.includes('Player1'))).toBe(true);
    const before = events.length; socket.close(); await vi.advanceTimersByTimeAsync(6000);
    expect(events.length).toBe(before); expect(vi.getTimerCount()).toBe(0); vi.useRealTimers();
  });
});

describe('production provider contract', () => {
  it('retains Bearer auth, request URL, JSON body and error codes', async () => {
    real.setToken('production-token');
    const fetcher = vi.fn().mockResolvedValue(new Response('{"ok":true}', { headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetcher);
    expect(await real.api('/api/servers/1/start', { method: 'POST', body: { value: 1 } })).toEqual({ ok: true });
    const [url, opts] = fetcher.mock.calls[0]; expect(url).toBe('/api/servers/1/start');
    expect(opts.headers.get('Authorization')).toBe('Bearer production-token'); expect(opts.body).toBe('{"value":1}');
    fetcher.mockResolvedValue(new Response('{"code":"AUTH_INVALID_CREDENTIALS"}', { status: 401, headers: { 'Content-Type': 'application/json' } }));
    await expect(real.api('/api/auth/login', { method: 'POST' })).rejects.toMatchObject({ status: 401, code: 'AUTH_INVALID_CREDENTIALS', message: 'Invalid username or password.' });
  });
  it('preserves multipart bodies, download options and native transports', async () => {
    const body = new FormData(); body.append('file', 'sample');
    const fetcher = vi.fn().mockResolvedValue(new Response('ok')); vi.stubGlobal('fetch', fetcher);
    await real.api('/api/upload', { method: 'POST', body });
    expect(fetcher.mock.calls[0][1].body).toBe(body); expect(fetcher.mock.calls[0][1].headers.has('Content-Type')).toBe(false);
    await real.request('/api/download', { headers: { Authorization: 'Bearer x' } });
    expect(fetcher).toHaveBeenLastCalledWith('/api/download', { headers: { Authorization: 'Bearer x' } });
    const ws = vi.fn(); const xhr = vi.fn(); vi.stubGlobal('WebSocket', ws); vi.stubGlobal('XMLHttpRequest', xhr);
    real.createServerSocket('wss://panel.test/ws?serverId=1'); real.createUploadRequest();
    expect(ws).toHaveBeenCalledWith('wss://panel.test/ws?serverId=1'); expect(xhr).toHaveBeenCalledOnce(); expect(real.demoMode).toBe(false);
  });
});
