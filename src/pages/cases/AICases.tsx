import { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './AICases.css';
import { Loader2 } from 'lucide-react';
import { useLocation } from 'wouter';
import ErrorBoundary from '@/components/ErrorBoundary';
import { useAiGeneration } from '@/contexts/AiGenerationContext';
import { toast } from 'sonner';
import {
  aiCasesApi,
  type AiCaseWorkspaceDetail,
} from '@/api';
import {
  collectDescendantTestcaseIds,
  computeProgress,
  createInitialMindData,
  expandImportedCaseNodesFromNote,
  findNodeById,
  inferWorkspaceNameFromRequirement,
  normalizeMindData,
  removeNodeAttachmentId,
} from '@/lib/aiCaseMindMap';
import {
  deleteNodeAttachment,
  deleteStaleWorkspaceAttachments,
  getWorkspaceDocument,
  listNodeAttachments,
  saveWorkspaceDocument,
} from '@/lib/aiCaseStorage';
import {
  AI_CASE_WORKSPACE_ID,
  type AiCaseAttachmentPreview,
  type AiCaseMindData,
  type AiCaseNode,
  type AiCaseNodeStatus,
  type AiCaseWorkspaceDocument,
} from '@/types/aiCases';
import { changeAiCaseNodeStatus, generateAiCases, uploadAiCaseImageFiles } from './AICasesActions';
import { runAiCaseStreamGeneration } from './AICasesStream';
import { AICasesWorkspaceView } from './AICasesWorkspaceView';
import {
  DEFAULT_REMOTE_SYNC_META,
  WAIT_COPY_MAGIC,
  collectGeneratedCases,
  collectNodeIds,
  mergeRemoteWorkspaceToDoc,
  readNodeTagVisibilityPreference,
  resolveRemoteSyncMeta,
  sanitizeImportedNodes,
  type CleanupStaleAttachmentOptions,
  type RemoteSyncMeta,
  type WorkspaceTab,
} from './AICasesUtils';

function AiCasesInner() {
  const [location, setLocation] = useLocation();
  // 全局 AI 生成状态：用于切换页面后仍能显示进度角标、弹跨页通知
  const { notifyStart, notifyProgress, notifyDone } = useAiGeneration();

  // 从 URL 参数读取要打开的文档 ID；未指定时回退到固定的默认工作区
  // 使用 state 而非 useMemo，确保 URL 变化时能响应式更新
  const [activeDocId, setActiveDocId] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('docId') || AI_CASE_WORKSPACE_ID;
  });

  // 监听 wouter location 变化（同路径下 search 参数变化时同步 activeDocId）
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const newDocId = params.get('docId') || AI_CASE_WORKSPACE_ID;
    setActiveDocId((prev) => (prev !== newDocId ? newDocId : prev));
  }, [location]);

  const docRef = useRef<AiCaseWorkspaceDocument | null>(null);
  const saveTimerRef = useRef<number | null>(null);
  const selectedNodeIdRef = useRef<string | null>(null);
  const selectedNodeIdsRef = useRef<string[]>([]);
  const mindDataRef = useRef<AiCaseMindData | null>(null);
  const isUploadingRef = useRef(false);
  const showNodeKindTagsRef = useRef(readNodeTagVisibilityPreference());
  const generateProgressResetTimerRef = useRef<number | null>(null);
  // 流式请求的 AbortController：用于组件卸载或重新生成时取消未完成的请求
  const streamAbortControllerRef = useRef<AbortController | null>(null);
  const remoteSyncMetaRef = useRef<RemoteSyncMeta>(DEFAULT_REMOTE_SYNC_META);
  const cleanupStaleAttachmentsRef = useRef<(
    nextData: AiCaseMindData,
    options?: CleanupStaleAttachmentOptions
  ) => Promise<number>>(async () => 0);
  const schedulePersistRef = useRef<(nextData: AiCaseMindData, nextSelectedNodeId: string | null) => void>(
    () => undefined
  );
  // 标记工作台名称是否被用户手动编辑过，若未手动编辑则允许自动推断覆盖
  const isWorkspaceNameUserEditedRef = useRef(false);
  const autoInferNameTimerRef = useRef<number | null>(null);
  // bootstrap 阶段的自动生成延迟定时器，卸载时需要清除
  const autoGenerateTimerRef = useRef<number | null>(null);

  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [workspaceName, setWorkspaceName] = useState('AI Testcase Workspace');
  const [requirementText, setRequirementText] = useState('');
  const [mindData, setMindData] = useState<AiCaseMindData | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  // 多选节点 ID 列表
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState(0);
  const [generationStageText, setGenerationStageText] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [isPublishingRemote, setIsPublishingRemote] = useState(false);
  const [isSyncingRemote, setIsSyncingRemote] = useState(false);
  const [isUpdatingNodeStatus, setIsUpdatingNodeStatus] = useState(false);
  const [attachmentReloadSeed, setAttachmentReloadSeed] = useState(0);
  const [attachments, setAttachments] = useState<AiCaseAttachmentPreview[]>([]);
  const [remoteSyncMeta, setRemoteSyncMeta] = useState<RemoteSyncMeta>(DEFAULT_REMOTE_SYNC_META);
  const [isImportingMindNodes, setIsImportingMindNodes] = useState(false);
// 移动端侧边栏抽屉
// 浮动面板（桌端）
// 浮动面板拖拽
  // 需求编辑弹窗
  const [isRequirementDialogOpen, setIsRequirementDialogOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('results');
  useEffect(() => {
    selectedNodeIdRef.current = selectedNodeId;
  }, [selectedNodeId]);

  useEffect(() => {
    selectedNodeIdsRef.current = selectedNodeIds;
  }, [selectedNodeIds]);

  useEffect(() => {
    mindDataRef.current = mindData;
  }, [mindData]);

  const clearGenerateProgressTimers = useCallback(() => {
    if (generateProgressResetTimerRef.current) {
      window.clearTimeout(generateProgressResetTimerRef.current);
      generateProgressResetTimerRef.current = null;
    }
  }, []);

  const updateRemoteSyncMeta = useCallback((patch: Partial<RemoteSyncMeta>) => {
    remoteSyncMetaRef.current = {
      ...remoteSyncMetaRef.current,
      ...patch,
    };
    setRemoteSyncMeta(remoteSyncMetaRef.current);
  }, []);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      if (autoInferNameTimerRef.current) {
        window.clearTimeout(autoInferNameTimerRef.current);
        autoInferNameTimerRef.current = null;
      }
      clearGenerateProgressTimers();
      // 组件卸载时应中止正在进行的流式请求，防止还未卸载时尝试 setState
      streamAbortControllerRef.current?.abort();
      streamAbortControllerRef.current = null;
    };
  }, [clearGenerateProgressTimers]);

  useEffect(() => {
    return () => {
      attachments.forEach((attachment) => URL.revokeObjectURL(attachment.previewUrl));
    };
  }, [attachments]);

  // 需求文本变化时，若用户未手动编辑过工作台名称，则 debounce 自动推断更新名称
  useEffect(() => {
    if (isWorkspaceNameUserEditedRef.current) {
      return;
    }

    if (autoInferNameTimerRef.current) {
      window.clearTimeout(autoInferNameTimerRef.current);
    }

    autoInferNameTimerRef.current = window.setTimeout(() => {
      autoInferNameTimerRef.current = null;
      if (isWorkspaceNameUserEditedRef.current) {
        return;
      }
      const inferred = inferWorkspaceNameFromRequirement(requirementText);
      if (inferred) {
        setWorkspaceName(inferred);
      }
    }, 600);
  }, [requirementText]);

  const persistDocument = useCallback(
    async (nextData: AiCaseMindData, nextSelectedNodeId: string | null) => {
      const now = Date.now();
      const currentDoc = docRef.current;
      const remoteMeta = remoteSyncMetaRef.current;
      const nextDoc: AiCaseWorkspaceDocument = {
        id: docRef.current?.id ?? activeDocId,
        name: workspaceName.trim() || 'AI Testcase Workspace',
        requirement: requirementText,
        mapData: nextData,
        version: (currentDoc?.version ?? 0) + 1,
        createdAt: currentDoc?.createdAt ?? now,
        updatedAt: now,
        lastSelectedNodeId: nextSelectedNodeId,
        syncMode: remoteMeta.syncMode,
        remoteWorkspaceId: remoteMeta.remoteWorkspaceId,
        remoteVersion: remoteMeta.remoteVersion,
        remoteStatus: remoteMeta.remoteStatus,
        lastRemoteSyncedAt: remoteMeta.lastRemoteSyncedAt,
      };

      setSaveState('saving');
      docRef.current = nextDoc;

      try {
        await saveWorkspaceDocument(nextDoc);
        setSaveState('saved');
      } catch (error) {
        console.error('[AICases] failed to save workspace', error);
        setSaveState('error');
      }
    },
    [requirementText, workspaceName]
  );

  const schedulePersist = useCallback(
    (nextData: AiCaseMindData, nextSelectedNodeId: string | null) => {
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current);
      }

      setSaveState('saving');
      saveTimerRef.current = window.setTimeout(() => {
        saveTimerRef.current = null;
        void persistDocument(nextData, nextSelectedNodeId);
      }, 280);
    },
    [persistDocument]
  );

  const setDataAndSync = useCallback(
    (
      nextData: AiCaseMindData,
      options?: {
        selectedId?: string | null;
        refreshMind?: boolean;
      }
    ) => {
      const normalized = normalizeMindData(nextData, {
        showNodeKindTags: showNodeKindTagsRef.current,
      });
      const selectedId = options?.selectedId ?? selectedNodeIdRef.current;

      setMindData(normalized);
      mindDataRef.current = normalized;

      if (options?.selectedId !== undefined) {
        setSelectedNodeId(options.selectedId);
      }

      schedulePersistRef.current(normalized, selectedId ?? null);
    },
    []
  );
  useEffect(() => {
    schedulePersistRef.current = schedulePersist;
  }, [schedulePersist]);

  useEffect(() => {
    let active = true;
    // activeDocId \u53d8\u5316\u65f6\u91cd\u65b0\u5f00\u59cb\u52a0\u8f7d\uff0c\u91cd\u7f6e\u52a0\u8f7d\u6001
    setIsBootstrapping(true);

    const bootstrap = async () => {
      try {
        const storedDoc = await getWorkspaceDocument(activeDocId);
        if (!active) return;

        if (storedDoc) {
          const normalized = normalizeMindData(storedDoc.mapData, {
            showNodeKindTags: showNodeKindTagsRef.current,
          });
          const expanded = expandImportedCaseNodesFromNote(normalized, {
            showNodeKindTags: showNodeKindTagsRef.current,
            // 兼容旧格式数据迁移：如果节点已展开但使用旧的"测试点"父节点格式，自动重建为新格式
            migrateLegacy: true,
          });
          const remoteMeta = resolveRemoteSyncMeta(storedDoc);
          remoteSyncMetaRef.current = remoteMeta;
          setRemoteSyncMeta(remoteMeta);

          let hydratedDoc: AiCaseWorkspaceDocument = {
            ...storedDoc,
            mapData: expanded.data,
            syncMode: remoteMeta.syncMode,
            remoteWorkspaceId: remoteMeta.remoteWorkspaceId,
            remoteVersion: remoteMeta.remoteVersion,
            remoteStatus: remoteMeta.remoteStatus,
            lastRemoteSyncedAt: remoteMeta.lastRemoteSyncedAt,
          };

          if (expanded.expandedCount > 0) {
            hydratedDoc = {
              ...hydratedDoc,
              version: (storedDoc.version ?? 0) + 1,
              updatedAt: Date.now(),
            };
            await saveWorkspaceDocument(hydratedDoc);
            if (!active) return;
          }

          docRef.current = hydratedDoc;
          // 记录最后打开的文档 ID，供历史列表页展示「当前工作区」badge
          window.localStorage.setItem('ai-case-last-opened-doc-id', hydratedDoc.id);
          const storedName = storedDoc.name || 'AI Testcase Workspace';
          // 如果本地存储的名称不是默认占位名，则视为"已编辑"，不允许自动推断覆盖
          if (storedName !== 'AI Testcase Workspace') {
            isWorkspaceNameUserEditedRef.current = true;
          }
          setWorkspaceName(storedName);
          setRequirementText(storedDoc.requirement || '');
          setMindData(hydratedDoc.mapData);
          setSelectedNodeId(storedDoc.lastSelectedNodeId ?? hydratedDoc.mapData.nodeData.id);
          setSaveState('saved');

          // 检查是否需要自动生成
          const searchParams = new URLSearchParams(window.location.search);
          if (searchParams.get('autoGenerate') === 'true') {
            // 移除 URL 参数避免刷新重复触发
            const newUrl = window.location.pathname;
            window.history.replaceState({}, '', newUrl);
            // 立即进入"生成中"状态，避免短暂闪出默认模板
            setIsGenerating(true);
            setGenerationProgress(2);
            setGenerationStageText('正在连接后端流式通道...');
            // 延迟一点执行，确保页面初始化完成
            autoGenerateTimerRef.current = window.setTimeout(() => {
              autoGenerateTimerRef.current = null;
              handleGenerateRef.current?.();
            }, 100);
          }
        } else {
          // 文档在 localStorage 中不存在（新建场景）
          // 从 URL 参数读取 initName / initReq（由 AICaseCreate 传过来），
          // 这里负责创建文档并写入 localStorage（不再由 AICaseCreate 提前写入）
          const searchParamsForInit = new URLSearchParams(window.location.search);
          const initName = searchParamsForInit.get('initName')?.trim() || 'AI Testcase Workspace';
          const initReq = searchParamsForInit.get('initReq')?.trim() || '';

          const initialData = normalizeMindData(createInitialMindData(initName), {
            showNodeKindTags: showNodeKindTagsRef.current,
          });
          const now = Date.now();
          const initialDoc: AiCaseWorkspaceDocument = {
            id: activeDocId,
            name: initName,
            requirement: initReq,
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

          // 注意：此处不立即写入 localStorage。
          // 当 autoGenerate=true 时，生成完成后 setDataAndSync 会在保存真实 AI 数据时首次写入，
          // 从而保证列表页只在生成完成后才看到记录，消除歧义感。
          // 当 autoGenerate 为 false（手动导航）时，也在用户编辑后才写入。
          if (!active) return;

          remoteSyncMetaRef.current = resolveRemoteSyncMeta(initialDoc);
          setRemoteSyncMeta(remoteSyncMetaRef.current);
          docRef.current = initialDoc;
          setMindData(initialData);
          setWorkspaceName(initName);
          setRequirementText(initReq);
          if (initName !== 'AI Testcase Workspace') {
            isWorkspaceNameUserEditedRef.current = true;
          }
          setSelectedNodeId(initialDoc.lastSelectedNodeId);
          setSaveState('saved');

          // 新文档也需要检查是否需要自动生成
          const searchParamsAutoGen = new URLSearchParams(window.location.search);
          if (searchParamsAutoGen.get('autoGenerate') === 'true') {
            // 移除 URL 参数避免刷新重复触发
            window.history.replaceState({}, '', window.location.pathname);
            // 立即进入"生成中"状态，避免短暂闪出默认模板
            setIsGenerating(true);
            setGenerationProgress(2);
            setGenerationStageText('正在连接后端流式通道...');
            // 延迟一点执行，确保页面初始化完成
            autoGenerateTimerRef.current = window.setTimeout(() => {
              autoGenerateTimerRef.current = null;
              handleGenerateRef.current?.();
            }, 100);
          }
        }
      } catch (error) {
        console.error('[AICases] bootstrap failed', error);

        if (!active) {
          return;
        }

        const now = Date.now();
        const fallbackData = normalizeMindData(createInitialMindData('AI Testcase Workspace'), {
          showNodeKindTags: showNodeKindTagsRef.current,
        });
        const fallbackDoc: AiCaseWorkspaceDocument = {
          id: activeDocId,
          name: 'AI Testcase Workspace',
          requirement: '',
          mapData: fallbackData,
          version: 1,
          createdAt: now,
          updatedAt: now,
          lastSelectedNodeId: fallbackData.nodeData.id,
          syncMode: 'local',
          remoteWorkspaceId: null,
          remoteVersion: null,
          remoteStatus: null,
          lastRemoteSyncedAt: null,
        };

        remoteSyncMetaRef.current = resolveRemoteSyncMeta(fallbackDoc);
        setRemoteSyncMeta(remoteSyncMetaRef.current);
        docRef.current = fallbackDoc;
        setWorkspaceName(fallbackDoc.name);
        setRequirementText(fallbackDoc.requirement);
        setMindData(fallbackData);
        setSelectedNodeId(fallbackDoc.lastSelectedNodeId);
        setSaveState('error');
        toast.error('初始化 AI 用例工作台失败，请刷新页面重试');
      } finally {
        if (active) {
          setIsBootstrapping(false);
        }
      }
    };

    void bootstrap();

    return () => {
      active = false;
      if (autoGenerateTimerRef.current !== null) {
        clearTimeout(autoGenerateTimerRef.current);
        autoGenerateTimerRef.current = null;
      }
    };
  }, [activeDocId]);


  const selectedNode = useMemo(() => {
    if (!mindData || !selectedNodeId) {
      return null;
    }
    return findNodeById(mindData.nodeData, selectedNodeId);
  }, [mindData, selectedNodeId]);

  const selectedNodeStatus = selectedNode?.metadata?.status ?? 'todo';
  // 单选时：选中节点是 testcase 才可操作
  // 多选时：只要有任意一个选中节点是 testcase 就允许操作
  const canEditSelectedNode = selectedNode?.metadata?.kind === 'testcase';

  // 所有选中节点（含其子树）中 kind=testcase 的节点 ID 列表（批量操作实际作用对象）
  // 支持递归：选中 module/scenario 时自动收集其下所有 testcase 子节点
  const selectedTestcaseNodeIds = useMemo(() => {
    if (!mindData || selectedNodeIds.length === 0) return [];
    const idSet = new Set<string>();
    for (const id of selectedNodeIds) {
      const node = findNodeById(mindData.nodeData, id);
      if (!node) continue;
      for (const tcId of collectDescendantTestcaseIds(node)) {
        idSet.add(tcId);
      }
    }
    return Array.from(idSet);
  }, [mindData, selectedNodeIds]);

  // 是否有可批量操作的 testcase 节点（用于按钮 disabled 判断）
  const canEditAnySelectedNode = selectedTestcaseNodeIds.length > 0;
  // 多选模式：选中了多个节点
  const isMultiSelect = selectedNodeIds.length > 1;

  const progress = useMemo(() => {
    if (!mindData) {
      return {
        total: 0,
        todo: 0,
        doing: 0,
        blocked: 0,
        passed: 0,
        failed: 0,
        skipped: 0,
        done: 0,
        completionRate: 0,
      };
    }
    return computeProgress(mindData);
  }, [mindData]);

  const saveStateText = useMemo(() => {
    switch (saveState) {
      case 'saving':
        return '保存中...';
      case 'saved':
        return '本地草稿已保存';
      case 'error':
        return '保存失败';
      default:
        return '未保存';
    }
  }, [saveState]);

  const isRemoteLinked = remoteSyncMeta.remoteWorkspaceId !== null;
  const remoteStatusText = useMemo(() => {
    if (!isRemoteLinked) {
      return '远端未发布';
    }

    return `远端#${remoteSyncMeta.remoteWorkspaceId} · v${remoteSyncMeta.remoteVersion ?? '-'} · ${remoteSyncMeta.remoteStatus ?? 'draft'}`;
  }, [isRemoteLinked, remoteSyncMeta.remoteStatus, remoteSyncMeta.remoteVersion, remoteSyncMeta.remoteWorkspaceId]);

  const generatedCases = useMemo(() => {
    if (!mindData) {
      return [];
    }
    return collectGeneratedCases(mindData);
  }, [mindData]);

  const highRiskCases = useMemo(
    () => generatedCases.filter((item) => item.riskLevel === 'high'),
    [generatedCases]
  );

  const coverageGapCases = useMemo(
    () => generatedCases.filter((item) => item.status === 'todo' || item.status === 'blocked' || item.status === 'failed'),
    [generatedCases]
  );

  const moduleCoverage = useMemo(() => {
    const map = new Map<string, { total: number; done: number; highRisk: number }>();

    for (const item of generatedCases) {
      const current = map.get(item.moduleName) ?? { total: 0, done: 0, highRisk: 0 };
      current.total += 1;
      if (item.status === 'passed' || item.status === 'skipped') {
        current.done += 1;
      }
      if (item.riskLevel === 'high') {
        current.highRisk += 1;
      }
      map.set(item.moduleName, current);
    }

    return Array.from(map.entries()).map(([moduleName, value]) => ({
      moduleName,
      total: value.total,
      done: value.done,
      highRisk: value.highRisk,
      completionRate: value.total === 0 ? 0 : Math.round((value.done / value.total) * 100),
    }));
  }, [generatedCases]);

  const workspaceSummary = useMemo(() => {
    const materialCount =
      (requirementText.trim() ? 1 : 0) +
      attachments.length +
      (isRemoteLinked ? 1 : 0);

    return {
      materialCount,
      caseCount: progress.total,
      highRiskCount: highRiskCases.length,
      coverageRate: `${progress.completionRate}%`,
      executionState: isRemoteLinked ? '已发布' : '未发布',
    };
  }, [attachments.length, highRiskCases.length, isRemoteLinked, progress.completionRate, progress.total, requirementText]);

    const handleFocusGeneratedCase = useCallback((nodeId: string) => {
    setActiveTab('results');
    selectedNodeIdRef.current = nodeId;
    selectedNodeIdsRef.current = [nodeId];
    setSelectedNodeId(nodeId);
    setSelectedNodeIds([nodeId]);
  }, []);

  const startGenerateProgress = useCallback(
    (initialStage: string = '正在连接后端流式通道...') => {
      clearGenerateProgressTimers();
      setGenerationProgress(2);
      setGenerationStageText(initialStage);
      // 同步通知全局 Context，供 Sidebar 角标和跨页通知使用。
      // 传入当前文档 ID，使列表页能准确识别哪张卡片正在生成。
      notifyStart(docRef.current?.id ?? null);
      notifyProgress(2, initialStage);
    },
    [clearGenerateProgressTimers, notifyStart, notifyProgress]
  );

  const applyGenerateProgress = useCallback((event: { progress?: unknown; stage?: unknown }) => {
    let nextProgress = -1;
    let nextStage = '';

    if (typeof event.progress === 'number' && Number.isFinite(event.progress)) {
      nextProgress = Math.max(0, Math.min(99, Math.round(event.progress)));
      setGenerationProgress((prev) => Math.max(prev, nextProgress));
    }

    if (typeof event.stage === 'string' && event.stage.trim()) {
      nextStage = event.stage.trim();
      setGenerationStageText(nextStage);
    }

    // 同步通知全局 Context
    if (nextProgress >= 0 || nextStage) {
      notifyProgress(
        nextProgress >= 0 ? nextProgress : -1,
        nextStage,
      );
    }
  }, [notifyProgress]);

  const finishGenerateProgress = useCallback(
    (nextStageText: string) => {
      clearGenerateProgressTimers();
      setGenerationStageText(nextStageText);
      setGenerationProgress(100);
      // 通知全局 Context 进度达到 100%
      notifyProgress(100, nextStageText);

      generateProgressResetTimerRef.current = window.setTimeout(() => {
        setGenerationProgress(0);
        setGenerationStageText('');
        // 延迟后通知全局 Context 生成已结束（状态清零）
        notifyDone();
      }, 900);
    },
    [clearGenerateProgressTimers, notifyProgress, notifyDone]
  );

  const streamGenerateFromBackend = useCallback(() =>
    runAiCaseStreamGeneration({
      streamAbortControllerRef,
      showNodeKindTagsRef,
      mindDataRef,
      requirementText,
      workspaceName,
      applyGenerateProgress,
      setMindData,
      setGenerationStageText,
      setGenerationProgress,
    }),
    [applyGenerateProgress, requirementText, workspaceName]
  );
  // 用户在侧边栏手动修改工作台名称时调用，标记"已手动编辑"，后续不再自动推断覆盖
  const handleWorkspaceNameChange = useCallback((name: string) => {
    isWorkspaceNameUserEditedRef.current = true;
    setWorkspaceName(name);
  }, []);

const applyWorkspaceDetail = useCallback(
    (workspace: AiCaseWorkspaceDetail, options?: { keepSelection?: boolean }) => {
      const now = Date.now();
      const fallbackDoc: AiCaseWorkspaceDocument = {
        id: docRef.current?.id ?? activeDocId,
        name: workspace.name || 'AI Testcase Workspace',
        requirement: workspace.requirementText || '',
        mapData: normalizeMindData(workspace.mapData, {
          showNodeKindTags: showNodeKindTagsRef.current,
        }),
        version: 1,
        createdAt: now,
        updatedAt: now,
        lastSelectedNodeId: workspace.mapData.nodeData?.id ?? null,
        syncMode: 'hybrid',
        remoteWorkspaceId: workspace.id,
        remoteVersion: workspace.version,
        remoteStatus: workspace.status,
        lastRemoteSyncedAt: now,
      };

      const mergedDoc = mergeRemoteWorkspaceToDoc(docRef.current ?? fallbackDoc, workspace);
      docRef.current = mergedDoc;

      const selectedId = options?.keepSelection
        ? selectedNodeIdRef.current ?? mergedDoc.lastSelectedNodeId
        : mergedDoc.lastSelectedNodeId;

      // 从远端加载时，名称由远端数据决定，标记为"已编辑"避免被自动推断覆盖
      isWorkspaceNameUserEditedRef.current = true;
      setWorkspaceName(mergedDoc.name || 'AI Testcase Workspace');
      setRequirementText(mergedDoc.requirement || '');
      updateRemoteSyncMeta({
        syncMode: 'hybrid',
        remoteWorkspaceId: mergedDoc.remoteWorkspaceId ?? workspace.id,
        remoteVersion: mergedDoc.remoteVersion ?? workspace.version,
        remoteStatus: mergedDoc.remoteStatus ?? workspace.status,
        lastRemoteSyncedAt: mergedDoc.lastRemoteSyncedAt ?? Date.now(),
      });
      setDataAndSync(mergedDoc.mapData, {
        selectedId: selectedId ?? mergedDoc.mapData.nodeData?.id ?? null,
        refreshMind: true,
      });
    },
    [setDataAndSync, updateRemoteSyncMeta]
  );

  useEffect(() => {
    if (!selectedNodeId) {
      setAttachments([]);
      return;
    }

    let active = true;

    const loadAttachments = async () => {
      try {
        const rows = await listNodeAttachments(docRef.current?.id ?? activeDocId, selectedNodeId);
        if (!active) {
          return;
        }

        const previews = rows.map((row) => ({
          ...row,
          previewUrl: URL.createObjectURL(row.blob),
        }));

        setAttachments((prev) => {
          prev.forEach((attachment) => URL.revokeObjectURL(attachment.previewUrl));
          return previews;
        });
      } catch (error) {
        console.error('[AICases] failed to load attachments', error);
        toast.error('读取节点截图失败');
      }
    };

    void loadAttachments();

    return () => {
      active = false;
    };
  }, [attachmentReloadSeed, selectedNodeId]);

  useEffect(() => {
    if (isBootstrapping || !mindDataRef.current || isGenerating) {
      return;
    }

    schedulePersistRef.current(mindDataRef.current, selectedNodeIdRef.current);
  }, [workspaceName, requirementText, isBootstrapping, remoteSyncMeta, isGenerating]);

  const cleanupStaleAttachments = useCallback(
    async (nextData: AiCaseMindData, options?: CleanupStaleAttachmentOptions): Promise<number> => {
      const activeNodeIds = collectNodeIds(nextData.nodeData);

      try {
        const cleanedCount = await deleteStaleWorkspaceAttachments(docRef.current?.id ?? activeDocId, activeNodeIds);

        if ((options?.showCountToast ?? true) && cleanedCount > 0) {
          toast.success(
            options?.reason === 'node_deleted'
              ? `检测到节点删除，已清理 ${cleanedCount} 条附件`
              : `已清理 ${cleanedCount} 条历史附件`
          );
        }

        return cleanedCount;
      } catch (error) {
        console.error('[AICases] failed to cleanup stale attachments', error);
        toast.error('清理历史截图失败，建议稍后重试');
        return 0;
      }
    },
    []
  );

  useEffect(() => {
    cleanupStaleAttachmentsRef.current = cleanupStaleAttachments;
  }, [cleanupStaleAttachments]);

  const uploadImageFiles = useCallback(
    (inputFiles: File[], source: 'picker' | 'paste') => uploadAiCaseImageFiles({
      inputFiles,
      source,
      mindDataRef,
      selectedNodeIdRef,
      isUploadingRef,
      docRef,
      activeDocId,
      setIsUploading,
      setDataAndSync,
      setAttachmentReloadSeed,
    }),
    [activeDocId, setDataAndSync]
  );
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      if (isImportingMindNodes) {
        return;
      }

      const clipboardText =
        typeof event.clipboardData?.getData === 'function'
          ? event.clipboardData.getData('text/plain')?.trim()
          : '';
      if (clipboardText) {
        try {
          const parsed = JSON.parse(clipboardText) as { magic?: unknown; data?: unknown };
          if (parsed.magic === WAIT_COPY_MAGIC && Array.isArray(parsed.data) && parsed.data.length > 0) {
            event.preventDefault();
            setIsImportingMindNodes(true);

            try {
              const currentData = mindDataRef.current;
              if (!currentData) {
                toast.error('当前工作区数据未初始化，无法导入复制节点');
                return;
              }

              const currentSelectedNodeId = selectedNodeIdRef.current;
              const selectedNode = currentSelectedNodeId
                ? findNodeById(currentData.nodeData, currentSelectedNodeId)
                : null;
              const parentNodeId = selectedNode?.metadata?.kind && selectedNode.metadata.kind !== 'testcase'
                ? selectedNode.id
                : currentData.nodeData.id;

              const nextData = normalizeMindData(currentData, {
                showNodeKindTags: showNodeKindTagsRef.current,
              });
              const parentNode = findNodeById(nextData.nodeData, parentNodeId);
              if (!parentNode) {
                toast.error('未找到目标父节点，导入失败');
                return;
              }

              const importedNodes = sanitizeImportedNodes(parsed.data);
              if (importedNodes.length === 0) {
                toast.error('复制数据格式不正确，导入失败');
                return;
              }

              parentNode.children = [
                ...((parentNode.children ?? []) as AiCaseNode[]),
                ...importedNodes,
              ];
              parentNode.expanded = true;

              const expanded = expandImportedCaseNodesFromNote(nextData, {
                candidateNodeIds: importedNodes.map((node) => node.id),
                showNodeKindTags: showNodeKindTagsRef.current,
              });

              setDataAndSync(expanded.data, {
                selectedId: importedNodes[0]?.id ?? currentSelectedNodeId,
                refreshMind: true,
              });

              toast.success(`已导入 ${importedNodes.length} 个节点`);
            } finally {
              setIsImportingMindNodes(false);
            }

            return;
          }
        } catch {
          // ignore json parse error, continue image paste flow
        }
      }

      const items = event.clipboardData?.items;
      if (!items || items.length === 0) {
        return;
      }

      const imageFiles: File[] = [];
      for (const item of Array.from(items)) {
        if (item.kind === 'file' && item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) {
            imageFiles.push(file);
          }
        }
      }

      if (imageFiles.length === 0) {
        return;
      }

      event.preventDefault();
      void uploadImageFiles(imageFiles, 'paste');
    };

    window.addEventListener('paste', onPaste);
    return () => {
      window.removeEventListener('paste', onPaste);
    };
  }, [isImportingMindNodes, setDataAndSync, uploadImageFiles]);

  const handleGenerateRef = useRef<() => void>();

  const handleGenerate = useCallback(() => generateAiCases({
    requirementText,
    workspaceName,
    streamGenerateFromBackend,
    showNodeKindTagsRef,
    isWorkspaceNameUserEditedRef,
    setActiveTab,
    setIsRequirementDialogOpen,
    startGenerateProgress,
    setIsGenerating,
    setGenerationProgress,
    setGenerationStageText,
    setDataAndSync,
    setWorkspaceName,
    cleanupStaleAttachments,
    setAttachmentReloadSeed,
    finishGenerateProgress,
    notifyProgress,
    setLocation,
  }), [
    requirementText,
    workspaceName,
    streamGenerateFromBackend,
    startGenerateProgress,
    finishGenerateProgress,
    setDataAndSync,
    cleanupStaleAttachments,
    notifyProgress,
    setLocation,
  ]);
  useEffect(() => {
    handleGenerateRef.current = handleGenerate;
  }, [handleGenerate]);

  const handleLoadHistoryWorkspace = useCallback(async (id: number) => {
    try {
      const res = await aiCasesApi.getWorkspace(id);
      if (!res.data) {
        toast.error('获取工作台数据失败');
        return;
      }
      applyWorkspaceDetail(res.data);
      toast.success(`已加载工作台：${res.data.name}`);
    } catch {
      toast.error('加载历史工作台失败，请稍后重试');
    }
  }, [applyWorkspaceDetail]);

  const handlePublishRemote = useCallback(async () => {
    if (!mindData) {
      toast.error('工作区数据尚未初始化，无法发布');
      return;
    }

    setIsPublishingRemote(true);
    try {
      const remoteId = remoteSyncMetaRef.current.remoteWorkspaceId;
      const workspaceNameValue = workspaceName.trim() || 'AI Testcase Workspace';
      const requirement = requirementText.trim();

      const response = remoteId
        ? await aiCasesApi.updateWorkspace(remoteId, {
            name: workspaceNameValue,
            requirementText: requirement,
            mapData: mindData,
            syncSource: 'mixed',
            status: remoteSyncMetaRef.current.remoteStatus ?? 'draft',
            expectedVersion: remoteSyncMetaRef.current.remoteVersion ?? undefined,
          })
        : await aiCasesApi.createWorkspace({
            name: workspaceNameValue,
            requirementText: requirement,
            mapData: mindData,
            syncSource: 'local_import',
            status: 'draft',
          });

      if (!response.data) {
        throw new Error('远端接口返回为空');
      }

      applyWorkspaceDetail(response.data, { keepSelection: true });
      await cleanupStaleAttachments(normalizeMindData(response.data.mapData));
      setAttachmentReloadSeed((value) => value + 1);
      toast.success(remoteId ? '已同步到远端最新版本' : '已发布到远端工作台');
    } catch (error) {
      console.error('[AICases] publish remote failed', error);
      toast.error(error instanceof Error ? error.message : '发布远端失败');
    } finally {
      setIsPublishingRemote(false);
    }
  }, [mindData, workspaceName, requirementText, applyWorkspaceDetail, cleanupStaleAttachments, updateRemoteSyncMeta]);

  const handleSyncFromRemote = useCallback(async () => {
    const remoteId = remoteSyncMetaRef.current.remoteWorkspaceId;
    if (!remoteId) {
      toast.error('当前草稿尚未发布到远端');
      return;
    }

    setIsSyncingRemote(true);
    try {
      const response = await aiCasesApi.getWorkspace(remoteId);
      if (!response.data) {
        throw new Error('远端工作台不存在');
      }

      applyWorkspaceDetail(response.data, { keepSelection: true });
      await cleanupStaleAttachments(normalizeMindData(response.data.mapData));
      setAttachmentReloadSeed((value) => value + 1);
      toast.success('已从远端同步最新数据');
    } catch (error) {
      console.error('[AICases] sync from remote failed', error);
      toast.error(error instanceof Error ? error.message : '从远端同步失败');
    } finally {
      setIsSyncingRemote(false);
    }
  }, [applyWorkspaceDetail, cleanupStaleAttachments]);

  const handleResetTemplate = useCallback(async () => {
    const next = createInitialMindData(workspaceName || 'AI Testcase Workspace');
    setDataAndSync(next, {
      selectedId: next.nodeData.id,
      refreshMind: true,
    });
    await cleanupStaleAttachments(next);
    setAttachmentReloadSeed((value) => value + 1);
    toast.success('已恢复默认工作区模板');
  }, [workspaceName, setDataAndSync, cleanupStaleAttachments]);

  const handleStatusChange = useCallback((status: AiCaseNodeStatus) => changeAiCaseNodeStatus({
    status,
    mindData,
    canEditAnySelectedNode,
    selectedTestcaseNodeIds,
    selectedNodeId,
    remoteSyncMetaRef,
    workspaceName,
    requirementText,
    applyWorkspaceDetail,
    updateRemoteSyncMeta,
    setDataAndSync,
    setIsUpdatingNodeStatus,
  }), [mindData, canEditAnySelectedNode, selectedTestcaseNodeIds, selectedNodeId, workspaceName, requirementText, applyWorkspaceDetail, updateRemoteSyncMeta, setDataAndSync]);
  const handleUploadAttachment = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    void uploadImageFiles(files, 'picker');
  }, [uploadImageFiles]);

  const handleDeleteAttachment = useCallback(async (attachmentId: string) => {
    if (!mindData || !selectedNodeId) {
      return;
    }

    try {
      await deleteNodeAttachment(attachmentId);
      const next = removeNodeAttachmentId(mindData, selectedNodeId, attachmentId);
      setDataAndSync(next, {
        selectedId: selectedNodeId,
        refreshMind: false,
      });
      setAttachmentReloadSeed((value) => value + 1);
      toast.success('截图已删除');
    } catch (error) {
      console.error('[AICases] failed to delete attachment', error);
      toast.error('删除截图失败，请稍后重试');
    }
  }, [mindData, selectedNodeId, setDataAndSync]);

  // ─── 辅助变量 ──────────────────────────────────────────────────────────────

  if (isBootstrapping || !mindData) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="flex items-center gap-2 text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>初始化 AI 用例工作台...</span>
        </div>
      </div>
    );
  }

  // ─── 新双栏布局 ─────────────────────────────────────────────────────────────

  return (
    <AICasesWorkspaceView
      saveStateText={saveStateText}
      remoteStatusText={remoteStatusText}
      onOpenHistory={() => setLocation('/cases/ai-history')}
      workspaceSummary={workspaceSummary}
      isRemoteLinked={isRemoteLinked}
      activeTab={activeTab}
      setActiveTab={setActiveTab}
      requirementText={requirementText}
      attachments={attachments}
      isGenerating={isGenerating}
      handleGenerate={handleGenerate}
      generatedCases={generatedCases}
      highRiskCases={highRiskCases}
      coverageGapCases={coverageGapCases}
      moduleCoverage={moduleCoverage}
      progress={progress}
      isPublishingRemote={isPublishingRemote}
      handlePublishRemote={handlePublishRemote}
      workspaceName={workspaceName}
      selectedNodeId={selectedNodeId}
      handleFocusGeneratedCase={handleFocusGeneratedCase}
      generationProgress={generationProgress}
      generationStageText={generationStageText}
      selectedNode={selectedNode}
      selectedNodeStatus={selectedNodeStatus}
      canEditSelectedNode={canEditSelectedNode}
      isMultiSelect={isMultiSelect}
      selectedTestcaseNodeIds={selectedTestcaseNodeIds}
      canEditAnySelectedNode={canEditAnySelectedNode}
      isUpdatingNodeStatus={isUpdatingNodeStatus}
      handleStatusChange={handleStatusChange}
      isUploading={isUploading}
      handleUploadAttachment={handleUploadAttachment}
      handleDeleteAttachment={handleDeleteAttachment}
      remoteSyncMeta={remoteSyncMeta}
      isSyncingRemote={isSyncingRemote}
      handleSyncFromRemote={handleSyncFromRemote}
      handleResetTemplate={handleResetTemplate}
      handleLoadHistoryWorkspace={handleLoadHistoryWorkspace}
      mindData={mindData}
      isRequirementDialogOpen={isRequirementDialogOpen}
      setIsRequirementDialogOpen={setIsRequirementDialogOpen}
      handleWorkspaceNameChange={handleWorkspaceNameChange}
      setRequirementText={setRequirementText}
    />
  );
}

export default function AICases() {
  return (
    <ErrorBoundary>
      <AiCasesInner />
    </ErrorBoundary>
  );
}
