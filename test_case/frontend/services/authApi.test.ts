import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getToken,
  setToken,
  clearToken,
  setRefreshToken,
  getRefreshToken,
  register,
  logout,
  forgotPassword,
  resetPassword,
  getCurrentUser,
  refreshAuthToken,
} from '@/services/authApi';

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string): string | null => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
  };
})();

const sessionStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string): string | null => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
  };
})();

Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock });
Object.defineProperty(globalThis, 'sessionStorage', { value: sessionStorageMock });

const fetchSpy = vi.fn();
globalThis.fetch = fetchSpy;

describe('getToken', () => {
  beforeEach(() => {
    localStorageMock.getItem.mockReset();
    sessionStorageMock.getItem.mockReset();
    localStorageMock.clear();
    sessionStorageMock.clear();
  });

  it('returns localStorage token when present', () => {
    localStorageMock.getItem.mockReturnValueOnce('local-token');
    const result = getToken();
    expect(result).toBe('local-token');
    expect(localStorageMock.getItem).toHaveBeenCalledWith('auth_token');
  });

  it('returns sessionStorage token when localStorage is empty', () => {
    localStorageMock.getItem.mockReturnValueOnce(null);
    sessionStorageMock.getItem.mockReturnValueOnce('session-token');
    const result = getToken();
    expect(result).toBe('session-token');
  });

  it('returns null when both storages are empty', () => {
    localStorageMock.getItem.mockReturnValueOnce(null);
    sessionStorageMock.getItem.mockReturnValueOnce(null);
    const result = getToken();
    expect(result).toBeNull();
  });
});

describe('setToken', () => {
  beforeEach(() => {
    localStorageMock.setItem.mockReset();
    sessionStorageMock.setItem.mockReset();
  });

  it('stores in localStorage when remember=true', () => {
    setToken('my-token', true);
    expect(localStorageMock.setItem).toHaveBeenCalledWith('auth_token', 'my-token');
    expect(sessionStorageMock.setItem).not.toHaveBeenCalled();
  });

  it('stores in sessionStorage when remember=false', () => {
    setToken('my-token', false);
    expect(sessionStorageMock.setItem).toHaveBeenCalledWith('auth_token', 'my-token');
    expect(localStorageMock.setItem).not.toHaveBeenCalled();
  });

  it('defaults remember to false', () => {
    setToken('my-token');
    expect(sessionStorageMock.setItem).toHaveBeenCalledWith('auth_token', 'my-token');
  });
});

describe('clearToken', () => {
  beforeEach(() => {
    localStorageMock.removeItem.mockReset();
    sessionStorageMock.removeItem.mockReset();
  });

  it('removes tokens from both storages', () => {
    clearToken();
    expect(localStorageMock.removeItem).toHaveBeenCalledWith('auth_token');
    expect(sessionStorageMock.removeItem).toHaveBeenCalledWith('auth_token');
    expect(localStorageMock.removeItem).toHaveBeenCalledWith('refresh_token');
  });
});

describe('setRefreshToken', () => {
  beforeEach(() => {
    localStorageMock.setItem.mockReset();
  });

  it('stores refresh token in localStorage', () => {
    setRefreshToken('refresh-123');
    expect(localStorageMock.setItem).toHaveBeenCalledWith('refresh_token', 'refresh-123');
  });
});

describe('getRefreshToken', () => {
  beforeEach(() => {
    localStorageMock.getItem.mockReset();
  });

  it('returns refresh token from localStorage', () => {
    localStorageMock.getItem.mockReturnValueOnce('refresh-abc');
    const result = getRefreshToken();
    expect(result).toBe('refresh-abc');
    expect(localStorageMock.getItem).toHaveBeenCalledWith('refresh_token');
  });

  it('returns null when no refresh token exists', () => {
    localStorageMock.getItem.mockReturnValueOnce(null);
    const result = getRefreshToken();
    expect(result).toBeNull();
  });
});

describe('register', () => {
  beforeEach(() => {
    fetchSpy.mockReset();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends POST with correct body', async () => {
    const mockResponse = { success: true, message: '注册成功', user: { id: 1 } };
    fetchSpy.mockResolvedValueOnce({
      json: () => Promise.resolve(mockResponse),
    });

    const result = await register('test@example.com', 'pass123', 'testuser');

    expect(fetchSpy).toHaveBeenCalledWith('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'test@example.com', password: 'pass123', username: 'testuser' }),
    });
    expect(result).toEqual(mockResponse);
  });

  it('handles network error', async () => {
    fetchSpy.mockRejectedValueOnce(new Error('Network error'));

    const result = await register('test@example.com', 'pass123', 'testuser');

    expect(result.success).toBe(false);
    expect(result.message).toContain('网络错误');
  });
});

describe('logout', () => {
  beforeEach(() => {
    fetchSpy.mockReset();
    localStorageMock.getItem.mockReset();
    localStorageMock.removeItem.mockReset();
    sessionStorageMock.removeItem.mockReset();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends POST and clears token', async () => {
    localStorageMock.getItem.mockReturnValueOnce('valid-token');
    const mockResponse = { success: true, message: '已登出' };
    fetchSpy.mockResolvedValueOnce({
      json: () => Promise.resolve(mockResponse),
    });

    const result = await logout();

    expect(fetchSpy).toHaveBeenCalledWith('/api/auth/logout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer valid-token',
      },
    });
    expect(localStorageMock.removeItem).toHaveBeenCalledWith('auth_token');
    expect(sessionStorageMock.removeItem).toHaveBeenCalledWith('auth_token');
    expect(result).toEqual(mockResponse);
  });
});

describe('forgotPassword', () => {
  beforeEach(() => {
    fetchSpy.mockReset();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends POST with email', async () => {
    const mockResponse = { success: true, message: '邮件已发送' };
    fetchSpy.mockResolvedValueOnce({
      json: () => Promise.resolve(mockResponse),
    });

    const result = await forgotPassword('user@test.com');

    expect(fetchSpy).toHaveBeenCalledWith('/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'user@test.com' }),
    });
    expect(result).toEqual(mockResponse);
  });

  it('handles network error', async () => {
    fetchSpy.mockRejectedValueOnce(new Error('fail'));

    const result = await forgotPassword('user@test.com');

    expect(result.success).toBe(false);
  });
});

describe('resetPassword', () => {
  beforeEach(() => {
    fetchSpy.mockReset();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends POST with token and password', async () => {
    const mockResponse = { success: true, message: '密码已重置' };
    fetchSpy.mockResolvedValueOnce({
      json: () => Promise.resolve(mockResponse),
    });

    const result = await resetPassword('reset-token-xyz', 'newpass');

    expect(fetchSpy).toHaveBeenCalledWith('/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: 'reset-token-xyz', password: 'newpass' }),
    });
    expect(result).toEqual(mockResponse);
  });

  it('handles network error', async () => {
    fetchSpy.mockRejectedValueOnce(new Error('fail'));

    const result = await resetPassword('token', 'pass');

    expect(result.success).toBe(false);
  });
});

describe('getCurrentUser', () => {
  beforeEach(() => {
    fetchSpy.mockReset();
    localStorageMock.getItem.mockReset();
    sessionStorageMock.getItem.mockReset();
    localStorageMock.removeItem.mockReset();
    sessionStorageMock.removeItem.mockReset();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns user when authenticated', async () => {
    localStorageMock.getItem.mockReturnValue('valid-token');
    const mockUser = { id: 1, username: 'test', email: 'test@test.com', role: 'user', status: 'active', display_name: null, avatar: null };
    fetchSpy.mockResolvedValueOnce({
      status: 200,
      json: () => Promise.resolve({ success: true, user: mockUser }),
    });

    const result = await getCurrentUser();

    expect(fetchSpy).toHaveBeenCalledWith('/api/auth/me', {
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer valid-token',
      },
    });
    expect(result.success).toBe(true);
    expect(result.user).toEqual(mockUser);
  });

  it('returns failure when no token', async () => {
    localStorageMock.getItem.mockReturnValue(null);
    sessionStorageMock.getItem.mockReturnValue(null);

    const result = await getCurrentUser();

    expect(result.success).toBe(false);
    expect(result.message).toBe('未登录');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('attempts token refresh on 401', async () => {
    localStorageMock.getItem.mockImplementation((key: string) => {
      if (key === 'auth_token') return 'expired-token';
      if (key === 'refresh_token') return 'refresh-token';
      return null;
    });

    fetchSpy
      .mockResolvedValueOnce({ status: 401, json: () => Promise.resolve({}) })
      .mockResolvedValueOnce({ json: () => Promise.resolve({ success: true, token: 'new-token' }) })
      .mockResolvedValueOnce({ status: 200, json: () => Promise.resolve({ success: true, user: { id: 1 } }) });

    const result = await getCurrentUser();

    expect(result.success).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });
});

describe('refreshAuthToken', () => {
  beforeEach(() => {
    fetchSpy.mockReset();
    localStorageMock.getItem.mockReset();
    localStorageMock.setItem.mockReset();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns false when no refresh token', async () => {
    localStorageMock.getItem.mockReturnValueOnce(null);

    const result = await refreshAuthToken();

    expect(result).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('sends refresh request and stores new token', async () => {
    localStorageMock.getItem.mockReturnValueOnce('refresh-123');
    fetchSpy.mockResolvedValueOnce({
      json: () => Promise.resolve({ success: true, token: 'new-access-token' }),
    });

    const result = await refreshAuthToken();

    expect(fetchSpy).toHaveBeenCalledWith('/api/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: 'refresh-123' }),
    });
    expect(localStorageMock.setItem).toHaveBeenCalledWith('auth_token', 'new-access-token');
    expect(result).toBe(true);
  });

  it('returns false on refresh failure', async () => {
    localStorageMock.getItem.mockReturnValueOnce('refresh-123');
    fetchSpy.mockResolvedValueOnce({
      json: () => Promise.resolve({ success: false }),
    });

    const result = await refreshAuthToken();

    expect(result).toBe(false);
  });

  it('returns false on network error', async () => {
    localStorageMock.getItem.mockReturnValueOnce('refresh-123');
    fetchSpy.mockRejectedValueOnce(new Error('network'));

    const result = await refreshAuthToken();

    expect(result).toBe(false);
  });
});
