import { useState, useEffect } from 'react';
import { Link, useLocation } from 'wouter';
import { CheckCircle2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import {
  AuthLayout,
  AuthError,
  FormInput,
  PasswordInput,
  SubmitButton,
  Spinner,
} from '@/components/auth';

/**
 * 登录页面右侧营销内容
 */
function LoginRightPanel() {
  return (
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
            <div className="h-1.5 w-1.5 rounded-full bg-green-500" />
            <span>API 接口测试</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
            <div className="h-1.5 w-1.5 rounded-full bg-green-500" />
            <span>UI 自动化测试</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
            <div className="h-1.5 w-1.5 rounded-full bg-green-500" />
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
  );
}

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
    } catch (err) {
      setError(err instanceof Error ? err.message : '登录失败，请稍后重试');
      setIsLoading(false);
    }
  };

  return (
    <AuthLayout rightPanel={<LoginRightPanel />}>
      <div className="mb-8">
        <h1 className="text-3xl font-bold leading-tight tracking-tight text-slate-900 dark:text-white">
          欢迎回来
        </h1>
        <p className="mt-3 text-base text-slate-500 dark:text-slate-400">
          请输入您的账号信息登录
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <AuthError message={error} />

        <FormInput
          id="email"
          name="email"
          label="邮箱地址"
          type="email"
          value={email}
          onChange={setEmail}
          placeholder="user@company.com"
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

        <SubmitButton isLoading={isLoading}>
          {isLoading ? <Spinner className="h-5 w-5 text-white" /> : '登录'}
        </SubmitButton>
      </form>

      <p className="mt-8 text-center text-sm text-slate-500 dark:text-slate-400">
        还没有账号？{' '}
        <Link href="/register" className="font-bold text-blue-500 hover:text-blue-600 hover:underline">
          免费注册
        </Link>
      </p>
    </AuthLayout>
  );
}
