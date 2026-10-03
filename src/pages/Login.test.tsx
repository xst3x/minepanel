import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import Login from './Login.tsx';

vi.mock('../context/AuthContext.tsx', () => ({
  useAuth: () => ({ login: vi.fn() })
}));

describe('Login', () => {
  it('renders an open, accessible sign-in form without the animated canvas', () => {
    render(<MemoryRouter><Login /></MemoryRouter>);

    expect(screen.getByRole('heading', { name: 'MinePanel' })).toBeInTheDocument();
    expect(screen.getByLabelText('Username')).toBeVisible();
    expect(screen.getByLabelText('Password')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Login' })).toBeVisible();
    expect(document.querySelector('#content-bg-canvas')).not.toBeInTheDocument();
  });
});
