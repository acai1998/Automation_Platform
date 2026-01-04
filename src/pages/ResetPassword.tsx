import { useState, useEffect } from 'react';
import { Link, useLocation } from 'wouter';
import { CheckCircle2, XCircle, KeyRound } from 'lucide-react';
import { resetPassword } from '@/services/authApi';
import {
  AuthLogo,
  AuthError,
  PasswordInput,
  SubmitButton,
  Spinner,
} from '@/components/auth';
import { validatePassword } from '@/utils/validation';

export default function ResetPassword() {
  const [, setLocation] = useLocation();
  // 从 URL 中提取 token 参数
  const searchParams = new URLSearchParams(window.location.search);
  const token = searchParams.get('token');

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!token) {
      setError('无效的重置链接');
    }
  }, [token]);

  const passwordMismatch = confirmPassword.length > 0 && password !== confirmPassword;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!token) {
      setError('无效的重置链接');
      return;
    }

    // 验证密码
    const passwordValidation = validatePassword(password);
    if (!passwordValidation.valid) {
      setError(passwordValidation.message);
      return;
    }

    if (password !== confirmPassword) {
      setError('两次输入的密码不一致');
      return;
    }

    setIsLoading(true);

    try {
      const result = await resetPassword(token, password);
      if (result.success) {
        setSuccess(true);
      } else {
        setError(result.message);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '重置失败，请稍后重试');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-slate-50 dark:bg-[#101922] px-6 py-12">
      <div className="w-full max-w-md">
        <div className="rounded-2xl bg-white dark:bg-[#1a2632] p-8 shadow-xl">
          {/* Logo Header */}
          <div className="mb-8 flex justify-center">
            <AuthLogo />
          </div>

          {!token ? (
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/20">
                <XCircle className="h-8 w-8 text-red-500" />
              </div>
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
                无效的链接
              </h1>
              <p className="text-slate-500 dark:text-slate-400 mb-6">
                该密码重置链接无效或已过期
              </p>
              <Link
                href="/forgot-password"
                className="inline-flex items-center justify-center rounded-lg bg-blue-500 px-6 py-3 text-sm font-bold text-white shadow-sm transition-colors hover:bg-blue-600"
              >
                重新发送重置链接
              </Link>
            </div>
          ) : success ? (
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/20">
                <CheckCircle2 className="h-8 w-8 text-green-500" />
              </div>
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
                密码已重置
              </h1>
              <p className="text-slate-500 dark:text-slate-400 mb-6">
                您的密码已成功重置，现在可以使用新密码登录
              </p>
              <button
                onClick={() => setLocation('/login')}
                className="inline-flex w-full items-center justify-center rounded-lg bg-blue-500 px-6 py-3.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-blue-600"
              >
                前往登录
              </button>
            </div>
          ) : (
            <>
              <div className="text-center mb-8">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/20">
                  <KeyRound className="h-8 w-8 text-blue-500" />
                </div>
                <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
                  设置新密码
                </h1>
                <p className="text-slate-500 dark:text-slate-400">
                  请输入您的新密码
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5">
                <AuthError message={error} />

                <PasswordInput
                  id="password"
                  name="password"
                  label="新密码"
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
                  label="确认新密码"
                  value={confirmPassword}
                  onChange={setConfirmPassword}
                  placeholder="再次输入新密码"
                  required
                  error={passwordMismatch}
                  errorMessage={passwordMismatch ? '两次输入的密码不一致' : undefined}
                />

                <SubmitButton isLoading={isLoading} disabled={passwordMismatch}>
                  {isLoading ? <Spinner className="h-5 w-5 text-white" /> : '重置密码'}
                </SubmitButton>
              </form>
            </>
          )}

          <p className="mt-8 text-center text-sm text-slate-500 dark:text-slate-400">
            记起密码了？{' '}
            <Link href="/login" className="font-bold text-blue-500 hover:text-blue-600 hover:underline">
              立即登录
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
