import React, { useMemo } from 'react';
import { 
  Boxes, 
  Play, 
  Clock, 
  CheckCircle2, 
  XCircle, 
  AlertCircle, 
  Loader2, 
  MoreVertical, 
  Calendar, 
  Globe,
  BarChart3,
  Plus
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from '@/components/ui/dropdown-menu';
import { useTasks, useRunTask, type Task, type TaskExecution } from '@/hooks/useTasks';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

export default function Tasks() {
  const { data: tasks, isLoading, error, refetch } = useTasks();
  const runTaskMutation = useRunTask();

  // 优化统计计算,使用useMemo避免每次渲染都重新计算
  const stats = useMemo(() => {
    if (!tasks) return { total: 0, active: 0, todayRuns: 0 };

    const today = new Date().toISOString().split('T')[0];
    return {
      total: tasks.length,
      active: tasks.filter(t => t.status === 'active').length,
      todayRuns: tasks.reduce((acc, t) => 
        acc + (t.recentExecutions?.filter(e => e.start_time?.startsWith(today)).length || 0), 0
      )
    };
  }, [tasks]);

  const handleRunTask = async (taskId: number, taskName: string) => {
    try {
      await runTaskMutation.mutateAsync(taskId);
      toast.success(`任务 "${taskName}" 已开始执行`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '触发失败');
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
        <Loader2 className="h-12 w-12 animate-spin text-blue-500" />
        <p className="text-slate-500 animate-pulse">正在加载任务列表...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
        <div className="p-4 rounded-full bg-red-50 dark:bg-red-900/20">
          <AlertCircle className="h-10 w-10 text-red-500" />
        </div>
        <p className="text-red-600 font-medium">加载失败: {(error as Error).message}</p>
        <Button variant="outline" onClick={() => refetch()}>重试</Button>
      </div>
    );
  }

  return (
    <div className="space-y-8 p-6">
      {/* 顶部标题与操作 */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-3">
            <Boxes className="h-8 w-8 text-blue-600" />
            任务管理
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">
            调度、执行和监控自动化测试任务
          </p>
        </div>
        <Button className="gap-2 shadow-lg shadow-blue-500/20">
          <Plus className="h-4 w-4" />
          新建任务
        </Button>
      </div>

      {/* 统计卡片 */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="bg-gradient-to-br from-blue-500/10 to-transparent border-blue-100 dark:border-blue-900/30">
          <CardHeader className="pb-2">
            <CardDescription className="text-blue-600 dark:text-blue-400 font-medium">总任务数</CardDescription>
            <CardTitle className="text-3xl font-bold">{stats.total}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="bg-gradient-to-br from-green-500/10 to-transparent border-green-100 dark:border-green-900/30">
          <CardHeader className="pb-2">
            <CardDescription className="text-green-600 dark:text-green-400 font-medium">活跃任务</CardDescription>
            <CardTitle className="text-3xl font-bold">{stats.active}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="bg-gradient-to-br from-purple-500/10 to-transparent border-purple-100 dark:border-purple-900/30">
          <CardHeader className="pb-2">
            <CardDescription className="text-purple-600 dark:text-purple-400 font-medium">今日运行</CardDescription>
            <CardTitle className="text-3xl font-bold">{stats.todayRuns}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* 任务列表 */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {tasks?.map((task) => (
          <TaskCard key={task.id} task={task} onRun={() => handleRunTask(task.id, task.name)} />
        ))}
      </div>
    </div>
  );
}

function TaskCard({ task, onRun }: { task: Task; onRun: () => void }) {
  const lastExecution = task.recentExecutions?.[0];
  const successRate = lastExecution?.total_cases 
    ? Math.round((lastExecution.passed_cases / lastExecution.total_cases) * 100) 
    : null;

  return (
    <Card className="group hover:shadow-xl transition-all duration-300 border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col">
      <CardHeader className="pb-4">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <CardTitle className="text-xl font-bold group-hover:text-blue-600 transition-colors">
              {task.name}
            </CardTitle>
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <Badge variant="outline" className="font-normal">
                {task.project_name || '未分类'}
              </Badge>
              <span className="flex items-center gap-1">
                <Globe className="h-3 w-3" />
                {task.environment_name || '默认环境'}
              </span>
            </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem>编辑任务</DropdownMenuItem>
              <DropdownMenuItem>查看报告</DropdownMenuItem>
              <DropdownMenuItem className="text-red-600">删除任务</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>

      <CardContent className="flex-1 space-y-4">
        <p className="text-sm text-slate-600 dark:text-slate-400 line-clamp-2 min-h-[2.5rem]">
          {task.description || '暂无描述'}
        </p>

        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-2 text-slate-500">
            <Calendar className="h-4 w-4" />
            <span>{task.trigger_type === 'scheduled' ? task.cron_expression : '手动触发'}</span>
          </div>
          {successRate !== null && (
            <div className="flex items-center gap-1.5">
              <BarChart3 className="h-4 w-4 text-slate-400" />
              <span className={cn(
                "font-bold",
                successRate >= 90 ? "text-green-600" : successRate >= 70 ? "text-orange-600" : "text-red-600"
              )}>
                {successRate}%
              </span>
            </div>
          )}
        </div>

        {/* 最近运行记录渲染 */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-[10px] uppercase tracking-wider font-semibold text-slate-400">
            <span>最近运行</span>
            <span>{task.recentExecutions?.length || 0} 次记录</span>
          </div>
          <div className="flex gap-1.5 h-6 items-center">
            {task.recentExecutions && task.recentExecutions.length > 0 ? (
              task.recentExecutions.slice(0, 10).map((exec) => (
                <ExecutionStatusDot key={exec.id} execution={exec} />
              ))
            ) : (
              <span className="text-xs text-slate-400 italic">暂无运行记录</span>
            )}
          </div>
        </div>
      </CardContent>

      <CardFooter className="pt-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
        <Button 
          onClick={onRun} 
          className="w-full gap-2 bg-white hover:bg-blue-50 text-blue-600 border-blue-200 hover:border-blue-300 dark:bg-slate-800 dark:text-blue-400 dark:border-slate-700"
          variant="outline"
        >
          <Play className="h-4 w-4 fill-current" />
          立即运行
        </Button>
      </CardFooter>
    </Card>
  );
}

function ExecutionStatusDot({ execution }: { execution: TaskExecution }) {
  const statusConfig = {
    success: { color: 'bg-green-500', icon: CheckCircle2, label: '成功' },
    failed: { color: 'bg-red-500', icon: XCircle, label: '失败' },
    running: { color: 'bg-blue-500 animate-pulse', icon: Loader2, label: '运行中' },
    pending: { color: 'bg-slate-300', icon: Clock, label: '等待中' },
    cancelled: { color: 'bg-slate-400', icon: AlertCircle, label: '已取消' },
  };

  const config = statusConfig[execution.status] || statusConfig.pending;

  return (
    <div 
      className={cn("w-3 h-3 rounded-full cursor-help transition-transform hover:scale-150", config.color)}
      title={`${config.label} - ${execution.start_time || '未知时间'}`}
    />
  );
}