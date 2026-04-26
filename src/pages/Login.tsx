import { useState, useEffect } from 'react';
import { Link, useLocation } from 'wouter';
import { useAuth } from '@/contexts/AuthContext';
import {
  AuthLayout,
  AuthError,
  FormInput,
  PasswordInput,
  SubmitButton,
  Spinner,
} from '@/components/auth';

export default function Login() {
  const [, setLocation] = useLocation();
  const { login, isAuthenticated } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  // 获取 returnUrl 参数
  const searchParams = new URLSearchParams(window.location.search);
  const returnUrl = searchParams.get('returnUrl') || '/dashboard';

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
    } catch (err) {
      setError(err instanceof Error ? err.message : '登录失败，请稍后重试');
      setIsLoading(false);
    }
  };

  return (
    <AuthLayout>
      <div className="mb-10">
        <h1 className="mb-3 text-4xl font-extrabold tracking-tight text-slate-900 dark:text-white">
          欢迎回来
        </h1>
        <p className="text-base text-slate-600 dark:text-slate-300">
          登录您的 AutoTest 账户
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <AuthError message={error} />

        <FormInput
          id="email"
          name="email"
          label="邮箱地址"
          type="email"
          value={email}
          onChange={setEmail}
          placeholder="name@company.com"
          required
        />

        <PasswordInput
          id="password"
          name="password"
          label="密码"
          value={password}
          onChange={setPassword}
          required
        />

        {/* Remember & Forgot Password */}
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2.5 cursor-pointer transition-colors hover:text-slate-900 dark:hover:text-white">
            <input
              id="remember"
              name="remember"
              type="checkbox"
              className="h-4 w-4 cursor-pointer rounded border-slate-300 text-blue-600 focus:ring-blue-500 focus:ring-offset-0 dark:border-slate-600 dark:bg-slate-700 dark:checked:bg-blue-600"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
            />
            <span className="text-sm font-medium text-slate-600 dark:text-slate-400">记住我</span>
          </label>
          <Link 
            href="/forgot-password" 
            className="text-sm font-semibold text-blue-600 hover:text-blue-700 transition-colors"
          >
            忘记密码?
          </Link>
        </div>

        <SubmitButton isLoading={isLoading}>
          {isLoading ? <Spinner className="h-5 w-5 text-white" /> : '登录账户'}
        </SubmitButton>
      </form>

      <div className="mt-8 flex items-center justify-between rounded-xl bg-slate-50 dark:bg-slate-800/50 p-4">
        <p className="text-sm text-slate-600 dark:text-slate-400">
          还没有账号？
        </p>
        <Link 
          href="/register" 
          className="rounded-lg bg-gradient-to-r from-blue-500 to-indigo-500 px-6 py-2.5 text-sm font-bold text-white shadow-lg transition-all duration-300 hover:scale-105 hover:shadow-xl hover:from-blue-600 hover:to-indigo-600"
        >
          免费注册
        </Link>
      </div>
    </AuthLayout>
  );
}