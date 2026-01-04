import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { PasswordStrengthIndicator } from './PasswordStrengthIndicator';

/** 输入框基础样式 */
const INPUT_BASE_STYLES =
  'block w-full rounded-lg border bg-slate-50 p-4 text-slate-900 placeholder:text-slate-400 focus:ring-blue-500 focus:outline-none dark:bg-slate-800 dark:text-white dark:placeholder:text-slate-500 text-sm';

/** 输入框边框样式 */
const INPUT_BORDER_NORMAL = 'border-slate-200 focus:border-blue-500 dark:border-slate-700';
const INPUT_BORDER_ERROR = 'border-red-300 focus:border-red-500 dark:border-red-700';

interface PasswordInputProps {
  id: string;
  name: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  minLength?: number;
  showStrength?: boolean;
  error?: boolean;
  errorMessage?: string;
  ariaDescribedBy?: string;
}

/**
 * 密码输入组件
 * 支持显示/隐藏密码、密码强度指示、错误状态
 */
export function PasswordInput({
  id,
  name,
  label,
  value,
  onChange,
  placeholder = '••••••••',
  required = false,
  minLength,
  showStrength = false,
  error = false,
  errorMessage,
  ariaDescribedBy,
}: PasswordInputProps) {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div>
      <label
        className="mb-2 block text-sm font-medium text-slate-900 dark:text-slate-200"
        htmlFor={id}
      >
        {label}
      </label>
      <div className="relative">
        <input
          className={`${INPUT_BASE_STYLES} pr-12 ${error ? INPUT_BORDER_ERROR : INPUT_BORDER_NORMAL}`}
          id={id}
          name={name}
          type={showPassword ? 'text' : 'password'}
          placeholder={placeholder}
          required={required}
          minLength={minLength}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-describedby={ariaDescribedBy}
        />
        <button
          type="button"
          className="absolute inset-y-0 right-0 flex items-center pr-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          onClick={() => setShowPassword(!showPassword)}
          aria-label={showPassword ? '隐藏密码' : '显示密码'}
        >
          {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
        </button>
      </div>
      {showStrength && <PasswordStrengthIndicator password={value} />}
      {errorMessage && <p className="mt-1 text-xs text-red-500">{errorMessage}</p>}
    </div>
  );
}
