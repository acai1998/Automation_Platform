import { useState } from 'react';
import { Link } from 'wouter';
import { ArrowLeft, Mail, CheckCircle2 } from 'lucide-react';
import { forgotPassword } from '@/services/authApi';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const isValidEmail = (email: string) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // 前端邮箱验证
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
    <div className="flex min-h-screen w-full items-center justify-center bg-slate-50 dark:bg-[#101922] px-6 py-12">
      <div className="w-full max-w-md">
        <div className="rounded-2xl bg-white dark:bg-[#1a2632] p-8 shadow-xl">
          {/* Logo Header */}
          <div className="mb-8 flex items-center gap-3 justify-center">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/10 text-blue-500">
              <svg className="h-6 w-6" fill="none" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
                <path d="M36.7273 44C33.9891 44 31.6043 39.8386 30.3636 33.69C29.123 39.8386 26.7382 44 24 44C21.2618 44 18.877 39.8386 17.6364 33.69C16.3957 39.8386 14.0109 44 11.2727 44C7.25611 44 4 35.0457 4 24C4 12.9543 7.25611 4 11.2727 4C14.0109 4 16.3957 8.16144 17.6364 14.31C18.877 8.16144 21.2618 4 24 4C26.7382 4 29.123 8.16144 30.3636 14.31C31.6043 8.16144 33.9891 4 36.7273 4C40.7439 4 44 12.9543 44 24C44 35.0457 40.7439 44 36.7273 44Z" fill="currentColor"></path>
              </svg>
            </div>
            <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">AutoTest</h2>
          </div>

          {/* Back to Login */}
          <Link href="/login" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 mb-6 cursor-pointer transition-colors">
            <ArrowLeft className="h-4 w-4" />
            返回登录
          </Link>

          {success ? (
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/20">
                <CheckCircle2 className="h-8 w-8 text-green-500" />
              </div>
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
                邮件已发送
              </h1>
              <p className="text-slate-500 dark:text-slate-400 mb-6">
                如果该邮箱已注册，您将收到一封包含密码重置链接的邮件。请检查您的收件箱（包括垃圾邮件文件夹）。
              </p>
              <p className="text-sm text-slate-400 dark:text-slate-500">
                没有收到邮件？{' '}
                <button
                  onClick={() => {
                    setSuccess(false);
                    setEmail('');
                  }}
                  className="text-blue-500 hover:text-blue-600 font-medium"
                >
                  重新发送
                </button>
              </p>
            </div>
          ) : (
            <>
              <div className="text-center mb-8">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/20">
                  <Mail className="h-8 w-8 text-blue-500" />
                </div>
                <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
                  忘记密码
                </h1>
                <p className="text-slate-500 dark:text-slate-400">
                  输入您的邮箱地址，我们将发送密码重置链接
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5">
                {/* Error Message */}
                {error && (
                  <div className="rounded-lg bg-red-50 dark:bg-red-900/20 p-4 text-sm text-red-600 dark:text-red-400">
                    {error}
                  </div>
                )}

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

                {/* Submit Button */}
                <button
                  type="submit"
                  disabled={isLoading}
                  className="flex w-full items-center justify-center rounded-lg bg-blue-500 px-4 py-3.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoading ? (
                    <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                  ) : (
                    '发送重置链接'
                  )}
                </button>
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