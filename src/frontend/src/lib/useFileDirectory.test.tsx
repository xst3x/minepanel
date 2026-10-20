import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { createRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { captureFileScroll, useFileDirectory } from './useFileDirectory';
const { api } = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock('./api', () => ({ api }));
vi.mock('../components/Toast', () => ({ toast: vi.fn() }));
const entries = Array.from({ length: 500 }, (_, i) => ({ name: `file-${i}.yml`, isDirectory: false, size: i }));
function deferred() { let resolve!: (value: any) => void; let reject!: (reason: any) => void; const promise = new Promise<any>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
beforeEach(() => api.mockReset());
afterEach(cleanup);
describe('directory revalidation', () => {
  it('retains hundreds of entries while refreshing and on network failure', async () => {
    api.mockResolvedValueOnce(entries);
    const container = createRef<HTMLDivElement>();
    const { result } = renderHook(() => useFileDirectory('1', '/plugins', container));
    await waitFor(() => expect(result.current.items).toHaveLength(500));
    const pending = deferred(); api.mockReturnValueOnce(pending.promise);
    act(() => { void result.current.refresh(); });
    expect(result.current.items).toBe(entries);
    expect(result.current.initialLoading).toBe(false);
    expect(result.current.navigating).toBe(false);
    await act(async () => pending.reject(new Error('offline')));
    expect(result.current.items).toBe(entries);
    expect(result.current.error).toBe('offline');
    expect(result.current.currentPath).toBe('/plugins');
  });
  it('coalesces rapid mutations and discards snapshots from before the last mutation', async () => {
    api.mockResolvedValueOnce(entries);
    const container = createRef<HTMLDivElement>();
    const { result } = renderHook(() => useFileDirectory('1', '/', container));
    await waitFor(() => expect(result.current.items).toHaveLength(500));
    const first = deferred(), second = deferred();
    api.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    act(() => { void result.current.refresh(); void result.current.refresh(); void result.current.refresh(); });
    expect(api).toHaveBeenCalledTimes(2);
    await act(async () => first.resolve([]));
    expect(result.current.items).toBe(entries);
    expect(api).toHaveBeenCalledTimes(3);
    await act(async () => second.resolve(entries.slice(1)));
    expect(result.current.items).toHaveLength(499);
  });
  it('ignores old directory responses, failures, and mutation completions after navigation', async () => {
    api.mockResolvedValueOnce(entries);
    const container = createRef<HTMLDivElement>();
    const { result, rerender } = renderHook(({ path }) => useFileDirectory('1', path, container), { initialProps: { path: '/' } });
    await waitFor(() => expect(result.current.items).toHaveLength(500));
    const pending = deferred(); api.mockReturnValueOnce(pending.promise).mockResolvedValueOnce([entries[2]]);
    const oldRefresh = result.current.refresh;
    act(() => { void oldRefresh(); });
    rerender({ path: '/plugins/Essentials' });
    await waitFor(() => expect(result.current.currentPath).toBe('/plugins/Essentials'));
    await act(async () => { pending.reject(new Error('stale failure')); await oldRefresh(); });
    expect(result.current.items).toEqual([entries[2]]);
    expect(result.current.error).toBe('');
    expect(api).toHaveBeenCalledTimes(3);
  });
  it('keeps the newest folder when navigation responses arrive out of order', async () => {
    const root = deferred(), nested = deferred();
    api.mockReturnValueOnce(root.promise).mockReturnValueOnce(nested.promise);
    const container = createRef<HTMLDivElement>();
    const { result, rerender } = renderHook(({ path }) => useFileDirectory('1', path, container), { initialProps: { path: '/' } });
    rerender({ path: '/plugins/nested' });
    await act(async () => nested.resolve([entries[3]]));
    await act(async () => root.resolve(entries));
    expect(result.current.currentPath).toBe('/plugins/nested');
    expect(result.current.items).toEqual([entries[3]]);
  });
});
describe('scroll commit policy', () => {
  it('preserves the actual scroller offset, clamps shrinking content, and resets only navigation', () => {
    const scroller = document.createElement('div'); scroller.style.overflowY = 'auto';
    const content = document.createElement('div'); scroller.append(content); document.body.append(scroller);
    Object.defineProperties(scroller, { scrollHeight: { configurable: true, value: 2000 }, clientHeight: { value: 500 } });
    scroller.scrollTop = 1200;
    const restore = captureFileScroll(content);
    scroller.scrollTop = 900; restore(); expect(scroller.scrollTop).toBe(1200);
    Object.defineProperty(scroller, 'scrollHeight', { value: 1000 });
    restore(); expect(scroller.scrollTop).toBe(500);
    restore(true); expect(scroller.scrollTop).toBe(0);
    scroller.remove();
  });
});
