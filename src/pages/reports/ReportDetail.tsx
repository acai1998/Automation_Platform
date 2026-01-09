import { useState } from 'react';
import { useRoute } from 'wouter';
import { 
  ArrowLeft, 
  Clock, 
  Calendar, 
  User, 
  ExternalLink, 
  CheckCircle2, 
  XCircle, 
  AlertCircle, 
  Loader2,
  Search,
  Filter,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { useTestRunDetail, useTestRunResults, type Auto_TestRunResults } from '@/hooks/useExecutions';
import { cn } from '@/lib/utils';

export default function ReportDetail() {
  const [, params] = useRoute('/reports/:id');
  const id = params?.id ? parseInt(params.id) : 0;
  
  const { data: runData, isLoading: isRunLoading } = useTestRunDetail(id);
  const { data: resultsData, isLoading: isResultsLoading } = useTestRunResults(id);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());

  const run = runData?.data;
  const results = resultsData?.data || [];

  // 过滤逻辑
  const filteredResults = results.filter(result => {
    const matchesSearch = result.case_name?.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          result.module?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || result.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const toggleRow = (id: number) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedRows(newExpanded);
  };

  if (isRunLoading || isResultsLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    );
  }

  if (!run) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4">
        <AlertCircle className="h-12 w-12 text-red-500" />
        <p className="text-lg font-medium">未找到运行记录</p>
        <Button onClick={() => window.history.back()}>返回列表</Button>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col min-h-0 bg-slate-50 dark:bg-slate-950">
      {/* 顶部导航与概览 */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-6 py-4">
        <div className="flex items-center gap-4 mb-6">
          <Button variant="ghost" size="icon" onClick={() => window.history.back()} className="-ml-2">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-bold text-slate-900 dark:text-white">
                运行详情 #{run.id}
              </h1>
              <StatusBadge status={run.status} />
            </div>
            <p className="text-sm text-slate-500 mt-1">
              {run.project_name || '未分类项目'} · {run.trigger_type}
            </p>
          </div>
          <div className="ml-auto flex items-center gap-3">
            {run.jenkins_url && (
              <Button variant="outline" size="sm" asChild className="gap-2">
                <a href={run.jenkins_url} target="_blank" rel="noreferrer">
                  <ExternalLink className="h-4 w-4" />
                  Jenkins 构建
                </a>
              </Button>
            )}
          </div>
        </div>

        {/* 统计卡片 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard 
            label="总用例" 
            value={run.total_cases} 
            icon={CheckCircle2}
            className="bg-slate-50 dark:bg-slate-800/50"
          />
          <StatCard 
            label="通过" 
            value={run.passed_cases} 
            icon={CheckCircle2}
            className="bg-green-50 dark:bg-green-900/10 text-green-600 dark:text-green-400"
          />
          <StatCard 
            label="失败" 
            value={run.failed_cases} 
            icon={XCircle}
            className="bg-red-50 dark:bg-red-900/10 text-red-600 dark:text-red-400"
          />
          <StatCard 
            label="耗时" 
            value={run.duration_ms ? `${(run.duration_ms / 1000).toFixed(1)}s` : '-'} 
            icon={Clock}
            className="bg-blue-50 dark:bg-blue-900/10 text-blue-600 dark:text-blue-400"
          />
        </div>
      </div>

      {/* 结果列表 */}
      <div className="flex-1 p-6 min-h-0 overflow-hidden flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input 
                placeholder="搜索用例名称或模块..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="flex items-center gap-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-md p-1">
              {['all', 'passed', 'failed', 'skipped'].map((status) => (
                <button
                  key={status}
                  onClick={() => setStatusFilter(status)}
                  className={cn(
                    "px-3 py-1.5 text-xs font-medium rounded-sm transition-colors",
                    statusFilter === status 
                      ? "bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white" 
                      : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                  )}
                >
                  {status === 'all' ? '全部' : status}
                </button>
              ))}
            </div>
          </div>
          <div className="text-sm text-slate-500">
            共 {filteredResults.length} 条结果
          </div>
        </div>

        <div className="flex-1 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 overflow-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 dark:bg-slate-800/50 sticky top-0 z-10">
              <tr>
                <th className="px-4 py-3 font-medium text-slate-500 w-12"></th>
                <th className="px-4 py-3 font-medium text-slate-500">用例名称</th>
                <th className="px-4 py-3 font-medium text-slate-500">模块</th>
                <th className="px-4 py-3 font-medium text-slate-500">状态</th>
                <th className="px-4 py-3 font-medium text-slate-500">耗时</th>
                <th className="px-4 py-3 font-medium text-slate-500 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredResults.map((result) => (
                <>
                  <tr key={result.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50">
                    <td className="px-4 py-3">
                      {result.status === 'failed' || result.status === 'error' ? (
                        <button onClick={() => toggleRow(result.id)}>
                          {expandedRows.has(result.id) ? (
                            <ChevronUp className="h-4 w-4 text-slate-400" />
                          ) : (
                            <ChevronDown className="h-4 w-4 text-slate-400" />
                          )}
                        </button>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-200">
                      {result.case_name}
                    </td>
                    <td className="px-4 py-3 text-slate-500">{result.module || '-'}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={result.status} />
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      {result.duration ? `${result.duration}ms` : '-'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {/* 预留操作按钮 */}
                    </td>
                  </tr>
                  {expandedRows.has(result.id) && (
                    <tr className="bg-slate-50 dark:bg-slate-800/30">
                      <td colSpan={6} className="px-4 py-4">
                        <div className="space-y-2">
                          {result.error_message && (
                            <div className="text-red-600 dark:text-red-400 font-mono text-xs bg-red-50 dark:bg-red-900/10 p-3 rounded border border-red-100 dark:border-red-900/20">
                              {result.error_message}
                            </div>
                          )}
                          {result.error_stack && (
                            <pre className="text-slate-600 dark:text-slate-400 font-mono text-xs overflow-x-auto p-3 bg-white dark:bg-slate-900 rounded border border-slate-200 dark:border-slate-800">
                              {result.error_stack}
                            </pre>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, icon: Icon, className }: any) {
  return (
    <div className={cn("p-4 rounded-lg border border-slate-200 dark:border-slate-800", className)}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium opacity-70">{label}</span>
        <Icon className="h-4 w-4 opacity-50" />
      </div>
      <div className="text-2xl font-bold">{value}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const configs: Record<string, { label: string, variant: "success" | "destructive" | "secondary" | "outline" | "warning", icon: any }> = {
    success: { label: '成功', variant: 'success', icon: CheckCircle2 },
    passed: { label: '通过', variant: 'success', icon: CheckCircle2 },
    failed: { label: '失败', variant: 'destructive', icon: XCircle },
    error: { label: '错误', variant: 'destructive', icon: AlertCircle },
    running: { label: '运行中', variant: 'secondary', icon: Loader2 },
    pending: { label: '等待中', variant: 'outline', icon: Clock },
    skipped: { label: '跳过', variant: 'outline', icon: AlertCircle },
    aborted: { label: '已中止', variant: 'warning', icon: AlertCircle },
  };

  const config = configs[status] || { label: status, variant: 'outline', icon: AlertCircle };
  const Icon = config.icon;

  return (
    <Badge variant={config.variant} className="gap-1.5 px-2 py-0.5 font-medium">
      <Icon className={cn("h-3 w-3", status === 'running' && "animate-spin")} />
      {config.label}
    </Badge>
  );
}