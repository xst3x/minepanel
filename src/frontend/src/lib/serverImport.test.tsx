import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom';
import { ToastProvider, toastProgress } from '../components/Toast';
import GlobalServerModals from '../components/GlobalServerModals';
import Panel from '../pages/Panel';
import { ServerModalsProvider, useServerModals } from '../context/ServerModalsContext';
import { startServerImport } from './serverImport';

const mocks = vi.hoisted(() => ({ create: vi.fn(), api: vi.fn() }));
vi.mock('./api', () => ({
  demoMode: false, createUploadRequest: mocks.create, getToken: () => 'test-token', api: mocks.api,
  extractApiErrorMessage: (data: any, status: number) => data?.error || `HTTP ${status}`,
}));
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: { id: 1, role: 'admin' } }) }));

const requests: any[] = [];
function request() {
  const xhr: any = { upload: {}, open: vi.fn(), setRequestHeader: vi.fn(), send: vi.fn(), status: 200, responseText: '{"id":1}' };
  requests.push(xhr);
  mocks.create.mockReturnValue(xhr);
  return xhr;
}
function Toolbar() {
  const { openImport } = useServerModals();
  return <><button onClick={openImport}>Open global import</button><Link to="/away">Navigate away</Link></>;
}
function mount(mode: 'panel' | 'global' = 'global') {
  mocks.api.mockImplementation(async (url: string) => url.includes('/versions') ? { paper: ['1.21'] } : []);
  render(<MemoryRouter initialEntries={['/panel']}><ToastProvider><ServerModalsProvider>
    <Toolbar />{mode === 'global' && <GlobalServerModals />}
    <Routes><Route path="/panel" element={mode === 'panel' ? <Panel /> : <p>Dashboard</p>} /><Route path="/away" element={<h1>Another page</h1>} /></Routes>
  </ServerModalsProvider></ToastProvider></MemoryRouter>);
}
async function submit(mode: 'panel' | 'global' = 'global') {
  fireEvent.click(screen.getByRole('button', { name: mode === 'global' ? 'Open global import' : 'Import Server' }));
  await waitFor(() => expect(screen.getByRole('combobox', { name: 'Minecraft Version' })).toHaveValue('1.21'));
  fireEvent.change(screen.getByLabelText('Server Archive (.zip)'), { target: { files: [new File(['zip'], 'my-world.zip', { type: 'application/zip' })] } });
  fireEvent.click(screen.getByRole('dialog').querySelector('button[type="submit"]')!);
}
function success(xhr: any) { act(() => xhr.onload?.()); }
afterEach(() => {
  for (const xhr of requests.splice(0)) act(() => xhr.onabort?.());
  cleanup();
  vi.clearAllMocks();
});

describe('background server import', () => {
  it.each(['panel', 'global'] as const)('closes the %s dialog immediately and shows persistent upload progress across navigation', async mode => {
    const xhr = request();
    mount(mode);
    await submit(mode);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
    expect(xhr.open).toHaveBeenCalledWith('POST', '/api/servers/import');
    expect(xhr.setRequestHeader).toHaveBeenCalledWith('Authorization', 'Bearer test-token');
    expect(xhr.timeout).toBe(0);
    const form = xhr.send.mock.calls[0][0] as FormData;
    expect(form.get('archive')).toBeInstanceOf(File);
    expect(form.get('ram_mb')).toBe('2048');
    fireEvent.click(screen.getByRole('link', { name: 'Navigate away' }));
    expect(screen.getByRole('heading', { name: 'Another page' })).toBeVisible();
    act(() => xhr.upload.onprogress({ loaded: 50 * 1024 ** 3, total: 100 * 1024 ** 3, lengthComputable: true }));
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '50');
    expect(screen.getByText(/50.00 GiB \/ 100.00 GiB/)).toBeVisible();
    act(() => xhr.upload.onload());
    expect(screen.getByRole('progressbar')).not.toHaveAttribute('aria-valuenow');
    expect(screen.getByText(/Extracting and configuring/)).toBeVisible();
    const change = vi.fn();
    window.addEventListener('mp:server-status-changed', change);
    success(xhr);
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    expect(screen.getByText(/imported successfully/)).toBeVisible();
    expect(change).toHaveBeenCalledTimes(1);
    window.removeEventListener('mp:server-status-changed', change);
  });

  it('does not close a newly opened dialog when an earlier import finishes', async () => {
    const xhr = request(); mount(); await submit();
    fireEvent.click(screen.getByRole('button', { name: 'Open global import' }));
    expect(screen.getByRole('dialog')).toBeVisible();
    success(xhr);
    expect(screen.getByRole('dialog')).toBeVisible();
  });

  it('shows the backend reason instead of IMPORT_UPLOAD_FAILED and releases navigation protection', async () => {
    const xhr = request(); mount(); await submit();
    const during = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(during);
    expect(during.defaultPrevented).toBe(true);
    xhr.status = 507;
    xhr.responseText = JSON.stringify({ error: 'IMPORT_UPLOAD_FAILED', message: 'Insufficient disk space for server import' });
    act(() => xhr.onload());
    expect(screen.getByText(/Insufficient disk space for server import/)).toBeVisible();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    const after = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(after);
    expect(after.defaultPrevented).toBe(false);
  });

  it.each(['onerror', 'ontimeout', 'onabort'])('settles progress on %s', async event => {
    const xhr = request(); mount(); await submit();
    act(() => xhr[event]());
    expect(screen.getByText(/Import of .* failed:/)).toBeVisible();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('handles synchronous send failure without trapping the form', async () => {
    const xhr = request(); xhr.send.mockImplementation(() => { throw new Error('Cannot read selected file'); });
    mount(); await submit();
    expect(screen.getByRole('dialog')).toBeVisible();
    expect(screen.getByText(/Cannot read selected file/)).toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('does not claim success for a non-JSON response', async () => {
    const xhr = request(); mount(); await submit(); xhr.responseText = '<html>Proxy error</html>';
    act(() => xhr.onload());
    expect(screen.getByText(/unexpected response \(HTTP 200\)/)).toBeVisible();
  });

  it('validates fields before creating an upload and preserves the demo provider boundary', () => {
    mount();
    const input = { file: new File(['zip'], 'world.zip'), name: 'World', software: 'paper', version: '1.21', ram: 2048, port: 25565, root: '' };
    act(() => expect(startServerImport({ ...input, port: 0 })).toBe(false));
    expect(mocks.create).not.toHaveBeenCalled();
    mocks.create.mockReturnValue(null);
    act(() => expect(startServerImport(input)).toBe(false));
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('keeps the existing callable progress-toast API and ignores updates after completion', () => {
    mount();
    let notification;
    act(() => { notification = toastProgress('Creating server'); });
    expect(screen.getByRole('progressbar')).not.toHaveAttribute('aria-valuenow');
    act(() => notification(null, 'Created'));
    act(() => notification.update({ progress: 50 }));
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    expect(screen.getByText('Created')).toBeVisible();
  });
});
