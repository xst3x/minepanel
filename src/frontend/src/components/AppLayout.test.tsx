import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import AppLayout from './AppLayout.tsx';

vi.mock('../context/AuthContext.tsx', () => ({ useAuth: () => ({ user: { username: 'Alex', role: 'admin' }, logout: vi.fn() }) }));
vi.mock('../context/ServerModalsContext.tsx', () => ({
  ServerModalsProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useServerModals: () => ({ openCreate: vi.fn(), openImport: vi.fn() }),
}));
vi.mock('../lib/api.ts', () => ({ api: vi.fn(() => new Promise(() => {})), demoMode: false }));
vi.mock('./GlobalServerModals.tsx', () => ({ default: () => null }));
vi.mock('./Toast.tsx', () => ({ showConfirm: vi.fn(), toast: vi.fn() }));

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
    expect(document.querySelector('#content-bg-canvas')).not.toBeInTheDocument();
  });
});
