import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import {
  BrainCircuit, Search, ChevronDown, ChevronUp,
  Filter, RefreshCw, ArrowLeft, ChevronLeft, ChevronRight,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { listAllWorkspaceDocuments } from '@/lib/aiCaseStorage';
import { computeProgress } from '@/lib/aiCaseMindMap';
import type { AiCaseWorkspaceDocument } from '@/types/aiCases';
import { AiCaseHistoryCard } from './components/AiCaseHistoryCard';

// ── Types ─────────────────────────────────────────────────────────

type SortKey = 'updatedAt' | 'createdAt' | 'total' | 'completionRate';
type FilterMode = 'all' | 'synced' | 'local-only';
const PAGE_SIZE = 10;

// ── Summary Stats ─────────────────────────────────────────────────

function SummaryStats({ docs }: { docs: AiCaseWorkspaceDocument[] }) {
  const s = useMemo(() => {
    let totalCases = 0, passedCases = 0, syncedDocs = 0;
    for (const d of docs) {
      const p = computeProgress(d.mapData);
      totalCases += p.total;
      passedCases += p.passed;
      if (d.syncMode === 'hybrid' && d.remoteWorkspaceId) syncedDocs++;
    }
    return {
      totalCases,
      passRate: totalCases === 0 ? 0 : Math.round((passedCases / totalCases) * 100),
      syncedDocs,
    };
  }, [docs]);

  const cards = [
    {
      label: '生成记录', value: docs.length, unit: '条',
      c: 'text-violet-600 dark:text-violet-400', bg: 'bg-violet-50 dark:bg-violet-900/20',
    },
    {
      label: '累计用例', value: s.totalCases, unit: '条',
      c: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-900/20',
    },
    {
      label: '整体通过率', value: s.passRate, unit: '%',
      c: 'text-green-600 dark:text-green-400', bg: 'bg-green-50 dark:bg-green-900/20',
    },
    {
      label: '已同步服务端', value: s.syncedDocs, unit: '条',
      c: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-900/20',
    },
  ];

  return (
    <div className="grid grid-cols-4 gap-3">
      {cards.map((card) => (
        <div key={card.label} className={`${card.bg} rounded-xl p-4 flex flex-col gap-1`}>
          <span className="text-xs text-slate-500 dark:text-slate-400">{card.label}</span>
          <span className={`text-2xl font-bold ${card.c}`}>
            {card.value}
            <span className="text-sm font-normal ml-0.5">{card.unit}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────

export default function AICaseHistory() {
  const [, setLocation] = useLocation();
  const [docs, setDocs] = useState<AiCaseWorkspaceDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastOpenedDocId] = useState(() =>
    window.localStorage.getItem('ai-case-last-opened-doc-id') ?? undefined
  );
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('updatedAt');
  const [sortDesc, setSortDesc] = useState(true);
  const [filter, setFilter] = useState<FilterMode>('all');
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [page, setPage] = useState(1);
  const filterRef = useRef<HTMLDivElement>(null);

  // Close filter menu on outside click
  useEffect(() => {
    if (!showFilterMenu) return;
    const h = (e: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(e.target as Node))
        setShowFilterMenu(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [showFilterMenu]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setDocs(await listAllWorkspaceDocuments());
    } catch {
      toast.error('加载记录失败，请刷新重试');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleOpen = useCallback(
    (id: string) => setLocation(`/cases/ai?docId=${encodeURIComponent(id)}`),
    [setLocation]
  );

  const handleDeleted = useCallback(
    (id: string) => setDocs((prev) => prev.filter((d) => d.id !== id)),
    []
  );

  // 预计算所有 doc 的 progress，避免排序时重复调用 computeProgress
  const progressCache = useMemo(
    () => new Map(docs.map((d) => [d.id, computeProgress(d.mapData)])),
    [docs]
  );

  const displayed = useMemo(() => {
    let r = [...docs];
    if (search.trim()) {
      const kw = search.trim().toLowerCase();
      r = r.filter((d) =>
        d.name.toLowerCase().includes(kw) || d.requirement.toLowerCase().includes(kw)
      );
    }
    if (filter === 'synced') r = r.filter((d) => d.syncMode === 'hybrid' && d.remoteWorkspaceId);
    if (filter === 'local-only') r = r.filter((d) => !d.remoteWorkspaceId);

    r.sort((a, b) => {
      let va: number, vb: number;
      if (sortKey === 'updatedAt') { va = a.updatedAt; vb = b.updatedAt; }
      else if (sortKey === 'createdAt') { va = a.createdAt; vb = b.createdAt; }
      else if (sortKey === 'total') {
        va = progressCache.get(a.id)?.total ?? 0;
        vb = progressCache.get(b.id)?.total ?? 0;
      } else {
        va = progressCache.get(a.id)?.completionRate ?? 0;
        vb = progressCache.get(b.id)?.completionRate ?? 0;
      }
      return sortDesc ? vb - va : va - vb;
    });
    return r;
  }, [docs, progressCache, search, filter, sortKey, sortDesc]);

  useEffect(() => {
    setPage(1);
  }, [search, filter, sortKey, sortDesc]);

  const totalPages = Math.max(1, Math.ceil(displayed.length / PAGE_SIZE));
  const pagedDocs = useMemo(() => {
    const safePage = Math.min(page, totalPages);
    const start = (safePage - 1) * PAGE_SIZE;
    return displayed.slice(start, start + PAGE_SIZE);
  }, [displayed, page, totalPages]);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  const toggleSort = useCallback((k: SortKey) => {
    if (sortKey === k) setSortDesc((v) => !v);
    else { setSortKey(k); setSortDesc(true); }
  }, [sortKey]);

  const SORT_OPTS: Array<{ key: SortKey; label: string }> = [
    { key: 'updatedAt', label: '最近更新' },
    { key: 'createdAt', label: '创建时间' },
    { key: 'total', label: '用例数' },
    { key: 'completionRate', label: '通过率' },
  ];
  const FILTER_LABELS: Record<FilterMode, string> = {
    all: '全部',
    synced: '已同步',
    'local-only': '仅本地',
  };

  return (
    <div className="h-full flex flex-col bg-slate-50 dark:bg-slate-950 overflow-hidden">
      {/* ── Page Header ── */}
      <div className="flex-shrink-0 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-6 py-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-blue-500 flex items-center justify-center shadow-sm shadow-violet-500/25">
              <BrainCircuit className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900 dark:text-white">全部记录</h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">搜索、筛选并分页管理所有 AI 工作台历史记录</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs gap-1.5"
              onClick={() => setLocation('/cases/ai-create')}
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              返回首页
            </Button>
            <Button
              size="sm" variant="outline" className="h-8 text-xs gap-1.5"
              onClick={load} disabled={loading}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              刷新
            </Button>
            <Button
              size="sm" className="h-8 text-xs gap-1.5"
              onClick={() => setLocation('/cases/ai-create')}
            >
              <BrainCircuit className="h-3.5 w-3.5" />
              新建生成
            </Button>
          </div>
        </div>
      </div>

      {/* ── Scrollable Content ── */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-6 py-6 space-y-5">

          {/* Summary stats */}
          {!loading && docs.length > 0 && <SummaryStats docs={docs} />}

          {/* Toolbar */}
          <div className="flex items-center gap-3 flex-wrap">
            {/* Search */}
            <div className="relative flex-1 min-w-48">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
              <Input
                className="pl-9 h-9 text-sm bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700"
                placeholder="搜索名称或需求内容…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            {/* Sort tabs */}
            <div className="flex items-center gap-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-1 py-1">
              {SORT_OPTS.map((o) => (
                <button
                  key={o.key}
                  type="button"
                  onClick={() => toggleSort(o.key)}
                  className={[
                    'px-2.5 py-1 rounded-md text-xs font-medium transition-all flex items-center gap-1',
                    sortKey === o.key
                      ? 'bg-primary text-white shadow-sm'
                      : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200',
                  ].join(' ')}
                >
                  {o.label}
                  {sortKey === o.key && (
                    sortDesc
                      ? <ChevronDown className="h-3 w-3" />
                      : <ChevronUp className="h-3 w-3" />
                  )}
                </button>
              ))}
            </div>

            {/* Filter */}
            <div className="relative" ref={filterRef}>
              <button
                type="button"
                onClick={() => setShowFilterMenu((v) => !v)}
                className={[
                  'flex items-center gap-1.5 px-3 h-9 rounded-lg text-xs font-medium border transition-all',
                  filter !== 'all'
                    ? 'border-primary bg-primary/5 text-primary dark:bg-primary/10'
                    : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-500 hover:text-slate-800 dark:text-slate-400',
                ].join(' ')}
              >
                <Filter className="h-3.5 w-3.5" />
                {FILTER_LABELS[filter]}
                <ChevronDown className={`h-3 w-3 transition-transform ${showFilterMenu ? 'rotate-180' : ''}`} />
              </button>
              {showFilterMenu && (
                <div className="absolute right-0 top-full mt-1.5 z-10 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg py-1 min-w-32 animate-in fade-in-0 slide-in-from-top-2 duration-150">
                  {(['all', 'synced', 'local-only'] as FilterMode[]).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => { setFilter(m); setShowFilterMenu(false); }}
                      className={[
                        'w-full text-left px-3 py-2 text-xs transition-colors',
                        filter === m
                          ? 'text-primary font-medium bg-primary/5'
                          : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800',
                      ].join(' ')}
                    >
                      {FILTER_LABELS[m]}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Result count hint */}
          {!loading && (
            <p className="text-xs text-slate-400">
              共 {displayed.length} 条记录，当前第 {page}/{totalPages} 页
              {(search || filter !== 'all') && docs.length !== displayed.length
                ? `（已过滤，全部共 ${docs.length} 条）`
                : null}
            </p>
          )}

          {/* Loading skeleton */}
          {loading && (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700/80 p-4 space-y-3 animate-pulse"
                >
                  <div className="flex gap-3">
                    <div className="w-9 h-9 rounded-lg bg-slate-100 dark:bg-slate-800 flex-shrink-0" />
                    <div className="flex-1 space-y-2">
                      <div className="h-4 bg-slate-100 dark:bg-slate-800 rounded w-1/3" />
                      <div className="h-3 bg-slate-100 dark:bg-slate-800 rounded w-1/4" />
                    </div>
                  </div>
                  <div className="h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full" />
                </div>
              ))}
            </div>
          )}

          {/* Empty state */}
          {!loading && docs.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="w-16 h-16 rounded-2xl bg-violet-50 dark:bg-violet-900/20 flex items-center justify-center mb-4">
                <BrainCircuit className="h-8 w-8 text-violet-400" />
              </div>
              <h3 className="text-base font-semibold text-slate-700 dark:text-slate-300 mb-1">
                还没有生成记录
              </h3>
              <p className="text-sm text-slate-400 dark:text-slate-500 mb-6 max-w-xs">
                去「AI 生成用例」页面，输入需求描述来生成你的第一批测试用例
              </p>
              <Button className="gap-1.5" onClick={() => setLocation('/cases/ai-create')}>
                <BrainCircuit className="h-4 w-4" />开始生成
              </Button>
            </div>
          )}

          {/* No search results */}
          {!loading && docs.length > 0 && displayed.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Search className="h-8 w-8 text-slate-300 dark:text-slate-600 mb-3" />
              <p className="text-sm text-slate-500 dark:text-slate-400">没有匹配的记录</p>
              <Button
                size="sm" variant="ghost" className="mt-3 text-xs"
                onClick={() => { setSearch(''); setFilter('all'); }}
              >
                清除筛选条件
              </Button>
            </div>
          )}

          {/* Record list */}
          {!loading && pagedDocs.length > 0 && (
            <div className="space-y-3">
              {pagedDocs.map((doc) => (
<AiCaseHistoryCard
key={doc.id}
doc={doc}
onOpen={handleOpen}
onDeleted={handleDeleted}
currentDocId={lastOpenedDocId}
/>
              ))}
            </div>
          )}

          {!loading && displayed.length > PAGE_SIZE && (
            <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900">
              <div className="text-xs text-slate-500 dark:text-slate-400">
                每页 {PAGE_SIZE} 条
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 px-2"
                  disabled={page <= 1}
                  onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <div className="min-w-[88px] text-center text-xs font-medium text-slate-600 dark:text-slate-300">
                  第 {page} / {totalPages} 页
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 px-2"
                  disabled={page >= totalPages}
                  onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
