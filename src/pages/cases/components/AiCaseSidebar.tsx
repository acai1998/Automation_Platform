import { type ChangeEvent, type ReactNode, useCallback, useEffect, useState } from 'react';
import {
  Bot, CheckCircle2, ChevronDown, Circle, Clock3, Download,
  FileText, History, ImageIcon, Loader2, PauseCircle,
  RotateCcw, ShieldAlert, Upload, XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import { aiCasesApi, type AiCaseWorkspaceSummary } from '@/api';
import { exportMindDataToMarkdown, downloadTextFile } from '@/lib/aiCaseStorage';
import type {
  AiCaseAttachmentPreview, AiCaseMindData, AiCaseNode,
  AiCaseNodeStatus, AiCaseProgress,
} from '@/types/aiCases';

const STATUS_ACTIONS: Array<{
  status: AiCaseNodeStatus; label: string; icon: ReactNode;
  activeClass: string; idleClass: string;
}> = [
  { status: 'todo', label: '待执行', icon: <Circle className="h-3.5 w-3.5" />,
    activeClass: 'border-slate-400 bg-slate-100 text-slate-700 dark:border-slate-500 dark:bg-slate-700 dark:text-slate-200',
    idleClass: 'border-slate-200 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800' },
  { status: 'doing', label: '执行中', icon: <Clock3 className="h-3.5 w-3.5" />,
    activeClass: 'border-blue-400 bg-blue-100 text-blue-700 dark:border-blue-500 dark:bg-blue-900/30 dark:text-blue-300',
    idleClass: 'border-slate-200 text-slate-600 hover:bg-blue-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-blue-900/20' },
  { status: 'blocked', label: '阻塞', icon: <ShieldAlert className="h-3.5 w-3.5" />,
    activeClass: 'border-amber-400 bg-amber-100 text-amber-700 dark:border-amber-500 dark:bg-amber-900/30 dark:text-amber-300',
    idleClass: 'border-slate-200 text-slate-600 hover:bg-amber-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-amber-900/20' },
  { status: 'passed', label: '通过', icon: <CheckCircle2 className="h-3.5 w-3.5" />,
    activeClass: 'border-emerald-400 bg-emerald-100 text-emerald-700 dark:border-emerald-500 dark:bg-emerald-900/30 dark:text-emerald-300',
    idleClass: 'border-slate-200 text-slate-600 hover:bg-emerald-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-emerald-900/20' },
  { status: 'failed', label: '失败', icon: <XCircle className="h-3.5 w-3.5" />,
    activeClass: 'border-rose-400 bg-rose-100 text-rose-700 dark:border-rose-500 dark:bg-rose-900/30 dark:text-rose-300',
    idleClass: 'border-slate-200 text-slate-600 hover:bg-rose-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-rose-900/20' },
  { status: 'skipped', label: '跳过', icon: <PauseCircle className="h-3.5 w-3.5" />,
    activeClass: 'border-purple-400 bg-purple-100 text-purple-700 dark:border-purple-500 dark:bg-purple-900/30 dark:text-purple-300',
    idleClass: 'border-slate-200 text-slate-600 hover:bg-purple-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-purple-900/20' },
];

const PROGRESS_METRICS: Array<{ key: keyof AiCaseProgress; label: string; color: string; dotClass: string }> = [
  { key: 'passed',  label: '通过',  color: '#10b981', dotClass: 'bg-emerald-500' },
  { key: 'failed',  label: '失败',  color: '#f43f5e', dotClass: 'bg-rose-500'    },
  { key: 'doing',   label: '执行中', color: '#3b82f6', dotClass: 'bg-blue-500'   },
  { key: 'blocked', label: '阻塞',  color: '#f59e0b', dotClass: 'bg-amber-500'   },
  { key: 'skipped', label: '跳过',  color: '#a855f7', dotClass: 'bg-purple-500'  },
  { key: 'todo',    label: '待执行', color: '#94a3b8', dotClass: 'bg-slate-400'  },
];

function SidebarSection({
  title, icon, defaultOpen = true, highlight, badge, children,
}: {
  title: string; icon: ReactNode; defaultOpen?: boolean;
  highlight?: boolean; badge?: number; children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-slate-100 dark:border-slate-800 last:border-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`w-full flex items-center justify-between px-4 py-2.5 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50 ${highlight ? 'bg-indigo-50/40 dark:bg-indigo-900/10' : ''}`}
      >
        <span className={`flex items-center gap-2 text-xs font-semibold uppercase tracking-wide ${highlight ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-500 dark:text-slate-400'}`}>
          {icon}
          {title}
          {typeof badge === 'number' && badge > 0
            ? <span className="ml-0.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-indigo-500 px-1 text-[9px] font-bold text-white">{badge}</span>
            : null}
        </span>
        <ChevronDown className={`h-3.5 w-3.5 text-slate-400 transition-transform duration-200 ${open ? '' : '-rotate-90'}`} />
      </button>
      {open ? <div className="px-4 pb-4">{children}</div> : null}
    </div>
  );
}

function DonutChart({ progress }: { progress: AiCaseProgress }) {
  const SIZE = 88; const STROKE = 10;
  const RADIUS = (SIZE - STROKE) / 2;
  const CIRC = 2 * Math.PI * RADIUS;
  const total = Math.max(progress.total, 1);
  type Seg = { key: keyof AiCaseProgress; color: string; dotClass: string; label: string; value: number; dash: number; offset: number };
  const segs: Seg[] = [];
  let acc = 0;
  for (const m of PROGRESS_METRICS) {
    const value = progress[m.key] as number;
    if (value <= 0) continue;
    const dash = (value / total) * CIRC;
    segs.push({ ...m, value, dash, offset: CIRC - acc });
    acc += dash;
  }
  return (
    <div className="flex items-center gap-3">
      <div className="relative shrink-0">
        <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} className="-rotate-90">
          <circle cx={SIZE / 2} cy={SIZE / 2} r={RADIUS} fill="none" stroke="currentColor" strokeWidth={STROKE} className="text-slate-100 dark:text-slate-800" />
          {segs.map((s) => (
            <circle key={String(s.key)} cx={SIZE / 2} cy={SIZE / 2} r={RADIUS} fill="none" stroke={s.color} strokeWidth={STROKE}
              strokeDasharray={`${s.dash} ${CIRC - s.dash}`} strokeDashoffset={s.offset} />
          ))}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-base font-bold text-slate-800 dark:text-white leading-none tabular-nums">{progress.completionRate}%</span>
          <span className="text-[9px] text-slate-400 mt-0.5">完成率</span>
        </div>
      </div>
      <div className="flex-1 grid grid-cols-2 gap-x-2 gap-y-1.5">
        <div className="col-span-2 text-[11px] text-slate-500 mb-0.5">
          共 <span className="font-semibold text-slate-700 dark:text-white">{progress.total}</span> 个测试点
        </div>
        {PROGRESS_METRICS.map((m) => (
          <div key={String(m.key)} className="flex items-center gap-1.5 text-[11px] text-slate-600 dark:text-slate-400">
            <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${m.dotClass}`} />
            <span className="truncate">{m.label}</span>
            <span className="ml-auto font-semibold text-slate-700 dark:text-slate-200 tabular-nums">{progress[m.key] as number}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function HistoryWorkspaceList({
  onLoadWorkspace, currentRemoteId,
}: {
  onLoadWorkspace: (id: number) => void;
  currentRemoteId: number | null;
}) {
  const [list, setList] = useState<AiCaseWorkspaceSummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const load = useCallback(async () => {
    setIsLoading(true);
    try { const res = await aiCasesApi.listWorkspaces({ limit: 10 }); setList(res.data ?? []); }
    catch { toast.error('获取历史工作台失败'); }
    finally { setIsLoading(false); }
  }, []);
  useEffect(() => { if (expanded) void load(); }, [expanded, load]);

  if (!expanded) {
    return (
      <button type="button" onClick={() => setExpanded(true)}
        className="flex items-center gap-1.5 text-xs text-indigo-600 dark:text-indigo-400 hover:underline underline-offset-2">
        <History className="h-3.5 w-3.5" />查看历史工作台记录
      </button>
    );
  }
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-slate-500">最近 10 条</span>
        <button type="button" onClick={() => void load()}
          className="text-[11px] text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1" disabled={isLoading}>
          {isLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : '刷新'}
        </button>
      </div>
      {isLoading && list.length === 0 ? (
        <div className="flex items-center gap-1.5 py-2 text-[11px] text-slate-400"><Loader2 className="h-3.5 w-3.5 animate-spin" />加载中...</div>
      ) : list.length === 0 ? (
        <div className="text-[11px] text-slate-400 py-2">暂无远端工作台记录</div>
      ) : (
        <div className="space-y-1.5 max-h-52 overflow-y-auto pr-0.5">
          {list.map((item) => (
            <button key={item.id} type="button" onClick={() => onLoadWorkspace(item.id)}
              className={`w-full text-left rounded-md border px-2.5 py-2 text-[11px] transition-colors ${
                currentRemoteId === item.id
                  ? 'border-indigo-300 bg-indigo-50 dark:border-indigo-500/60 dark:bg-indigo-900/20'
                  : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-indigo-300 hover:bg-indigo-50/60 dark:hover:bg-indigo-900/10'
              }`}>
              <div className="flex items-start justify-between gap-1">
                <span className="font-medium text-slate-800 dark:text-slate-100 truncate flex-1">{item.name}</span>
                <span className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium ${
                  item.status === 'published' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                  : item.status === 'archived' ? 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                  : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'}`}>
                  {item.status === 'published' ? '已发布' : item.status === 'archived' ? '已归档' : '草稿'}
                </span>
              </div>
              <div className="text-slate-400 mt-0.5">{item.counters.totalCases} 个用例 · v{item.version}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export interface AiCaseSidebarProps {
  workspaceName: string; requirementText: string;
  onWorkspaceNameChange: (v: string) => void; onRequirementTextChange: (v: string) => void;
  isGenerating: boolean; generationProgress: number; generationStageText: string; onGenerate: () => void;
  progress: AiCaseProgress;
  selectedNode: AiCaseNode | null; selectedNodeStatus: AiCaseNodeStatus;
  canEditSelectedNode: boolean; isUpdatingNodeStatus: boolean; onStatusChange: (status: AiCaseNodeStatus) => void;
  attachments: AiCaseAttachmentPreview[]; isUploading: boolean;
  onUploadAttachment: (event: ChangeEvent<HTMLInputElement>) => void; onDeleteAttachment: (id: string) => void;
  isRemoteLinked: boolean; remoteWorkspaceId: number | null;
  isPublishingRemote: boolean; isSyncingRemote: boolean;
  onPublishRemote: () => void; onSyncFromRemote: () => void;
  onResetTemplate: () => void; onLoadHistoryWorkspace: (id: number) => void;
  mindData: AiCaseMindData | null;
}

export function AiCaseSidebar({
  workspaceName, requirementText, onWorkspaceNameChange, onRequirementTextChange,
  isGenerating, generationProgress, generationStageText, onGenerate, progress,
  selectedNode, selectedNodeStatus, canEditSelectedNode, isUpdatingNodeStatus, onStatusChange,
  attachments, isUploading, onUploadAttachment, onDeleteAttachment,
  isRemoteLinked, remoteWorkspaceId, isPublishingRemote, isSyncingRemote,
  onPublishRemote, onSyncFromRemote, onResetTemplate, onLoadHistoryWorkspace, mindData,
}: AiCaseSidebarProps) {
  const isBusy = isGenerating || isPublishingRemote || isSyncingRemote;
  const hasSelectedNode = Boolean(selectedNode);
  const selectedNodeLabel = selectedNode?.topic ?? '未选中节点';

  const handleExportMarkdown = useCallback(() => {
    if (!mindData) { toast.error('脑图数据尚未加载，无法导出'); return; }
    const md = exportMindDataToMarkdown(mindData);
    const safeTitle = (workspaceName || 'AI-Testcase').replace(/[^a-zA-Z0-9\u4e00-\u9fa5_-]/g, '_');
    downloadTextFile(md, `${safeTitle}.md`);
    toast.success('测试用例已导出为 Markdown');
  }, [mindData, workspaceName]);

  return (
    <aside className="h-full flex flex-col overflow-y-auto overflow-x-hidden bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800">

      {/* ══ 需求输入 ══════════════════════════════════════ */}
      <SidebarSection title="需求输入" icon={<FileText className="h-3.5 w-3.5" />} defaultOpen>
        <div className="space-y-2.5">
          <div className="space-y-1">
            <label className="block text-[11px] text-slate-500 dark:text-slate-400 font-medium">工作台名称</label>
            <input value={workspaceName} onChange={(e) => onWorkspaceNameChange(e.target.value)}
              className="h-8 w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 text-sm text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-400/40 focus:border-indigo-400 transition-colors"
              placeholder="输入工作台标题" />
          </div>
          <div className="space-y-1">
            <label className="block text-[11px] text-slate-500 dark:text-slate-400 font-medium">需求描述 / PRD</label>
            <textarea value={requirementText} onChange={(e) => onRequirementTextChange(e.target.value)} rows={8}
              className="w-full resize-none rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-2.5 text-sm leading-6 text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-400/40 focus:border-indigo-400 transition-colors"
              placeholder="粘贴 PRD、需求描述或技术方案，点击「AI 生成」按钮自动生成测试用例脑图..." />
          </div>
          <Button className="w-full gap-2 bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm" onClick={onGenerate} disabled={isBusy}>
            {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bot className="h-4 w-4" />}
            {isGenerating ? 'AI 生成中...' : 'AI 生成测试用例'}
          </Button>
          {(isGenerating || generationProgress > 0) ? (
            <div className="space-y-1.5 rounded-lg bg-indigo-50/70 dark:bg-indigo-900/15 border border-indigo-100 dark:border-indigo-800/30 p-2.5">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-indigo-700 dark:text-indigo-300 truncate">{generationStageText || '正在处理...'}</span>
                <span className="shrink-0 ml-2 font-semibold text-indigo-700 dark:text-indigo-300 tabular-nums">{generationProgress}%</span>
              </div>
              <Progress value={generationProgress} className="h-1.5 bg-indigo-100 dark:bg-indigo-900/40 [&>div]:bg-indigo-500" />
            </div>
          ) : null}
        </div>
      </SidebarSection>

      {/* ══ 执行进度 ══════════════════════════════════════ */}
      <SidebarSection title="执行进度" icon={<CheckCircle2 className="h-3.5 w-3.5" />} defaultOpen>
        {progress.total === 0 ? (
          <p className="text-[11px] text-slate-400 py-1">AI 生成后此处显示进度统计</p>
        ) : (
          <div className="space-y-3">
            <DonutChart progress={progress} />
            <div>
              <div className="flex items-center justify-between text-[11px] text-slate-500 mb-1">
                <span>整体进度</span>
                <span className="font-medium text-slate-700 dark:text-slate-200">{progress.done} / {progress.total}</span>
              </div>
              <Progress value={progress.completionRate} className="h-1.5 bg-slate-100 dark:bg-slate-800 [&>div]:bg-emerald-500" />
            </div>
          </div>
        )}
      </SidebarSection>

      {/* ══ 节点操作 ══════════════════════════════════════ */}
      <SidebarSection title="节点操作" icon={<Circle className="h-3.5 w-3.5" />} defaultOpen={hasSelectedNode} highlight={hasSelectedNode}>
        <div className="space-y-3">
          <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 p-2.5">
            <div className="text-[10px] uppercase tracking-wide text-slate-400 font-medium mb-1">当前选中节点</div>
            {hasSelectedNode ? (
              <>
                <p className="text-sm font-medium text-slate-800 dark:text-white break-words leading-snug">{selectedNodeLabel}</p>
                <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                  {(() => {
                    const a = STATUS_ACTIONS.find((x) => x.status === selectedNodeStatus);
                    if (!a) return null;
                    return <span className={`inline-flex items-center gap-1 text-[11px] font-medium px-1.5 py-0.5 rounded border ${a.activeClass}`}>{a.icon}{a.label}</span>;
                  })()}
                  {!canEditSelectedNode ? <span className="text-[10px] text-slate-400">（仅测试点可切换状态）</span> : null}
                </div>
                {/* 展示 testcase 的链式子节点（前置条件→测试步骤→预期结果） */}
                {canEditSelectedNode ? (() => {
                  // 新链式格式：testcase → 前置条件 → 测试步骤 → 预期结果（每级1个子节点）
                  const preconditionNode = (selectedNode?.children as AiCaseNode[] | undefined)?.[0];
                  const stepsNode = (preconditionNode?.children as AiCaseNode[] | undefined)?.[0];
                  const expectedNode = (stepsNode?.children as AiCaseNode[] | undefined)?.[0];

                  const sections: Array<{ label: string; topic: string; colorClass: string }> = [];
                  if (preconditionNode?.topic) {
                    sections.push({ label: '前置条件', topic: preconditionNode.topic.trim(), colorClass: 'bg-yellow-50 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400' });
                  }
                  if (stepsNode?.topic) {
                    sections.push({ label: '测试步骤', topic: stepsNode.topic.trim(), colorClass: 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400' });
                  }
                  if (expectedNode?.topic) {
                    sections.push({ label: '预期结果', topic: expectedNode.topic.trim(), colorClass: 'bg-pink-50 text-pink-700 dark:bg-pink-900/20 dark:text-pink-400' });
                  }

                  // 兼容仅有 note 的旧格式
                  if (sections.length === 0 && selectedNode?.note) {
                    const labelColors: Record<string, string> = {
                      '前置条件': 'bg-yellow-50 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400',
                      '测试步骤': 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400',
                      '预期结果': 'bg-pink-50 text-pink-700 dark:bg-pink-900/20 dark:text-pink-400',
                    };
                    return (
                      <div className="mt-2 space-y-1">
                        {selectedNode.note.split(/\r?\n/).map((line, idx) => {
                          const trimmed = line.trim();
                          if (!trimmed) return null;
                          const m = trimmed.match(/^(前置条件|测试步骤|预期结果)[：:]\s*([\s\S]*)$/);
                          if (m) {
                            return (
                              <div key={idx} className="rounded-md p-1.5">
                                <span className={`inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded mb-0.5 ${labelColors[m[1]] ?? 'bg-slate-50 text-slate-600'}`}>{m[1]}</span>
                                <p className="text-[11px] text-slate-600 dark:text-slate-400 whitespace-pre-wrap leading-relaxed">{m[2]}</p>
                              </div>
                            );
                          }
                          return <p key={idx} className="text-[11px] text-slate-500 whitespace-pre-wrap">{trimmed}</p>;
                        })}
                      </div>
                    );
                  }

                  if (sections.length === 0) return null;
                  return (
                    <div className="mt-2 space-y-1">
                      {sections.map((s, idx) => (
                        <div key={idx} className="rounded-md p-1.5">
                          <span className={`inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded mb-0.5 ${s.colorClass}`}>{s.label}</span>
                          <p className="text-[11px] text-slate-600 dark:text-slate-400 whitespace-pre-wrap leading-relaxed">{s.topic}</p>
                        </div>
                      ))}
                    </div>
                  );
                })() : null}
              </>
            ) : (
              <p className="text-[11px] text-slate-400">请在脑图中点击一个节点</p>
            )}
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {STATUS_ACTIONS.map((item) => {
              const isActive = hasSelectedNode && selectedNodeStatus === item.status;
              return (
                <button key={item.status} type="button"
                  onClick={() => void onStatusChange(item.status)}
                  disabled={!canEditSelectedNode || isUpdatingNodeStatus}
                  className={`h-8 rounded-md border text-xs font-medium flex items-center justify-center gap-1 transition-all disabled:opacity-40 disabled:cursor-not-allowed ${isActive ? `${item.activeClass} ring-2 ring-inset ring-indigo-300 dark:ring-indigo-600` : item.idleClass}`}>
                  {isUpdatingNodeStatus && isActive ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : item.icon}
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>
      </SidebarSection>

      {/* ══ 截图证据 ══════════════════════════════════════ */}
      <SidebarSection title="截图证据" icon={<ImageIcon className="h-3.5 w-3.5" />} defaultOpen={false} badge={attachments.length} highlight={attachments.length > 0}>
        <div className="space-y-2.5">
          <label className={`flex items-center gap-2 cursor-pointer ${!canEditSelectedNode || isUploading ? 'opacity-50 pointer-events-none' : ''}`}>
            <span className="inline-flex h-8 items-center gap-1.5 rounded-md border border-dashed border-slate-300 dark:border-slate-600 px-3 text-xs text-slate-600 dark:text-slate-400 hover:border-indigo-400 hover:text-indigo-600 transition-colors">
              {isUploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
              {isUploading ? '上传中...' : '上传截图'}
            </span>
            <input type="file" accept="image/*" multiple className="hidden" onChange={onUploadAttachment} disabled={!canEditSelectedNode || isUploading} />
          </label>
          <p className="text-[10px] text-slate-400">支持 Ctrl/Cmd + V 直接粘贴截图</p>
          {attachments.length === 0 ? (
            <p className="text-[11px] text-slate-400">当前节点暂无截图</p>
          ) : (
            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-0.5">
              {attachments.map((att) => (
                <div key={att.id} className="flex items-center gap-2 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 p-2">
                  <a href={att.previewUrl} target="_blank" rel="noreferrer" className="shrink-0">
                    <img src={att.previewUrl} alt={att.name} className="h-9 w-9 rounded object-cover border border-slate-200 dark:border-slate-700" />
                  </a>
                  <div className="min-w-0 flex-1">
                    <a href={att.previewUrl} target="_blank" rel="noreferrer" className="block text-xs font-medium truncate text-slate-700 dark:text-slate-200 hover:text-indigo-600">{att.name}</a>
                    <span className="text-[10px] text-slate-400">{Math.round(att.size / 1024)} KB</span>
                  </div>
                  <button type="button" className="shrink-0 text-slate-400 hover:text-rose-500 transition-colors" onClick={() => onDeleteAttachment(att.id)} aria-label="删除截图">
                    <XCircle className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </SidebarSection>

      {/* ══ 工作台操作 ════════════════════════════════════ */}
      <SidebarSection title="工作台操作" icon={<Download className="h-3.5 w-3.5" />} defaultOpen={false}>
        <div className="space-y-2">
          <Button variant="outline" size="sm" className="w-full gap-1.5 justify-start text-xs" onClick={onPublishRemote} disabled={isPublishingRemote || isBusy}>
            {isPublishingRemote ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
            {isRemoteLinked ? '同步到远端' : '发布到远端'}
          </Button>
          <Button variant="outline" size="sm" className="w-full gap-1.5 justify-start text-xs" onClick={onSyncFromRemote} disabled={!isRemoteLinked || isSyncingRemote || isBusy}>
            {isSyncingRemote ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            从远端拉取
          </Button>
          <Button variant="outline" size="sm" className="w-full gap-1.5 justify-start text-xs" onClick={onResetTemplate} disabled={isBusy}>
            <RotateCcw className="h-3.5 w-3.5" />
            重置模板
          </Button>
          <div className="pt-1 border-t border-slate-100 dark:border-slate-800">
            <Button variant="outline" size="sm" className="w-full gap-1.5 justify-start text-xs" onClick={handleExportMarkdown} disabled={!mindData}>
              <FileText className="h-3.5 w-3.5" />
              导出 Markdown
            </Button>
          </div>
        </div>
      </SidebarSection>

      {/* ══ 历史工作台 ════════════════════════════════════ */}
      <SidebarSection title="历史工作台" icon={<History className="h-3.5 w-3.5" />} defaultOpen={false}>
        <HistoryWorkspaceList onLoadWorkspace={onLoadHistoryWorkspace} currentRemoteId={remoteWorkspaceId} />
      </SidebarSection>

    </aside>
  );
}
