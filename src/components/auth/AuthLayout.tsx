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
    <div className="flex min-h-screen w-full flex-row bg-slate-50 dark:bg-[#101922]">
      {/* Left Side: Form */}
      <div className="flex w-full flex-col justify-center bg-white dark:bg-[#1a2632] px-6 py-12 lg:w-1/2 lg:px-20 xl:px-32 shadow-xl z-10">
        <div className="mb-10">
          <AuthLogo />
        </div>
        <div className="w-full max-w-md">{children}</div>
      </div>

      {/* Right Side: Visual/Marketing */}
      {rightPanel && (
        <div className="relative hidden w-0 flex-1 lg:block bg-slate-50 dark:bg-slate-900">
          <div className="absolute inset-0 bg-blue-500/5 dark:bg-blue-500/10" />
          <div className="relative flex h-full flex-col items-center justify-center p-12">
            {rightPanel}
            <p className="mt-12 text-sm text-slate-400 dark:text-slate-500">
              AutoTest Platform - 让测试更简单
            </p>
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
    <div className="rounded-lg bg-red-50 dark:bg-red-900/20 p-4 text-sm text-red-600 dark:text-red-400">
      {message}
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
    <div>
      <label
        className="mb-2 block text-sm font-medium text-slate-900 dark:text-slate-200"
        htmlFor={id}
      >
        {label}
      </label>
      <input
        className="block w-full rounded-lg border border-slate-200 bg-slate-50 p-4 text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:ring-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:placeholder:text-slate-500 text-sm"
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
      className="flex w-full items-center justify-center rounded-lg bg-blue-500 px-4 py-3.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {children}
    </button>
  );
}
