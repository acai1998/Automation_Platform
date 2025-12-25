import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import {
  UserInfo,
  login as apiLogin,
  logout as apiLogout,
  register as apiRegister,
  getCurrentUser,
  getToken,
  clearToken,
} from '@/services/authApi';

interface AuthContextType {
  user: UserInfo | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string, remember?: boolean) => Promise<{ success: boolean; message: string }>;
  logout: () => Promise<void>;
  register: (email: string, password: string, username: string) => Promise<{ success: boolean; message: string }>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const isAuthenticated = !!user;

  // 检查并加载用户信息
  const loadUser = useCallback(async () => {
    const token = getToken();
    if (!token) {
      setUser(null);
      setIsLoading(false);
      return;
    }

    try {
      const result = await getCurrentUser();
      if (result.success && result.user) {
        setUser(result.user);
      } else {
        setUser(null);
        clearToken();
      }
    } catch {
      setUser(null);
      clearToken();
    } finally {
      setIsLoading(false);
    }
  }, []);

  // 初始化时检查登录状态
  useEffect(() => {
    loadUser();
  }, [loadUser]);

  // 登录
  const login = useCallback(async (email: string, password: string, remember = false) => {
    const result = await apiLogin(email, password, remember);
    if (result.success && result.user) {
      setUser(result.user);
    }
    return { success: result.success, message: result.message };
  }, []);

  // 登出
  const logout = useCallback(async () => {
    await apiLogout();
    setUser(null);
  }, []);

  // 注册
  const register = useCallback(async (email: string, password: string, username: string) => {
    const result = await apiRegister(email, password, username);
    return { success: result.success, message: result.message };
  }, []);

  // 刷新用户信息
  const refreshUser = useCallback(async () => {
    await loadUser();
  }, [loadUser]);

  const value: AuthContextType = {
    user,
    isAuthenticated,
    isLoading,
    login,
    logout,
    register,
    refreshUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export default AuthContext;
