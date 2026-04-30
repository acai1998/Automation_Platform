import type { ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Link } from 'wouter';
import { AuthLogo } from './Logo';

interface AuthLayoutProps {
  children: ReactNode;
}

interface AuthPageHeaderProps {
  title: string;
  description?: string;
}

interface AuthBackLinkProps {
  href: string;
  children: ReactNode;
}

interface AuthStatusPanelProps {
  icon: ReactNode;
  title: string;
  description: string;
  tone?: 'info' | 'success' | 'error';
  action?: ReactNode;
}

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

interface SubmitButtonProps {
  isLoading: boolean;
  disabled?: boolean;
  children: ReactNode;
}

const statusToneClasses = {
  info: 'border-cyan-400/20 bg-cyan-400/8 text-cyan-50',
  success: 'border-emerald-400/20 bg-emerald-400/8 text-emerald-50',
  error: 'border-rose-400/20 bg-rose-400/8 text-rose-50',
} as const;

const statusIconClasses = {
  info: 'bg-cyan-400/12 text-cyan-300 ring-cyan-300/20',
  success: 'bg-emerald-400/12 text-emerald-300 ring-emerald-300/20',
  error: 'bg-rose-400/12 text-rose-300 ring-rose-300/20',
} as const;

export const AUTH_FIELD_LABEL_CLASS_NAME = 'mb-2 block text-sm font-semibold tracking-[0.02em] text-slate-200';
export const AUTH_FIELD_INPUT_CLASS_NAME =
  'block w-full rounded-2xl border bg-white/[0.04] px-4 py-3.5 text-sm text-white placeholder:text-slate-500 transition-all duration-200 focus:bg-white/[0.06] focus:outline-none focus:ring-4';
export const AUTH_FIELD_INPUT_NORMAL_CLASS_NAME =
  'border-white/10 focus:border-cyan-300/60 focus:ring-cyan-300/10';
export const AUTH_FIELD_INPUT_ERROR_CLASS_NAME =
  'border-rose-400/50 focus:border-rose-300/70 focus:ring-rose-300/10';

function AuthBrandPanel() {
  return (
    <section
      data-testid="auth-brand-panel"
      className="relative overflow-hidden bg-[linear-gradient(180deg,rgba(8,20,36,0.96),rgba(4,10,20,0.98))] px-16 py-16 text-white"
    >
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(99,102,241,0.18),transparent_28%),radial-gradient(circle_at_85%_12%,rgba(34,211,238,0.16),transparent_22%)]" />
        <div className="absolute inset-0 opacity-20 [background-image:linear-gradient(rgba(148,163,184,0.12)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.12)_1px,transparent_1px)] [background-size:42px_42px]" />
      </div>

      <div className="relative z-10 flex h-full items-center justify-center">
        <div className="relative w-full max-w-[640px]">
          <div className="absolute inset-x-10 top-10 h-36 rounded-full bg-cyan-400/10 blur-3xl" />
          <div className="absolute inset-x-20 bottom-0 h-40 rounded-full bg-indigo-500/16 blur-3xl" />

          <div
            data-testid="auth-terminal-demo"
            className="relative overflow-hidden rounded-[28px] border border-white/10 bg-[#0b1224]/94 shadow-[0_32px_120px_rgba(2,6,23,0.68)] backdrop-blur-xl"
          >
            <div className="flex items-center gap-2 border-b border-white/8 bg-white/[0.04] px-6 py-4">
              <span className="h-3 w-3 rounded-full bg-[#ef6b57]" />
              <span className="h-3 w-3 rounded-full bg-[#f5c64f]" />
              <span className="h-3 w-3 rounded-full bg-[#69cb63]" />
              <span className="ml-auto text-sm font-semibold text-slate-400">autotest.platform</span>
            </div>

            <div className="space-y-4 px-8 py-8 font-mono text-[14px] leading-7">
              <div className="grid gap-4">
                <div className="rounded-2xl border border-cyan-400/12 bg-white/[0.03] p-5">
                  <div className="mb-3 flex items-center justify-between">
                    <span className="text-[12px] font-semibold uppercase tracking-[0.2em] text-cyan-300">
                      AI 用例生成
                    </span>
                    <span className="rounded-full bg-cyan-400/10 px-2.5 py-1 text-[11px] text-cyan-200">
                      active
                    </span>
                  </div>
                  <div className="text-cyan-300">
                    <span className="mr-3 text-slate-500">$</span>
                    ai-case generate --source=prd --with-risk-analysis
                  </div>
                  <div className="mt-3 space-y-1 text-slate-200">
                    <div>
                      <span className="mr-2 text-slate-500">→</span>
                      解析需求上下文
                      <span className="ml-2 text-emerald-300">完成</span>
                    </div>
                    <div>
                      <span className="mr-2 text-slate-500">→</span>
                      生成 128 条候选测试点
                    </div>
                    <div className="text-violet-300">高风险场景: 支付回调 / 权限越权 / 并发写入</div>
                  </div>
                </div>

                <div className="rounded-2xl border border-indigo-400/12 bg-white/[0.03] p-5">
                  <div className="mb-3 flex items-center justify-between">
                    <span className="text-[12px] font-semibold uppercase tracking-[0.2em] text-indigo-300">
                      自动化执行 / Jenkins
                    </span>
                    <span className="rounded-full bg-indigo-400/10 px-2.5 py-1 text-[11px] text-indigo-200">
                      running
                    </span>
                  </div>
                  <div className="text-cyan-300">
                    <span className="mr-3 text-slate-500">$</span>
                    auto-test run --suite=regression --parallel
                  </div>
                  <div className="mt-3 space-y-1 text-slate-200">
                    <div>
                      <span className="mr-2 text-slate-500">→</span>
                      Jenkins 流水线已触发
                    </div>
                    <div>
                      <span className="mr-2 text-slate-500">→</span>
                      <span className="text-emerald-300">✓</span>
                      <span className="ml-2">用户登录流程</span>
                      <span className="ml-2 text-slate-400">(1.2s)</span>
                    </div>
                    <div>
                      <span className="mr-2 text-slate-500">→</span>
                      <span className="text-emerald-300">✓</span>
                      <span className="ml-2">支付网关集成</span>
                      <span className="ml-2 text-slate-400">(3.4s)</span>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-violet-400/12 bg-white/[0.03] p-5">
                  <div className="mb-3 flex items-center justify-between">
                    <span className="text-[12px] font-semibold uppercase tracking-[0.2em] text-violet-300">
                      质量门禁 / 发布保障
                    </span>
                    <span className="rounded-full bg-emerald-400/10 px-2.5 py-1 text-[11px] text-emerald-200">
                      passed
                    </span>
                  </div>
                  <div className="text-cyan-300">
                    <span className="mr-3 text-slate-500">$</span>
                    quality-gate verify --release=v3.0
                  </div>
                  <div className="mt-3 space-y-1 text-slate-200">
                    <div>覆盖率: <span className="text-violet-300">96.4%</span></div>
                    <div>通过率: <span className="text-violet-300">100%</span></div>
                    <div>质量结论: <span className="text-emerald-300">满足发布阈值，允许上线</span></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <div
      data-testid="auth-shell"
      className="relative flex min-h-screen min-w-[1280px] items-center justify-center overflow-auto bg-[#020617] px-10 py-10 text-white"
    >
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(99,102,241,0.22),transparent_24%),radial-gradient(circle_at_80%_0%,rgba(34,211,238,0.16),transparent_26%),linear-gradient(180deg,#020617_0%,#030712_50%,#020617_100%)]" />
        <div className="absolute inset-0 opacity-20 [background-image:linear-gradient(rgba(148,163,184,0.16)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.16)_1px,transparent_1px)] [background-size:44px_44px]" />
      </div>

      <div
        data-testid="auth-surface"
        className="relative z-10 grid min-h-[860px] w-full max-w-[1480px] grid-cols-[520px_minmax(0,1fr)] overflow-hidden rounded-[32px] border border-white/10 bg-white/[0.04] shadow-[0_30px_120px_rgba(2,6,23,0.52)] backdrop-blur-2xl"
      >
        <section className="relative border-r border-white/10 bg-[linear-gradient(180deg,rgba(7,16,29,0.98),rgba(5,12,22,0.96))] px-14 py-14">
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute left-10 top-10 h-40 w-40 rounded-full bg-indigo-500/10 blur-3xl" />
            <div className="absolute bottom-12 right-8 h-36 w-36 rounded-full bg-cyan-400/8 blur-3xl" />
          </div>

          <div className="relative z-10 flex h-full flex-col">
            <AuthLogo />
            <div className="mt-12 w-full max-w-[360px] flex-1">{children}</div>
          </div>
        </section>

        <AuthBrandPanel />
      </div>
    </div>
  );
}

export function AuthPageHeader({ title, description }: AuthPageHeaderProps) {
  return (
    <div className="space-y-3">
      <h1 className="text-[34px] font-black leading-[1.08] tracking-[-0.04em] text-white">{title}</h1>
      {description ? <p className="text-sm leading-7 text-slate-400">{description}</p> : null}
    </div>
  );
}

export function AuthBackLink({ href, children }: AuthBackLinkProps) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-2 text-sm font-medium text-slate-400 transition-colors duration-200 hover:text-white"
    >
      <ArrowLeft className="h-4 w-4" />
      {children}
    </Link>
  );
}

export function AuthStatusPanel({
  icon,
  title,
  description,
  tone = 'info',
  action,
}: AuthStatusPanelProps) {
  return (
    <div className={`rounded-[28px] border p-6 ${statusToneClasses[tone]}`}>
      <div className={`flex h-14 w-14 items-center justify-center rounded-2xl ring-1 ${statusIconClasses[tone]}`}>
        {icon}
      </div>
      <h3 className="mt-5 text-xl font-bold text-white">{title}</h3>
      <p className="mt-3 text-sm leading-7 text-slate-300">{description}</p>
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}

export function AuthError({ message }: { message: string }) {
  if (!message) {
    return null;
  }

  return (
    <div className="rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3.5 text-sm text-rose-100">
      {message}
    </div>
  );
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
      <label className={AUTH_FIELD_LABEL_CLASS_NAME} htmlFor={id}>
        {label}
        {required ? <span className="ml-1 text-rose-300">*</span> : null}
      </label>
      <input
        className={`${AUTH_FIELD_INPUT_CLASS_NAME} ${AUTH_FIELD_INPUT_NORMAL_CLASS_NAME}`}
        id={id}
        name={name}
        type={type}
        placeholder={placeholder}
        required={required}
        minLength={minLength}
        maxLength={maxLength}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

export function SubmitButton({ isLoading, disabled = false, children }: SubmitButtonProps) {
  return (
    <button
      type="submit"
      disabled={isLoading || disabled}
      className="flex w-full items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#6366f1_0%,#06b6d4_100%)] px-4 py-3.5 text-sm font-bold text-white shadow-[0_18px_40px_rgba(8,47,73,0.35)] transition-all duration-200 hover:brightness-110 focus:outline-none focus:ring-4 focus:ring-cyan-300/20 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {children}
    </button>
  );
}
