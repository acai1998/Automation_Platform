import { useState } from 'react';
import { Link, useLocation } from 'wouter';
import { CheckCircle2, ArrowLeft } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import {
  AuthLayout,
  AuthError,
  FormInput,
  PasswordInput,
  SubmitButton,
  Spinner,
} from '@/components/auth';
import { validateUsername, validatePassword, validateEmail } from '@/utils/validation';

/**
 * 注册页面右侧营销内容
 */
function RegisterRightPanel() {
  return (
    <div className="w-full max-w-lg space-y-6">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
          加入 AutoTest
        </h2>
        <p className="text-slate-500 dark:text-slate-400">
          开启您的自动化测试之旅
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-xl bg-white dark:bg-slate-800 p-5 shadow-lg ring-1 ring-slate-900/5 dark:ring-white/10">
          <div className="text-3xl font-bold text-blue-500 mb-1">1000+</div>
          <div className="text-sm text-slate-500 dark:text-slate-400">测试用例管理</div>
        </div>
        <div className="rounded-xl bg-white dark:bg-slate-800 p-5 shadow-lg ring-1 ring-slate-900/5 dark:ring-white/10">
          <div className="text-3xl font-bold text-green-500 mb-1">99.9%</div>
          <div className="text-sm text-slate-500 dark:text-slate-400">系统稳定性</div>
        </div>
        <div className="rounded-xl bg-white dark:bg-slate-800 p-5 shadow-lg ring-1 ring-slate-900/5 dark:ring-white/10">
          <div className="text-3xl font-bold text-purple-500 mb-1">24/7</div>
          <div className="text-sm text-slate-500 dark:text-slate-400">自动调度执行</div>
        </div>
        <div className="rounded-xl bg-white dark:bg-slate-800 p-5 shadow-lg ring-1 ring-slate-900/5 dark:ring-white/10">
          <div className="text-3xl font-bold text-orange-500 mb-1">实时</div>
          <div className="text-sm text-slate-500 dark:text-slate-400">测试报告生成</div>
        </div>
      </div>
    </div>
  );
}

export default function Register() {
  const [, setLocation] = useLocation();
  const { register: registerUser, login } = useAuth();

  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const passwordMismatch = confirmPassword.length > 0 && password !== confirmPassword;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // 验证用户名
    const usernameValidation = validateUsername(username);
    if (!usernameValidation.valid) {
      setError(usernameValidation.message);
      return;
    }

    // 验证邮箱
    const emailValidation = validateEmail(email);
    if (!emailValidation.valid) {
      setError(emailValidation.message);
      return;
    }

    // 验证密码
    const passwordValidation = validatePassword(password);
    if (!passwordValidation.valid) {
      setError(passwordValidation.message);
      return;
    }

    // 验证密码一致性
    if (password !== confirmPassword) {
      setError('两次输入的密码不一致');
      return;
    }

    setIsLoading(true);

    try {
      const result = await registerUser(email, password, username);
      if (result.success) {
        setSuccess(true);
        // 自动登录
        const loginResult = await login(email, password, false);
        if (loginResult.success) {
          setTimeout(() => setLocation('/'), 1500);
        } else {
          // 注册成功但自动登录失败，提示用户手动登录
          setError('注册成功！请前往登录页面登录');
          setTimeout(() => setLocation('/login'), 2000);
        }
      } else {
        setError(result.message);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '注册失败，请稍后重试');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthLayout rightPanel={<RegisterRightPanel />}>
      {/* Back to Login */}
      <Link href="/login" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 mb-6">
        <ArrowLeft className="h-4 w-4" />
        返回登录
      </Link>

      <div className="mb-8">
        <h1 className="text-3xl font-bold leading-tight tracking-tight text-slate-900 dark:text-white">
          创建账号
        </h1>
        <p className="mt-3 text-base text-slate-500 dark:text-slate-400">
          填写以下信息完成注册
        </p>
      </div>

      {success ? (
        <div className="rounded-lg bg-green-50 dark:bg-green-900/20 p-6 text-center">
          <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-green-800 dark:text-green-200 mb-2">
            注册成功!
          </h3>
          <p className="text-sm text-green-600 dark:text-green-300">
            正在为您跳转...
          </p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-5">
          <AuthError message={error} />

          <FormInput
            id="username"
            name="username"
            label="用户名"
            value={username}
            onChange={setUsername}
            placeholder="请输入用户名"
            required
            minLength={2}
            maxLength={50}
          />

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
            placeholder="至少 6 位字符"
            required
            minLength={6}
            showStrength
          />

          <PasswordInput
            id="confirmPassword"
            name="confirmPassword"
            label="确认密码"
            value={confirmPassword}
            onChange={setConfirmPassword}
            placeholder="再次输入密码"
            required
            error={passwordMismatch}
            errorMessage={passwordMismatch ? '两次输入的密码不一致' : undefined}
          />

          <SubmitButton isLoading={isLoading} disabled={passwordMismatch}>
            {isLoading ? <Spinner className="h-5 w-5 text-white" /> : '注册'}
          </SubmitButton>
        </form>
      )}

      <p className="mt-8 text-center text-sm text-slate-500 dark:text-slate-400">
        已有账号？{' '}
        <Link href="/login" className="font-bold text-blue-500 hover:text-blue-600 hover:underline">
          立即登录
        </Link>
      </p>
    </AuthLayout>
  );
}
