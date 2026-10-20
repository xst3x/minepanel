import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ServerFiles from './Files';
const { api } = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock('react-router-dom', () => ({ useOutletContext: () => ({ serverId: 1, hasPerm: () => true }) }));
vi.mock('../../lib/api', () => ({ api, getToken: vi.fn(), assetUrl: vi.fn(), request: vi.fn() }));
vi.mock('../../components/CodeEditor.tsx', () => ({ default: () => null }));
vi.mock('../../components/Toast.tsx', () => ({ toast: vi.fn(), toastProgress: () => vi.fn(), showConfirm: vi.fn(), showPrompt: vi.fn() }));
const folder = { name: 'Space Folder', isDirectory: true, size: 0 };
beforeEach(() => { api.mockReset(); api.mockImplementation(async (url) => url.includes('/list?') ? [folder] : {}); });
afterEach(cleanup);
async function openFolder() {
  fireEvent.click(await screen.findByText('Space Folder'));
  await waitFor(() => expect(document.querySelector('#fm-path')?.textContent).toBe('/Space Folder'));
}
function picker(files: File[]) { fireEvent.change(document.querySelector('input[type=file]')!, { target: { files } }); }
function uploads() { return api.mock.calls.filter(([url]) => url.endsWith('/upload')); }
describe('File Browser upload flow', () => {
  it.each([390, 768, 1440])('uses the shared mobile/tablet/desktop picker at width %s', async width => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
    render(<ServerFiles />);
    await openFolder();
    picker([new File(['a'], 'config.yml'), new File(['b'], 'unicode-\u914d.yml')]);
    await waitFor(() => expect(uploads()).toHaveLength(2));
    for (const [, options] of uploads()) {
      expect(options.body.get('path')).toBe('/Space Folder');
      expect(Array.from(options.body.keys())).toEqual(['path', 'file']);
    }
    await waitFor(() => expect(api.mock.calls.filter(([url]) => url.includes('path=%2FSpace%20Folder'))).toHaveLength(2));
    expect(document.querySelector('#fm-path')?.textContent).toBe('/Space Folder');
  });
  it('uploads to root explicitly', async () => {
    render(<ServerFiles />); await screen.findByText('Space Folder');
    picker([new File(['a'], 'root.yml')]);
    await waitFor(() => expect(uploads()).toHaveLength(1));
    expect(uploads()[0][1].body.get('path')).toBe('/');
  });
  it('uses the same destination for drag and drop', async () => {
    render(<ServerFiles />); await openFolder();
    fireEvent.drop(document.querySelector('.file-manager')!, { dataTransfer: { files: [new File(['x'], 'drop.yml')], items: [] } });
    await waitFor(() => expect(uploads()).toHaveLength(1));
    expect(uploads()[0][1].body.get('path')).toBe('/Space Folder');
  });
  it('keeps a batch destination and does not navigate back after switching folders', async () => {
    render(<ServerFiles />); await screen.findByText('Space Folder');
    let finish!: () => void;
    api.mockImplementation(async url => url.endsWith('/upload') ? new Promise<void>(resolve => { finish = resolve; }) : [folder]);
    picker([new File(['a'], 'first.yml'), new File(['b'], 'second.yml')]);
    await openFolder();
    await act(async () => { finish(); });
    await waitFor(() => expect(uploads()).toHaveLength(2));
    await act(async () => { finish(); });
    expect(uploads().map(([, options]) => options.body.get('path'))).toEqual(['/', '/']);
    expect(document.querySelector('#fm-path')?.textContent).toBe('/Space Folder');
    expect(api.mock.calls.filter(([url]) => url.includes('/list?'))).toHaveLength(2);
  });
  it('refreshes after each concurrent batch completes in the same directory', async () => {
    render(<ServerFiles />); await openFolder();
    const finishes: (() => void)[] = [];
    api.mockImplementation(async url => url.endsWith('/upload') ? new Promise<void>(resolve => finishes.push(resolve)) : [folder]);
    picker([new File(['a'], 'first.yml')]);
    picker([new File(['b'], 'second.yml')]);
    await act(async () => { finishes[0](); });
    await act(async () => { finishes[1](); });
    expect(api.mock.calls.filter(([url]) => url.includes('path=%2FSpace%20Folder'))).toHaveLength(3);
    expect(uploads().map(([, options]) => options.body.get('path'))).toEqual(['/Space Folder', '/Space Folder']);
  });

});
