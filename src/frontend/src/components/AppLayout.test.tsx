import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AppLayout from './AppLayout.tsx';

const session = vi.hoisted(() => ({ user: { username: 'Alex', role: 'admin', globalPermissions: [] as string[] } }));
vi.mock('../context/AuthContext.tsx', () => ({ useAuth: () => ({ user: session.user, logout: vi.fn() }) }));
vi.mock('../context/ServerModalsContext.tsx', () => ({
  ServerModalsProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useServerModals: () => ({ openCreate: vi.fn(), openImport: vi.fn() }),
}));
vi.mock('../lib/api.ts', () => ({ api: vi.fn(() => new Promise(() => {})), demoMode: false }));
vi.mock('./GlobalServerModals.tsx', () => ({ default: () => null }));
vi.mock('./McpNotifications', () => ({ default: () => null }));
vi.mock('./Toast.tsx', () => ({ showConfirm: vi.fn(), toast: vi.fn() }));
afterEach(() => cleanup());

describe('AppLayout', () => {
  it('renders navigation and a keyboard skip link without an animated content canvas', () => {
    render(
      <MemoryRouter initialEntries={['/panel']}>
        <Routes>
          <Route element={<AppLayout />}><Route path="/panel" element={<h1>Dashboard</h1>} /></Route>
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByRole('complementary', { name: 'Main navigation' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Skip to content' })).toHaveAttribute('href', `${window.location.pathname}#content-area`);
    expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'MCP Servers' })).toHaveAttribute('href', '/mcp-servers');
    expect(document.querySelector('#content-bg-canvas')).not.toBeInTheDocument();
  });
  it('shows MCP navigation to a Manager without granting general panel settings', () => {
    session.user = { username: 'Manager', role: 'user', globalPermissions: ['mcp.manage'] };
    render(<MemoryRouter><Routes><Route element={<AppLayout />}><Route path="/" element={<h1>Dashboard</h1>} /></Route></Routes></MemoryRouter>);
    expect(screen.getByRole('link', { name: 'MCP Servers' })).toHaveAttribute('href', '/mcp-servers');
    expect(screen.queryByRole('link', { name: 'Panel Settings' })).not.toBeInTheDocument();
  });
  it('hides MCP navigation when the user does not have its permission', () => {
    session.user = { username: 'Helper', role: 'user', globalPermissions: ['server.start'] };
    render(<MemoryRouter><Routes><Route element={<AppLayout />}><Route path="/" element={<h1>Dashboard</h1>} /></Route></Routes></MemoryRouter>);
    expect(screen.queryByRole('link', { name: 'MCP Servers' })).not.toBeInTheDocument();
  });
});
