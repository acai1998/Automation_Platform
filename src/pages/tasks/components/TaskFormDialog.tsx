import { useCallback, useEffect, useMemo, useState } from 'react';
import { Calendar, ChevronDown, ListChecks, Loader2, Plus, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useAllCasesForSelect, type CaseType, type TestCase as CaseItem } from '@/hooks/useCases';
import { useCronPreview, type CreateTaskInput, type Task } from '@/hooks/useTasks';
import { cn } from '@/lib/utils';
import { TASKS_CONFIG } from '@/constants/tasks';
import { TASK_MESSAGES } from '@/constants/messages';
import {
  CASE_TYPE_FILTER_OPTIONS,
  TASK_TRIGGER_TYPE_OPTIONS,
  type TaskTriggerType,
} from './taskPageConfig';

interface TaskFormDialogProps {
  open: boolean;
  task: Task | null;
  onClose: () => void;
  onSave: (input: CreateTaskInput & { id?: number }) => void;
  isSaving: boolean;
}

/** 用例类型标签映射 */
const CASE_TYPE_LABELS: Record<string, string> = {
  api: 'API',
  ui: 'UI',
  performance: '性能',
};

/** 用例类型颜色 */
const CASE_TYPE_COLORS: Record<string, string> = {
  api: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  ui: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  performance: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
};

/** Cron 常用预设 */
const CRON_PRESETS = [
  { label: '每分钟', value: '* * * * *' },
  { label: '每小时', value: '0 * * * *' },
  { label: '每天凌晨', value: '0 2 * * *' },
  { label: '工作日9点', value: '0 9 * * 1-5' },
  { label: '每周一', value: '0 9 * * 1' },
  { label: '每月1号', value: '0 9 1 * *' },
] as const;

export function TaskFormDialog({ open, task, onClose, onSave, isSaving }: TaskFormDialogProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [triggerType, setTriggerType] = useState<TaskTriggerType>('manual');
  const [cronExpression, setCronExpression] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  // ── Cron 预览（防抖后才触发查询）──────────────────────────────────
  const [debouncedCron, setDebouncedCron] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebouncedCron(cronExpression), 600);
    return () => clearTimeout(t);
  }, [cronExpression]);

  const cronPreviewExpr = triggerType === 'scheduled' ? debouncedCron : '';
  const {
    data: cronPreviewData,
    isFetching: cronPreviewLoading,
  } = useCronPreview(cronPreviewExpr, 5);

  // ── 关联用例状态 ──────────────────────────────────────
  const [selectedCaseIds, setSelectedCaseIds] = useState<number[]>([]);
  const [caseSearch, setCaseSearch] = useState('');
  const [caseTypeFilter, setCaseTypeFilter] = useState<CaseType | ''>('');
  const [casePickerOpen, setCasePickerOpen] = useState(false);

  // 已选用例对象缓存（独立维护，避免 API 加载中时标签短暂消失）
  const [selectedCaseObjects, setSelectedCaseObjects] = useState<CaseItem[]>([]);

  // 搜索防抖
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(caseSearch), 300);
    return () => clearTimeout(t);
  }, [caseSearch]);

  const { data: casesData, isLoading: casesLoading } = useAllCasesForSelect({
    search: debouncedSearch,
    type: caseTypeFilter,
    enabled: open, // 弹窗打开时才请求
  });
  const allCases = casesData?.data ?? [];

  // 同步已选用例对象缓存（避免在事件回调内嵌套 setState）
  useEffect(() => {
    if (selectedCaseIds.length === 0) {
      setSelectedCaseObjects([]);
      return;
    }

    setSelectedCaseObjects((prev) => {
      const cacheById = new Map<number, CaseItem>();
      prev.forEach((item) => cacheById.set(item.id, item));
      allCases.forEach((item) => cacheById.set(item.id, item));

      return selectedCaseIds
        .map((id) => cacheById.get(id))
        .filter((item): item is CaseItem => item !== undefined);
    });
  }, [allCases, selectedCaseIds]);

  // 候选列表（排除已选）
  const candidateCases = useMemo(
    () => allCases.filter((c) => !selectedCaseIds.includes(c.id)),
    [allCases, selectedCaseIds]
  );

  // 已选用例对象：按 selectedCaseIds 顺序展示，保证顺序稳定
  const selectedCases = selectedCaseObjects;

  // 回填编辑数据
  useEffect(() => {
    if (open) {
      setName(task?.name ?? '');
      setDescription(task?.description ?? '');
      setTriggerType(task?.trigger_type ?? 'manual');
      setCronExpression(task?.cron_expression ?? '');
      setErrors({});
      setCaseSearch('');
      setCaseTypeFilter('');
      setCasePickerOpen(false);
      setSelectedCaseObjects([]);
      // 回填已有 case_ids
      if (task?.case_ids) {
        try {
          const ids = JSON.parse(task.case_ids);
          setSelectedCaseIds(Array.isArray(ids) ? ids : []);
        } catch {
          setSelectedCaseIds([]);
        }
      } else {
        setSelectedCaseIds([]);
      }
    }
  }, [open, task]);

  const toggleCaseSelect = useCallback((caseId: number) => {
    setSelectedCaseIds((prev) =>
      prev.includes(caseId)
        ? prev.filter((id) => id !== caseId)
        : [...prev, caseId]
    );
  }, []);

  const validate = () => {
    const errs: Record<string, string> = {};

    // 任务名称验证
    if (!name.trim()) {
      errs.name = TASK_MESSAGES.NAME_REQUIRED;
    } else if (name.trim().length > TASKS_CONFIG.MAX_NAME_LENGTH) {
      errs.name = TASK_MESSAGES.NAME_TOO_LONG;
    } else if (!/^[\u4e00-\u9fa5a-zA-Z0-9_\-\s]+$/.test(name.trim())) {
      errs.name = TASK_MESSAGES.NAME_INVALID_CHARS;
    }

    // 描述验证
    if (description.trim().length > TASKS_CONFIG.MAX_DESCRIPTION_LENGTH) {
      errs.description = TASK_MESSAGES.DESCRIPTION_TOO_LONG;
    }

    // Cron 表达式验证
    if (triggerType === 'scheduled') {
      if (!cronExpression.trim()) {
        errs.cronExpression = TASK_MESSAGES.CRON_REQUIRED;
      } else {
        const parts = cronExpression.trim().split(/\s+/);
        if (parts.length !== TASKS_CONFIG.CRON_SEGMENTS) {
          errs.cronExpression = TASK_MESSAGES.CRON_INVALID_FORMAT;
        } else {
          // 验证每段的合法性（简单验证：数字、*、逗号、连字符、斜杠）
          const isValid = parts.every((part) => /^[\d\*\-,\/]+$/.test(part));
          if (!isValid) {
            errs.cronExpression = TASK_MESSAGES.CRON_INVALID_CHARS;
          }
        }
      }
    }

    return errs;
  };

  const handleSubmit = () => {
    const errs = validate();
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }
    onSave({
      id: task?.id,
      name: name.trim(),
      description: description.trim() || undefined,
      triggerType,
      cronExpression: triggerType === 'scheduled' ? cronExpression.trim() : undefined,
      caseIds: selectedCaseIds,
    });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto p-0 animate-in fade-in-0 zoom-in-95 duration-200">
        <DialogHeader className="px-6 pt-6 pb-3 border-b border-slate-100 dark:border-slate-800">
          <DialogTitle>{task ? TASK_MESSAGES.FORM_EDIT_TITLE : TASK_MESSAGES.FORM_CREATE_TITLE}</DialogTitle>
          <DialogDescription>
            {task ? TASK_MESSAGES.FORM_EDIT_DESC : TASK_MESSAGES.FORM_CREATE_DESC}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 px-6 py-4">
          {/* 任务名称 */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
              {TASK_MESSAGES.FORM_NAME_LABEL} <span className="text-red-500">*</span>
            </label>
            <Input
              placeholder={TASK_MESSAGES.FORM_NAME_PLACEHOLDER}
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (errors.name) setErrors((p) => ({ ...p, name: '' }));
              }}
              className={cn(errors.name && 'border-red-400 focus-visible:ring-red-400')}
              aria-label={TASK_MESSAGES.FORM_NAME_LABEL}
              aria-invalid={!!errors.name}
              aria-describedby={errors.name ? 'name-error' : undefined}
            />
            {errors.name && <p id="name-error" className="text-xs text-red-500">{errors.name}</p>}
          </div>

          {/* 任务描述 */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
              {TASK_MESSAGES.FORM_DESCRIPTION_LABEL}
            </label>
            <Textarea
              placeholder={TASK_MESSAGES.FORM_DESCRIPTION_PLACEHOLDER}
              value={description}
              onChange={(e) => {
                setDescription(e.target.value);
                if (errors.description) setErrors((p) => ({ ...p, description: '' }));
              }}
              rows={3}
              className={cn(errors.description && 'border-red-400 focus-visible:ring-red-400')}
              aria-label={TASK_MESSAGES.FORM_DESCRIPTION_LABEL}
              aria-invalid={!!errors.description}
              aria-describedby={errors.description ? 'description-error' : undefined}
            />
            {errors.description && <p id="description-error" className="text-xs text-red-500">{errors.description}</p>}
          </div>

          {/* 触发类型 */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
              {TASK_MESSAGES.FORM_TRIGGER_LABEL}
            </label>
            <div className="flex gap-2" role="group" aria-label={TASK_MESSAGES.FORM_TRIGGER_LABEL}>
              {TASK_TRIGGER_TYPE_OPTIONS.map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setTriggerType(value)}
                  className={cn(
                    'flex-1 rounded-lg border px-3 py-2.5 text-sm font-medium transition-all',
                    triggerType === value
                      ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-500'
                      : 'border-slate-200 text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:text-slate-400'
                  )}
                  aria-pressed={triggerType === value}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Cron 表达式（仅定时触发时显示） */}
          {triggerType === 'scheduled' && (
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                {TASK_MESSAGES.FORM_CRON_LABEL} <span className="text-red-500">*</span>
              </label>

              {/* 常用预设快捷按钮 */}
              <div className="flex flex-wrap gap-1.5">
                {CRON_PRESETS.map((preset) => (
                  <button
                    key={preset.value}
                    type="button"
                    onClick={() => {
                      setCronExpression(preset.value);
                      if (errors.cronExpression) setErrors((p) => ({ ...p, cronExpression: '' }));
                    }}
                    className={cn(
                      'px-2.5 py-1 rounded-full text-xs font-medium border transition-all',
                      cronExpression === preset.value
                        ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-500'
                        : 'border-slate-200 text-slate-500 hover:border-blue-300 hover:text-blue-600 dark:border-slate-700 dark:text-slate-400'
                    )}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>

              {/* Cron 输入框 */}
              <Input
                placeholder={TASK_MESSAGES.FORM_CRON_PLACEHOLDER}
                value={cronExpression}
                onChange={(e) => {
                  setCronExpression(e.target.value);
                  if (errors.cronExpression) setErrors((p) => ({ ...p, cronExpression: '' }));
                }}
                className={cn(
                  'font-mono',
                  errors.cronExpression && 'border-red-400 focus-visible:ring-red-400'
                )}
                aria-label={TASK_MESSAGES.FORM_CRON_LABEL}
                aria-invalid={!!errors.cronExpression}
                aria-describedby={errors.cronExpression ? 'cron-error' : 'cron-hint'}
              />
              {errors.cronExpression ? (
                <p id="cron-error" className="text-xs text-red-500">{errors.cronExpression}</p>
              ) : (
                <p id="cron-hint" className="text-xs text-slate-400">{TASK_MESSAGES.FORM_CRON_HINT}</p>
              )}

              {/* 下次运行时间预览卡片 */}
              {(cronPreviewLoading || (cronPreviewData?.times && cronPreviewData.times.length > 0)) && (
                <div className="rounded-lg border border-blue-100 dark:border-blue-900/40 bg-blue-50/60 dark:bg-blue-900/10 p-3 space-y-1.5">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-blue-700 dark:text-blue-300">
                    <Calendar className="h-3.5 w-3.5" />
                    <span>未来运行时间预览</span>
                    {cronPreviewLoading && <Loader2 className="h-3 w-3 animate-spin ml-auto" />}
                  </div>
                  {!cronPreviewLoading && cronPreviewData?.times.map((isoTime, idx) => {
                    const d = new Date(isoTime);
                    const dateStr = d.toLocaleDateString('zh-CN', {
                      month: '2-digit', day: '2-digit', weekday: 'short',
                    });
                    const timeStr = d.toLocaleTimeString('zh-CN', {
                      hour: '2-digit', minute: '2-digit',
                    });
                    return (
                      <div
                        key={isoTime}
                        className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400"
                      >
                        <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-300 text-[10px] font-bold shrink-0">
                          {idx + 1}
                        </span>
                        <span className="font-mono tabular-nums">{dateStr} {timeStr}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── 关联用例 ─────────────────────────────────── */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <ListChecks className="h-4 w-4 text-slate-500" />
                关联用例
                {selectedCaseIds.length > 0 && (
                  <span className="ml-1 inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                    {selectedCaseIds.length}
                  </span>
                )}
              </label>
              <button
                type="button"
                onClick={() => setCasePickerOpen((v) => !v)}
                className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-0.5 transition-colors"
              >
                {casePickerOpen ? '收起' : '展开选择'}
                <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', casePickerOpen && 'rotate-180')} />
              </button>
            </div>

            {/* 已选用例标签列表 */}
            {selectedCases.length > 0 && (
              <div className="flex flex-wrap gap-1.5 p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 min-h-[36px]">
                {selectedCases.map((c) => (
                  <span
                    key={c.id}
                    className="inline-flex items-center gap-1 rounded-md bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-2 py-0.5 text-xs text-slate-700 dark:text-slate-300 shadow-sm"
                  >
                    <span className={cn('rounded px-1 text-[10px] font-semibold', CASE_TYPE_COLORS[c.type] ?? '')}>
                      {CASE_TYPE_LABELS[c.type] ?? c.type}
                    </span>
                    <span className="max-w-[120px] truncate">{c.name}</span>
                    <button
                      type="button"
                      onClick={() => toggleCaseSelect(c.id)}
                      className="ml-0.5 text-slate-400 hover:text-red-500 transition-colors"
                      aria-label={`移除 ${c.name}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}

            {selectedCases.length === 0 && !casePickerOpen && (
              <p className="text-xs text-slate-400 italic">暂未关联用例，任务运行时将跳过执行</p>
            )}

            {/* 用例选择器面板 */}
            {casePickerOpen && (
              <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm animate-in fade-in-0 slide-in-from-top-1 duration-200">
                {/* 搜索 + 类型过滤 */}
                <div className="flex gap-2 p-2 border-b border-slate-100 dark:border-slate-800">
                  <div className="relative flex-1">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                    <input
                      type="text"
                      placeholder="搜索用例名称..."
                      value={caseSearch}
                      onChange={(e) => setCaseSearch(e.target.value)}
                      className="w-full pl-8 pr-3 py-1.5 text-sm rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                  <div className="flex gap-1">
                    {CASE_TYPE_FILTER_OPTIONS.map(({ value, label }) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setCaseTypeFilter(value)}
                        className={cn(
                          'px-2 py-1 rounded-md text-xs font-medium border transition-all',
                          caseTypeFilter === value
                            ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                            : 'border-slate-200 text-slate-500 hover:border-slate-300 dark:border-slate-700 dark:text-slate-400'
                        )}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 候选用例列表 */}
                <div className="max-h-[200px] overflow-y-auto">
                  {casesLoading ? (
                    <div className="flex items-center justify-center py-6 text-slate-400">
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      <span className="text-sm">加载中...</span>
                    </div>
                  ) : candidateCases.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-6 text-slate-400">
                      <Search className="h-5 w-5 mb-1 opacity-40" />
                      <span className="text-sm">{caseSearch ? '未找到匹配用例' : '所有用例已选完'}</span>
                    </div>
                  ) : (
                    candidateCases.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => toggleCaseSelect(c.id)}
                        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors border-b border-slate-50 dark:border-slate-800 last:border-0"
                      >
                        <span className={cn('shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold', CASE_TYPE_COLORS[c.type] ?? '')}>
                          {CASE_TYPE_LABELS[c.type] ?? c.type}
                        </span>
                        <span className="flex-1 text-sm text-slate-700 dark:text-slate-300 truncate">{c.name}</span>
                        {c.module && (
                          <span className="shrink-0 text-[10px] text-slate-400 bg-slate-100 dark:bg-slate-700 rounded px-1.5 py-0.5 truncate max-w-[80px]">
                            {c.module}
                          </span>
                        )}
                        <Plus className="shrink-0 h-3.5 w-3.5 text-blue-500" />
                      </button>
                    ))
                  )}
                </div>

                {/* 底部统计 */}
                <div className="flex items-center justify-between px-3 py-1.5 border-t border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/60">
                  <span className="text-[11px] text-slate-400">
                    共 {casesData?.total ?? 0} 个用例，已选 {selectedCaseIds.length} 个
                  </span>
                  {selectedCaseIds.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedCaseIds([]);
                        setSelectedCaseObjects([]);
                      }}
                      className="text-[11px] text-red-400 hover:text-red-600 transition-colors"
                    >
                      清空已选
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/60">
          <Button variant="outline" onClick={onClose} disabled={isSaving}>
            {TASK_MESSAGES.BTN_CANCEL}
          </Button>
          <Button onClick={handleSubmit} disabled={isSaving}>
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            {isSaving ? TASK_MESSAGES.BTN_SAVING : task ? TASK_MESSAGES.BTN_SAVE : TASK_MESSAGES.BTN_CREATE_TASK}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
