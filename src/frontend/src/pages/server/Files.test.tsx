import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, useNavigate, useLocation } from 'react-router-dom';
import { showConfirm, showPrompt } from '../../components/Toast';
import ServerFiles from './Files';
const { api } = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock('react-router-dom', async importOriginal => ({ ...await importOriginal<typeof import('react-router-dom')>(), useOutletContext: () => ({ serverId: 1, hasPerm: () => true }) }));
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
    render(<MemoryRouter><ServerFiles /></MemoryRouter>);
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
    render(<MemoryRouter><ServerFiles /></MemoryRouter>); await screen.findByText('Space Folder');
    picker([new File(['a'], 'root.yml')]);
    await waitFor(() => expect(uploads()).toHaveLength(1));
    expect(uploads()[0][1].body.get('path')).toBe('/');
  });
  it('uses the same destination for drag and drop', async () => {
    render(<MemoryRouter><ServerFiles /></MemoryRouter>); await openFolder();
    fireEvent.drop(document.querySelector('.file-manager')!, { dataTransfer: { files: [new File(['x'], 'drop.yml')], items: [] } });
    await waitFor(() => expect(uploads()).toHaveLength(1));
    expect(uploads()[0][1].body.get('path')).toBe('/Space Folder');
  });
  it('keeps a batch destination and does not navigate back after switching folders', async () => {
    render(<MemoryRouter><ServerFiles /></MemoryRouter>); await screen.findByText('Space Folder');
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
    render(<MemoryRouter><ServerFiles /></MemoryRouter>); await openFolder();
    const finishes: (() => void)[] = [];
    api.mockImplementation(async url => url.endsWith('/upload') ? new Promise<void>(resolve => finishes.push(resolve)) : [folder]);
    picker([new File(['a'], 'first.yml')]);
    picker([new File(['b'], 'second.yml')]);
    await act(async () => { finishes[0](); });
    await act(async () => { finishes[1](); });
    expect(api.mock.calls.filter(([url]) => url.includes('path=%2FSpace%20Folder'))).toHaveLength(3);
    expect(uploads().map(([, options]) => options.body.get('path'))).toEqual(['/Space Folder', '/Space Folder']);
  });

  it('uploads a picked folder with its relative hierarchy', async () => {
    render(<MemoryRouter><ServerFiles /></MemoryRouter>); await openFolder();
    const file = new File(['data'], 'config.yml');
    Object.defineProperty(file, 'webkitRelativePath', { value: 'Essentials/sub/config.yml' });
    fireEvent.change(screen.getByLabelText('Upload folder'), { target: { files: [file] } });
    await waitFor(() => expect(uploads()).toHaveLength(1));
    expect(uploads()[0][1].body.get('path')).toBe('/Space Folder');
    expect(uploads()[0][1].body.get('relativePath')).toBe('Essentials/sub/config.yml');
  });
  it.each(['Delete', 'Rename', 'Move'])('keeps unaffected rows mounted through %s and background refresh', async action => {
    const keep = { name: 'keep.yml', isDirectory: false, size: 1 };
    const change = { name: 'change.yml', isDirectory: false, size: 1 };
    api.mockResolvedValue([folder, keep, change]);
    vi.mocked(showConfirm).mockResolvedValue(true);
    vi.mocked(showPrompt).mockResolvedValue(action === 'Move' ? '/elsewhere' : 'renamed.yml');
    render(<MemoryRouter initialEntries={['/?path=/plugins/Essentials']}><ServerFiles /></MemoryRouter>);
    const row = await screen.findByRole('button', { name: 'keep.yml', exact: true });
    let complete!: (value: any) => void;
    api.mockImplementation(async url => url.includes('/list?') ? new Promise(resolve => { complete = resolve; }) : {});
    fireEvent.click(screen.getByRole('button', { name: 'Actions for change.yml' }));
    fireEvent.click(screen.getByRole('button', { name: action, exact: true }));
    await waitFor(() => expect(complete).toBeTypeOf('function'));
    expect(row.isConnected).toBe(true);
    expect(screen.queryByText('Loading files...')).toBeNull();
    expect(screen.queryByText('This folder is empty.')).toBeNull();
    await act(async () => complete([folder, keep]));
    expect(screen.getByRole('button', { name: 'keep.yml', exact: true })).toBe(row);
    expect(document.querySelector('#fm-path')?.textContent).toBe('/plugins/Essentials');
  });
  it('preserves selection and URL while creating a folder', async () => {
    vi.mocked(showPrompt).mockResolvedValue('New directory');
    render(<MemoryRouter initialEntries={['/?path=/nested']}><ServerFiles /></MemoryRouter>);
    await screen.findByText('Space Folder');
    fireEvent.click(screen.getByRole('button', { name: 'Select', exact: true }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Space Folder' }));
    fireEvent.click(screen.getByRole('button', { name: 'New Folder', exact: true }));
    await waitFor(() => expect(api.mock.calls.filter(([url]) => url.includes('/list?'))).toHaveLength(2));
    expect(screen.getByRole('checkbox', { name: 'Space Folder' })).toHaveAttribute('aria-checked', 'true');
    expect(document.querySelector('#fm-path')?.textContent).toBe('/nested');
  });
  it('uses browser history for navigation without adding history during refresh', async () => {
    function HistoryControls() { const navigate = useNavigate(); const location = useLocation(); return <><button onClick={() => navigate(-1)}>Back</button><output>{location.search}</output></>; }
    render(<MemoryRouter><HistoryControls /><ServerFiles /></MemoryRouter>);
    await openFolder();
    expect(document.querySelector('output')?.textContent).toContain('path=%2FSpace+Folder');
    picker([new File(['a'], 'config.yml')]);
    await waitFor(() => expect(api.mock.calls.filter(([url]) => url.includes('/list?'))).toHaveLength(3));
    fireEvent.click(screen.getByRole('button', { name: 'Back', exact: true }));
    await waitFor(() => expect(document.querySelector('#fm-path')?.textContent).toBe('/'));
  });

  it('keeps rows and directory intact after a failed delete without refreshing', async () => {
    vi.mocked(showConfirm).mockResolvedValue(true);
    render(<MemoryRouter initialEntries={['/?path=/nested']}><ServerFiles /></MemoryRouter>);
    const row = await screen.findByRole('button', { name: 'Space Folder', exact: true });
    api.mockRejectedValueOnce(new Error('Permission denied'));
    fireEvent.click(screen.getByRole('button', { name: 'Actions for Space Folder' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete', exact: true }));
    await waitFor(() => expect(api).toHaveBeenCalledTimes(2));
    expect(row.isConnected).toBe(true);
    expect(document.querySelector('#fm-path')?.textContent).toBe('/nested');
    expect(api.mock.calls.filter(([url]) => url.includes('/list?'))).toHaveLength(1);
  });

});
