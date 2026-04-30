import { useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { forgotPassword } from '@/services/authApi';
import {
  AuthBackLink,
  AuthError,
  AuthLayout,
  AuthPageHeader,
  AuthStatusPanel,
  FormInput,
  SubmitButton,
  Spinner,
} from '@/components/auth';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const isValidEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');

    if (!isValidEmail(email)) {
      setError('请输入有效的邮箱地址');
      return;
    }

    setIsLoading(true);

    try {
      const result = await forgotPassword(email);
      if (result.success) {
        setSuccess(true);
      } else {
        setError(result.message);
      }
    } catch {
      setError('发送失败，请稍后重试');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthLayout>
      <div className="space-y-8">
        <AuthBackLink href="/login">返回登录</AuthBackLink>

        <AuthPageHeader title="找回密码" description="输入注册邮箱" />

        {success ? (
          <AuthStatusPanel
            tone="success"
            icon={<CheckCircle2 className="h-7 w-7" />}
            title="邮件已发送"
            description="如果邮箱已注册，你会收到重置密码邮件。"
            action={
              <button
                type="button"
                onClick={() => {
                  setSuccess(false);
                  setEmail('');
                }}
                className="rounded-2xl border border-emerald-300/20 bg-emerald-300/10 px-4 py-3 text-sm font-semibold text-emerald-100 transition-colors duration-200 hover:bg-emerald-300/15"
              >
                重新输入邮箱
              </button>
            }
          />
        ) : (
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

            <SubmitButton isLoading={isLoading}>
              {isLoading ? <Spinner className="h-5 w-5 text-white" /> : '发送重置链接'}
            </SubmitButton>
          </form>
        )}
      </div>
    </AuthLayout>
  );
}
