import { useState, useEffect } from 'react';
import { Link, useLocation } from 'wouter';
import { Eye, EyeOff, CheckCircle2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

export default function Login() {
  const [, setLocation] = useLocation();
  const { login, isAuthenticated } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  // 获取 returnUrl 参数
  const searchParams = new URLSearchParams(window.location.search);
  const returnUrl = searchParams.get('returnUrl') || '/';

  // 如果已登录，自动跳转
  useEffect(() => {
    if (isAuthenticated) {
      setLocation(decodeURIComponent(returnUrl));
    }
  }, [isAuthenticated, returnUrl, setLocation]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const result = await login(email, password, remember);
      if (!result.success) {
        setError(result.message);
        setIsLoading(false);
      }
      // 登录成功后，useEffect 会自动处理跳转
    } catch {
      setError('登录失败，请稍后重试');
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen w-full flex-row bg-slate-50 dark:bg-[#101922]">
      {/* Left Side: Login Form */}
      <div className="flex w-full flex-col justify-center bg-white dark:bg-[#1a2632] px-6 py-12 lg:w-1/2 lg:px-20 xl:px-32 shadow-xl z-10">
        {/* Logo Header */}
        <div className="mb-10 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/10 text-blue-500">
            <svg className="h-6 w-6" fill="none" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
              <path d="M36.7273 44C33.9891 44 31.6043 39.8386 30.3636 33.69C29.123 39.8386 26.7382 44 24 44C21.2618 44 18.877 39.8386 17.6364 33.69C16.3957 39.8386 14.0109 44 11.2727 44C7.25611 44 4 35.0457 4 24C4 12.9543 7.25611 4 11.2727 4C14.0109 4 16.3957 8.16144 17.6364 14.31C18.877 8.16144 21.2618 4 24 4C26.7382 4 29.123 8.16144 30.3636 14.31C31.6043 8.16144 33.9891 4 36.7273 4C40.7439 4 44 12.9543 44 24C44 35.0457 40.7439 44 36.7273 44Z" fill="currentColor"></path>
            </svg>
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">AutoTest</h2>
        </div>

        <div className="w-full max-w-md">
          <div className="mb-8">
            <h1 className="text-3xl font-bold leading-tight tracking-tight text-slate-900 dark:text-white">
              欢迎回来
            </h1>
            <p className="mt-3 text-base text-slate-500 dark:text-slate-400">
              请输入您的账号信息登录
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Error Message */}
            {error && (
              <div className="rounded-lg bg-red-50 dark:bg-red-900/20 p-4 text-sm text-red-600 dark:text-red-400">
                {error}
              </div>
            )}

            {/* Email Input */}
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-900 dark:text-slate-200" htmlFor="email">
                邮箱地址
              </label>
              <input
                className="block w-full rounded-lg border border-slate-200 bg-slate-50 p-4 text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:ring-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:placeholder:text-slate-500 text-sm"
                id="email"
                name="email"
                type="email"
                placeholder="user@company.com"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            {/* Password Input */}
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-900 dark:text-slate-200" htmlFor="password">
                密码
              </label>
              <div className="relative">
                <input
                  className="block w-full rounded-lg border border-slate-200 bg-slate-50 p-4 pr-12 text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:ring-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:placeholder:text-slate-500 text-sm"
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  className="absolute inset-y-0 right-0 flex items-center pr-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>

            {/* Remember & Forgot Password */}
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-slate-300 text-blue-500 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-700"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                />
                <span className="text-sm text-slate-600 dark:text-slate-400">记住登录</span>
              </label>
              <Link href="/forgot-password" className="text-sm font-semibold text-blue-500 hover:text-blue-600">
                忘记密码?
              </Link>
            </div>

            {/* Login Button */}
            <button
              type="submit"
              disabled={isLoading}
              className="flex w-full items-center justify-center rounded-lg bg-blue-500 px-4 py-3.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              ) : (
                '登录'
              )}
            </button>
          </form>

          <p className="mt-8 text-center text-sm text-slate-500 dark:text-slate-400">
            还没有账号？{' '}
            <Link href="/register" className="font-bold text-blue-500 hover:text-blue-600 hover:underline">
              免费注册
            </Link>
          </p>
        </div>
      </div>

      {/* Right Side: Visual/Marketing */}
      <div className="relative hidden w-0 flex-1 lg:block bg-slate-50 dark:bg-slate-900">
        <div className="absolute inset-0 bg-blue-500/5 dark:bg-blue-500/10"></div>
        <div className="relative flex h-full flex-col items-center justify-center p-12">
          {/* Feature Cards */}
          <div className="w-full max-w-lg space-y-6">
            <div className="rounded-2xl bg-white dark:bg-slate-800 p-6 shadow-lg ring-1 ring-slate-900/5 dark:ring-white/10">
              <div className="flex items-center gap-4 mb-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-500/10 text-blue-500">
                  <CheckCircle2 className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-900 dark:text-white">自动化测试管理</h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400">统一管理所有测试用例</p>
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                  <div className="h-1.5 w-1.5 rounded-full bg-green-500"></div>
                  <span>API 接口测试</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                  <div className="h-1.5 w-1.5 rounded-full bg-green-500"></div>
                  <span>UI 自动化测试</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                  <div className="h-1.5 w-1.5 rounded-full bg-green-500"></div>
                  <span>性能压力测试</span>
                </div>
              </div>
            </div>

            <div className="rounded-2xl bg-white dark:bg-slate-800 p-6 shadow-lg ring-1 ring-slate-900/5 dark:ring-white/10">
              <h3 className="font-semibold text-slate-900 dark:text-white mb-2">Jenkins 集成</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                与 Jenkins CI/CD 无缝集成，支持定时任务调度和手动触发执行
              </p>
            </div>

            <div className="rounded-2xl bg-gradient-to-r from-blue-500 to-blue-600 p-6 text-white">
              <h3 className="font-semibold mb-2">实时测试报告</h3>
              <p className="text-sm text-blue-100">
                可视化展示测试执行结果，快速定位问题，提升测试效率
              </p>
            </div>
          </div>

          {/* Footer Text */}
          <p className="mt-12 text-sm text-slate-400 dark:text-slate-500">
            AutoTest Platform - 让测试更简单
          </p>
        </div>
      </div>
    </div>
  );
}
