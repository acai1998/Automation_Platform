const API_BASE_URL = '/api/auth';

// 用户信息类型
export interface UserInfo {
  id: number;
  username: string;
  email: string;
  display_name: string | null;
  avatar: string | null;
  role: string;
  status: string;
}

// API 响应类型
interface AuthResponse {
  success: boolean;
  message: string;
  user?: UserInfo;
  token?: string;
  refreshToken?: string;
}

// 获取存储的 Token
export function getToken(): string | null {
  return localStorage.getItem('auth_token') || sessionStorage.getItem('auth_token');
}

// 存储 Token
export function setToken(token: string, remember = false): void {
  if (remember) {
    localStorage.setItem('auth_token', token);
  } else {
    sessionStorage.setItem('auth_token', token);
  }
}

// 清除 Token
export function clearToken(): void {
  localStorage.removeItem('auth_token');
  sessionStorage.removeItem('auth_token');
  localStorage.removeItem('refresh_token');
}

// 存储刷新 Token
export function setRefreshToken(token: string): void {
  localStorage.setItem('refresh_token', token);
}

// 获取刷新 Token
export function getRefreshToken(): string | null {
  return localStorage.getItem('refresh_token');
}

// 带认证头的 fetch
async function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  return fetch(url, { ...options, headers });
}

// 用户注册
export async function register(
  email: string,
  password: string,
  username: string
): Promise<AuthResponse> {
  try {
    const response = await fetch(`${API_BASE_URL}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, username }),
    });
    return await response.json();
  } catch (error) {
    console.error('Register error:', error);
    return { success: false, message: '网络错误，请稍后重试' };
  }
}

// 用户登录
export async function login(
  email: string,
  password: string,
  remember = false
): Promise<AuthResponse> {
  try {
    const response = await fetch(`${API_BASE_URL}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, remember }),
    });

    // 检查响应是否有内容
    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      console.error('Login error: Non-JSON response', {
        status: response.status,
        statusText: response.statusText,
        contentType
      });
      return { 
        success: false, 
        message: `服务器返回异常响应 (${response.status}): ${response.statusText}` 
      };
    }

    const text = await response.text();
    if (!text || text.trim() === '') {
      console.error('Login error: Empty response body');
      return { 
        success: false, 
        message: '服务器返回空响应，请检查后端服务是否正常运行' 
      };
    }

    const data: AuthResponse = JSON.parse(text);

    if (data.success && data.token) {
      setToken(data.token, remember);
      if (data.refreshToken) {
        setRefreshToken(data.refreshToken);
      }
    }

    return data;
  } catch (error) {
    console.error('Login error:', error);
    if (error instanceof SyntaxError) {
      return { success: false, message: 'JSON 解析失败，请检查后端服务' };
    }
    return { success: false, message: '网络错误，请稍后重试' };
  }
}

// 用户登出
export async function logout(): Promise<{ success: boolean; message: string }> {
  try {
    const response = await authFetch(`${API_BASE_URL}/logout`, {
      method: 'POST',
    });
    const data = await response.json();
    clearToken();
    return data;
  } catch (error) {
    console.error('Logout error:', error);
    clearToken();
    return { success: true, message: '已登出' };
  }
}

// 忘记密码
export async function forgotPassword(
  email: string
): Promise<{ success: boolean; message: string }> {
  try {
    const response = await fetch(`${API_BASE_URL}/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    return await response.json();
  } catch (error) {
    console.error('Forgot password error:', error);
    return { success: false, message: '网络错误，请稍后重试' };
  }
}

// 重置密码
export async function resetPassword(
  token: string,
  password: string
): Promise<{ success: boolean; message: string }> {
  try {
    const response = await fetch(`${API_BASE_URL}/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, password }),
    });
    return await response.json();
  } catch (error) {
    console.error('Reset password error:', error);
    return { success: false, message: '网络错误，请稍后重试' };
  }
}

// 获取当前用户信息
export async function getCurrentUser(): Promise<{ success: boolean; user?: UserInfo; message?: string }> {
  try {
    const token = getToken();
    if (!token) {
      return { success: false, message: '未登录' };
    }

    const response = await authFetch(`${API_BASE_URL}/me`);

    if (response.status === 401) {
      // Token 过期，尝试刷新
      const refreshed = await refreshAuthToken();
      if (refreshed) {
        const retryResponse = await authFetch(`${API_BASE_URL}/me`);
        return await retryResponse.json();
      }
      clearToken();
      return { success: false, message: '登录已过期' };
    }

    return await response.json();
  } catch (error) {
    console.error('Get current user error:', error);
    return { success: false, message: '网络错误' };
  }
}

// 刷新 Token
export async function refreshAuthToken(): Promise<boolean> {
  try {
    const refreshToken = getRefreshToken();
    if (!refreshToken) {
      return false;
    }

    const response = await fetch(`${API_BASE_URL}/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });

    const data = await response.json();
    if (data.success && data.token) {
      setToken(data.token, true);
      return true;
    }

    return false;
  } catch (error) {
    console.error('Refresh token error:', error);
    return false;
  }
}

export default {
  register,
  login,
  logout,
  forgotPassword,
  resetPassword,
  getCurrentUser,
  getToken,
  clearToken,
};