import type { ReactNode } from 'react';
import { AuthLogo } from './Logo';

interface AuthLayoutProps {
  children: ReactNode;
  rightPanel?: ReactNode;
}

/**
 * 认证页面通用布局
 * 左侧表单区域 + 右侧营销区域（可选）
 */
export function AuthLayout({ children, rightPanel }: AuthLayoutProps) {
  return (
    <div className="flex min-h-screen w-full flex-row bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 dark:from-[#0a0a0a] dark:via-[#0f172a] dark:to-[#1e293b]">
      {/* Decorative background elements */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute right-1/4 top-1/4 h-96 w-96 -translate-y-1/2 translate-x-1/2 rounded-full bg-gradient-to-br from-blue-400/10 to-indigo-400/10 blur-3xl" />
        <div className="absolute bottom-1/4 left-1/4 h-64 w-64 translate-y-1/2 -translate-x-1/2 rounded-full bg-gradient-to-br from-indigo-400/10 to-purple-400/10 blur-3xl" />
      </div>

      {/* Left Side: Form */}
      <div className="relative z-10 flex w-full flex-col justify-center bg-white/80 dark:bg-[#1a2632]/90 px-6 py-12 lg:w-1/2 lg:px-20 xl:px-32 backdrop-blur-sm shadow-2xl">
        <div className="mb-12">
          <AuthLogo />
        </div>
        <div className="w-full max-w-md">{children}</div>
      </div>

      {/* Right Side: Visual/Marketing */}
      {rightPanel && (
        <div className="relative z-10 hidden w-0 flex-1 lg:block">
          <div className="flex h-full flex-col justify-center p-12">
            {rightPanel}
            <div className="mt-12 text-center">
              <p className="text-sm font-medium text-slate-400 dark:text-slate-500">
                让测试更简单
              </p>
              <p className="mt-1 text-xs text-slate-300 dark:text-slate-600">
                AutoTest Platform v1.0.0
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * 错误消息提示
 */
export function AuthError({ message }: { message: string }) {
  if (!message) return null;
  return (
    <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-900/50 dark:bg-red-900/20 backdrop-blur-sm">
      <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/50">
        <svg className="h-3 w-3 text-red-600 dark:text-red-400" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V5a1 1 0 00-1-1z" clipRule="evenodd" />
        </svg>
      </div>
      <p className="text-sm font-medium text-red-700 dark:text-red-300">
        {message}
      </p>
    </div>
  );
}

/**
 * 表单输入组件（通用文本输入）
 */
interface FormInputProps {
  id: string;
  name: string;
  label: string;
  type?: 'text' | 'email';
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  minLength?: number;
  maxLength?: number;
}

export function FormInput({
  id,
  name,
  label,
  type = 'text',
  value,
  onChange,
  placeholder,
  required = false,
  minLength,
  maxLength,
}: FormInputProps) {
  return (
    <div className="space-y-2">
      <label
        className="block text-sm font-semibold text-slate-700 dark:text-slate-200"
        htmlFor={id}
      >
        {label}
        {required && <span className="ml-1 text-red-500">*</span>}
      </label>
      <input
        className="block w-full rounded-xl border-2 border-slate-200 bg-white/90 p-4 text-slate-900 placeholder:text-slate-400 transition-all duration-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/20 focus:outline-none dark:border-slate-700 dark:bg-slate-900/90 dark:text-white dark:placeholder:text-slate-500 dark:focus:border-indigo-500 dark:focus:ring-indigo-500/20"
        id={id}
        name={name}
        type={type}
        placeholder={placeholder}
        required={required}
        minLength={minLength}
        maxLength={maxLength}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

/**
 * 提交按钮
 */
interface SubmitButtonProps {
  isLoading: boolean;
  disabled?: boolean;
  children: ReactNode;
}

export function SubmitButton({ isLoading, disabled = false, children }: SubmitButtonProps) {
  return (
    <button
      type="submit"
      disabled={isLoading || disabled}
      className="flex w-full items-center justify-center rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-4 text-base font-bold text-white shadow-lg shadow-blue-500/25 transition-all duration-300 hover:from-blue-700 hover:to-indigo-700 hover:scale-[1.02] hover:shadow-xl hover:shadow-blue-500/35 focus:outline-none focus:ring-4 focus:ring-blue-500/50 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {children}
    </button>
  );
}