import { useMemo } from 'react';
import { getPasswordStrength } from '@/utils/validation';

interface PasswordStrengthIndicatorProps {
  password: string;
}

export function PasswordStrengthIndicator({ password }: PasswordStrengthIndicatorProps) {
  const strength = useMemo(() => getPasswordStrength(password), [password]);

  if (!password) {
    return null;
  }

  return (
    <div className="mt-3">
      <div className="mb-2 flex gap-2">
        {[1, 2, 3].map((level) => (
          <div
            key={level}
            className={`h-1 flex-1 rounded-full ${
              strength.level >= level ? strength.color : 'bg-white/10'
            }`}
          />
        ))}
      </div>
      <p className="text-xs text-slate-400">密码强度: {strength.text}</p>
    </div>
  );
}
