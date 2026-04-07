import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useLocation } from 'wouter';
import {
  BrainCircuit, Bot, Loader2, Plus, Search,
  ChevronDown, ChevronUp, Filter, RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { toast } from 'sonner';
import { saveWorkspaceDocument, listAllWorkspaceDocuments } from '@/lib/aiCaseStorage';
import { createInitialMindData, normalizeMindData, computeProgress } from '@/lib/aiCaseMindMap';
import { type AiCaseWorkspaceDocument } from '@/types/aiCases';
import { AiCaseHistoryCard } from './components/AiCaseHistoryCard';

// ── Types ─────────────────────────────────────────────────────────

type SortKey = 'updatedAt' | 'createdAt' | 'total' | 'completionRate';
type FilterMode = 'all' | 'synced' | 'local-only';

/** 生成工作台文档的唯一 ID */
function generateWorkspaceId(): string {
  return `ai-ws-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// 常量定义在模块级别，避免每次渲染重建
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
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
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

// ── New Requirement Sheet ─────────────────────────────────────────

interface NewRequirementSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}

function NewRequirementSheet({ open, onOpenChange, onCreated }: NewRequirementSheetProps) {
  const [, setLocation] = useLocation();
  const [workspaceName, setWorkspaceName] = useState('');
  const [requirementText, setRequirementText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleGenerate = async () => {
    if (!requirementText.trim()) {
      toast.error('请先输入需求描述');
      return;
    }

    setIsSubmitting(true);
    try {
      const name = workspaceName.trim() || 'AI Testcase Workspace';
      const initialData = normalizeMindData(createInitialMindData(name), {
        showNodeKindTags: true,
      });

      const now = Date.now();
      const docId = generateWorkspaceId();
      const newDoc: AiCaseWorkspaceDocument = {
        id: docId,
        name,
        requirement: requirementText,
        mapData: initialData,
        version: 1,
        createdAt: now,
        updatedAt: now,
        lastSelectedNodeId: initialData.nodeData.id,
        syncMode: 'local',
        remoteWorkspaceId: null,
        remoteVersion: null,
        remoteStatus: null,
        lastRemoteSyncedAt: null,
      };

      await saveWorkspaceDocument(newDoc);
      onCreated();
      onOpenChange(false);
      setWorkspaceName('');
      setRequirementText('');
      setLocation(`/cases/ai?docId=${encodeURIComponent(docId)}&autoGenerate=true`);
    } catch (error) {
      console.error('[AICaseCreate] failed to create workspace', error);
      toast.error('创建工作台失败，请重试');
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!isSubmitting) {
      onOpenChange(false);
      // 取消时重置表单内容，下次打开时是干净的新建表单
      setWorkspaceName('');
      setRequirementText('');
    }
  };

  return (
    <Sheet open={open} onOpenChange={handleClose}>
      <SheetContent className="w-full sm:max-w-lg flex flex-col gap-0 p-0 overflow-hidden" preventClose={isSubmitting}>
        <SheetHeader className="flex-shrink-0 px-6 pt-6 pb-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center shadow-sm shadow-indigo-500/25 flex-shrink-0">
              <Bot className="h-5 w-5 text-white" />
            </div>
            <div>
              <SheetTitle className="text-base font-bold text-slate-900 dark:text-white">
                新增需求
              </SheetTitle>
              <SheetDescription className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                输入需求，AI 将自动生成测试用例脑图
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          <div className="space-y-2">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
              工作台名称{' '}
              <span className="text-slate-400 font-normal text-xs">（可选）</span>
            </label>
            <Input
              value={workspaceName}
              onChange={(e) => setWorkspaceName(e.target.value)}
              placeholder="例如：登录模块测试"
            />
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
              需求描述 / PRD <span className="text-rose-500">*</span>
            </label>
            <Textarea
              value={requirementText}
              onChange={(e) => setRequirementText(e.target.value)}
              rows={14}
              className="resize-none leading-relaxed"
              placeholder="粘贴 PRD、需求描述或技术方案，AI 将自动分析并生成完整的测试用例脑图..."
            />
          </div>
        </div>

        <div className="flex-shrink-0 px-6 py-4 border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900">
          <div className="flex gap-3">
            <Button
              variant="outline"
              className="flex-1"
              onClick={handleClose}
              disabled={isSubmitting}
            >
              取消
            </Button>
            <Button
              className="flex-1 gap-2 bg-indigo-600 hover:bg-indigo-700 text-white"
              onClick={handleGenerate}
              disabled={isSubmitting || !requirementText.trim()}
            >
              {isSubmitting
                ? <><Loader2 className="h-4 w-4 animate-spin" />准备中…</>
                : <><Bot className="h-4 w-4" />AI 生成用例</>}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ── Main Page ─────────────────────────────────────────────────────

/** 上次在脑图页面打开的文档 ID，用于列表页标识「当前工作区」 */
const LAST_OPENED_DOC_KEY = 'ai-case-last-opened-doc-id';

export default function AICaseCreate() {
  const [, setLocation] = useLocation();
  const [sheetOpen, setSheetOpen] = useState(false);
  // 读取最后一次在脑图页面打开的文档 ID
  const [lastOpenedDocId] = useState(() =>
    window.localStorage.getItem(LAST_OPENED_DOC_KEY) ?? undefined
  );
  const [docs, setDocs] = useState<AiCaseWorkspaceDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('updatedAt');
  const [sortDesc, setSortDesc] = useState(true);
  const [filter, setFilter] = useState<FilterMode>('all');
  const [showFilterMenu, setShowFilterMenu] = useState(false);
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

  const toggleSort = useCallback((k: SortKey) => {
    if (sortKey === k) setSortDesc((v) => !v);
    else { setSortKey(k); setSortDesc(true); }
  }, [sortKey]);

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
              <h1 className="text-lg font-bold text-slate-900 dark:text-white">AI 生成用例</h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">输入需求，AI 自动为你生成完整测试用例脑图</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm" variant="outline" className="h-8 text-xs gap-1.5"
              onClick={load} disabled={loading}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              刷新
            </Button>
            <Button
              size="sm" className="h-8 text-xs gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white"
              onClick={() => setSheetOpen(true)}
            >
              <Plus className="h-3.5 w-3.5" />
              新增需求
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
          {!loading && docs.length > 0 && (
            <p className="text-xs text-slate-400">
              共 {displayed.length} 条记录
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
                输入需求描述，让 AI 自动为你生成第一批测试用例脑图
              </p>
              <Button
                className="gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white"
                onClick={() => setSheetOpen(true)}
              >
                <Plus className="h-4 w-4" />新增需求
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
          {!loading && displayed.length > 0 && (
            <div className="space-y-3">
              {displayed.map((doc) => (
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

        </div>
      </div>

      {/* ── New Requirement Sheet ── */}
      <NewRequirementSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        onCreated={load}
      />
    </div>
  );
}
