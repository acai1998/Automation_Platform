import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { PasswordStrengthIndicator } from './PasswordStrengthIndicator';
import {
  AUTH_FIELD_INPUT_CLASS_NAME,
  AUTH_FIELD_INPUT_ERROR_CLASS_NAME,
  AUTH_FIELD_INPUT_NORMAL_CLASS_NAME,
  AUTH_FIELD_LABEL_CLASS_NAME,
} from './AuthLayout';

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
      <label className={AUTH_FIELD_LABEL_CLASS_NAME} htmlFor={id}>
        {label}
      </label>

      <div className="relative">
        <input
          className={`${AUTH_FIELD_INPUT_CLASS_NAME} pr-12 ${
            error ? AUTH_FIELD_INPUT_ERROR_CLASS_NAME : AUTH_FIELD_INPUT_NORMAL_CLASS_NAME
          }`}
          id={id}
          name={name}
          type={showPassword ? 'text' : 'password'}
          placeholder={placeholder}
          required={required}
          minLength={minLength}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-describedby={ariaDescribedBy}
        />

        <button
          type="button"
          className="absolute inset-y-0 right-0 flex items-center pr-4 text-slate-500 transition-colors duration-200 hover:text-white"
          onClick={() => setShowPassword((current) => !current)}
          aria-label={showPassword ? '隐藏密码' : '显示密码'}
        >
          {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
        </button>
      </div>

      {showStrength ? <PasswordStrengthIndicator password={value} /> : null}
      {errorMessage ? <p className="mt-2 text-xs text-rose-300">{errorMessage}</p> : null}
    </div>
  );
}
