import { useState } from 'react';
import { Link } from 'wouter';
import {
  AlertCircle,
  BarChart3,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  ExternalLink,
  FileText,
  History,
  Loader2,
  XCircle,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DateRangePicker } from '@/components/ui/date-range-picker';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { useTestRuns, TestRunFilters } from '@/hooks/useExecutions';
import { cn } from '@/lib/utils';

function formatDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || ms <= 0) return '-';
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
}

type MultiSelectOption = {
  value: string;
  label: string;
};

export default function Reports() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [filters, setFilters] = useState<TestRunFilters>({});

  const pageSizeOptions = [10, 20, 50] as const;
  const triggerTypeOptions: MultiSelectOption[] = [
    { value: 'manual', label: '鎵嬪姩' },
    { value: 'jenkins', label: 'Jenkins' },
    { value: 'schedule', label: '瀹氭椂' },
    { value: 'ci_triggered', label: 'CI' },
  ];
  const statusOptions: MultiSelectOption[] = [
    { value: 'success', label: '鎴愬姛' },
    { value: 'failed', label: '澶辫触' },
    { value: 'running', label: '杩愯涓?' },
    { value: 'pending', label: '绛夊緟涓?' },
    { value: 'aborted', label: '宸蹭腑姝?' },
  ];

  const { data, isLoading, error, refetch } = useTestRuns(page, pageSize, filters);
  const totalPages = data ? Math.ceil(data.total / pageSize) : 0;
  const startIndex = (page - 1) * pageSize + 1;
  const endIndex = Math.min(page * pageSize, data?.total || 0);

  const handleMultiFilterChange = (key: 'triggerType' | 'status', values: string[]) => {
    setFilters((prev) => ({
      ...prev,
      [key]: values.length > 0 ? values : undefined,
    }));
    setPage(1);
  };

  const handleDateRangeChange = (range: { startDate?: string; endDate?: string }) => {
    setFilters((prev) => ({
      ...prev,
      startDate: range.startDate,
      endDate: range.endDate,
    }));
    setPage(1);
  };

  const handleClearAll = () => {
    setFilters({});
    setPage(1);
  };

  const hasActiveFilters = Boolean(
    (filters.triggerType?.length ?? 0) ||
      (filters.status?.length ?? 0) ||
      filters.startDate ||
      filters.endDate
  );

  const theme = {
    gradient: 'from-blue-500/20 via-blue-500/5 to-transparent',
    iconBg: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  };

  return (
    <div className="h-full min-h-0 flex flex-col">
      <div
        className={`relative flex h-20 items-center rounded-t-xl bg-gradient-to-r px-6 ${theme.gradient} dark:from-slate-800/50 dark:via-transparent`}
      >
        <div className="flex w-full items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`rounded-xl p-2.5 shadow-sm ${theme.iconBg}`}>
              <BarChart3 className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                杩愯璁板綍
              </h1>
              <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
                鏌ョ湅鍜屽垎鏋愯嚜鍔ㄥ寲娴嬭瘯杩愯鍘嗗彶璁板綍
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="relative z-30 overflow-visible border-b border-slate-200/80 bg-white/50 px-4 py-3 backdrop-blur-sm dark:border-slate-700/50 dark:bg-slate-900/50">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="shrink-0 text-xs text-slate-500 dark:text-slate-400">瑙﹀彂鏂瑰紡</span>
            <FilterMultiSelect
              options={triggerTypeOptions}
              value={filters.triggerType || []}
              onChange={(values) => handleMultiFilterChange('triggerType', values)}
              placeholder="鍏ㄩ儴"
            />
          </div>

          <div className="flex items-center gap-2">
            <span className="shrink-0 text-xs text-slate-500 dark:text-slate-400">鐘舵€?/span>
            <FilterMultiSelect
              options={statusOptions}
              value={filters.status || []}
              onChange={(values) => handleMultiFilterChange('status', values)}
              placeholder="鍏ㄩ儴"
            />
          </div>

          <div className="flex items-center gap-2">
            <span className="shrink-0 text-xs text-slate-500 dark:text-slate-400">鏃堕棿鑼冨洿</span>
            <DateRangePicker
              value={{ startDate: filters.startDate, endDate: filters.endDate }}
              onChange={handleDateRangeChange}
            />
          </div>

          {hasActiveFilters ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClearAll}
              className="ml-auto h-8 gap-1.5 text-xs text-slate-500 hover:text-slate-700"
            >
              <X className="h-3 w-3" />
              娓呯┖绛涢€?
            </Button>
          ) : null}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-hidden rounded-b-xl border border-t-0 border-slate-200/80 bg-white shadow-sm dark:border-slate-700/50 dark:bg-slate-900">
        {isLoading ? (
          <div className="flex h-64 flex-col items-center justify-center gap-3">
            <Loader2 className="h-10 w-10 animate-spin text-blue-500" />
            <span className="text-sm text-slate-500 dark:text-slate-400">鍔犺浇涓?..</span>
          </div>
        ) : error ? (
          <div className="flex h-64 flex-col items-center justify-center gap-4">
            <AlertCircle className="h-10 w-10 text-red-500" />
            <p className="text-sm text-red-600">鍔犺浇澶辫触: {(error as Error).message}</p>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              閲嶈瘯
            </Button>
          </div>
        ) : data?.data.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center gap-3 text-slate-500 dark:text-slate-400">
            <History className="h-10 w-10 opacity-20" />
            <p className="font-medium">
              {hasActiveFilters ? '娌℃湁绗﹀悎绛涢€夋潯浠剁殑璁板綍' : '鏆傛棤杩愯璁板綍'}
            </p>
            {hasActiveFilters ? (
              <Button variant="outline" size="sm" onClick={handleClearAll}>
                娓呯┖绛涢€夋潯浠?
              </Button>
            ) : null}
          </div>
        ) : (
          <div className="flex h-full flex-col">
            <div className="flex-1 overflow-auto">
              <table className="w-full min-w-[1000px]">
                <thead className="sticky top-0 z-10">
                  <tr className="border-b border-slate-200 bg-slate-50/95 backdrop-blur-sm dark:border-slate-700 dark:bg-slate-800/95">
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                      鎵ц缂栧彿
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                      瑙﹀彂淇℃伅
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                      鐘舵€?/th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                      鐢ㄤ緥缁熻
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                      寮€濮嬫椂闂?/th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                      鑰楁椂
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                      鎿嶄綔
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {data.data.map((record) => (
                    <tr
                      key={record.id}
                      className="group transition-colors duration-150 hover:bg-slate-50/80 dark:hover:bg-slate-800/50"
                    >
                      <td className="px-4 py-3.5 font-mono text-sm text-slate-700 dark:text-slate-300">
                        {record.id}
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-1 text-[10px] text-slate-400">
                          <TriggerTypeBadge type={record.trigger_type} />
                          <span>by {record.trigger_by_name || '绯荤粺'}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        <StatusBadge status={record.status} reason={record.abort_reason} />
                        {record.status === 'aborted' && record.abort_reason ? (
                          <div
                            className="mt-1 max-w-[220px] truncate text-[10px] text-amber-600 dark:text-amber-400"
                            title={record.abort_reason}
                          >
                            鍘熷洜: {record.abort_reason}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="mb-1 flex items-center gap-1.5 text-xs">
                          <span className="font-medium text-green-600">{record.passed_cases} 閫氳繃</span>
                          <span className="text-slate-300">路</span>
                          <span className="font-medium text-red-500">{record.failed_cases} 澶辫触</span>
                          <span className="text-slate-300">路</span>
                          <span className="text-slate-400">{record.total_cases} 鎬昏</span>
                        </div>
                        <div className="h-1 w-24 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                          <div
                            className="h-full bg-green-500 transition-all duration-500"
                            style={{ width: `${(record.passed_cases / (record.total_cases || 1)) * 100}%` }}
                          />
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-xs text-slate-600 dark:text-slate-400">
                        {record.start_time ? new Date(record.start_time).toLocaleString() : '-'}
                      </td>
                      <td className="px-4 py-3.5 text-xs text-slate-600 dark:text-slate-400">
                        {formatDuration(record.duration_ms)}
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <div className="flex justify-end gap-2">
                          {record.jenkins_url ? (
                            <Button variant="ghost" size="icon" className="h-8 w-8" asChild title="鏌ョ湅 Jenkins">
                              <a href={record.jenkins_url} target="_blank" rel="noreferrer">
                                <ExternalLink className="h-4 w-4 text-slate-400" />
                              </a>
                            </Button>
                          ) : null}
                          <Button variant="outline" size="sm" className="h-8 gap-1.5" asChild>
                            <Link href={`/reports/${record.id}`}>
                              <FileText className="h-3.5 w-3.5" />
                              璇︽儏
                            </Link>
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex shrink-0 items-center justify-between gap-3 border-t border-slate-200 bg-slate-50/50 px-6 py-3 dark:border-slate-700 dark:bg-slate-800/30">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500">姣忛〉</span>
                  <select
                    value={pageSize}
                    onChange={(e) => {
                      setPageSize(Number(e.target.value));
                      setPage(1);
                    }}
                    className="h-8 w-16 rounded-md border border-slate-200 bg-white text-sm dark:border-slate-700 dark:bg-slate-800"
                  >
                    {pageSizeOptions.map((size) => (
                      <option key={size} value={size}>
                        {size}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="text-xs text-slate-500">
                  绗?<span className="font-medium text-slate-700 dark:text-slate-300">{startIndex}</span>-
                  <span className="font-medium text-slate-700 dark:text-slate-300">{endIndex}</span> 鏉★紝
                  鍏?<span className="font-medium text-slate-700 dark:text-slate-300">{data.total}</span> 鏉?
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page === 1}
                  onClick={() => setPage((current) => current - 1)}
                  className="h-8 w-8 p-0"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <div className="px-2 text-xs font-medium">
                  绗?{page} / {totalPages || 1} 椤?
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page === totalPages}
                  onClick={() => setPage((current) => current + 1)}
                  className="h-8 w-8 p-0"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function FilterMultiSelect({
  options,
  value,
  onChange,
  placeholder = '璇烽€夋嫨',
}: {
  options: MultiSelectOption[];
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
}) {
  const optionMap = new Map(options.map((item) => [item.value, item.label]));

  const toggleOption = (optionValue: string) => {
    if (value.includes(optionValue)) {
      onChange(value.filter((item) => item !== optionValue));
      return;
    }
    onChange([...value, optionValue]);
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="min-h-8 min-w-[180px] max-w-[320px] rounded-md border border-slate-200 bg-white px-2 py-1 text-left text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/30 dark:border-slate-700 dark:bg-slate-800"
        >
          <div className="flex items-center gap-2">
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
              {value.length === 0 ? (
                <span className="text-slate-400">{placeholder}</span>
              ) : (
                value.map((item) => (
                  <span
                    key={item}
                    className="inline-flex items-center rounded border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[10px] text-blue-600 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-400"
                  >
                    {optionMap.get(item) || item}
                  </span>
                ))
              )}
            </div>
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400" />
          </div>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={6} className="w-52 p-1.5">
        <div className="max-h-56 space-y-0.5 overflow-auto">
          {options.map((option) => (
            <label
              key={option.value}
              className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              <Checkbox
                checked={value.includes(option.value)}
                onCheckedChange={() => toggleOption(option.value)}
                className="h-3.5 w-3.5 rounded border-slate-300 data-[state=checked]:border-blue-500 data-[state=checked]:bg-blue-500"
              />
              <span className="text-xs text-slate-700 dark:text-slate-300">{option.label}</span>
            </label>
          ))}
        </div>
        {value.length > 0 ? (
          <div className="mt-1.5 border-t border-slate-100 pt-1.5 dark:border-slate-800">
            <button
              type="button"
              className="w-full px-2 py-1 text-left text-xs text-slate-500 transition-colors hover:text-blue-600"
              onClick={() => onChange([])}
            >
              娓呯┖閫夋嫨
            </button>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

function TriggerTypeBadge({ type }: { type: string }) {
  const configs: Record<string, { label: string; className: string }> = {
    manual: {
      label: '鎵嬪姩',
      className: 'bg-blue-50 text-blue-600 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800',
    },
    jenkins: {
      label: 'Jenkins',
      className: 'bg-orange-50 text-orange-600 border-orange-200 dark:bg-orange-900/20 dark:text-orange-400 dark:border-orange-800',
    },
    schedule: {
      label: '瀹氭椂',
      className: 'bg-purple-50 text-purple-600 border-purple-200 dark:bg-purple-900/20 dark:text-purple-400 dark:border-purple-800',
    },
    ci_triggered: {
      label: 'CI',
      className: 'bg-green-50 text-green-600 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800',
    },
  };
  const config = configs[type] || { label: type, className: 'bg-slate-50 text-slate-500 border-slate-200' };

  return (
    <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[9px] font-medium ${config.className}`}>
      {config.label}
    </span>
  );
}

function StatusBadge({ status, reason }: { status: string; reason?: string | null }) {
  const configs: Record<
    string,
    {
      label: string;
      variant: 'success' | 'destructive' | 'secondary' | 'outline' | 'warning';
      icon: typeof AlertCircle;
    }
  > = {
    success: { label: '鎴愬姛', variant: 'success', icon: CheckCircle2 },
    failed: { label: '澶辫触', variant: 'destructive', icon: XCircle },
    running: { label: '杩愯涓?', variant: 'secondary', icon: Loader2 },
    pending: { label: '绛夊緟涓?', variant: 'outline', icon: Clock },
    aborted: { label: '宸蹭腑姝?', variant: 'warning', icon: AlertCircle },
    cancelled: { label: '宸插彇娑?', variant: 'warning', icon: AlertCircle },
  };

  const config = configs[status] || { label: status, variant: 'outline', icon: AlertCircle };
  const Icon = config.icon;
  const title = status === 'aborted' && reason ? `涓鍘熷洜: ${reason}` : undefined;

  return (
    <Badge variant={config.variant} className="gap-1.5 px-2 py-0.5 font-medium" title={title}>
      <Icon className={cn('h-3 w-3', status === 'running' && 'animate-spin')} />
      {config.label}
    </Badge>
  );
}
