import { ArrowUpDown, MoreVertical, Pause, Pencil, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import type { CheckedState } from '@radix-ui/react-checkbox';
import type { Task } from '@/hooks/useTasks';
import { TRIGGER_TYPE_LABELS } from '@/constants/tasks';
import { cn } from '@/lib/utils';
import {
  TABLE_COLUMN_OPTIONS,
  TASK_STATUS_SEMANTIC,
  formatTime,
  getTaskSemanticStatus,
  getTaskSuccessRate,
  type SortDirection,
  type TaskSortKey,
} from './taskPageConfig';

interface TaskTableViewProps {
  tasks: Task[];
  selectedTasks: Set<number>;
  columnVisibility: Record<TaskSortKey, boolean>;
  sortKey: TaskSortKey;
  sortDirection: SortDirection;
  onSort: (key: TaskSortKey) => void;
  onSelectTask: (taskId: number, checked: CheckedState) => void;
  onRunTask: (taskId: number, taskName: string) => void;
  onToggleStatus: (task: Task) => void;
  onEditTask: (task: Task) => void;
  onDeleteTask: (task: Task) => void;
}

export function TaskTableView({
  tasks,
  selectedTasks,
  columnVisibility,
  sortKey,
  sortDirection,
  onSort,
  onSelectTask,
  onRunTask,
  onToggleStatus,
  onEditTask,
  onDeleteTask,
}: TaskTableViewProps) {
  const visibleColumns = TABLE_COLUMN_OPTIONS.filter((column) => columnVisibility[column.key]);

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <table className="min-w-full text-sm">
        <thead className="bg-slate-50 dark:bg-slate-800/80">
          <tr>
            <th className="w-10 px-3 py-3 text-left">
              <span className="sr-only">选择</span>
            </th>
            {visibleColumns.map((column) => (
              <th key={column.key} className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <button className="inline-flex items-center gap-1 hover:text-slate-700 dark:hover:text-slate-300" onClick={() => onSort(column.key)}>
                  {column.label}
                  {sortKey === column.key && <ArrowUpDown className={cn('h-3.5 w-3.5', sortDirection === 'desc' && 'rotate-180')} />}
                </button>
              </th>
            ))}
            <th className="px-3 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">操作</th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((task) => {
            const status = getTaskSemanticStatus(task);
            const latest = task.recentExecutions?.[0];
            const successRate = getTaskSuccessRate(task);
            return (
              <tr key={task.id} className="border-t border-slate-100 hover:bg-slate-50/80 dark:border-slate-800 dark:hover:bg-slate-800/40">
                <td className="px-3 py-3">
                  <Checkbox checked={selectedTasks.has(task.id)} onCheckedChange={(checked) => onSelectTask(task.id, checked)} />
                </td>
                {columnVisibility.name && <td className="px-3 py-3 font-medium text-slate-800 dark:text-slate-100">{task.name}</td>}
                {columnVisibility.status && (
                  <td className="px-3 py-3">
                    <span className={cn('inline-flex rounded-full px-2 py-0.5 text-xs font-medium', TASK_STATUS_SEMANTIC[status.key])}>{status.label}</span>
                  </td>
                )}
                {columnVisibility.trigger && <td className="px-3 py-3 text-slate-600 dark:text-slate-300">{TRIGGER_TYPE_LABELS[task.trigger_type] ?? task.trigger_type}</td>}
                {columnVisibility.owner && <td className="px-3 py-3 text-slate-600 dark:text-slate-300">{task.created_by_name ?? '-'}</td>}
                {columnVisibility.latestRun && <td className="px-3 py-3 text-slate-600 dark:text-slate-300">{formatTime(latest?.start_time)}</td>}
                {columnVisibility.successRate && <td className="px-3 py-3 font-medium text-slate-700 dark:text-slate-200">{successRate == null ? '-' : `${successRate}%`}</td>}
                <td className="px-3 py-3">
                  <div className="flex items-center justify-end gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onRunTask(task.id, task.name)}>
                      <Play className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onToggleStatus(task)}>
                      <Pause className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onEditTask(task)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onDeleteTask(task)}>
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
