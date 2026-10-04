import { afterEach, describe, expect, it, vi } from 'vitest';
import { getBasePath, withBasePath } from './basePath';
import * as real from './backend/real';
import * as demo from './backend/mock';

afterEach(() => { document.querySelector('base')?.remove(); });
describe('installation URLs', () => {
  it('preserves root defaults and external/blob/data URLs', () => {
    expect(getBasePath()).toBe('/');
    expect(withBasePath('/api/servers')).toBe('/api/servers');
    for (const url of ['https://example.com/skin', '//example.com/skin', 'blob:example', 'data:image/png;base64,x', '']) expect(withBasePath(url)).toBe(url);
  });
  it('prefixes API, downloads, assets, console and leaves demo local', async () => {
    document.head.insertAdjacentHTML('afterbegin', '<base href="/panel/">');
    const fetcher = vi.fn().mockResolvedValue(new Response('{}', { headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetcher);
    vi.stubGlobal('WebSocket', vi.fn());
    expect(getBasePath()).toBe('/panel/');
    await real.api('/api/servers');
    expect(fetcher.mock.calls[0][0]).toBe('/panel/api/servers');
    await real.request('/api/download');
    expect(fetcher.mock.calls[1][0]).toBe('/panel/api/download');
    expect(real.assetUrl('/avatars/example.png')).toBe('/panel/avatars/example.png');
    real.createServerSocket('wss://host.test/ws?serverId=1');
    expect(WebSocket).toHaveBeenCalledWith('wss://host.test/panel/ws?serverId=1');
    fetcher.mockClear();
    expect((await demo.api('/api/servers')).length).toBeGreaterThan(0);
    await expect(demo.request('/api/download')).rejects.toMatchObject({ code: 'DEMO_UNAVAILABLE' });
    expect(fetcher).not.toHaveBeenCalled();
  });
});
