import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useLocation } from 'wouter';
import {
  Bot,
  Loader2,
  Plus,
  FileText,
  ShieldAlert,
  PlayCircle,
  Search,
  ArrowRight,
  Clock3,
  Inbox,
  Filter,
  ArrowUpDown,
  CheckCircle2,
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
import type {
  AiCaseMindData,
  AiCaseNode,
  AiCaseNodePriority,
  AiCaseProgress,
  AiCaseWorkspaceDocument,
} from '@/types/aiCases';
import { useAiGeneration } from '@/contexts/AiGenerationContext';

function generateWorkspaceId(): string {
  return `ai-ws-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

type HistoryFilterMode = 'all' | 'synced' | 'local-only';
type HistorySortMode = 'updatedAt' | 'createdAt';

interface WorkspaceMetrics {
  progress: AiCaseProgress;
  moduleCount: number;
  highestPriority: AiCaseNodePriority;
}

const HOME_GUIDE_CARDS = [
  {
    key: 'prepare',
    title: '先准备什么',
    description: '把需求输入整理成 AI 能直接吸收的上下文，避免生成结果只有标题没有细节。',
    items: ['明确的业务需求文档或产品原型', '核心用户流程与边界条件说明'],
    icon: FileText,
    iconTone: 'bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-300',
  },
  {
    key: 'review',
    title: '生成后看什么',
    description: '结果页重点不是“看 AI 说了什么”，而是判断覆盖、风险和可执行性是否到位。',
    items: ['检查覆盖率与关键路径是否遗漏', '验证前置条件与预期结果是否准确'],
    icon: ShieldAlert,
    iconTone: 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-300',
  },
  {
    key: 'workflow',
    title: '建议工作流',
    description: '首页负责进入和继续，真正的筛选、补充、执行与回流都在工作台详情内完成。',
    items: ['AI 生成 > 人工筛选 > 补充细节', '归档优质用例并进入后续执行'],
    icon: PlayCircle,
    iconTone: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300',
  },
] as const;

const HISTORY_FILTER_LABELS: Record<HistoryFilterMode, string> = {
  all: '全部',
  synced: '已同步',
  'local-only': '仅本地',
};

const HISTORY_SORT_LABELS: Record<HistorySortMode, string> = {
  updatedAt: '最近更新',
  createdAt: '创建时间',
};

const PRIORITY_RANK: Record<AiCaseNodePriority, number> = {
  P0: 0,
  P1: 1,
  P2: 2,
  P3: 3,
};

function walkNodes(node: AiCaseNode, visit: (current: AiCaseNode) => void): void {
  visit(node);
  for (const child of node.children ?? []) {
    walkNodes(child as AiCaseNode, visit);
  }
}

function collectWorkspaceMetrics(doc: AiCaseWorkspaceDocument): WorkspaceMetrics {
  let moduleCount = 0;
  let highestPriority: AiCaseNodePriority = 'P3';

  walkNodes(doc.mapData.nodeData, (node) => {
    const metadata = node.metadata;
    if (!metadata) return;

    if (metadata.kind === 'module') {
      moduleCount += 1;
    }

    if (PRIORITY_RANK[metadata.priority] < PRIORITY_RANK[highestPriority]) {
      highestPriority = metadata.priority;
    }
  });

  return {
    progress: computeProgress(doc.mapData),
    moduleCount,
    highestPriority,
  };
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

function formatDateTime(ts: number): string {
  return new Date(ts).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function resolveWorkspaceStatus(
  doc: AiCaseWorkspaceDocument,
  progress: AiCaseProgress
): { label: string; className: string } {
  if (doc.remoteStatus === 'published') {
    return {
      label: '已发布',
      className: 'bg-emerald-50 text-emerald-700 ring-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/20',
    };
  }

  if (doc.remoteStatus === 'archived') {
    return {
      label: '已归档',
      className: 'bg-slate-100 text-slate-700 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700',
    };
  }

  if (progress.total === 0) {
    return {
      label: '待生成',
      className: 'bg-amber-50 text-amber-700 ring-amber-100 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/20',
    };
  }

  if (progress.completionRate >= 100) {
    return {
      label: '已完成',
      className: 'bg-blue-50 text-blue-700 ring-blue-100 dark:bg-blue-500/10 dark:text-blue-300 dark:ring-blue-500/20',
    };
  }

  return {
    label: '进行中',
    className: 'bg-indigo-50 text-indigo-700 ring-indigo-100 dark:bg-indigo-500/10 dark:text-indigo-300 dark:ring-indigo-500/20',
  };
}

function countModules(data: AiCaseMindData): number {
  let moduleCount = 0;
  walkNodes(data.nodeData, (node) => {
    if (node.metadata?.kind === 'module') {
      moduleCount += 1;
    }
  });
  return moduleCount;
}

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

      notifyStart(docId);

      onOpenChange(false);
      setWorkspaceName('');
      setRequirementText('');

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
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!isSubmitting) {
      onOpenChange(false);
      setWorkspaceName('');
      setRequirementText('');
    }
  };

  return (
    <Sheet open={open} onOpenChange={handleClose}>
      <SheetContent className="w-full max-w-lg flex flex-col gap-0 overflow-hidden p-0" preventClose={isSubmitting}>
        <SheetHeader className="flex-shrink-0 border-b border-slate-100 px-6 pb-4 pt-6 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-blue-500 shadow-sm shadow-indigo-500/25">
              <Bot className="h-5 w-5 text-white" />
            </div>
            <div>
              <SheetTitle className="text-base font-bold text-slate-900 dark:text-white">
                新增需求
              </SheetTitle>
              <SheetDescription className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                输入需求上下文，AI 将生成结构化测试用例并进入工作台继续补充和执行。
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
          <div className="space-y-2">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
              工作台名称 <span className="text-xs font-normal text-slate-400">（可选）</span>
            </label>
            <Input
              value={workspaceName}
              onChange={(event) => setWorkspaceName(event.target.value)}
              placeholder="例如：登录模块测试"
            />
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
              需求描述 / PRD <span className="text-rose-500">*</span>
            </label>
            <Textarea
              value={requirementText}
              onChange={(event) => setRequirementText(event.target.value)}
              rows={14}
              className="resize-none leading-relaxed"
              placeholder="粘贴 PRD、需求描述或技术方案，AI 将自动分析并生成结构化测试用例..."
            />
          </div>
        </div>

        <div className="flex-shrink-0 border-t border-slate-100 bg-white px-6 py-4 dark:border-slate-800 dark:bg-slate-900">
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
              className="flex-1 gap-2 bg-indigo-600 text-white hover:bg-indigo-700"
              onClick={handleGenerate}
              disabled={isSubmitting || !requirementText.trim()}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  准备中
                </>
              ) : (
                <>
                  <Bot className="h-4 w-4" />
                  AI 生成用例
                </>
              )}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

interface HomeGuideCardsProps {
  onCreate: () => void;
}

function HomeGuideCards({ onCreate }: HomeGuideCardsProps) {
  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-3xl">
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-4xl">
            AI 工作台
          </h1>
          <p className="mt-3 text-base leading-7 text-slate-600 dark:text-slate-300">
            输入需求并生成结构化测试用例，继续完成筛选、补充、执行与回流。
          </p>
        </div>

        <Button
          type="button"
          size="lg"
          className="h-12 gap-2 rounded-xl bg-indigo-600 px-5 text-sm font-semibold text-white shadow-sm shadow-indigo-600/20 hover:bg-indigo-700"
          onClick={onCreate}
        >
          <Plus className="h-4 w-4" />
          新增需求
        </Button>
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        {HOME_GUIDE_CARDS.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.key}
              className="rounded-3xl border border-slate-200 bg-white p-7 shadow-sm shadow-slate-200/45 dark:border-slate-800 dark:bg-slate-900 dark:shadow-slate-950/30"
            >
              <div className={`inline-flex h-14 w-14 items-center justify-center rounded-2xl ${card.iconTone}`}>
                <Icon className="h-7 w-7" />
              </div>
              <h2 className="mt-5 text-2xl font-semibold text-slate-900 dark:text-white">{card.title}</h2>
              <p className="mt-3 text-sm leading-6 text-slate-500 dark:text-slate-400">
                {card.description}
              </p>
              <div className="mt-5 space-y-3">
                {card.items.map((item) => (
                  <div key={item} className="flex items-start gap-3 text-sm leading-6 text-slate-700 dark:text-slate-200">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-indigo-600 dark:text-indigo-300" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface RecentWorkspaceSectionProps {
  docs: AiCaseWorkspaceDocument[];
  metrics: Map<string, WorkspaceMetrics>;
  onOpen: (id: string) => void;
  onViewAll: () => void;
}

function RecentWorkspaceSection({
  docs,
  metrics,
  onOpen,
  onViewAll,
}: RecentWorkspaceSectionProps) {
  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900 dark:text-white">最近的工作台</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            首页默认保留最近 5 条，更多记录统一进入“全部记录”页检索。
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          className="gap-1.5 px-0 text-sm font-semibold text-indigo-600 hover:bg-transparent hover:text-indigo-700 dark:text-indigo-300 dark:hover:text-indigo-200"
          onClick={onViewAll}
        >
          查看全部
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/45 dark:border-slate-800 dark:bg-slate-900 dark:shadow-slate-950/30">
        {docs.length === 0 ? (
          <div className="flex min-h-[240px] flex-col items-center justify-center gap-4 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500">
              <Clock3 className="h-8 w-8" />
            </div>
            <div>
              <div className="text-base font-medium text-slate-900 dark:text-white">暂无最近活动</div>
              <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                创建第一条需求后，这里会展示最近继续过的 AI 工作台。
              </div>
            </div>
          </div>
        ) : (
          <div className="grid gap-4 xl:grid-cols-3">
            {docs.map((doc) => {
              const currentMetrics = metrics.get(doc.id) ?? {
                progress: computeProgress(doc.mapData),
                moduleCount: countModules(doc.mapData),
                highestPriority: 'P3' as AiCaseNodePriority,
              };
              const status = resolveWorkspaceStatus(doc, currentMetrics.progress);

              return (
                <button
                  key={doc.id}
                  type="button"
                  onClick={() => onOpen(doc.id)}
                  className="rounded-2xl border border-slate-200 bg-slate-50 p-5 text-left transition-all hover:-translate-y-0.5 hover:border-indigo-200 hover:bg-white hover:shadow-md hover:shadow-indigo-100/60 dark:border-slate-800 dark:bg-slate-950 dark:hover:border-indigo-500/30 dark:hover:bg-slate-900 dark:hover:shadow-none"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="line-clamp-1 text-base font-semibold text-slate-900 dark:text-white">
                        {doc.name}
                      </div>
                      <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        最近更新：{formatRelativeTime(doc.updatedAt)}
                      </div>
                    </div>
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${status.className}`}>
                      {status.label}
                    </span>
                  </div>

                  <div className="mt-4 grid grid-cols-3 gap-3">
                    <div className="rounded-xl border border-slate-200 bg-white px-3 py-3 dark:border-slate-800 dark:bg-slate-900">
                      <div className="text-xs text-slate-400 dark:text-slate-500">模块数</div>
                      <div className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">
                        {currentMetrics.moduleCount}
                      </div>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-white px-3 py-3 dark:border-slate-800 dark:bg-slate-900">
                      <div className="text-xs text-slate-400 dark:text-slate-500">用例数</div>
                      <div className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">
                        {currentMetrics.progress.total}
                      </div>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-white px-3 py-3 dark:border-slate-800 dark:bg-slate-900">
                      <div className="text-xs text-slate-400 dark:text-slate-500">完成率</div>
                      <div className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">
                        {currentMetrics.progress.completionRate}%
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

interface HistoryPreviewSectionProps {
  docs: AiCaseWorkspaceDocument[];
  metrics: Map<string, WorkspaceMetrics>;
  searchValue: string;
  onSearchChange: (value: string) => void;
  historyFilter: HistoryFilterMode;
  historySort: HistorySortMode;
  onToggleFilter: () => void;
  onToggleSort: () => void;
  onOpen: (id: string) => void;
  onViewAll: () => void;
}

function HistoryPreviewSection({
  docs,
  metrics,
  searchValue,
  onSearchChange,
  historyFilter,
  historySort,
  onToggleFilter,
  onToggleSort,
  onOpen,
  onViewAll,
}: HistoryPreviewSectionProps) {
  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900 dark:text-white">全部历史记录</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            先在首页快速检索，深度搜索、筛选和分页仍然由“全部记录”页承接。
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          className="gap-1.5 px-0 text-sm font-semibold text-indigo-600 hover:bg-transparent hover:text-indigo-700 dark:text-indigo-300 dark:hover:text-indigo-200"
          onClick={onViewAll}
        >
          查看全部
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/45 dark:border-slate-800 dark:bg-slate-900 dark:shadow-slate-950/30">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative w-full max-w-xl">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={searchValue}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder="搜索历史记录..."
              className="h-11 rounded-xl border-slate-200 pl-11 text-sm dark:border-slate-700"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              className="h-11 gap-2 rounded-xl border-slate-200 px-4 text-sm dark:border-slate-700"
              onClick={onToggleFilter}
            >
              <Filter className="h-4 w-4" />
              筛选 · {HISTORY_FILTER_LABELS[historyFilter]}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-11 gap-2 rounded-xl border-slate-200 px-4 text-sm dark:border-slate-700"
              onClick={onToggleSort}
            >
              <ArrowUpDown className="h-4 w-4" />
              排序 · {HISTORY_SORT_LABELS[historySort]}
            </Button>
          </div>
        </div>

        <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800">
          {docs.length === 0 ? (
            <div className="flex min-h-[360px] flex-col items-center justify-center gap-4 bg-white text-center dark:bg-slate-900">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500">
                <Inbox className="h-8 w-8" />
              </div>
              <div>
                <div className="text-base font-medium text-slate-900 dark:text-white">暂无记录</div>
                <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  生成第一批 AI 用例后，这里会出现工作台历史记录预览。
                </div>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-800">
                <thead className="bg-slate-50 dark:bg-slate-950/60">
                  <tr className="text-left text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    <th className="px-5 py-3">名称</th>
                    <th className="px-5 py-3">更新时间</th>
                    <th className="px-5 py-3">模块数</th>
                    <th className="px-5 py-3">用例数</th>
                    <th className="px-5 py-3">优先级</th>
                    <th className="px-5 py-3">状态</th>
                    <th className="px-5 py-3">进度</th>
                    <th className="px-5 py-3 text-right">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white dark:divide-slate-800 dark:bg-slate-900">
                  {docs.map((doc) => {
                    const currentMetrics = metrics.get(doc.id) ?? {
                      progress: computeProgress(doc.mapData),
                      moduleCount: countModules(doc.mapData),
                      highestPriority: 'P3' as AiCaseNodePriority,
                    };
                    const status = resolveWorkspaceStatus(doc, currentMetrics.progress);

                    return (
                      <tr key={doc.id} className="transition-colors hover:bg-slate-50 dark:hover:bg-slate-950/60">
                        <td className="px-5 py-4">
                          <div className="max-w-[260px]">
                            <div className="line-clamp-1 font-medium text-slate-900 dark:text-white">
                              {doc.name}
                            </div>
                            <div className="mt-1 line-clamp-1 text-xs text-slate-500 dark:text-slate-400">
                              {doc.requirement}
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-4 text-slate-600 dark:text-slate-300">
                          {formatDateTime(doc.updatedAt)}
                        </td>
                        <td className="px-5 py-4 text-slate-600 dark:text-slate-300">
                          {currentMetrics.moduleCount}
                        </td>
                        <td className="px-5 py-4 text-slate-600 dark:text-slate-300">
                          {currentMetrics.progress.total}
                        </td>
                        <td className="px-5 py-4">
                          <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                            {currentMetrics.highestPriority}
                          </span>
                        </td>
                        <td className="px-5 py-4">
                          <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${status.className}`}>
                            {status.label}
                          </span>
                        </td>
                        <td className="px-5 py-4">
                          <div className="min-w-[120px]">
                            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                              <span>{currentMetrics.progress.done}/{currentMetrics.progress.total}</span>
                              <span>{currentMetrics.progress.completionRate}%</span>
                            </div>
                            <div className="mt-2 h-2 rounded-full bg-slate-100 dark:bg-slate-800">
                              <div
                                className="progress-fill h-2 rounded-full bg-indigo-500 transition-all"
                                style={{ width: `${Math.min(currentMetrics.progress.completionRate, 100)}%` }}
                              />
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-4 text-right">
                          <Button
                            type="button"
                            variant="ghost"
                            className="h-8 px-2 text-sm font-medium text-indigo-600 hover:bg-indigo-50 hover:text-indigo-700 dark:text-indigo-300 dark:hover:bg-indigo-500/10 dark:hover:text-indigo-200"
                            onClick={() => onOpen(doc.id)}
                          >
                            打开
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {docs.length > 0 ? (
          <div className="mt-3 text-xs text-slate-500 dark:text-slate-400">
            首页仅展示前 5 条匹配结果，更多记录请前往“全部记录”页继续检索和分页浏览。
          </div>
        ) : null}
      </div>
    </section>
  );
}

export default function AICaseCreate() {
  const [, setLocation] = useLocation();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [docs, setDocs] = useState<AiCaseWorkspaceDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [historySearch, setHistorySearch] = useState('');
  const [historyFilter, setHistoryFilter] = useState<HistoryFilterMode>('all');
  const [historySort, setHistorySort] = useState<HistorySortMode>('updatedAt');

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

  const { generatingDocId } = useAiGeneration();
  const prevGeneratingDocIdRef = useRef<string | null>(generatingDocId);

  useEffect(() => {
    const previousDocId = prevGeneratingDocIdRef.current;
    prevGeneratingDocIdRef.current = generatingDocId;

    if (previousDocId !== null && generatingDocId === null) {
      load();
    }
  }, [generatingDocId, load]);

  useEffect(() => {
    load();
  }, [load]);

  const metricsById = useMemo(
    () => new Map(docs.map((doc) => [doc.id, collectWorkspaceMetrics(doc)])),
    [docs]
  );

  const sortedDocs = useMemo(
    () => [...docs].sort((left, right) => right.updatedAt - left.updatedAt),
    [docs]
  );

  const recentDocs = useMemo(() => sortedDocs.slice(0, 5), [sortedDocs]);

  const historyPreviewDocs = useMemo(() => {
    const keyword = historySearch.trim().toLowerCase();

    let nextDocs = [...sortedDocs];

    if (keyword) {
      nextDocs = nextDocs.filter((doc) =>
        doc.name.toLowerCase().includes(keyword) || doc.requirement.toLowerCase().includes(keyword)
      );
    }

    if (historyFilter === 'synced') {
      nextDocs = nextDocs.filter((doc) => doc.syncMode === 'hybrid' && !!doc.remoteWorkspaceId);
    }

    if (historyFilter === 'local-only') {
      nextDocs = nextDocs.filter((doc) => !doc.remoteWorkspaceId);
    }

    nextDocs.sort((left, right) =>
      historySort === 'createdAt'
        ? right.createdAt - left.createdAt
        : right.updatedAt - left.updatedAt
    );

    return nextDocs.slice(0, 5);
  }, [docs, historyFilter, historySearch, historySort, sortedDocs]);

  const handleOpen = useCallback(
    (id: string) => setLocation(`/cases/ai?docId=${encodeURIComponent(id)}`),
    [setLocation]
  );

  const handleViewAll = useCallback(() => {
    setLocation('/cases/ai-history');
  }, [setLocation]);

  const toggleHistoryFilter = useCallback(() => {
    setHistoryFilter((current) => {
      if (current === 'all') return 'synced';
      if (current === 'synced') return 'local-only';
      return 'all';
    });
  }, []);

  const toggleHistorySort = useCallback(() => {
    setHistorySort((current) => (current === 'updatedAt' ? 'createdAt' : 'updatedAt'));
  }, []);

  return (
    <div className="h-full overflow-y-auto bg-slate-50 dark:bg-slate-950">
      <div className="mx-auto max-w-6xl px-6 py-8">
        {loading ? (
          <div className="space-y-8">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
              <div className="space-y-3">
                <div className="h-10 w-48 animate-pulse rounded-xl bg-slate-200 dark:bg-slate-800" />
                <div className="h-5 w-96 max-w-full animate-pulse rounded-lg bg-slate-200 dark:bg-slate-800" />
              </div>
              <div className="h-12 w-36 animate-pulse rounded-xl bg-slate-200 dark:bg-slate-800" />
            </div>

            <div className="grid gap-5 xl:grid-cols-3">
              {[1, 2, 3].map((item) => (
                <div
                  key={item}
                  className="rounded-3xl border border-slate-200 bg-white p-7 shadow-sm shadow-slate-200/45 dark:border-slate-800 dark:bg-slate-900 dark:shadow-slate-950/30"
                >
                  <div className="h-14 w-14 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800" />
                  <div className="mt-5 h-8 w-40 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />
                  <div className="mt-4 space-y-3">
                    <div className="h-4 w-full animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
                    <div className="h-4 w-4/5 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
                    <div className="h-4 w-3/4 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
                  </div>
                </div>
              ))}
            </div>

            {[1, 2].map((item) => (
              <div
                key={item}
                className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/45 dark:border-slate-800 dark:bg-slate-900 dark:shadow-slate-950/30"
              >
                <div className="h-7 w-44 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />
                <div className="mt-5 h-64 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800" />
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-10">
            <HomeGuideCards onCreate={() => setSheetOpen(true)} />

            <RecentWorkspaceSection
              docs={recentDocs}
              metrics={metricsById}
              onOpen={handleOpen}
              onViewAll={handleViewAll}
            />

            <HistoryPreviewSection
              docs={historyPreviewDocs}
              metrics={metricsById}
              searchValue={historySearch}
              onSearchChange={setHistorySearch}
              historyFilter={historyFilter}
              historySort={historySort}
              onToggleFilter={toggleHistoryFilter}
              onToggleSort={toggleHistorySort}
              onOpen={handleOpen}
              onViewAll={handleViewAll}
            />
          </div>
        )}
      </div>

      <NewRequirementSheet open={sheetOpen} onOpenChange={setSheetOpen} />
    </div>
  );
}
