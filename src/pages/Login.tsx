import { useState, useEffect, memo } from 'react';
import { Link, useLocation } from 'wouter';
import { CheckCircle2, Zap, Shield, BarChart3, Clock, Users, GitBranch } from 'lucide-react';
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
 * 特性卡片组件 - 使用 memo 优化性能
 */
const FeatureCard = memo(({
  icon: Icon,
  title,
  description,
  delay
}: {
  icon: React.ElementType;
  title: string;
  description: string;
  delay: number;
}) => {
  const delayClass = delay === 0.1 ? 'animate-delay-100' :
                     delay === 0.2 ? 'animate-delay-200' :
                     delay === 0.3 ? 'animate-delay-300' :
                     'animate-delay-400';

  return (
    <div
      className={`group relative overflow-hidden rounded-2xl bg-white/90 dark:bg-slate-800/90 p-6 shadow-xl backdrop-blur-sm transition-all duration-300 hover:scale-[1.02] hover:shadow-2xl animate-fade-in-up ${delayClass}`}
    >
      {/* Gradient overlay on hover */}
      <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-indigo-500/5 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />

      <div className="relative">
        {/* Icon container with gradient */}
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-500 text-white shadow-lg transition-transform duration-300 group-hover:scale-110">
          <Icon className="h-7 w-7" strokeWidth={2} />
        </div>

        <h3 className="mb-2 text-lg font-semibold text-slate-900 dark:text-white">
          {title}
        </h3>

        <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
          {description}
        </p>
      </div>
    </div>
  );
});

FeatureCard.displayName = 'FeatureCard';

/**
 * 登录页面右侧营销内容
 */
function LoginRightPanel() {
  return (
    <div className="w-full space-y-6">
      {/* Hero Section */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-600 p-8 shadow-2xl">
        {/* Decorative patterns */}
        <div className="absolute inset-0 opacity-20">
          <div className="absolute right-0 top-0 h-64 w-64 -translate-y-1/2 translate-x-1/2 rounded-full bg-white/30 blur-3xl" />
          <div className="absolute bottom-0 left-0 h-48 w-48 translate-y-1/2 -translate-x-1/2 rounded-full bg-white/20 blur-2xl" />
        </div>
        
        <div className="relative">
          <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-white/20 text-white shadow-xl backdrop-blur-sm">
            <CheckCircle2 className="h-8 w-8" strokeWidth={2.5} />
          </div>
          
          <h2 className="mb-3 text-3xl font-bold text-white">
            智能测试管理
          </h2>
          <p className="text-lg text-blue-100">
            一站式自动化测试平台
          </p>
          
          <div className="mt-6 flex items-center gap-3">
            <div className="flex -space-x-2">
              {[1, 2, 3].map((i) => (
                <div 
                  key={i}
                  className="h-8 w-8 rounded-full border-2 border-blue-400/50 bg-blue-500/80 text-xs font-bold text-white flex items-center justify-center"
                >
                  {i}
                </div>
              ))}
            </div>
            <span className="text-sm font-medium text-blue-100">个核心模块</span>
          </div>
        </div>
      </div>

      {/* Features Grid - Bento Style */}
      <div className="grid gap-4 md:grid-cols-2">
        <FeatureCard
          icon={Zap}
          title="快速执行"
          description="Jenkins 深度集成，一键触发测试任务，实时监控执行进度"
          delay={0.1}
        />
        <FeatureCard
          icon={Shield}
          title="稳定可靠"
          description="完善的用例管理和调度机制，确保测试任务按时准确执行"
          delay={0.2}
        />
        <FeatureCard
          icon={BarChart3}
          title="可视化报告"
          description="丰富的图表展示和数据分析，快速定位问题，提升测试效率"
          delay={0.3}
        />
        <FeatureCard
          icon={Clock}
          title="灵活调度"
          description="支持定时任务、手动触发和 CI 集成，满足不同场景需求"
          delay={0.4}
        />
      </div>

      {/* Stats Section */}
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl bg-white/90 dark:bg-slate-800/90 p-6 text-center shadow-lg backdrop-blur-sm">
          <div className="mb-2 flex h-12 w-12 mx-auto items-center justify-center rounded-xl bg-blue-500/10 text-blue-500">
            <Users className="h-6 w-6" />
          </div>
          <div className="text-3xl font-bold text-slate-900 dark:text-white">1000+</div>
          <div className="text-sm text-slate-500 dark:text-slate-400">活跃用户</div>
        </div>
        <div className="rounded-2xl bg-white/90 dark:bg-slate-800/90 p-6 text-center shadow-lg backdrop-blur-sm">
          <div className="mb-2 flex h-12 w-12 mx-auto items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-500">
            <GitBranch className="h-6 w-6" />
          </div>
          <div className="text-3xl font-bold text-slate-900 dark:text-white">50K+</div>
          <div className="text-sm text-slate-500 dark:text-slate-400">测试用例</div>
        </div>
        <div className="rounded-2xl bg-white/90 dark:bg-slate-800/90 p-6 text-center shadow-lg backdrop-blur-sm">
          <div className="mb-2 flex h-12 w-12 mx-auto items-center justify-center rounded-xl bg-orange-500/10 text-orange-500">
            <BarChart3 className="h-6 w-6" />
          </div>
          <div className="text-3xl font-bold text-slate-900 dark:text-white">98%</div>
          <div className="text-sm text-slate-500 dark:text-slate-400">成功率</div>
        </div>
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
      <div className="mb-10">
        <h1 className="mb-3 text-4xl font-extrabold tracking-tight text-slate-900 dark:text-white">
          欢迎回来
        </h1>
        <p className="text-lg text-slate-500 dark:text-slate-400">
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