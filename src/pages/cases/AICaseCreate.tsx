import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useLocation } from 'wouter';
import {
  BrainCircuit, Bot, Loader2, Plus, RefreshCw, ArrowUpRight,
  FileText, ShieldAlert, PlayCircle, History,
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
import { listAllWorkspaceDocuments } from '@/lib/aiCaseStorage';
import { computeProgress } from '@/lib/aiCaseMindMap';
import { type AiCaseWorkspaceDocument } from '@/types/aiCases';
import { useAiGeneration } from '@/contexts/AiGenerationContext';

/** 生成工作台文档的唯一 ID */
function generateWorkspaceId(): string {
  return `ai-ws-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

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

  // 将 cards 数组纳入 useMemo，避免每次组件重渲染都创建新的数组对象
  const cards = useMemo(() => [
    {
      label: '生成记录', value: docs.length, unit: '条',
      c: 'text-violet-600 dark:text-violet-400', bg: 'bg-violet-50 dark:bg-violet-900/20',
      border: 'border-violet-100 dark:border-violet-800/30',
    },
    {
      label: '累计用例', value: s.totalCases, unit: '条',
      c: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-900/20',
      border: 'border-blue-100 dark:border-blue-800/30',
    },
    {
      label: '整体通过率', value: s.passRate, unit: '%',
      c: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-900/20',
      border: 'border-emerald-100 dark:border-emerald-800/30',
    },
    {
      label: '已同步服务端', value: s.syncedDocs, unit: '条',
      c: 'text-sky-600 dark:text-sky-400', bg: 'bg-sky-50 dark:bg-sky-900/20',
      border: 'border-sky-100 dark:border-sky-800/30',
    },
  ], [docs.length, s.totalCases, s.passRate, s.syncedDocs]);

  return (
    <div className="grid grid-cols-4 gap-3">
      {cards.map((card) => (
        <div
          key={card.label}
          className={`${card.bg} border ${card.border} rounded-xl px-4 py-3 flex flex-col gap-0.5`}
        >
          <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">{card.label}</span>
          <div className="flex items-baseline gap-0.5 mt-0.5">
            <span className={`text-2xl font-bold leading-none ${card.c}`}>{card.value}</span>
            <span className={`text-xs font-medium ${card.c} opacity-80`}>{card.unit}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function formatRelativeTime(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 60_000);
  if (diff < 1) return '刚刚';
  if (diff < 60) return `${diff} 分钟前`;
  const hours = Math.floor(diff / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} 天前`;
  return new Date(ts).toLocaleDateString('zh-CN');
}

function EmptyWorkspaceGuide({ onCreate }: { onCreate: () => void }) {
  const cards = [
    {
      icon: <FileText className="h-4 w-4" />,
      title: '先准备什么',
      items: ['需求描述 / PRD', '接口文档或截图', '代码变更和缺陷上下文'],
      tone: 'from-sky-50 to-cyan-50 border-sky-100 text-sky-700 dark:from-sky-900/20 dark:to-cyan-900/20 dark:border-sky-800/40 dark:text-sky-300',
    },
    {
      icon: <ShieldAlert className="h-4 w-4" />,
      title: '生成后看什么',
      items: ['结构化用例列表', '高风险和待补充项', '来源、覆盖和执行状态'],
      tone: 'from-amber-50 to-orange-50 border-amber-100 text-amber-700 dark:from-amber-900/20 dark:to-orange-900/20 dark:border-amber-800/40 dark:text-amber-300',
    },
    {
      icon: <PlayCircle className="h-4 w-4" />,
      title: '建议工作流',
      items: ['先生成首版用例', '筛选高风险项补充', '发布并进入执行回流'],
      tone: 'from-emerald-50 to-teal-50 border-emerald-100 text-emerald-700 dark:from-emerald-900/20 dark:to-teal-900/20 dark:border-emerald-800/40 dark:text-emerald-300',
    },
  ];

  return (
    <div className="space-y-5">
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="bg-[radial-gradient(circle_at_top_left,_rgba(99,102,241,0.14),_transparent_36%),radial-gradient(circle_at_bottom_right,_rgba(16,185,129,0.12),_transparent_34%)] px-6 py-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700 dark:border-indigo-800/40 dark:bg-indigo-500/10 dark:text-indigo-300">
                <BrainCircuit className="h-3.5 w-3.5" />
                AI 工作台首页
              </div>
              <h2 className="mt-3 text-xl font-semibold text-slate-900 dark:text-white">
                先输入需求，再把 AI 结果收敛成可执行的结构化测试用例
              </h2>
              <p className="mt-2 max-w-xl text-sm leading-6 text-slate-600 dark:text-slate-300">
                这里不只是“生成一下用例”。后续你会在同一个工作台里继续做筛选、补充、评审、执行和回流，所以首页应该先告诉用户要准备什么、会得到什么。
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button
                className="gap-2 bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm shadow-indigo-600/20"
                onClick={onCreate}
              >
                <Plus className="h-4 w-4" />
                新增需求
              </Button>
              <div className="rounded-xl border border-slate-200 bg-white/80 px-4 py-3 text-xs text-slate-500 backdrop-blur dark:border-slate-700 dark:bg-slate-900/80 dark:text-slate-400">
                首次建议至少准备：
                <div className="mt-1 font-medium text-slate-700 dark:text-slate-200">
                  需求文本 + 1 份辅助材料
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {cards.map((card) => (
          <div
            key={card.title}
            className={`rounded-2xl border bg-gradient-to-br px-5 py-4 ${card.tone}`}
          >
            <div className="flex items-center gap-2 text-sm font-semibold">
              {card.icon}
              {card.title}
            </div>
            <div className="mt-3 space-y-2 text-sm leading-6">
              {card.items.map((item) => (
                <div key={item}>{item}</div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function RecentWorkspaceStrip({
  docs,
  onOpen,
  onViewAll,
}: {
  docs: AiCaseWorkspaceDocument[];
  onOpen: (id: string) => void;
  onViewAll: () => void;
}) {
  const recentDocs = docs.slice(0, 5);

  if (recentDocs.length === 0) {
    return null;
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-slate-900 dark:text-white">继续最近工作台</div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            首页只透出最近 5 条工作台，搜索、筛选和分页统一放到“全部记录”页。
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 text-xs text-slate-400">
            <History className="h-3.5 w-3.5" />
            最近 5 条
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 text-xs"
            onClick={onViewAll}
          >
            查看全部记录
          </Button>
        </div>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-5">
        {recentDocs.map((doc) => {
          const progress = computeProgress(doc.mapData);
          return (
            <button
              key={doc.id}
              type="button"
              onClick={() => onOpen(doc.id)}
              className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4 text-left transition-colors hover:border-indigo-300 hover:bg-indigo-50/60 dark:border-slate-700 dark:bg-slate-950 dark:hover:border-indigo-500/50 dark:hover:bg-indigo-500/10"
            >
              <div className="line-clamp-1 text-sm font-semibold text-slate-900 dark:text-white">{doc.name}</div>
              <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{formatRelativeTime(doc.updatedAt)}</div>

              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-lg bg-white px-3 py-2 text-slate-600 dark:bg-slate-900 dark:text-slate-300">
                  <div className="text-slate-400 dark:text-slate-500">用例数</div>
                  <div className="mt-1 font-semibold text-slate-900 dark:text-white">{progress.total}</div>
                </div>
                <div className="rounded-lg bg-white px-3 py-2 text-slate-600 dark:bg-slate-900 dark:text-slate-300">
                  <div className="text-slate-400 dark:text-slate-500">完成率</div>
                  <div className="mt-1 font-semibold text-slate-900 dark:text-white">{progress.completionRate}%</div>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── New Requirement Sheet ─────────────────────────────────────────

interface NewRequirementSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function NewRequirementSheet({ open, onOpenChange }: NewRequirementSheetProps) {
  const [, setLocation] = useLocation();
  const { notifyStart } = useAiGeneration();
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
      const docId = generateWorkspaceId();

      // 先通知全局 Context 开始生成（携带 docId），
      // AICases 页面生成完成后才会真正将文档写入 localStorage。
      // 这样列表页在生成完成前不会出现该条记录，消除歧义。
      notifyStart(docId);

      onOpenChange(false);
      setWorkspaceName('');
      setRequirementText('');

      // 将需求文本和名称通过 URL 参数传递给 AICases 页面，
      // AICases 检测到 autoGenerate=true 后自行创建文档并开始生成。
      const params = new URLSearchParams();
      params.set('docId', docId);
      params.set('autoGenerate', 'true');
      params.set('initName', workspaceName.trim() || 'AI Testcase Workspace');
      params.set('initReq', requirementText.trim());
      setLocation(`/cases/ai?${params.toString()}`);
    } catch (error) {
      console.error('[AICaseCreate] failed to navigate', error);
      toast.error('跳转失败，请重试');
    } finally {
      // 无论成功还是失败都重置提交状态，避免 Sheet 在不卸载场景下按钮永久禁用
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
      <SheetContent className="w-full max-w-lg flex flex-col gap-0 p-0 overflow-hidden" preventClose={isSubmitting}>
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
export default function AICaseCreate() {
  const [, setLocation] = useLocation();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [docs, setDocs] = useState<AiCaseWorkspaceDocument[]>([]);
  const [loading, setLoading] = useState(true);

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

  // 订阅 AI 生成状态：当 generatingDocId 从「有→无」时，说明生成结束，自动刷新列表
  const { generatingDocId } = useAiGeneration();
  const prevGeneratingDocIdRef = useRef<string | null>(generatingDocId);
  useEffect(() => {
    const prev = prevGeneratingDocIdRef.current;
    prevGeneratingDocIdRef.current = generatingDocId;
    // 从「有值 → null」表示生成刚结束，触发列表刷新
    if (prev !== null && generatingDocId === null) {
      load();
    }
  }, [generatingDocId, load]);

  useEffect(() => { load(); }, [load]);

  const handleOpen = useCallback(
    (id: string) => setLocation(`/cases/ai?docId=${encodeURIComponent(id)}`),
    [setLocation]
  );

  const recentDocs = useMemo(() => docs.slice(0, 5), [docs]);

  // 是否有真实数据（不含正在生成的临时占位）
  const hasData = docs.length > 0;

  return (
    <div className="h-full flex flex-col bg-slate-50 dark:bg-slate-950 overflow-hidden">
      {/* ── Page Header ── */}
      <div className="flex-shrink-0 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-6 py-3.5">
        <div className="flex items-center justify-between gap-4">
          {/* 左侧：标题区 */}
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-500 flex items-center justify-center shadow-sm shadow-violet-500/20">
              <BrainCircuit className="h-4 w-4 text-white" />
            </div>
            <div className="min-w-0">
              <h1 className="text-sm font-semibold text-slate-900 dark:text-white leading-tight truncate">
                AI 工作台
              </h1>
              <p className="text-xs text-slate-400 dark:text-slate-500 leading-tight mt-0.5">
                输入需求并生成结构化测试用例，继续完成筛选、补充、执行与回流
              </p>
            </div>
          </div>

          {/* 右侧：操作区 */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* 刷新：使用 Button 组件保证 focus-visible / disabled 样式与全局一致 */}
            <Button
              variant="ghost"
              size="icon"
              onClick={load}
              disabled={loading}
              title="刷新列表"
              aria-label="刷新列表"
              className="h-8 w-8 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>

            {/* 主 CTA：新增需求 */}
            <Button
              size="sm"
              className="h-8 text-xs gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm shadow-indigo-600/20"
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
        <div className="max-w-4xl mx-auto px-6 py-5 space-y-4">

          {/* Loading skeleton */}
          {loading && (
            <>
              {/* 统计卡片 skeleton */}
              <div className="grid grid-cols-4 gap-3">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/80 rounded-xl px-4 py-3 animate-pulse">
                    <div className="h-3 bg-slate-100 dark:bg-slate-800 rounded w-2/3 mb-2" />
                    <div className="h-6 bg-slate-100 dark:bg-slate-800 rounded w-1/2" />
                  </div>
                ))}
              </div>
              {/* 卡片列表 skeleton */}
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
            </>
          )}

          {!loading && (
            <>
              {/* Summary stats：有数据时显示 */}
              {hasData && <SummaryStats docs={docs} />}

              {hasData && (
                <RecentWorkspaceStrip
                  docs={recentDocs}
                  onOpen={handleOpen}
                  onViewAll={() => setLocation('/cases/ai-history')}
                />
              )}

              {/* Empty state：无数据时居中展示，不再放重复按钮 */}
              {docs.length === 0 && (
                <div className="space-y-4 py-6">
                  <EmptyWorkspaceGuide onCreate={() => setSheetOpen(true)} />
                  <div className="flex items-center justify-center gap-1.5 text-xs text-indigo-500 dark:text-indigo-400 font-medium select-none">
                    <ArrowUpRight className="h-3.5 w-3.5" />
                    <span>点击右上角「新增需求」开始生成你的第一个 AI 工作台</span>
                  </div>
                </div>
              )}

              {hasData ? (
                <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="text-sm font-semibold text-slate-900 dark:text-white">历史记录入口</div>
                      <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        搜索、筛选、分页和批量管理统一放到“全部记录”页，这里只保留最近工作台入口。
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      className="h-9 gap-2 text-sm"
                      onClick={() => setLocation('/cases/ai-history')}
                    >
                      <History className="h-4 w-4" />
                      查看全部记录
                    </Button>
                  </div>
                </div>
              ) : null}
            </>
          )}

        </div>
      </div>

      {/* ── New Requirement Sheet ── */}
      <NewRequirementSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
      />
    </div>
  );
}
