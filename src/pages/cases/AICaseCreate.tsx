import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useLocation } from 'wouter';
import {
  ArrowRight,
  ArrowUpDown,
  BookOpen,
  Bot,
  Boxes,
  Bug,
  ChevronRight,
  Clock3,
  Code2,
  FileText,
  Filter,
  FolderUp,
  Inbox,
  Link2,
  Loader2,
  NotebookTabs,
  PencilLine,
  Plus,
  RefreshCcw,
  Search,
  Sparkles,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
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
type WorkspaceInputMode = 'direct' | 'upload' | 'template';

interface WorkspaceMetrics {
  progress: AiCaseProgress;
  moduleCount: number;
  highestPriority: AiCaseNodePriority;
}

interface MaterialChip {
  label: string;
  icon: typeof FileText;
  tone: string;
}

interface QuickStartCardItem {
  title: string;
  description: string;
  actionLabel: string;
  icon: typeof FileText;
  iconTone: string;
  onClick: () => void;
}

interface InputModeOption {
  id: WorkspaceInputMode;
  label: string;
  icon: typeof PencilLine;
}

interface SupplementOption {
  id: string;
  label: string;
  icon: typeof FileText;
  accent: string;
}

const MATERIAL_CHIPS: MaterialChip[] = [
  {
    label: 'PRD / 需求文档',
    icon: FileText,
    tone: 'border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-500/20 dark:bg-violet-500/10 dark:text-violet-300',
  },
  {
    label: 'OpenAPI / 接口文档',
    icon: NotebookTabs,
    tone: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300',
  },
  {
    label: '缺陷单',
    icon: Bug,
    tone: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300',
  },
  {
    label: '代码变更',
    icon: Code2,
    tone: 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-300',
  },
];

const WORKSPACE_MODULE_OPTIONS = [
  '登录与认证',
  '接口联调',
  '订单流程',
  '支付结算',
  '数据报表',
  '测试平台配置',
] as const;

const INPUT_MODE_OPTIONS: InputModeOption[] = [
  { id: 'direct', label: '直接输入', icon: PencilLine },
  { id: 'upload', label: '上传文档', icon: FolderUp },
  { id: 'template', label: '从模板开始', icon: Boxes },
];

const SUPPLEMENT_OPTIONS: SupplementOption[] = [
  { id: 'prd', label: 'PRD / 需求文档', icon: FileText, accent: 'text-violet-600' },
  { id: 'openapi', label: 'OpenAPI / 接口文档', icon: NotebookTabs, accent: 'text-emerald-600' },
  { id: 'attachment', label: '附件上传', icon: Link2, accent: 'text-blue-600' },
  { id: 'code', label: '代码变更', icon: Code2, accent: 'text-amber-600' },
  { id: 'bug', label: '缺陷单', icon: Bug, accent: 'text-rose-500' },
];

const NEXT_STEP_ITEMS = [
  '补充输入材料',
  '生成结构化测试用例',
  '查看覆盖与风险',
  '执行与回流',
] as const;

const EXAMPLE_REQUIREMENT_TEXT = [
  '业务目标：优化登录模块测试设计，覆盖账号密码登录、验证码、记住我和登录失败限制。',
  '核心流程：用户输入邮箱和密码后提交；支持忘记密码；连续输错 5 次后账户临时锁定。',
  '边界条件：空值、超长输入、错误密码、过期验证码、已锁定账号。',
  '异常场景：服务超时、接口 500、登录态失效、频繁重试。',
].join('\n');

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

const FIRST_USE_STEPS = [
  {
    title: '准备输入',
    description: '整理业务需求、接口文档与边界条件',
    icon: FileText,
    tone: 'bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-300',
    indexTone: 'bg-violet-600 text-white',
  },
  {
    title: '生成结果',
    description: 'AI 生成结构化测试点与用例',
    icon: Sparkles,
    tone: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300',
    indexTone: 'bg-emerald-600 text-white',
  },
  {
    title: '补充优化',
    description: '人工筛选、补点并确认覆盖风险',
    icon: PencilLine,
    tone: 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-300',
    indexTone: 'bg-amber-500 text-white',
  },
  {
    title: '执行回流',
    description: '执行高风险范围并沉淀结果',
    icon: RefreshCcw,
    tone: 'bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-300',
    indexTone: 'bg-blue-600 text-white',
  },
] as const;

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

function countModules(data: AiCaseMindData): number {
  let moduleCount = 0;
  walkNodes(data.nodeData, (node) => {
    if (node.metadata?.kind === 'module') {
      moduleCount += 1;
    }
  });
  return moduleCount;
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

interface NewRequirementSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function NewRequirementSheet({ open, onOpenChange }: NewRequirementSheetProps) {
  const [, setLocation] = useLocation();
  const { notifyStart } = useAiGeneration();
  const [workspaceName, setWorkspaceName] = useState('');
  const [workspaceModule, setWorkspaceModule] = useState('');
  const [requirementText, setRequirementText] = useState('');
  const [inputMode, setInputMode] = useState<WorkspaceInputMode>('direct');
  const [selectedSupplements, setSelectedSupplements] = useState<string[]>(['prd', 'openapi']);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const resetForm = () => {
    setWorkspaceName('');
    setWorkspaceModule('');
    setRequirementText('');
    setInputMode('direct');
    setSelectedSupplements(['prd', 'openapi']);
  };

  const navigateToWorkspace = async (autoGenerate: boolean) => {
    if (!requirementText.trim()) {
      toast.error('请先输入需求描述');
      return;
    }

    setIsSubmitting(true);
    try {
      const docId = generateWorkspaceId();
      notifyStart(docId);

      onOpenChange(false);
      resetForm();

      const params = new URLSearchParams();
      params.set('docId', docId);
      params.set('autoGenerate', autoGenerate ? 'true' : 'false');
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

  const handleGenerate = async () => {
    await navigateToWorkspace(true);
  };

  const handleCreateOnly = async () => {
    await navigateToWorkspace(false);
  };

  const handleClose = () => {
    if (!isSubmitting) {
      onOpenChange(false);
      resetForm();
    }
  };

  const toggleSupplement = (id: string) => {
    setSelectedSupplements((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    );
  };

  return (
    <Sheet open={open} onOpenChange={handleClose}>
      <SheetContent
        className="flex w-full max-w-[540px] flex-col gap-0 overflow-hidden border-slate-200 bg-[#fcfcff] p-0 [&>button]:right-5 [&>button]:top-5 [&>button]:h-9 [&>button]:w-9 [&>button]:rounded-full [&>button]:border [&>button]:border-slate-200 [&>button]:bg-white/90 [&>button]:text-slate-500 [&>button]:shadow-sm [&>button]:hover:bg-white [&>button]:hover:text-slate-700"
        preventClose={isSubmitting}
      >
        <SheetHeader className="flex-shrink-0 border-b border-slate-200/80 bg-white px-6 pb-5 pt-5">
          <div className="flex items-center gap-3">
            <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-[18px] bg-[linear-gradient(135deg,#ede9fe_0%,#ddd6fe_45%,#c4b5fd_100%)] shadow-[0_12px_32px_rgba(124,58,237,0.18)]">
              <Bot className="h-7 w-7 text-violet-600" />
            </div>
            <div>
              <SheetTitle className="text-[28px] font-black tracking-tight text-slate-900">
                新增 AI 工作台
              </SheetTitle>
              <SheetDescription className="mt-1 max-w-[360px] text-sm leading-6 text-slate-500">
                输入需求背景或导入材料，创建一个可继续补充、生成、执行与回流的 AI 工作台。
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <div className="flex-1 space-y-6 overflow-y-auto bg-[linear-gradient(180deg,#ffffff_0%,#faf7ff_100%)] px-6 py-5">
          <section className="space-y-4">
            <div className="text-base font-bold text-slate-900">基础信息</div>

            <div className="space-y-2">
              <label className="block text-sm font-semibold text-slate-700">
                工作台名称 <span className="text-xs font-normal text-slate-400">（可选）</span>
              </label>
              <Input
                value={workspaceName}
                onChange={(event) => setWorkspaceName(event.target.value)}
                placeholder="例如：登录模块测试设计"
                className="h-11 rounded-xl border-slate-200 bg-white"
              />
              <p className="text-xs leading-5 text-slate-500">
                建议填写清晰的业务模块或场景名称，便于后续继续协作。
              </p>
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-semibold text-slate-700">
                所属模块 <span className="text-xs font-normal text-slate-400">（可选）</span>
              </label>
              <select
                value={workspaceModule}
                onChange={(event) => setWorkspaceModule(event.target.value)}
                className="flex h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none transition focus:border-violet-300 focus:ring-2 focus:ring-violet-100"
              >
                <option value="">请选择模块</option>
                {WORKSPACE_MODULE_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
          </section>

          <section className="space-y-4">
            <div className="text-base font-bold text-slate-900">输入方式</div>
            <div className="grid grid-cols-3 gap-3">
              {INPUT_MODE_OPTIONS.map((option) => {
                const Icon = option.icon;
                const active = inputMode === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setInputMode(option.id)}
                    className={`flex h-11 items-center justify-center gap-2 rounded-xl border text-sm font-semibold transition ${
                      active
                        ? 'border-violet-300 bg-violet-50 text-violet-700 shadow-[0_8px_20px_rgba(124,58,237,0.08)]'
                        : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {option.label}
                  </button>
                );
              })}
            </div>
            <p className="text-xs leading-5 text-slate-500">
              你也可以先创建工作台，再到侧边补充资料或切换更多来源。
            </p>
          </section>

          <section className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <label className="block text-sm font-semibold text-slate-700">
                需求描述 / PRD <span className="text-rose-500">*</span>
              </label>
              <button
                type="button"
                className="text-xs font-semibold text-violet-600 hover:text-violet-700"
                onClick={() => setRequirementText(EXAMPLE_REQUIREMENT_TEXT)}
              >
                试试示例输入
              </button>
            </div>
            <Textarea
              value={requirementText}
              onChange={(event) => setRequirementText(event.target.value)}
              rows={9}
              className="min-h-[180px] resize-none rounded-2xl border-slate-200 bg-white leading-7"
              placeholder="粘贴 PRD、需求描述、验收标准、接口背景或测试上下文。建议包含：业务目标、核心流程、边界条件、异常场景。"
            />
          </section>

          <section className="space-y-4">
            <div>
              <div className="text-sm font-semibold text-slate-700">
                补充材料 <span className="text-xs font-normal text-slate-400">（可选）</span>
              </div>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                补充更多输入来源，可提升 AI 生成结果的准确性。
              </p>
            </div>

            <div className="grid grid-cols-3 gap-3">
              {SUPPLEMENT_OPTIONS.map((option) => {
                const Icon = option.icon;
                const active = selectedSupplements.includes(option.id);
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => toggleSupplement(option.id)}
                    className={`rounded-2xl border bg-white px-3 py-4 text-center transition ${
                      active
                        ? 'border-violet-200 shadow-[0_12px_24px_rgba(124,58,237,0.08)]'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <Icon className={`mx-auto h-5 w-5 ${option.accent}`} />
                    <div className="mt-2 text-xs font-semibold leading-5 text-slate-700">{option.label}</div>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="rounded-2xl border border-violet-100 bg-[linear-gradient(135deg,#faf5ff_0%,#f5f3ff_100%)] p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="text-sm font-bold text-violet-700">创建后你可以继续：</div>
                <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs font-medium text-slate-600">
                  {NEXT_STEP_ITEMS.map((item) => (
                    <div key={item} className="flex items-center gap-2">
                      <span className="h-1.5 w-1.5 rounded-full bg-violet-500" />
                      {item}
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-2xl bg-white/70 shadow-sm">
                <Sparkles className="h-7 w-7 text-violet-500" />
              </div>
            </div>
          </section>
        </div>

        <div className="flex-shrink-0 border-t border-slate-200 bg-white px-6 py-4">
          <div className="flex gap-3">
            <Button
              variant="outline"
              className="h-11 flex-1 rounded-xl border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              onClick={handleClose}
              disabled={isSubmitting}
            >
              取消
            </Button>
            <Button
              variant="outline"
              className="h-11 flex-1 rounded-xl border-violet-200 bg-white text-violet-700 hover:bg-violet-50"
              onClick={handleCreateOnly}
              disabled={isSubmitting || !requirementText.trim()}
            >
              保存并继续补充
            </Button>
            <Button
              className="h-11 flex-[1.35] gap-2 rounded-xl bg-indigo-600 text-white hover:bg-indigo-700"
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
                  创建并生成首版用例
                </>
              )}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

interface HeroSectionProps {
  onCreate: () => void;
  onCreateFromTemplate: () => void;
  onViewExample: () => void;
}

function HeroSection({
  onCreate,
  onCreateFromTemplate,
  onViewExample,
}: HeroSectionProps) {
  return (
    <section className="relative overflow-hidden rounded-[32px] border border-slate-200/80 bg-white px-8 py-8 shadow-[0_24px_80px_rgba(15,23,42,0.06)] dark:border-slate-800 dark:bg-slate-900">
      <div className="pointer-events-none absolute -right-24 -top-28 h-80 w-80 rounded-full bg-[radial-gradient(circle,_rgba(99,102,241,0.16),_transparent_68%)]" />
      <div className="pointer-events-none absolute right-20 top-0 h-64 w-64 rounded-full bg-[radial-gradient(circle,_rgba(191,219,254,0.28),_transparent_68%)]" />
      <div className="pointer-events-none absolute right-0 top-8 h-56 w-[420px] rounded-full bg-[conic-gradient(from_210deg_at_50%_50%,rgba(255,255,255,0)_0deg,rgba(129,140,248,0.12)_80deg,rgba(255,255,255,0)_210deg)] blur-2xl" />

      <div className="relative flex flex-col gap-8">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
          <div className="max-w-3xl">
            <h1 className="text-4xl font-black tracking-tight text-slate-900 dark:text-white sm:text-5xl">
              AI 工作台
            </h1>
            <p className="mt-4 text-lg leading-8 text-slate-600 dark:text-slate-300">
              输入需求并生成结构化测试用例，继续完成筛选、补充、执行与回流。
            </p>

            <div className="mt-5 flex flex-wrap gap-3">
              {MATERIAL_CHIPS.map((chip) => {
                const Icon = chip.icon;
                return (
                  <span
                    key={chip.label}
                    className={`inline-flex items-center gap-2 rounded-xl border px-3.5 py-2 text-sm font-medium ${chip.tone}`}
                  >
                    <Icon className="h-4 w-4" />
                    {chip.label}
                  </span>
                );
              })}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 xl:justify-end">
            <Button
              type="button"
              size="lg"
              className="h-12 rounded-xl bg-indigo-600 px-5 text-sm font-semibold text-white shadow-sm shadow-indigo-600/20 hover:bg-indigo-700"
              onClick={onCreate}
            >
              <Plus className="mr-2 h-4 w-4" />
              新增需求
            </Button>
            <Button
              type="button"
              size="lg"
              variant="outline"
              className="h-12 rounded-xl border-slate-200 bg-white px-5 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
              onClick={onCreateFromTemplate}
            >
              <BookOpen className="mr-2 h-4 w-4" />
              从模板创建
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="h-12 rounded-xl px-3 text-sm font-semibold text-indigo-600 hover:bg-indigo-50 hover:text-indigo-700 dark:text-indigo-300 dark:hover:bg-indigo-500/10 dark:hover:text-indigo-200"
              onClick={onViewExample}
            >
              查看示例
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}

interface QuickStartSectionProps {
  items: QuickStartCardItem[];
}

function QuickStartSection({ items }: QuickStartSectionProps) {
  return (
    <section className="space-y-4">
      <h2 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">快速开始</h2>

      <div className="grid gap-4 xl:grid-cols-3">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.title}
              type="button"
              onClick={item.onClick}
              className="group rounded-[26px] border border-slate-200 bg-white p-5 text-left shadow-[0_18px_45px_rgba(15,23,42,0.04)] transition-all hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-[0_20px_50px_rgba(79,70,229,0.08)] dark:border-slate-800 dark:bg-slate-900 dark:hover:border-indigo-500/30"
            >
              <div className="flex items-start gap-4">
                <div className={`flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-2xl ${item.iconTone}`}>
                  <Icon className="h-7 w-7" />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-2xl font-semibold text-slate-900 dark:text-white">
                        {item.title}
                      </div>
                      <div className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
                        {item.description}
                      </div>
                    </div>
                    <ChevronRight className="mt-1 h-5 w-5 flex-shrink-0 text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-indigo-500 dark:text-slate-600" />
                  </div>

                  <div className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-indigo-600 dark:text-indigo-300">
                    {item.actionLabel}
                    <ArrowRight className="h-4 w-4" />
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}

interface RecentWorkspacePanelProps {
  docs: AiCaseWorkspaceDocument[];
  metrics: Map<string, WorkspaceMetrics>;
  onOpen: (id: string) => void;
  onCreate: () => void;
  onCreateFromTemplate: () => void;
  onViewAll: () => void;
  onViewExample: () => void;
}

function RecentWorkspacePanel({
  docs,
  metrics,
  onOpen,
  onCreate,
  onCreateFromTemplate,
  onViewAll,
  onViewExample,
}: RecentWorkspacePanelProps) {
  return (
    <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_18px_45px_rgba(15,23,42,0.04)] dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-5 flex items-center justify-between gap-3">
        <h3 className="text-2xl font-semibold text-slate-900 dark:text-white">最近继续</h3>
        <Button
          type="button"
          variant="ghost"
          className="px-0 text-sm font-semibold text-indigo-600 hover:bg-transparent hover:text-indigo-700 dark:text-indigo-300 dark:hover:text-indigo-200"
          onClick={onViewAll}
        >
          查看全部
          <ArrowRight className="ml-1 h-4 w-4" />
        </Button>
      </div>

      {docs.length === 0 ? (
        <div className="rounded-[24px] border border-dashed border-slate-200 bg-slate-50/60 px-6 py-12 text-center dark:border-slate-800 dark:bg-slate-950/40">
          <div className="mx-auto flex h-28 w-28 items-center justify-center rounded-full bg-[radial-gradient(circle_at_50%_40%,rgba(129,140,248,0.18),rgba(255,255,255,0)_70%)]">
            <Clock3 className="h-12 w-12 text-slate-400 dark:text-slate-500" />
          </div>
          <div className="mt-5 text-4xl font-bold tracking-tight text-slate-900 dark:text-white">
            暂无最近工作台
          </div>
          <p className="mx-auto mt-3 max-w-xl text-base leading-7 text-slate-500 dark:text-slate-400">
            创建第一条需求后，你可以在这里继续未完成的 AI 工作台。
          </p>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Button
              type="button"
              className="h-11 rounded-xl bg-indigo-600 px-6 text-sm font-semibold text-white hover:bg-indigo-700"
              onClick={onCreate}
            >
              新增需求
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-11 rounded-xl border-slate-200 bg-white px-6 text-sm font-semibold dark:border-slate-700 dark:bg-slate-900"
              onClick={onCreateFromTemplate}
            >
              从模板创建
            </Button>
          </div>

          <div className="mt-8 border-t border-slate-200 pt-5 text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400">
            也可以先
            <button
              type="button"
              className="mx-1 font-semibold text-indigo-600 hover:text-indigo-700 dark:text-indigo-300 dark:hover:text-indigo-200"
              onClick={onViewExample}
            >
              查看示例
            </button>
            ，了解完整工作流。
          </div>
        </div>
      ) : (
        <div className="space-y-3">
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
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4 text-left transition-colors hover:border-indigo-200 hover:bg-white dark:border-slate-800 dark:bg-slate-950 dark:hover:border-indigo-500/30 dark:hover:bg-slate-900"
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0">
                    <div className="line-clamp-1 text-lg font-semibold text-slate-900 dark:text-white">
                      {doc.name}
                    </div>
                    <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                      最近更新：{formatRelativeTime(doc.updatedAt)}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${status.className}`}>
                      {status.label}
                    </span>
                    <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-600 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-700">
                      模块 {currentMetrics.moduleCount}
                    </span>
                    <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-600 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-700">
                      用例 {currentMetrics.progress.total}
                    </span>
                    <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-600 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-700">
                      完成率 {currentMetrics.progress.completionRate}%
                    </span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function FirstUseTipsPanel({ onViewExample }: { onViewExample: () => void }) {
  return (
    <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_18px_45px_rgba(15,23,42,0.04)] dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-5 text-2xl font-semibold text-slate-900 dark:text-white">首次使用建议</div>

      <div className="space-y-5">
        {FIRST_USE_STEPS.map((step, index) => {
          const Icon = step.icon;
          const isLast = index === FIRST_USE_STEPS.length - 1;

          return (
            <div key={step.title} className="relative flex gap-4">
              {!isLast ? (
                <div className="absolute left-[16px] top-9 h-[calc(100%+12px)] w-px border-l border-dashed border-slate-200 dark:border-slate-700" />
              ) : null}

              <div className="relative flex flex-col items-center">
                <div className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold ${step.indexTone}`}>
                  {index + 1}
                </div>
              </div>

              <div className="flex min-w-0 flex-1 gap-3 rounded-2xl bg-slate-50/80 px-3 py-3 dark:bg-slate-950/50">
                <div className={`flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl ${step.tone}`}>
                  <Icon className="h-6 w-6" />
                </div>
                <div className="min-w-0">
                  <div className="text-lg font-semibold text-slate-900 dark:text-white">
                    {step.title}
                  </div>
                  <div className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">
                    {step.description}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <Button
        type="button"
        variant="ghost"
        className="mt-6 h-11 w-full rounded-2xl bg-slate-50 text-sm font-semibold text-indigo-600 hover:bg-indigo-50 hover:text-indigo-700 dark:bg-slate-950 dark:text-indigo-300 dark:hover:bg-indigo-500/10 dark:hover:text-indigo-200"
        onClick={onViewExample}
      >
        查看完整工作流
        <ArrowRight className="ml-1 h-4 w-4" />
      </Button>
    </div>
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
    <section className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-[0_18px_45px_rgba(15,23,42,0.04)] dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">全部历史记录</h2>
        </div>
        <Button
          type="button"
          variant="ghost"
          className="px-0 text-sm font-semibold text-indigo-600 hover:bg-transparent hover:text-indigo-700 dark:text-indigo-300 dark:hover:text-indigo-200"
          onClick={onViewAll}
        >
          查看全部
          <ArrowRight className="ml-1 h-4 w-4" />
        </Button>
      </div>

      <div className="mt-5 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="relative w-full max-w-[520px]">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={searchValue}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="搜索工作台名称..."
            className="h-11 rounded-xl border-slate-200 bg-white pl-11 text-sm dark:border-slate-700 dark:bg-slate-900"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant="outline"
            className="h-11 rounded-xl border-slate-200 bg-white px-4 text-sm font-medium dark:border-slate-700 dark:bg-slate-900"
            onClick={onToggleFilter}
          >
            <Filter className="mr-2 h-4 w-4" />
            筛选: {HISTORY_FILTER_LABELS[historyFilter]}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-11 rounded-xl border-slate-200 bg-white px-4 text-sm font-medium dark:border-slate-700 dark:bg-slate-900"
            onClick={onToggleSort}
          >
            <ArrowUpDown className="mr-2 h-4 w-4" />
            排序: {HISTORY_SORT_LABELS[historySort]}
          </Button>
        </div>
      </div>

      <div className="mt-4 overflow-hidden rounded-[24px] border border-slate-200 dark:border-slate-800">
        {docs.length === 0 ? (
          <div className="flex min-h-[240px] items-center justify-center bg-white px-6 py-10 dark:bg-slate-900">
            <div className="flex flex-col items-center gap-4 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-violet-50 text-violet-500 dark:bg-violet-500/10 dark:text-violet-300">
                <Inbox className="h-8 w-8" />
              </div>
              <div>
                <div className="text-2xl font-semibold text-slate-900 dark:text-white">暂无历史记录</div>
                <div className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
                  创建第一条需求后，这里会展示你的历史工作台。
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-800">
              <thead className="bg-slate-50 dark:bg-slate-950/60">
                <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
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
                        <div className="max-w-[280px]">
                          <div className="line-clamp-1 font-semibold text-slate-900 dark:text-white">
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
                        <div className="min-w-[140px]">
                          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                            <span>
                              {currentMetrics.progress.done}/{currentMetrics.progress.total}
                            </span>
                            <span>{currentMetrics.progress.completionRate}%</span>
                          </div>
                          <div className="mt-2 h-2 rounded-full bg-slate-100 dark:bg-slate-800">
                            <div
                              className="h-2 rounded-full bg-indigo-500 transition-all"
                              style={{ width: `${Math.min(currentMetrics.progress.completionRate, 100)}%` }}
                            />
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4 text-right">
                        <Button
                          type="button"
                          variant="ghost"
                          className="h-8 px-2 text-sm font-semibold text-indigo-600 hover:bg-indigo-50 hover:text-indigo-700 dark:text-indigo-300 dark:hover:bg-indigo-500/10 dark:hover:text-indigo-200"
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
  }, [historyFilter, historySearch, historySort, sortedDocs]);

  const handleOpen = useCallback(
    (id: string) => setLocation(`/cases/ai?docId=${encodeURIComponent(id)}`),
    [setLocation]
  );

  const handleViewAll = useCallback(() => {
    setLocation('/cases/ai-history');
  }, [setLocation]);

  const handleCreateFromTemplate = useCallback(() => {
    toast.info('模板创建能力正在接入，当前可先通过新增需求创建工作台');
  }, []);

  const handleViewExample = useCallback(() => {
    toast.info('示例工作台入口预留中，当前可先创建一条需求体验完整流程');
  }, []);

  const handleImportMaterials = useCallback(() => {
    toast.info('资料导入入口预留中，当前可先把核心内容粘贴到新增需求中');
  }, []);

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

  const quickStartItems = useMemo<QuickStartCardItem[]>(
    () => [
      {
        title: '新建需求',
        description: '从 PRD、需求描述或原型开始生成测试用例',
        actionLabel: '立即创建',
        icon: FileText,
        iconTone: 'bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-300',
        onClick: () => setSheetOpen(true),
      },
      {
        title: '导入资料',
        description: '上传接口文档、附件、缺陷单和代码变更',
        actionLabel: '去导入',
        icon: FolderUp,
        iconTone: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300',
        onClick: handleImportMaterials,
      },
      {
        title: '查看示例',
        description: '查看一条完整的 AI 工作台示例，快速理解流程',
        actionLabel: '查看示例',
        icon: BookOpen,
        iconTone: 'bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-300',
        onClick: handleViewExample,
      },
    ],
    [handleImportMaterials, handleViewExample]
  );

  return (
    <div className="h-full overflow-y-auto bg-[#f6f8fc] dark:bg-slate-950">
      <div className="mx-auto max-w-[1320px] px-6 py-8">
        {loading ? (
          <div className="space-y-6">
            <div className="rounded-[32px] border border-slate-200 bg-white px-8 py-8 shadow-[0_18px_45px_rgba(15,23,42,0.04)] dark:border-slate-800 dark:bg-slate-900">
              <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                <div className="space-y-4">
                  <div className="h-12 w-52 animate-pulse rounded-xl bg-slate-200 dark:bg-slate-800" />
                  <div className="h-6 w-[420px] max-w-full animate-pulse rounded-xl bg-slate-200 dark:bg-slate-800" />
                  <div className="flex flex-wrap gap-3">
                    {[1, 2, 3, 4].map((item) => (
                      <div key={item} className="h-10 w-36 animate-pulse rounded-xl bg-slate-200 dark:bg-slate-800" />
                    ))}
                  </div>
                </div>
                <div className="flex gap-3">
                  <div className="h-12 w-32 animate-pulse rounded-xl bg-slate-200 dark:bg-slate-800" />
                  <div className="h-12 w-36 animate-pulse rounded-xl bg-slate-200 dark:bg-slate-800" />
                </div>
              </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-3">
              {[1, 2, 3].map((item) => (
                <div
                  key={item}
                  className="rounded-[26px] border border-slate-200 bg-white p-5 shadow-[0_18px_45px_rgba(15,23,42,0.04)] dark:border-slate-800 dark:bg-slate-900"
                >
                  <div className="flex gap-4">
                    <div className="h-14 w-14 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800" />
                    <div className="flex-1 space-y-3">
                      <div className="h-8 w-32 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />
                      <div className="h-4 w-full animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
                      <div className="h-4 w-2/3 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
              {[1, 2].map((item) => (
                <div
                  key={item}
                  className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_18px_45px_rgba(15,23,42,0.04)] dark:border-slate-800 dark:bg-slate-900"
                >
                  <div className="h-8 w-44 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />
                  <div className="mt-5 h-64 animate-pulse rounded-[24px] bg-slate-100 dark:bg-slate-800" />
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <HeroSection
              onCreate={() => setSheetOpen(true)}
              onCreateFromTemplate={handleCreateFromTemplate}
              onViewExample={handleViewExample}
            />

            <QuickStartSection items={quickStartItems} />

            <section className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
              <RecentWorkspacePanel
                docs={recentDocs}
                metrics={metricsById}
                onOpen={handleOpen}
                onCreate={() => setSheetOpen(true)}
                onCreateFromTemplate={handleCreateFromTemplate}
                onViewAll={handleViewAll}
                onViewExample={handleViewExample}
              />
              <FirstUseTipsPanel onViewExample={handleViewExample} />
            </section>

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
