import { useState } from 'react';
import { Link, useLocation } from 'wouter';
import { Eye, EyeOff, CheckCircle2, ArrowLeft } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

export default function Register() {
  const [, setLocation] = useLocation();
  const { register: registerUser, login } = useAuth();

  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  // 密码强度检查
  const getPasswordStrength = (pwd: string): { level: number; text: string; color: string } => {
    if (!pwd) return { level: 0, text: '', color: '' };
    let strength = 0;
    if (pwd.length >= 6) strength++;
    if (pwd.length >= 8) strength++;
    if (/[a-z]/.test(pwd) && /[A-Z]/.test(pwd)) strength++;
    if (/\d/.test(pwd)) strength++;
    if (/[!@#$%^&*(),.?":{}|<>]/.test(pwd)) strength++;

    if (strength <= 2) return { level: 1, text: '弱', color: 'bg-red-500' };
    if (strength <= 3) return { level: 2, text: '中', color: 'bg-yellow-500' };
    return { level: 3, text: '强', color: 'bg-green-500' };
  };

  const passwordStrength = getPasswordStrength(password);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // 验证
    if (password !== confirmPassword) {
      setError('两次输入的密码不一致');
      return;
    }

    if (password.length < 6) {
      setError('密码长度至少为 6 位');
      return;
    }

    if (username.length < 2 || username.length > 50) {
      setError('用户名长度应在 2-50 个字符之间');
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
        }
      } else {
        setError(result.message);
      }
    } catch {
      setError('注册失败，请稍后重试');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen w-full flex-row bg-slate-50 dark:bg-[#101922]">
      {/* Left Side: Register Form */}
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
              {/* Error Message */}
              {error && (
                <div className="rounded-lg bg-red-50 dark:bg-red-900/20 p-4 text-sm text-red-600 dark:text-red-400">
                  {error}
                </div>
              )}

              {/* Username Input */}
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-900 dark:text-slate-200" htmlFor="username">
                  用户名
                </label>
                <input
                  className="block w-full rounded-lg border border-slate-200 bg-slate-50 p-4 text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:ring-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:placeholder:text-slate-500 text-sm"
                  id="username"
                  name="username"
                  type="text"
                  placeholder="请输入用户名"
                  required
                  minLength={2}
                  maxLength={50}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
              </div>

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
                    placeholder="至少 6 位字符"
                    required
                    minLength={6}
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
                {/* Password Strength Indicator */}
                {password && (
                  <div className="mt-2">
                    <div className="flex gap-1 mb-1">
                      {[1, 2, 3].map((level) => (
                        <div
                          key={level}
                          className={`h-1 flex-1 rounded ${
                            passwordStrength.level >= level ? passwordStrength.color : 'bg-slate-200 dark:bg-slate-700'
                          }`}
                        />
                      ))}
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      密码强度: {passwordStrength.text}
                    </p>
                  </div>
                )}
              </div>

              {/* Confirm Password Input */}
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-900 dark:text-slate-200" htmlFor="confirmPassword">
                  确认密码
                </label>
                <div className="relative">
                  <input
                    className={`block w-full rounded-lg border bg-slate-50 p-4 pr-12 text-slate-900 placeholder:text-slate-400 focus:ring-blue-500 focus:outline-none dark:bg-slate-800 dark:text-white dark:placeholder:text-slate-500 text-sm ${
                      confirmPassword && password !== confirmPassword
                        ? 'border-red-300 focus:border-red-500 dark:border-red-700'
                        : 'border-slate-200 focus:border-blue-500 dark:border-slate-700'
                    }`}
                    id="confirmPassword"
                    name="confirmPassword"
                    type={showConfirmPassword ? 'text' : 'password'}
                    placeholder="再次输入密码"
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    className="absolute inset-y-0 right-0 flex items-center pr-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  >
                    {showConfirmPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
                {confirmPassword && password !== confirmPassword && (
                  <p className="mt-1 text-xs text-red-500">两次输入的密码不一致</p>
                )}
              </div>

              {/* Register Button */}
              <button
                type="submit"
                disabled={isLoading || (password !== confirmPassword && !!confirmPassword)}
                className="flex w-full items-center justify-center rounded-lg bg-blue-500 px-4 py-3.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? (
                  <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                ) : (
                  '注册'
                )}
              </button>
            </form>
          )}

          <p className="mt-8 text-center text-sm text-slate-500 dark:text-slate-400">
            已有账号？{' '}
            <Link href="/login" className="font-bold text-blue-500 hover:text-blue-600 hover:underline">
              立即登录
            </Link>
          </p>
        </div>
      </div>

      {/* Right Side: Visual/Marketing */}
      <div className="relative hidden w-0 flex-1 lg:block bg-slate-50 dark:bg-slate-900">
        <div className="absolute inset-0 bg-blue-500/5 dark:bg-blue-500/10"></div>
        <div className="relative flex h-full flex-col items-center justify-center p-12">
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

          <p className="mt-12 text-sm text-slate-400 dark:text-slate-500">
            AutoTest Platform - 让测试更简单
          </p>
        </div>
      </div>
    </div>
  );
}
