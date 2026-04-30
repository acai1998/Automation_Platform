import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { CheckCircle2, XCircle } from 'lucide-react';
import { resetPassword } from '@/services/authApi';
import {
  AuthBackLink,
  AuthError,
  AuthLayout,
  AuthPageHeader,
  AuthStatusPanel,
  PasswordInput,
  Spinner,
  SubmitButton,
} from '@/components/auth';
import { validatePassword } from '@/utils/validation';

export default function ResetPassword() {
  const [, setLocation] = useLocation();
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

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');

    if (!token) {
      setError('无效的重置链接');
      return;
    }

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

  const renderContent = () => {
    if (!token) {
      return (
        <AuthStatusPanel
          tone="error"
          icon={<XCircle className="h-7 w-7" />}
          title="链接无效"
          description="请重新发起找回密码流程。"
          action={
            <button
              type="button"
              onClick={() => setLocation('/forgot-password')}
              className="rounded-2xl border border-rose-300/20 bg-rose-300/10 px-4 py-3 text-sm font-semibold text-rose-100 transition-colors duration-200 hover:bg-rose-300/15"
            >
              重新发送链接
            </button>
          }
        />
      );
    }

    if (success) {
      return (
        <AuthStatusPanel
          tone="success"
          icon={<CheckCircle2 className="h-7 w-7" />}
          title="密码已重置"
          description="现在可以使用新密码登录。"
          action={
            <button
              type="button"
              onClick={() => setLocation('/login')}
              className="rounded-2xl border border-emerald-300/20 bg-emerald-300/10 px-4 py-3 text-sm font-semibold text-emerald-100 transition-colors duration-200 hover:bg-emerald-300/15"
            >
              前往登录
            </button>
          }
        />
      );
    }

    return (
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
    );
  };

  return (
    <AuthLayout>
      <div className="space-y-8">
        <AuthBackLink href="/login">返回登录</AuthBackLink>

        <AuthPageHeader
          title={token ? '设置新密码' : '重置链接失效'}
          description={token ? '输入新的登录密码' : '重新获取重置链接'}
        />

        {renderContent()}
      </div>
    </AuthLayout>
  );
}
