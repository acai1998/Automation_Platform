import { useEffect, useState } from 'react';
import { UserRound } from 'lucide-react';
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

const demoAccount = {
  email: 'zhaoliu@autotest.com',
  password: 'test123456',
} as const;

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

  const handleUseDemoAccount = () => {
    setEmail(demoAccount.email);
    setPassword(demoAccount.password);
    setError('');
  };

  return (
    <AuthLayout>
      <div className="space-y-8">
        <AuthPageHeader title="登录" description="进入 AutoTest 平台" />

        <section className="rounded-2xl border border-cyan-300/20 bg-cyan-300/[0.07] p-4 text-sm text-slate-200">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-cyan-300/10 text-cyan-200 ring-1 ring-cyan-200/20">
              <UserRound className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-sm font-bold text-white">体验账号</h2>
                <button
                  type="button"
                  className="shrink-0 rounded-xl border border-cyan-300/20 px-3 py-1.5 text-xs font-semibold text-cyan-100 transition-colors duration-200 hover:border-cyan-200/40 hover:bg-cyan-300/10 focus:outline-none focus:ring-4 focus:ring-cyan-300/15"
                  onClick={handleUseDemoAccount}
                >
                  填入账号
                </button>
              </div>
              <dl className="mt-3 space-y-2 text-xs leading-5">
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-slate-400">邮箱</dt>
                  <dd className="truncate font-mono text-cyan-100">{demoAccount.email}</dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-slate-400">密码</dt>
                  <dd className="font-mono text-cyan-100">{demoAccount.password}</dd>
                </div>
              </dl>
            </div>
          </div>
        </section>

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
