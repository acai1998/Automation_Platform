import { ReactNode } from 'react';
import { Redirect, useLocation } from 'wouter';
import { useAuth } from '@/contexts/AuthContext';

interface ProtectedRouteProps {
  children: ReactNode;
}

export default function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading } = useAuth();
  const [location] = useLocation();

  // 显示加载状态
  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-[#101922]">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-blue-500 border-r-transparent"></div>
          <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">加载中...</p>
        </div>
      </div>
    );
  }

  // 未登录则重定向到登录页
  if (!isAuthenticated) {
    // 保存当前路径用于登录后跳转
    const returnUrl = encodeURIComponent(location);
    return <Redirect to={`/login?returnUrl=${returnUrl}`} />;
  }

  return <>{children}</>;
}
