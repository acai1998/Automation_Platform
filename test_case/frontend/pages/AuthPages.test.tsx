import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Login from '@/pages/Login';
import Register from '@/pages/Register';
import ForgotPassword from '@/pages/ForgotPassword';
import ResetPassword from '@/pages/ResetPassword';
import { useAuth } from '@/contexts/AuthContext';

const mockSetLocation = vi.fn();
const mockLogin = vi.fn();
const mockRegister = vi.fn();
const mockUseAuth = vi.mocked(useAuth);

vi.mock('wouter', () => ({
  Link: ({ children, href, className }: { children: React.ReactNode; href: string; className?: string }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
  useLocation: () => ['/login', mockSetLocation] as const,
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}));

vi.mock('@/services/authApi', () => ({
  forgotPassword: vi.fn(),
  resetPassword: vi.fn(),
}));

function renderWithRoute(path: string, ui: React.ReactElement) {
  window.history.pushState({}, '', path);
  return render(ui);
}

describe('Auth pages', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      login: mockLogin,
      logout: vi.fn(),
      register: mockRegister,
      refreshUser: vi.fn(),
    });
  });

  it.each([
    ['login', '/login', <Login />],
    ['register', '/register', <Register />],
    ['forgot-password', '/forgot-password', <ForgotPassword />],
    ['reset-password', '/reset-password?token=test-token', <ResetPassword />],
  ])('renders the shared auth desktop shell for %s', (_name, path, page) => {
    renderWithRoute(path, page);

    expect(screen.getByTestId('auth-shell')).toBeInTheDocument();
    expect(screen.getByTestId('auth-surface')).toBeInTheDocument();
    expect(screen.getByTestId('auth-brand-panel')).toBeInTheDocument();
    expect(screen.getByTestId('auth-terminal-demo')).toBeInTheDocument();
  });

  it('keeps reset password in the shared shell when token is missing', () => {
    renderWithRoute('/reset-password', <ResetPassword />);

    expect(screen.getByTestId('auth-shell')).toBeInTheDocument();
    expect(screen.getByTestId('auth-brand-panel')).toBeInTheDocument();
    expect(screen.getByTestId('auth-terminal-demo')).toBeInTheDocument();
  });
});
