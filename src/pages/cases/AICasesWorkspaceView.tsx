import type { ChangeEvent, Dispatch, SetStateAction } from 'react';
import { Activity, Bot, Bug, CheckCircle2, GitBranch, Link2, ListTree, Loader2 } from 'lucide-react';
import { AiCaseSidebar } from './components/AiCaseSidebar';
import { AiWorkspaceHeader } from './components/AiWorkspaceHeader';
import { AiWorkspaceSummaryBar } from './components/AiWorkspaceSummaryBar';
import { AiWorkspaceTabs } from './components/AiWorkspaceTabs';
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import type { AiCaseAttachmentPreview, AiCaseMindData, AiCaseNode, AiCaseNodeStatus, AiCaseProgress } from '@/types/aiCases';
import { WORKSPACE_TAB_ITEMS, WorkspacePanelCard, type GeneratedCaseListItem, type RemoteSyncMeta, type WorkspaceTab } from './AICasesUtils';

interface WorkspaceSummaryViewModel {
  materialCount: number;
  caseCount: number;
  highRiskCount: number;
  coverageRate: string;
  executionState: string;
}

interface ModuleCoverageItem {
  moduleName: string;
  done: number;
  total: number;
  highRisk: number;
  completionRate: number;
}

interface AICasesWorkspaceViewProps {
  saveStateText: string;
  remoteStatusText: string;
  onOpenHistory: () => void;
  workspaceSummary: WorkspaceSummaryViewModel;
  isRemoteLinked: boolean;
  activeTab: WorkspaceTab;
  setActiveTab: Dispatch<SetStateAction<WorkspaceTab>>;
  requirementText: string;
  attachments: AiCaseAttachmentPreview[];
  isGenerating: boolean;
  handleGenerate: () => void | Promise<void>;
  generatedCases: GeneratedCaseListItem[];
  highRiskCases: GeneratedCaseListItem[];
  coverageGapCases: GeneratedCaseListItem[];
  moduleCoverage: ModuleCoverageItem[];
  progress: AiCaseProgress;
  isPublishingRemote: boolean;
  handlePublishRemote: () => void | Promise<void>;
  workspaceName: string;
  selectedNodeId: string | null;
  handleFocusGeneratedCase: (id: string) => void;
  generationProgress: number;
  generationStageText: string;
  selectedNode: AiCaseNode | null;
  selectedNodeStatus: AiCaseNodeStatus;
  canEditSelectedNode: boolean;
  isMultiSelect: boolean;
  selectedTestcaseNodeIds: string[];
  canEditAnySelectedNode: boolean;
  isUpdatingNodeStatus: boolean;
  handleStatusChange: (status: AiCaseNodeStatus) => void | Promise<void>;
  isUploading: boolean;
  handleUploadAttachment: (event: ChangeEvent<HTMLInputElement>) => void;
  handleDeleteAttachment: (attachmentId: string) => void | Promise<void>;
  remoteSyncMeta: RemoteSyncMeta;
  isSyncingRemote: boolean;
  handleSyncFromRemote: () => void | Promise<void>;
  handleResetTemplate: () => void | Promise<void>;
  handleLoadHistoryWorkspace: (id: number) => void | Promise<void>;
  mindData: AiCaseMindData | null;
  isRequirementDialogOpen: boolean;
  setIsRequirementDialogOpen: Dispatch<SetStateAction<boolean>>;
  handleWorkspaceNameChange: (name: string) => void;
  setRequirementText: Dispatch<SetStateAction<string>>;
}

export function AICasesWorkspaceView({
  saveStateText,
  remoteStatusText,
  onOpenHistory,
  workspaceSummary,
  isRemoteLinked,
  activeTab,
  setActiveTab,
  requirementText,
  attachments,
  isGenerating,
  handleGenerate,
  generatedCases,
  highRiskCases,
  coverageGapCases,
  moduleCoverage,
  progress,
  isPublishingRemote,
  handlePublishRemote,
  workspaceName,
  selectedNodeId,
  handleFocusGeneratedCase,
  generationProgress,
  generationStageText,
  selectedNode,
  selectedNodeStatus,
  canEditSelectedNode,
  isMultiSelect,
  selectedTestcaseNodeIds,
  canEditAnySelectedNode,
  isUpdatingNodeStatus,
  handleStatusChange,
  isUploading,
  handleUploadAttachment,
  handleDeleteAttachment,
  remoteSyncMeta,
  isSyncingRemote,
  handleSyncFromRemote,
  handleResetTemplate,
  handleLoadHistoryWorkspace,
  mindData,
  isRequirementDialogOpen,
  setIsRequirementDialogOpen,
  handleWorkspaceNameChange,
  setRequirementText,
}: AICasesWorkspaceViewProps) {
  return (
    <div className="h-full flex flex-col bg-white dark:bg-slate-950 overflow-hidden">

      {/* 顶部标题栏（全屏时隐藏） */}
      <AiWorkspaceHeader
          title="AI 用例工作台"
          saveStateText={saveStateText}
          remoteStatusText={remoteStatusText}
          onOpenRequirement={() => setIsRequirementDialogOpen(true)}
          onOpenHistory={() => onOpenHistory()}
        />
      
          <AiWorkspaceSummaryBar
            items={[
              { label: '输入材料', value: `${workspaceSummary.materialCount}`, hint: '需求、附件和远端上下文' },
              { label: '生成用例', value: `${workspaceSummary.caseCount}`, hint: '当前工作台中的测试点数量' },
              { label: '高风险项', value: `${workspaceSummary.highRiskCount}`, hint: '按优先级和状态初步推断' },
              { label: '当前覆盖率', value: workspaceSummary.coverageRate, hint: '基于节点状态的阶段性指标' },
              { label: '执行状态', value: workspaceSummary.executionState, hint: isRemoteLinked ? remoteStatusText : '尚未发布到远端工作台' },
            ]}
          />

          <AiWorkspaceTabs
            activeTab={activeTab}
            items={WORKSPACE_TAB_ITEMS}
            onChange={setActiveTab}
          />
      

      {/* 主体内容 */}
      {activeTab === 'materials' ? (
        <section className="flex-1 min-h-0 overflow-y-auto px-4 py-4">
          <div className="grid gap-4 grid-cols-[1.6fr_1fr]">
            <WorkspacePanelCard
              title="需求与附件"
              description="这里先承接当前最核心的输入材料，确保 AI 生成入口不变。"
              action={(
                <Button type="button" size="sm" className="gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white" onClick={() => setIsRequirementDialogOpen(true)}>
                  <Bot className="h-3.5 w-3.5" />
                  编辑需求
                </Button>
              )}
            >
              <div className="space-y-4">
                <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium text-slate-900 dark:text-white">需求描述 / PRD</div>
                      <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">当前工作台生成所依赖的主需求文本</div>
                    </div>
                    <span className="rounded-full bg-indigo-100 px-2 py-1 text-[11px] font-medium text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300">
                      {requirementText.trim() ? '已准备' : '待补充'}
                    </span>
                  </div>
                  <div className="mt-3 rounded-lg border border-dashed border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 text-sm leading-6 text-slate-600 dark:text-slate-300">
                    {requirementText.trim() || '还没有填写需求内容，建议先补充 PRD 或功能描述，再执行 AI 生成。'}
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium text-slate-900 dark:text-white">附件材料</div>
                      <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">复用当前工作台附件能力，后续扩展到接口文档、截图和说明材料。</div>
                    </div>
                    <span className="rounded-full bg-slate-200 px-2 py-1 text-[11px] font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                      {attachments.length} 个
                    </span>
                  </div>

                  {attachments.length > 0 ? (
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      {attachments.slice(0, 6).map((attachment) => (
                        <div key={attachment.id} className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2">
                          <div className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">{attachment.name}</div>
                          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{(attachment.size / 1024).toFixed(1)} KB</div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="mt-3 rounded-lg border border-dashed border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 text-sm text-slate-500 dark:text-slate-400">
                      当前还没有上传附件。后续这里会统一展示 PRD、接口文档、截图和辅助材料。
                    </div>
                  )}
                </div>
              </div>
            </WorkspacePanelCard>

            <div className="grid gap-4">
              <WorkspacePanelCard title="外部来源骨架" description="Phase 1 先把结构搭好，Phase 2 再逐步接真实平台。">
                <div className="space-y-3">
                  {[
                    { icon: <Link2 className="h-4 w-4" />, title: '接口文档', desc: 'OpenAPI / Swagger 导入入口预留' },
                    { icon: <GitBranch className="h-4 w-4" />, title: '代码变更', desc: 'PR / MR / Commit 影响面摘要预留' },
                    { icon: <Bug className="h-4 w-4" />, title: '缺陷单', desc: '缺陷来源和高频问题预留' },
                    { icon: <Activity className="h-4 w-4" />, title: '流量摘要', desc: '热门接口与异常热点预留' },
                  ].map((item) => (
                    <div key={item.title} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-4 py-3">
                      <div className="flex items-center gap-2 text-sm font-medium text-slate-900 dark:text-white">
                        {item.icon}
                        {item.title}
                      </div>
                      <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{item.desc}</div>
                      <div className="mt-2 text-[11px] text-amber-600 dark:text-amber-400">待接入</div>
                    </div>
                  ))}
                </div>
              </WorkspacePanelCard>

              <WorkspacePanelCard
                title="本次生成材料摘要"
                description="确认当前工作台是否具备执行 AI 生成的最基本条件。"
                action={(
                  <Button
                    type="button"
                    size="sm"
                    className="gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white"
                    onClick={() => void handleGenerate()}
                    disabled={isGenerating || !requirementText.trim()}
                  >
                    {isGenerating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Bot className="h-3.5 w-3.5" />}
                    AI 生成
                  </Button>
                )}
              >
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-xl bg-slate-50 dark:bg-slate-950 px-4 py-3">
                    <div className="text-xs text-slate-500 dark:text-slate-400">需求文本</div>
                    <div className="mt-1 font-medium text-slate-900 dark:text-white">{requirementText.trim() ? '已填写' : '未填写'}</div>
                  </div>
                  <div className="rounded-xl bg-slate-50 dark:bg-slate-950 px-4 py-3">
                    <div className="text-xs text-slate-500 dark:text-slate-400">附件数</div>
                    <div className="mt-1 font-medium text-slate-900 dark:text-white">{attachments.length}</div>
                  </div>
                  <div className="rounded-xl bg-slate-50 dark:bg-slate-950 px-4 py-3">
                    <div className="text-xs text-slate-500 dark:text-slate-400">远端状态</div>
                    <div className="mt-1 font-medium text-slate-900 dark:text-white">{isRemoteLinked ? '已关联远端' : '仅本地工作台'}</div>
                  </div>
                  <div className="rounded-xl bg-slate-50 dark:bg-slate-950 px-4 py-3">
                    <div className="text-xs text-slate-500 dark:text-slate-400">建议动作</div>
                    <div className="mt-1 font-medium text-slate-900 dark:text-white">{requirementText.trim() ? '可开始生成' : '先补需求'}</div>
                  </div>
                </div>
              </WorkspacePanelCard>
            </div>
          </div>
        </section>
      ) : null}

      {activeTab === 'results' ? (
        <div className="shrink-0 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-slate-900 dark:text-white">生成结果</div>
              <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">以结构化列表作为默认结果视图，方便审阅、筛选和批量操作。</div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="default"
                className="bg-indigo-600 hover:bg-indigo-700 text-white"
              >
                <ListTree className="mr-1.5 h-3.5 w-3.5" />
                列表视图
              </Button></div>
          </div>
        </div>
      ) : null}

      {activeTab === 'coverage' ? (
        <section className="flex-1 min-h-0 overflow-y-auto px-4 py-4">
          <div className="grid gap-4">
            <AiWorkspaceSummaryBar
              items={[
                { label: '高风险项', value: `${highRiskCases.length}`, hint: '优先级 P0 / 失败项优先展示' },
                { label: '待补充项', value: `${coverageGapCases.length}`, hint: '待执行、阻塞和失败项合并展示' },
                { label: '模块数', value: `${moduleCoverage.length}`, hint: '按模块节点聚合' },
                { label: '总体覆盖率', value: `${progress.completionRate}%`, hint: '基于节点进度的临时口径' },
              ]}
              gridClassName="grid-cols-4"
            />

            <div className="grid gap-4 grid-cols-[1.2fr_1fr]">
              <WorkspacePanelCard title="高风险点" description="Phase 1 先基于优先级和执行状态生成静态风险清单。">
                {highRiskCases.length > 0 ? (
                  <div className="space-y-2">
                    {highRiskCases.slice(0, 6).map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => handleFocusGeneratedCase(item.id)}
                        className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-3 text-left hover:border-indigo-300 hover:bg-indigo-50/40 dark:hover:border-indigo-500/60 dark:hover:bg-indigo-500/10 transition-colors"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="text-sm font-medium text-slate-900 dark:text-white">{item.title}</div>
                            <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{item.moduleName} · {item.priority}</div>
                          </div>
                          <span className="rounded-full bg-rose-100 px-2 py-1 text-[11px] font-medium text-rose-700 dark:bg-rose-500/15 dark:text-rose-300">高风险</span>
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-8 text-center text-sm text-slate-500 dark:text-slate-400">
                    还没有高风险点，先生成测试用例后这里会出现分析结果。
                  </div>
                )}
              </WorkspacePanelCard>

              <WorkspacePanelCard title="模块覆盖" description="这里先展示每个模块的完成率骨架，后续再接真实覆盖口径。">
                {moduleCoverage.length > 0 ? (
                  <div className="space-y-3">
                    {moduleCoverage.map((item) => (
                      <div key={item.moduleName} className="rounded-xl bg-slate-50 dark:bg-slate-950 px-4 py-3">
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-sm font-medium text-slate-900 dark:text-white">{item.moduleName}</div>
                          <div className="text-xs text-slate-500 dark:text-slate-400">{item.done}/{item.total} · 高风险 {item.highRisk}</div>
                        </div>
                        <progress
                          className="ai-cases-progress ai-cases-progress--indigo mt-2 h-2 w-full overflow-hidden rounded-full"
                          max={100}
                          value={item.completionRate}
                        />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-8 text-center text-sm text-slate-500 dark:text-slate-400">
                    暂无模块覆盖数据。
                  </div>
                )}
              </WorkspacePanelCard>
            </div>
          </div>
        </section>
      ) : null}

      {activeTab === 'execution' ? (
        <section className="flex-1 min-h-0 overflow-y-auto px-4 py-4">
          <div className="grid gap-4 grid-cols-[1.1fr_1fr]">
            <div className="grid gap-4">
              <WorkspacePanelCard
                title="发布"
                description="沿用当前远端工作台发布能力，作为执行前的统一入口。"
                action={(
                  <Button
                    type="button"
                    size="sm"
                    className="gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white"
                    onClick={() => void handlePublishRemote()}
                    disabled={isPublishingRemote || isGenerating}
                  >
                    {isPublishingRemote ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                    发布工作台
                  </Button>
                )}
              >
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl bg-slate-50 dark:bg-slate-950 px-4 py-3">
                    <div className="text-xs text-slate-500 dark:text-slate-400">远端状态</div>
                    <div className="mt-1 font-medium text-slate-900 dark:text-white">{remoteStatusText}</div>
                  </div>
                  <div className="rounded-xl bg-slate-50 dark:bg-slate-950 px-4 py-3">
                    <div className="text-xs text-slate-500 dark:text-slate-400">本地保存</div>
                    <div className="mt-1 font-medium text-slate-900 dark:text-white">{saveStateText}</div>
                  </div>
                </div>
              </WorkspacePanelCard>

              <WorkspacePanelCard title="执行触发骨架" description="Phase 1 先把执行入口布局搭好，后续对接 Jenkins 真实触发。">
                <div className="grid grid-cols-3 gap-3">
                  <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-3">
                    <div className="text-xs text-slate-500 dark:text-slate-400">执行范围</div>
                    <div className="mt-1 font-medium text-slate-900 dark:text-white">全部 / 按模块 / 高风险</div>
                  </div>
                  <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-3">
                    <div className="text-xs text-slate-500 dark:text-slate-400">执行环境</div>
                    <div className="mt-1 font-medium text-slate-900 dark:text-white">待接入</div>
                  </div>
                  <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-3">
                    <div className="text-xs text-slate-500 dark:text-slate-400">Jenkins</div>
                    <div className="mt-1 font-medium text-slate-900 dark:text-white">保留现有执行链路</div>
                  </div>
                </div>
              </WorkspacePanelCard>
            </div>

            <div className="grid gap-4">
              <WorkspacePanelCard title="最近执行摘要" description="这里先展示工作台现状与后续回流入口。">
                <div className="space-y-3">
                  <div className="rounded-xl bg-slate-50 dark:bg-slate-950 px-4 py-3">
                    <div className="text-xs text-slate-500 dark:text-slate-400">当前工作台</div>
                    <div className="mt-1 font-medium text-slate-900 dark:text-white">{workspaceName}</div>
                  </div>
                  <div className="rounded-xl bg-slate-50 dark:bg-slate-950 px-4 py-3">
                    <div className="text-xs text-slate-500 dark:text-slate-400">结果规模</div>
                    <div className="mt-1 font-medium text-slate-900 dark:text-white">{generatedCases.length} 条测试点</div>
                  </div>
                  <div className="rounded-xl bg-slate-50 dark:bg-slate-950 px-4 py-3">
                    <div className="text-xs text-slate-500 dark:text-slate-400">当前进度</div>
                    <div className="mt-1 font-medium text-slate-900 dark:text-white">{progress.done}/{progress.total} 已完成</div>
                  </div>
                </div>
              </WorkspacePanelCard>

              <WorkspacePanelCard title="质量回流骨架" description="后续这里会承接质量评分、知识库回流和执行反馈。">
                <div className="space-y-3 text-sm text-slate-600 dark:text-slate-300">
                  <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-4">
                    <div className="font-medium text-slate-900 dark:text-white">质量评分</div>
                    <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">Phase 1 先放置入口，后续对接人工评分与系统评分。</div>
                  </div>
                  <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-4">
                    <div className="font-medium text-slate-900 dark:text-white">知识库回流</div>
                    <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">优质工作台后续可在这里直接加入知识库。</div>
                  </div>
                </div>
              </WorkspacePanelCard>
            </div>
          </div>
        </section>
      ) : null}

      
      {activeTab === 'results' ? (
        <section className="flex-1 min-h-0 overflow-y-auto px-4 py-4">
          <div className="grid gap-4 grid-cols-[1.6fr_1fr]">
            <WorkspacePanelCard title="测试用例列表" description="从当前工作区结构中派生出的结构化列表，后续将支持更多筛选与批量操作。">
              {generatedCases.length > 0 ? (
                <div className="space-y-2">
                  {generatedCases.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleFocusGeneratedCase(item.id)}
                      className={`w-full rounded-xl border px-4 py-3 text-left transition-colors ${
                        selectedNodeId === item.id
                          ? 'border-indigo-300 bg-indigo-50 dark:border-indigo-500/60 dark:bg-indigo-500/10'
                          : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700 dark:hover:bg-slate-800/70'
                      }`}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium text-slate-900 dark:text-white">{item.title}</div>
                          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{item.moduleName} · {item.priority} · {item.sourceLabel}</div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`rounded-full px-2 py-1 text-[11px] font-medium ${
                            item.riskLevel === 'high'
                              ? 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300'
                              : item.riskLevel === 'medium'
                                ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300'
                                : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
                          }`}>
                            {item.riskLevel === 'high' ? '高风险' : item.riskLevel === 'medium' ? '中风险' : '低风险'}
                          </span>
                          <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                            {item.status}
                          </span>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-8 text-center text-sm text-slate-500 dark:text-slate-400">
                  暂无生成结果，先回到“输入材料”补充需求后再执行 AI 生成。
                </div>
              )}
            </WorkspacePanelCard>

            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
              <AiCaseSidebar
                isGenerating={isGenerating}
                generationProgress={generationProgress}
                generationStageText={generationStageText}
                onGenerate={() => setIsRequirementDialogOpen(true)}
                progress={progress}
                selectedNode={selectedNode}
                selectedNodeStatus={selectedNodeStatus}
                canEditSelectedNode={canEditSelectedNode}
                isMultiSelect={isMultiSelect}
                selectedTestcaseCount={selectedTestcaseNodeIds.length}
                canEditAnySelectedNode={canEditAnySelectedNode}
                isUpdatingNodeStatus={isUpdatingNodeStatus}
                onStatusChange={handleStatusChange}
                attachments={attachments}
                isUploading={isUploading}
                onUploadAttachment={handleUploadAttachment}
                onDeleteAttachment={handleDeleteAttachment}
                isRemoteLinked={isRemoteLinked}
                remoteWorkspaceId={remoteSyncMeta.remoteWorkspaceId ?? null}
                isPublishingRemote={isPublishingRemote}
                isSyncingRemote={isSyncingRemote}
                onPublishRemote={handlePublishRemote}
                onSyncFromRemote={handleSyncFromRemote}
                onResetTemplate={handleResetTemplate}
                onLoadHistoryWorkspace={handleLoadHistoryWorkspace}
                mindData={mindData}
              />
            </div>
          </div>
        </section>
      ) : null}

      <Dialog open={isRequirementDialogOpen} onOpenChange={setIsRequirementDialogOpen}>
        <DialogContent className="max-w-[600px]">
          <DialogHeader>
            <DialogTitle>需求信息</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                工作台名称
              </label>
              <input
                value={workspaceName}
                onChange={(e) => handleWorkspaceNameChange(e.target.value)}
                className="h-10 w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 text-sm text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500 transition-colors"
                placeholder="输入工作台标题"
              />
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                需求描述 / PRD
              </label>
              <textarea
                value={requirementText}
                onChange={(e) => setRequirementText(e.target.value)}
                rows={10}
                className="w-full resize-none rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-3 text-sm leading-relaxed text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500 transition-colors"
                placeholder="粘贴 PRD、需求描述或技术方案，点击「AI 生成」按钮自动生成测试用例结构..."
              />
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">取消</Button>
            </DialogClose>
            <Button
              className="gap-2 bg-indigo-600 hover:bg-indigo-700 text-white"
              onClick={handleGenerate}
              disabled={isGenerating || !requirementText.trim()}
            >
              {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bot className="h-4 w-4" />}
              {isGenerating ? 'AI 生成中...' : 'AI 生成测试用例'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
