import { useEffect, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { useAuth } from '@/contexts/AuthContext';
import {
  AuthError,
  AuthLayout,
  AuthPageHeader,
  FormInput,
  PasswordInput,
  Spinner,
  SubmitButton,
} from '@/components/auth';

export default function Login() {
  const [, setLocation] = useLocation();
  const { login, isAuthenticated } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const searchParams = new URLSearchParams(window.location.search);
  const returnUrl = searchParams.get('returnUrl') || '/dashboard';

  useEffect(() => {
    if (isAuthenticated) {
      setLocation(decodeURIComponent(returnUrl));
    }
  }, [isAuthenticated, returnUrl, setLocation]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
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
      <div className="space-y-8">
        <AuthPageHeader title="登录" description="进入 AutoTest 平台" />

        <form onSubmit={handleSubmit} className="space-y-5">
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

          <div className="flex items-center justify-between">
            <label className="flex items-center gap-3 text-sm text-slate-400">
              <input
                id="remember"
                name="remember"
                type="checkbox"
                className="h-4 w-4 rounded border-white/15 bg-white/5 text-cyan-300 focus:ring-cyan-300/30"
                checked={remember}
                onChange={(event) => setRemember(event.target.checked)}
              />
              记住我
            </label>

            <Link
              href="/forgot-password"
              className="text-sm font-semibold text-cyan-300 transition-colors duration-200 hover:text-cyan-200"
            >
              忘记密码？
            </Link>
          </div>

          <SubmitButton isLoading={isLoading}>
            {isLoading ? <Spinner className="h-5 w-5 text-white" /> : '登录账户'}
          </SubmitButton>
        </form>

        <p className="text-sm text-slate-400">
          还没有账号？{' '}
          <Link
            href="/register"
            className="font-semibold text-cyan-300 transition-colors duration-200 hover:text-cyan-200"
          >
            立即注册
          </Link>
        </p>
      </div>
    </AuthLayout>
  );
}
