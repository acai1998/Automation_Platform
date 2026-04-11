import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useJenkinsHealthStatus } from '@/hooks/useExecutions';
import { Bell, RefreshCcw, ServerCog, ShieldCheck, SlidersHorizontal } from 'lucide-react';

function formatCheckedAt(checkedAt?: string): string {
  if (!checkedAt) return '尚未检测';
  const date = new Date(checkedAt);
  if (Number.isNaN(date.getTime())) return '尚未检测';
  return date.toLocaleString('zh-CN', { hour12: false });
}

export default function SystemSettings() {
  const { data: jenkinsHealth, isFetching, refetch } = useJenkinsHealthStatus();

  const isConnected = Boolean(jenkinsHealth?.connected);
  const statusText = !jenkinsHealth ? '检测中' : isConnected ? '可用' : '不可用';
  const statusMessage = jenkinsHealth?.message || '正在进行 Jenkins 连通性检查...';

  return (
    <div className="h-full overflow-y-auto px-4 py-5 sm:px-6 sm:py-6">
      <div className="mb-5">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">系统设置</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          统一管理系统级配置入口。当前先接入 Jenkins 监控，后续可在此扩展更多平台设置。
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <div className="rounded-lg bg-blue-500/10 p-2 text-blue-600 dark:text-blue-400">
                  <ServerCog className="h-4 w-4" />
                </div>
                <CardTitle className="text-base">Jenkins 集成监控</CardTitle>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="h-8"
                onClick={() => refetch()}
                disabled={isFetching}
              >
                <RefreshCcw className={`mr-1.5 h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
                刷新
              </Button>
            </div>
            <CardDescription>用于快速判断 Jenkins 可用性与接口返回状态。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center justify-between rounded-md border border-slate-200/80 bg-slate-50/70 px-3 py-2 dark:border-slate-700 dark:bg-slate-900/40">
              <span className="text-slate-500 dark:text-slate-400">当前状态</span>
              <Badge variant={!jenkinsHealth ? 'outline' : isConnected ? 'success' : 'destructive'}>
                {statusText}
              </Badge>
            </div>
            <div>
              <div className="mb-1 text-xs text-slate-500 dark:text-slate-400">状态说明</div>
              <div className="rounded-md border border-slate-200/80 px-3 py-2 text-slate-700 dark:border-slate-700 dark:text-slate-200">
                {statusMessage}
              </div>
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400">
              最近检测时间：{formatCheckedAt(jenkinsHealth?.checkedAt)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <div className="rounded-lg bg-slate-500/10 p-2 text-slate-600 dark:text-slate-300">
                <Bell className="h-4 w-4" />
              </div>
              <CardTitle className="text-base">通知设置（预留）</CardTitle>
            </div>
            <CardDescription>后续可配置告警渠道、通知规则和联系人分组。</CardDescription>
          </CardHeader>
          <CardContent>
            <Badge variant="outline">规划中</Badge>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <div className="rounded-lg bg-slate-500/10 p-2 text-slate-600 dark:text-slate-300">
                <ShieldCheck className="h-4 w-4" />
              </div>
              <CardTitle className="text-base">执行治理策略（预留）</CardTitle>
            </div>
            <CardDescription>后续可配置超时治理、重试策略与并发阈值。</CardDescription>
          </CardHeader>
          <CardContent>
            <Badge variant="outline">规划中</Badge>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <div className="rounded-lg bg-slate-500/10 p-2 text-slate-600 dark:text-slate-300">
                <SlidersHorizontal className="h-4 w-4" />
              </div>
              <CardTitle className="text-base">系统变量（预留）</CardTitle>
            </div>
            <CardDescription>后续可维护全局参数、环境变量映射与默认模板。</CardDescription>
          </CardHeader>
          <CardContent>
            <Badge variant="outline">规划中</Badge>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
