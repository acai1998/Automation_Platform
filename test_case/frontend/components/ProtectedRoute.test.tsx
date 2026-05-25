import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ProtectedRoute from '@/components/ProtectedRoute';

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}));

vi.mock('wouter', () => ({
  useLocation: vi.fn(),
  Redirect: ({ to }: { to: string }) => <div data-testid="redirect" data-to={to} />,
}));

import { useAuth } from '@/contexts/AuthContext';
import { useLocation } from 'wouter';

const mockUseAuth = vi.mocked(useAuth);
const mockUseLocation = vi.mocked(useLocation);

describe('ProtectedRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseLocation.mockReturnValue(['/dashboard', vi.fn()]);
  });

  it('should show spinner when loading', () => {
    mockUseAuth.mockReturnValue({
      isAuthenticated: false,
      isLoading: true,
      user: null,
      login: vi.fn(),
      logout: vi.fn(),
      register: vi.fn(),
      refreshUser: vi.fn(),
    });

    render(
      <ProtectedRoute>
        <div>Protected Content</div>
      </ProtectedRoute>
    );

    expect(screen.getByText('加载中...')).toBeInTheDocument();
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
  });

  it('should redirect to /login when not authenticated', () => {
    mockUseAuth.mockReturnValue({
      isAuthenticated: false,
      isLoading: false,
      user: null,
      login: vi.fn(),
      logout: vi.fn(),
      register: vi.fn(),
      refreshUser: vi.fn(),
    });

    render(
      <ProtectedRoute>
        <div>Protected Content</div>
      </ProtectedRoute>
    );

    const redirect = screen.getByTestId('redirect');
    expect(redirect).toBeInTheDocument();
    expect(redirect.getAttribute('data-to')).toContain('/login');
  });

  it('should encode current path as returnUrl when not authenticated', () => {
    mockUseLocation.mockReturnValue(['/settings/profile', vi.fn()]);
    mockUseAuth.mockReturnValue({
      isAuthenticated: false,
      isLoading: false,
      user: null,
      login: vi.fn(),
      logout: vi.fn(),
      register: vi.fn(),
      refreshUser: vi.fn(),
    });

    render(
      <ProtectedRoute>
        <div>Protected Content</div>
      </ProtectedRoute>
    );

    const redirect = screen.getByTestId('redirect');
    const toProp = redirect.getAttribute('data-to');
    expect(toProp).toBe(`/login?returnUrl=${encodeURIComponent('/settings/profile')}`);
  });

  it('should render children when authenticated', () => {
    mockUseAuth.mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
      user: { id: 1, username: 'testuser', email: 'test@test.com', display_name: 'Test User', avatar: null, role: 'user', status: 'active' },
      login: vi.fn(),
      logout: vi.fn(),
      register: vi.fn(),
      refreshUser: vi.fn(),
    });

    render(
      <ProtectedRoute>
        <div>Protected Content</div>
      </ProtectedRoute>
    );

    expect(screen.getByText('Protected Content')).toBeInTheDocument();
    expect(screen.queryByTestId('redirect')).not.toBeInTheDocument();
    expect(screen.queryByText('加载中...')).not.toBeInTheDocument();
  });

  it('should render children when authenticated with different locations', () => {
    mockUseLocation.mockReturnValue(['/reports/daily', vi.fn()]);
    mockUseAuth.mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
      user: { id: 1, username: 'testuser', email: 'test@test.com', display_name: 'Test User', avatar: null, role: 'user', status: 'active' },
      login: vi.fn(),
      logout: vi.fn(),
      register: vi.fn(),
      refreshUser: vi.fn(),
    });

    render(
      <ProtectedRoute>
        <div>Reports Page</div>
      </ProtectedRoute>
    );

    expect(screen.getByText('Reports Page')).toBeInTheDocument();
    expect(screen.queryByTestId('redirect')).not.toBeInTheDocument();
  });
});
