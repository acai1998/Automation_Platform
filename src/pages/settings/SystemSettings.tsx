import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useJenkinsHealthStatus } from '@/hooks/useExecutions';
import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';
import { Bell, RefreshCcw, ServerCog, ShieldCheck, SlidersHorizontal } from 'lucide-react';

type StatusTone = 'neutral' | 'success' | 'danger';

type ReservedSettingModule = {
  title: string;
  description: string;
  icon: LucideIcon;
};

const RESERVED_MODULES: ReservedSettingModule[] = [
  {
    title: '通知设置（预留）',
    description: '后续可配置告警渠道、通知规则和联系人分组。',
    icon: Bell,
  },
  {
    title: '执行治理策略（预留）',
    description: '后续可配置超时治理、重试策略与并发阈值。',
    icon: ShieldCheck,
  },
  {
    title: '系统变量（预留）',
    description: '后续可维护全局参数、环境变量映射与默认模板。',
    icon: SlidersHorizontal,
  },
];

function formatCheckedAt(checkedAt?: string): string {
  if (!checkedAt) return '尚未检测';
  const date = new Date(checkedAt);
  if (Number.isNaN(date.getTime())) return '尚未检测';
  return date.toLocaleString('zh-CN', { hour12: false });
}

function getStatusBadgeVariant(tone: StatusTone): 'outline' | 'success' | 'destructive' {
  if (tone === 'success') return 'success';
  if (tone === 'danger') return 'destructive';
  return 'outline';
}

function getStatusTone(isLoading: boolean, isConnected: boolean): StatusTone {
  if (isLoading) return 'neutral';
  return isConnected ? 'success' : 'danger';
}

function ReservedModuleCard({ title, description, icon: Icon }: ReservedSettingModule) {
  return (
    <Card className="border-slate-200/80 bg-white/95 shadow-sm transition-colors dark:border-slate-800 dark:bg-slate-950/70">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
            <Icon className="h-4 w-4" />
          </div>
          <div>
            <CardTitle className="text-base text-slate-900 dark:text-slate-100">{title}</CardTitle>
            <CardDescription className="mt-1 text-slate-600 dark:text-slate-400">{description}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Badge variant="outline" className="border-slate-300/90 text-slate-700 dark:border-slate-700 dark:text-slate-300">
          规划中
        </Badge>
      </CardContent>
    </Card>
  );
}

export default function SystemSettings() {
  const { data: jenkinsHealth, isFetching, refetch } = useJenkinsHealthStatus();

  const isConnected = Boolean(jenkinsHealth?.connected);
  const statusText = !jenkinsHealth ? '检测中' : isConnected ? '可用' : '不可用';
  const statusMessage = jenkinsHealth?.message || '正在进行 Jenkins 连通性检查...';
  const checkedAt = formatCheckedAt(jenkinsHealth?.checkedAt);
  const statusTone = getStatusTone(!jenkinsHealth, isConnected);

  return (
    <div className="h-full overflow-y-auto px-4 py-5 sm:px-6 sm:py-6">
      <div className="mx-auto max-w-7xl space-y-5">
        <Card className="overflow-hidden border-slate-200 bg-gradient-to-br from-white via-white to-slate-50/70 shadow-sm dark:border-slate-800 dark:from-slate-950 dark:via-slate-950 dark:to-slate-900/80">
          <CardContent className="flex flex-col gap-3 p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">系统设置</h1>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600 dark:text-slate-400">
                  统一管理系统级配置入口。当前已接入 Jenkins 可用性监控，后续可在此扩展通知、治理策略和系统变量等能力。
                </p>
              </div>
              <Badge variant="outline" className="border-slate-300/90 bg-white/90 text-slate-700 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-300">
                {RESERVED_MODULES.length + 1} 个设置模块
              </Badge>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <Card className="border-slate-200/80 bg-white/95 shadow-sm transition-colors dark:border-slate-800 dark:bg-slate-950/70">
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="rounded-xl border border-blue-100 bg-blue-50 p-2.5 text-blue-600 dark:border-blue-900/50 dark:bg-blue-950/40 dark:text-blue-300">
                    <ServerCog className="h-4 w-4" />
                  </div>
                  <div>
                    <CardTitle className="text-base text-slate-900 dark:text-slate-100">Jenkins 集成监控</CardTitle>
                    <CardDescription className="mt-1 text-slate-600 dark:text-slate-400">
                      快速判断 Jenkins 可用性与接口返回状态。
                    </CardDescription>
                  </div>
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 min-w-20 border-slate-300 bg-white text-slate-700 transition-colors hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-primary dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
                  onClick={() => refetch()}
                  disabled={isFetching}
                  aria-label="刷新 Jenkins 状态"
                >
                  <RefreshCcw className={cn('mr-1.5 h-3.5 w-3.5', isFetching && 'animate-spin')} />
                  {isFetching ? '刷新中' : '刷新'}
                </Button>
              </div>
            </CardHeader>

            <CardContent className="space-y-3 text-sm">
              <div className="rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-3 dark:border-slate-800 dark:bg-slate-900/50">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-slate-600 dark:text-slate-400">当前状态</span>
                  <Badge variant={getStatusBadgeVariant(statusTone)}>{statusText}</Badge>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white px-3.5 py-3 dark:border-slate-800 dark:bg-slate-950/60">
                <div className="mb-1 text-xs text-slate-500 dark:text-slate-400">状态说明</div>
                <p className="text-slate-700 dark:text-slate-200" aria-live="polite">
                  {statusMessage}
                </p>
              </div>

              <div className="rounded-xl border border-dashed border-slate-200 px-3.5 py-2.5 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
                最近检测时间：{checkedAt}
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 gap-4">
            {RESERVED_MODULES.map((module) => (
              <ReservedModuleCard key={module.title} {...module} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
