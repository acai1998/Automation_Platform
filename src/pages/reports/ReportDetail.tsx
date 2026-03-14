import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useRoute } from "wouter";
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Copy,
  Download,
  ExternalLink,
  FileText,
  Image as ImageIcon,
  Loader2,
  MinusCircle,
  RefreshCw,
  Search,
  TrendingUp,
  MoreHorizontal,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useTestRunDetail, useTestRunResults, TestRunResultStatus } from "@/hooks/useExecutions";
import type { TestRunResult, TestRunRecord } from "@/hooks/useExecutions";

type SortBy = "failed_first" | "default" | "duration_desc";

// ─── 常量定义 ─────────────────────────────────────────────────────────────────
const PAGE_SIZE = 10;
const SEARCH_DEBOUNCE_MS = 300;

const RUN_STATUS_STYLE: Record<TestRunRecord['status'], string> = {
  success: "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20",
  failed: "bg-rose-500/10 text-rose-500 border border-rose-500/20",
  running: "bg-blue-500/10 text-blue-500 border border-blue-500/20",
  pending: "bg-slate-500/10 text-slate-500 border border-slate-500/20",
  aborted: "bg-amber-500/10 text-amber-500 border border-amber-500/20",
};

const RUN_STATUS_LABEL: Record<TestRunRecord['status'], string> = {
  success: "Completed",
  failed:  "Completed",
  running: "Running",
  pending: "Pending",
  aborted: "Aborted",
};

const TRIGGER_MAP: Record<TestRunRecord['trigger_type'], string> = {
  manual:       "手动触发",
  jenkins:      "Jenkins 触发",
  schedule:     "定时触发",
  ci_triggered: "CI 触发",
};

const STATUS_LABEL_MAP: Record<TestRunResult['status'], string> = {
  passed: 'PASSED',
  failed: 'FAILED',
  skipped: 'SKIPPED',
  error: 'ERROR',
  pending: 'PENDING',
};

// ─── 工具函数 ─────────────────────────────────────────────────────────────────

/**
 * 构建分页器的页码数组，超过 7 页时使用省略号
 * @param current 当前页码（1-based）
 * @param total 总页数
 * @returns 页码数组，例如 [1, "...", 5, 6, 7, "...", 10]
 */
function buildPageNumbers(current: number, total: number): (number | "...")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages: (number | "...")[] = [1];
  const start = Math.max(2, current - 1);
  const end   = Math.min(total - 1, current + 1);
  if (start > 2) pages.push("...");
  for (let i = start; i <= end; i++) pages.push(i);
  if (end < total - 1) pages.push("...");
  pages.push(total);
  return pages;
}

/**
 * 判断测试用例状态是否为失败
 */
function isFailedStatus(status: string): boolean {
  return status === "failed" || status === "error";
}

/**
 * 获取测试用例状态的显示标签
 */
function getStatusLabel(status: TestRunResult['status']): string {
  return STATUS_LABEL_MAP[status] ?? 'UNKNOWN';
}

function formatTime(value?: string | null, full = false): string {
  if (!value) return "-";
  const d = new Date(value);
  if (isNaN(d.getTime())) return "-";
  return full
    ? d.toLocaleString("zh-CN", { hour12: false })
    : d.toLocaleTimeString("zh-CN", { hour12: false });
}

function formatDuration(ms?: number | null) {
  if (ms == null) return "-";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

// ─── 按分组视图组件 ───────────────────────────────────────────────────────────

function GroupView({ results, loading }: { results: TestRunResult[]; loading: boolean }) {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  // 按模块分组
  const groups = useMemo(() => {
    const map = new Map<string, TestRunResult[]>();
    for (const item of results) {
      const key = item.module && item.module !== "-" ? item.module : "未分组";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(item);
    }
    // 有失败的组排前面
    return Array.from(map.entries()).sort(([, a], [, b]) => {
      const aFail = a.some(r => isFailedStatus(r.status)) ? 0 : 1;
      const bFail = b.some(r => isFailedStatus(r.status)) ? 0 : 1;
      return aFail - bFail;
    });
  }, [results]);

  const toggleGroup = (key: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (groups.length === 0) {
    return (
      <div className="py-12 text-center text-slate-400 text-sm">
        暂无匹配的用例结果
      </div>
    );
  }

  return (
    <div className="divide-y divide-slate-200 dark:divide-slate-800">
      {groups.map(([groupName, items]) => {
        const hasFail = items.some(r => isFailedStatus(r.status));
        const passCount = items.filter(r => r.status === "passed").length;
        const failCount = items.filter(r => isFailedStatus(r.status)).length;
        const skipCount = items.filter(r => r.status === "skipped").length;
        const expanded = expandedGroups.has(groupName);

        return (
          <div key={groupName}>
            <button
              onClick={() => toggleGroup(groupName)}
              className={cn(
                "w-full flex items-center justify-between px-6 py-4 text-left transition-colors",
                hasFail
                  ? "bg-rose-500/[0.03] hover:bg-rose-500/[0.06]"
                  : "hover:bg-slate-50 dark:hover:bg-slate-800/50",
              )}
            >
              <div className="flex items-center gap-3">
                {expanded ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
                <span className={cn("text-sm font-bold", hasFail ? "text-rose-600 dark:text-rose-400" : "text-slate-800 dark:text-slate-200")}>
                  {groupName}
                </span>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  共 {items.length} 个用例
                </span>
              </div>
              <div className="flex items-center gap-3 text-xs font-bold">
                {passCount > 0 && (
                  <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="h-3.5 w-3.5" /> {passCount} 通过
                  </span>
                )}
                {failCount > 0 && (
                  <span className="flex items-center gap-1 text-rose-600 dark:text-rose-400">
                    <XCircle className="h-3.5 w-3.5" /> {failCount} 失败
                  </span>
                )}
                {skipCount > 0 && (
                  <span className="flex items-center gap-1 text-slate-400">
                    <MinusCircle className="h-3.5 w-3.5" /> {skipCount} 跳过
                  </span>
                )}
              </div>
            </button>

            {expanded && (
              <div className="bg-slate-50/50 dark:bg-slate-900/30 border-t border-slate-100 dark:border-slate-800/50">
                <table className="w-full text-left text-sm">
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
                    {items.map(item => {
                      const failed = isFailedStatus(item.status);
                      const statusText = getStatusLabel(item.status);
                      return (
                        <tr key={item.id} className={cn("px-6", failed ? "bg-rose-500/[0.02]" : "")}>
                          <td className="pl-14 pr-6 py-3">
                            <span className={cn("font-medium", failed ? "font-semibold text-slate-900 dark:text-slate-100" : "text-slate-700 dark:text-slate-300")}>
                              {item.case_name}
                            </span>
                          </td>
                          <td className="px-6 py-3 w-28">
                            <div className={cn(
                              "flex items-center gap-1.5 text-xs font-bold uppercase",
                              item.status === "passed" ? "text-emerald-600 dark:text-emerald-400"
                              : failed ? "text-rose-600 dark:text-rose-400"
                              : "text-slate-400",
                            )}>
                              {item.status === "passed" ? <CheckCircle2 className="h-3.5 w-3.5" /> : failed ? <XCircle className="h-3.5 w-3.5" /> : <MinusCircle className="h-3.5 w-3.5" />}
                              {statusText}
                            </div>
                          </td>
                          <td className="px-6 py-3 w-24 font-mono text-slate-500 text-xs">
                            {formatDuration(item.duration)}
                          </td>
                          <td className="px-6 py-3 w-32 font-mono text-slate-500 text-xs">
                            {formatTime(item.start_time)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── 主组件 ────────────────────────────────────────────────────────────────────

export default function ReportDetail() {
  const [, params] = useRoute("/reports/:id");
  const [, navigate] = useLocation();
  const rawId = params?.id ? Number(params.id) : 0;
  const runId = isNaN(rawId) || rawId <= 0 ? 0 : rawId;

  // ✅ 所有 Hook 必须在任何条件 return 之前调用，保证 Hook 调用顺序稳定
  const { data: run, isLoading: runLoading, error, refetch } = useTestRunDetail(runId);

  const [activeTab, setActiveTab] = useState<"cases" | "groups">("cases");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<TestRunResultStatus>("all");
  const [sortBy, setSortBy] = useState<SortBy>("failed_first");
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  const [page, setPage] = useState(1);

  // ✅ P1 优化：搜索防抖逻辑优化
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [search]);

  // ✅ P1 优化：筛选条件变化时重置页码
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, statusFilter]);

  const apiStatus = statusFilter !== "all" ? statusFilter : undefined;

  const { data: resultData, isLoading: resultLoading } = useTestRunResults(runId, {
    page,
    pageSize: PAGE_SIZE,
    status: apiStatus,
    keyword: debouncedSearch || undefined,
  });

  const results = resultData?.data ?? [];
  const total = resultData?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);

  // ✅ P2 优化：排序逻辑使用 useMemo 缓存
  const pagedResults = useMemo(() => {
    const copy = [...results];
    if (sortBy === "failed_first") {
      copy.sort((a, b) => {
        const af = isFailedStatus(a.status) ? 0 : 1;
        const bf = isFailedStatus(b.status) ? 0 : 1;
        return af - bf;
      });
    } else if (sortBy === "duration_desc") {
      copy.sort((a, b) => (b.duration ?? 0) - (a.duration ?? 0));
    }
    return copy;
  }, [results, sortBy]);

  // ✅ P0 修复：页码变化时清空展开状态，防止内存泄漏
  useEffect(() => {
    setExpandedRows(new Set());
  }, [page]);

  const toggleRow = useCallback((id: number) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const applyFilter = useCallback((next: () => void) => {
    next();
    setPage(1);
  }, []);

  // ✅ P2 优化：派生状态使用 useMemo
  const onlyFailures = useMemo(() => statusFilter === "failed", [statusFilter]);

  // ✅ P2 优化：成功率计算使用 useMemo（run 为 null 时返回 0）
  const successRate = useMemo(
    () => run && run.total_cases > 0
      ? Math.round((run.passed_cases / run.total_cases) * 100)
      : 0,
    [run],
  );

  // ─── 所有 Hook 调用结束，以下开始条件渲染 ────────────────────────────────────

  // 无效 ID 提前返回
  if (runId === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4">
        <AlertCircle className="h-10 w-10 text-rose-500" />
        <p className="text-sm text-slate-500">无效的执行 ID</p>
        <button
          onClick={() => navigate("/reports")}
          className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-semibold hover:brightness-110 transition-all"
        >
          返回运行记录
        </button>
      </div>
    );
  }

  // 错误处理
  if (error) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4">
        <AlertCircle className="h-10 w-10 text-rose-500" />
        <p className="text-sm text-slate-500">加载失败：{error instanceof Error ? error.message : '未知错误'}</p>
        <div className="flex gap-3">
          <button
            onClick={() => refetch()}
            className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-semibold hover:brightness-110 transition-all flex items-center gap-2"
          >
            <RefreshCw className="h-4 w-4" />
            重试
          </button>
          <button
            onClick={() => navigate("/reports")}
            className="px-4 py-2 rounded-lg bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-white text-sm font-semibold hover:bg-slate-300 dark:hover:bg-slate-700 transition-colors"
          >
            返回运行记录
          </button>
        </div>
      </div>
    );
  }

  if (runLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!run) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4">
        <AlertCircle className="h-10 w-10 text-rose-500" />
        <p className="text-sm text-slate-500">未找到运行记录</p>
        <button
          onClick={() => navigate("/reports")}
          className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-semibold hover:brightness-110 transition-all"
        >
          返回运行记录
        </button>
      </div>
    );
  }

  const hasFailures = run.failed_cases > 0;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      <main className="max-w-[1440px] mx-auto px-6 py-8">
        <div className="mb-8">
          <nav className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 mb-4">
<button className="hover:text-primary" onClick={() => navigate("/reports")}>
运行记录
</button>
            <ChevronDown className="h-3 w-3 -rotate-90" />
            <span className="text-slate-900 dark:text-slate-200 font-medium">
              运行详情
            </span>
          </nav>

          <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-6">
            <div className="space-y-2">
              <div className="flex items-center gap-3 flex-wrap">
                <button
                  onClick={() => navigate("/reports")}
                  className="p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg -ml-2"
                >
                  <ArrowLeft className="h-5 w-5" />
                </button>

                <h1 className="text-3xl font-black tracking-tight text-slate-900 dark:text-white">
                  <span className="font-mono">#{run.id}</span>
                </h1>

                <span
                  className={cn(
                    "inline-flex items-center px-3 py-1 rounded-full text-xs font-bold",
                    RUN_STATUS_STYLE[run.status] ?? RUN_STATUS_STYLE.pending,
                  )}
                >
                  执行状态: {RUN_STATUS_LABEL[run.status] ?? run.status}
                </span>

                <span
                  className={cn(
                    "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border",
                    hasFailures
                      ? "bg-rose-500/10 text-rose-500 border-rose-500/20"
                      : "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
                  )}
                >
                  {hasFailures ? <AlertTriangle className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3" />}
                  质量结果: {hasFailures ? "Has Failed" : "All Passed"}
                </span>
              </div>

              <p className="text-slate-500 dark:text-slate-400 text-sm pl-9">
                触发方式: <span className="text-slate-700 dark:text-slate-200 font-medium">{TRIGGER_MAP[run.trigger_type] ?? run.trigger_type}</span>
                {" | "}
                执行人: <span className="text-slate-700 dark:text-slate-200 font-medium">{run.trigger_by_name || "-"}</span>
                {" | "}
                触发时间: <span className="text-slate-700 dark:text-slate-200 font-medium font-mono">{formatTime(run.start_time ?? run.created_at, true)}</span>
              </p>
            </div>

            <div className="flex gap-3">
              <button onClick={() => toast.info("导出功能开发中，敬请期待")} className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-white text-sm font-bold border border-slate-300 dark:border-slate-700 hover:bg-slate-300 dark:hover:bg-slate-700 transition-colors">
                <Download className="h-4 w-4" />
                Export Report
              </button>

              {run.jenkins_url && (
                <a
                  href={run.jenkins_url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-white text-sm font-bold hover:brightness-110 transition-all shadow-lg shadow-primary/20"
                >
                  <ExternalLink className="h-4 w-4" />
                  View on Jenkins
                </a>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden">
            <div className="absolute top-0 right-0 w-16 h-16 bg-primary/5 -mr-8 -mt-8 rounded-full" />
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">总用例</p>
            <div className="flex items-baseline gap-3">
              <h3 className="text-4xl font-black font-mono text-slate-900 dark:text-white">{run.total_cases}</h3>
              <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-500 text-xs font-bold">成功率 {successRate}%</span>
            </div>
          </div>

          <div
            className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm hover:border-emerald-500/50 cursor-pointer transition-all"
            onClick={() => applyFilter(() => setStatusFilter("passed"))}
          >
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">通过</p>
            <div className="flex items-center gap-3">
              <h3 className="text-4xl font-black font-mono text-emerald-500">{run.passed_cases}</h3>
              <TrendingUp className="h-6 w-6 text-emerald-500/30" />
            </div>
          </div>

          <div
            className={cn(
              "p-5 rounded-xl shadow-sm cursor-pointer transition-all",
              hasFailures
                ? "bg-rose-500/5 dark:bg-rose-500/10 border-2 border-rose-500"
                : "bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800",
            )}
            onClick={() => applyFilter(() => setStatusFilter("failed"))}
          >
            <p className={cn("text-sm mb-1", hasFailures ? "font-bold text-rose-500 uppercase tracking-wider" : "text-slate-500 dark:text-slate-400")}>
              失败
            </p>
            <div className="flex items-center gap-3">
              <h3 className={cn("text-4xl font-black font-mono", hasFailures ? "text-rose-600 dark:text-rose-500" : "text-slate-400")}>{run.failed_cases}</h3>
              {hasFailures && <AlertCircle className="h-6 w-6 text-rose-500" />}
            </div>
          </div>

          <div
            className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm hover:border-slate-400 transition-all cursor-pointer"
            onClick={() => applyFilter(() => setStatusFilter("skipped"))}
          >
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">跳过</p>
            <div className="flex items-center gap-3">
              <h3 className="text-4xl font-black font-mono text-slate-400">{run.skipped_cases}</h3>
              <MinusCircle className="h-6 w-6 text-slate-300 dark:text-slate-700" />
            </div>
          </div>
        </div>

        {hasFailures && (
          <div className="bg-rose-600 text-white p-4 rounded-xl flex items-center justify-between mb-8 shadow-xl shadow-rose-900/20">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 flex-shrink-0" />
              <p className="font-medium">
                失败摘要 ({run.failed_cases} 个用例失败):
                <span className="opacity-90 ml-1">优先处理失败用例，查看错误信息与堆栈</span>
              </p>
            </div>
            <button
              className="bg-white/20 hover:bg-white/30 text-white px-4 py-1.5 rounded-lg text-sm font-bold transition-colors"
              onClick={() => applyFilter(() => setStatusFilter("failed"))}
            >
              查看详情
            </button>
          </div>
        )}

        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
          <div className="flex border-b border-slate-200 dark:border-slate-800 px-6">
            <button
              onClick={() => setActiveTab("cases")}
              className={cn(
                "px-6 py-4 text-sm font-bold transition-colors",
                activeTab === "cases"
                  ? "border-b-2 border-primary text-primary"
                  : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300",
              )}
            >
              按用例视图
            </button>
            <button
              onClick={() => setActiveTab("groups")}
              className={cn(
                "px-6 py-4 text-sm font-bold transition-colors",
                activeTab === "groups"
                  ? "border-b-2 border-primary text-primary"
                  : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300",
              )}
            >
              按分组视图
            </button>
          </div>

          {activeTab === "groups" && (
            <GroupView results={pagedResults} loading={resultLoading} />
          )}

          {activeTab === "cases" && <>
          <div className="p-4 bg-slate-50 dark:bg-slate-900/50 flex flex-wrap items-center gap-4 border-b border-slate-200 dark:border-slate-800">
            <div className="relative flex-1 min-w-[240px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 h-4 w-4" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="搜索用例名/模块..."
                className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg pl-10 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary h-10"
              />
            </div>

            <select
              value={statusFilter}
              onChange={(e) => applyFilter(() => setStatusFilter(e.target.value as TestRunResultStatus))}
              className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm h-10 px-3 min-w-[120px]"
            >
              <option value="all">All Status</option>
              <option value="passed">Passed</option>
              <option value="failed">Failed / Error</option>
              <option value="skipped">Skipped</option>
            </select>

            <div className="flex items-center gap-2 px-3 py-2 bg-rose-500/10 rounded-lg border border-rose-500/20">
              <input
                type="checkbox"
                checked={onlyFailures}
                onChange={(e) =>
                  applyFilter(() => setStatusFilter(e.target.checked ? "failed" : "all"))
                }
                className="rounded text-rose-500 focus:ring-rose-500 border-rose-500/50 bg-transparent"
              />
              <span className="text-xs font-bold text-rose-600 dark:text-rose-400 uppercase">仅看失败</span>
            </div>

            <div className="h-6 w-[1px] bg-slate-200 dark:bg-slate-700" />

            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500 font-medium">Sort by:</span>
              <select value={sortBy} onChange={(e) => setSortBy(e.target.value as SortBy)} className="bg-transparent border-none text-sm font-bold">
                <option value="failed_first">失败优先</option>
                <option value="default">Default</option>
                <option value="duration_desc">耗时降序</option>
              </select>
            </div>

            <div className="ml-auto text-sm text-slate-500 font-medium">共 {total} 条</div>
          </div>

          <div className="overflow-x-auto relative">
            {resultLoading && (
              <div className="absolute inset-0 bg-white/60 dark:bg-slate-900/60 flex items-center justify-center z-10">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            )}
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 text-xs font-bold uppercase tracking-wider">
                  <th className="px-6 py-4">用例名称 / 分组</th>
                  <th className="px-6 py-4">模块</th>
                  <th className="px-6 py-4">状态</th>
                  <th className="px-6 py-4">耗时</th>
                  <th className="px-6 py-4">开始时间</th>
                  <th className="px-6 py-4 text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {pagedResults.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-slate-400 text-sm">
                      暂无匹配的用例结果
                    </td>
                  </tr>
                )}

                {pagedResults.map((item) => {
                  const failed = isFailedStatus(item.status);
                  const expanded = expandedRows.has(item.id);
                  const statusText = getStatusLabel(item.status);

                  return (
                    <Fragment key={item.id}>
                      <tr className={failed ? "bg-rose-500/[0.02] dark:bg-rose-500/[0.05]" : "hover:bg-slate-50 dark:hover:bg-slate-800/50"}>
                        <td className="px-6 py-4">
                          <div className="flex flex-col">
                <span className={cn("text-sm text-slate-900 dark:text-slate-100", failed ? "font-semibold" : "font-medium")}>
                {item.case_name}
                            </span>
                            {item.module && item.module !== "-" && (
                              <span
                                className={cn(
                                  "text-[10px] self-start px-1.5 py-0.5 rounded mt-1 font-bold",
                                  failed ? "text-primary bg-primary/10" : "text-slate-500 bg-slate-100 dark:bg-slate-800",
                                )}
                              >
                                {item.module}
                              </span>
                            )}
                          </div>
                        </td>

                        <td className="px-6 py-4 text-sm font-medium">{item.module || "-"}</td>

                        <td className="px-6 py-4">
                          <div
                            className={cn(
                              "flex items-center gap-2 text-xs uppercase font-bold",
                              item.status === "passed"
                                ? "text-emerald-600 dark:text-emerald-500"
                                : failed
                                  ? "text-rose-600 dark:text-rose-500"
                                  : "text-slate-500 dark:text-slate-400",
                            )}
                          >
                            {item.status === "passed" ? <CheckCircle2 className="h-3.5 w-3.5" /> : failed ? <XCircle className="h-3.5 w-3.5" /> : <MinusCircle className="h-3.5 w-3.5" />}
                            {statusText}
                          </div>
                        </td>

                        <td className="px-6 py-4 text-sm font-mono">{formatDuration(item.duration)}</td>
                        <td className="px-6 py-4 text-sm font-mono text-slate-500">{formatTime(item.start_time)}</td>

                        <td className="px-6 py-4 text-right">
                          <button
                            aria-label={expanded ? "折叠详情" : "展开详情"}
                            onClick={() => toggleRow(item.id)}
                            className={cn(
                              "p-1.5 rounded transition-colors",
                              expanded ? "text-primary hover:bg-primary/10" : "text-slate-400 hover:text-primary",
                            )}
                          >
                            {expanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
                          </button>
                        </td>
                      </tr>
                      {expanded && (
                        <tr className="bg-slate-50 dark:bg-slate-950/50">
                          <td className="p-6" colSpan={6}>
                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                              <div className="lg:col-span-2 space-y-4">
                                                                {failed ? (
                                  <>
                                    {item.error_message ? (
                                      <div className="bg-rose-500/10 border border-rose-500/20 rounded-lg p-4">
                                        <p className="text-rose-600 dark:text-rose-400 text-sm font-bold mb-2">Error Message:</p>
                                        <p className="text-sm font-mono text-rose-700 dark:text-rose-300 break-all">{item.error_message}</p>
                                      </div>
                                    ) : (
                                      <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-4">
                                        <div className="flex items-start gap-2">
                                          <AlertTriangle className="h-4 w-4 text-amber-500 flex-shrink-0 mt-0.5" />
                                          <div>
                                            <p className="text-sm font-bold text-amber-700 dark:text-amber-400 mb-1">未收到错误详情</p>
                                            <p className="text-xs text-amber-600 dark:text-amber-500">
                                              Jenkins 执行器未上报错误信息，可能是用例启动失败或执行环境异常。
                                              {run.jenkins_url && (
                                                <>
                                                  {" 请"}
                                                  <a
                                                    href={run.jenkins_url}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="font-bold underline hover:text-amber-800 dark:hover:text-amber-300 inline-flex items-center gap-0.5"
                                                  >
                                                    前往 Jenkins 查看日志
                                                    <ExternalLink className="h-3 w-3" />
                                                  </a>
                                                  {"。"}
                                                </>
                                              )}
                                            </p>
                                          </div>
                                        </div>
                                      </div>
                                    )}

                                    {item.error_stack && (
                                      <div className="bg-slate-900 rounded-lg p-4 border border-slate-800">
                                        <div className="flex items-center justify-between mb-2">
                                          <span className="text-xs text-slate-500 font-mono uppercase tracking-widest">Stack Trace</span>
                                          <button aria-label="复制堆栈信息" className="text-slate-400 hover:text-white transition-colors" onClick={async () => { try { await navigator.clipboard.writeText(item.error_stack ?? ''); toast.success('堆栈信息已复制到剪贴板'); } catch { toast.error('复制失败，请手动选中并复制'); } }}>
                                            <Copy className="h-4 w-4" />
                                          </button>
                                        </div>
                                        <pre className="font-mono text-[12px] text-slate-300 leading-relaxed overflow-x-auto max-h-64">{item.error_stack}</pre>
                                      </div>
                                    )}
                                  </>
                                ) : (
                                  <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-lg p-4 flex items-center gap-3">
                                    <CheckCircle2 className="h-5 w-5 text-emerald-500 flex-shrink-0" />
                                    <p className="text-sm text-emerald-700 dark:text-emerald-400 font-medium">用例执行通过，无错误信息</p>
                                  </div>
                                )}
                              </div>

                              <div className="space-y-4">
                                {(item.assertions_total ?? 0) > 0 && (
                                  <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4">
                                    <p className="text-xs font-bold text-slate-500 uppercase mb-2">Assertion Stats</p>
                                    <p className="text-sm text-slate-600 dark:text-slate-300">
                                      Total: <span className="font-mono">{item.assertions_total}</span>
                                      {" | "}Passed: <span className="font-mono text-emerald-500">{item.assertions_passed ?? 0}</span>
                                      {" | "}Failed: <span className="font-mono text-rose-500">{(item.assertions_total ?? 0) - (item.assertions_passed ?? 0)}</span>
                                    </p>
                                  </div>
                                )}

                                {item.response_data && (
                                  <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4">
                                    <p className="text-xs font-bold text-slate-500 uppercase mb-2">Response Data</p>
                                    <pre className="font-mono text-[11px] text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/50 p-2 rounded overflow-x-auto">{item.response_data}</pre>
                                  </div>
                                )}
                              </div>
                            </div>

                            <div className="mt-6 flex gap-3 border-t border-slate-200 dark:border-slate-800 pt-6">
                              {item.log_path && (
                                <a href={item.log_path} target="_blank" rel="noreferrer" className="px-4 py-2 bg-slate-900 text-white rounded-lg text-xs font-bold flex items-center gap-2 hover:bg-slate-700 transition-colors">
                                  <FileText className="h-3.5 w-3.5" /> View Logs
                                </a>
                              )}
                              {item.screenshot_path && (
                                <a href={item.screenshot_path} target="_blank" rel="noreferrer" className="px-4 py-2 bg-slate-900 text-white rounded-lg text-xs font-bold flex items-center gap-2 hover:bg-slate-700 transition-colors">
                                  <ImageIcon className="h-3.5 w-3.5" /> Screenshot
                                </a>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          {total > PAGE_SIZE && (
            <div className="px-6 py-4 flex items-center justify-between border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50">
              <span className="text-sm text-slate-500 font-medium">
                第 {(currentPage - 1) * PAGE_SIZE + 1}-{Math.min(currentPage * PAGE_SIZE, total)} 条，共 {total} 条
              </span>

              <div className="flex gap-2">
                <button
                  disabled={currentPage === 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="p-2 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors disabled:opacity-30"
                >
                  <ChevronDown className="h-4 w-4 rotate-90" />
                </button>

                {buildPageNumbers(currentPage, totalPages).map((p, idx) =>
                  p === "..." ? (
                    <span key={"ellipsis-"+idx} className="px-2 py-1.5 flex items-center text-slate-400">
                      <MoreHorizontal className="h-4 w-4" />
                    </span>
                  ) : (
                    <button
                      key={p}
                      onClick={() => setPage(p)}
                      className={cn(
                        "min-w-[36px] px-2.5 py-1.5 text-sm font-bold rounded-lg transition-colors",
                        p === currentPage
                          ? "bg-primary text-white"
                          : "hover:bg-slate-200 dark:hover:bg-slate-800",
                      )}
                    >
                      {p}
                    </button>
                  ),
                )}

                <button
                  disabled={currentPage === totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  aria-label="下一页"
                  className="p-2 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors disabled:opacity-30"
                >
                  <ChevronDown className="h-4 w-4 -rotate-90" />
                </button>
              </div>
            </div>
          )}
          </>}
        </div>
      </main>
    </div>
  );
}
