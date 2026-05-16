import { useState } from 'react';
import { useLocation } from 'wouter';
import { Bot, Boxes, Bug, Code2, FileText, FolderUp, Link2, Loader2, NotebookTabs, PencilLine, Sparkles } from 'lucide-react';
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
import { useAiGeneration } from '@/contexts/AiGenerationContext';

function generateWorkspaceId(): string {
  return `ai-ws-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

type WorkspaceInputMode = 'direct' | 'upload' | 'template';

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

interface NewRequirementSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function NewRequirementSheet({ open, onOpenChange }: NewRequirementSheetProps) {
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
                aria-label="所属模块"
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
