import { useState } from 'react';
import { useLocation } from 'wouter';
import { CheckCircle2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import {
  AuthBackLink,
  AuthError,
  AuthLayout,
  AuthPageHeader,
  AuthStatusPanel,
  FormInput,
  PasswordInput,
  Spinner,
  SubmitButton,
} from '@/components/auth';
import { validateEmail, validatePassword, validateUsername } from '@/utils/validation';

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

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');

    const usernameValidation = validateUsername(username);
    if (!usernameValidation.valid) {
      setError(usernameValidation.message);
      return;
    }

    const emailValidation = validateEmail(email);
    if (!emailValidation.valid) {
      setError(emailValidation.message);
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
      const result = await registerUser(email, password, username);
      if (result.success) {
        setSuccess(true);

        const loginResult = await login(email, password, false);
        if (loginResult.success) {
          setTimeout(() => setLocation('/dashboard'), 1500);
        } else {
          setError('注册成功，请前往登录页继续登录');
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
    <AuthLayout>
      <div className="space-y-8">
        <AuthBackLink href="/login">返回登录</AuthBackLink>

        <AuthPageHeader title="注册" description="创建平台账号" />

        {success ? (
          <AuthStatusPanel
            tone="success"
            icon={<CheckCircle2 className="h-7 w-7" />}
            title="注册成功"
            description="账户已创建，正在跳转。"
          />
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

        <p className="text-sm text-slate-400">
          已有账号？{' '}
          <button
            type="button"
            onClick={() => setLocation('/login')}
            className="font-semibold text-cyan-300 transition-colors duration-200 hover:text-cyan-200"
          >
            立即登录
          </button>
        </p>
      </div>
    </AuthLayout>
  );
}
