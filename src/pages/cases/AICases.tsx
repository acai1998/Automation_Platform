import { ChangeEvent, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import MindElixir, { type MindElixirData, type MindElixirInstance } from 'mind-elixir';
import 'mind-elixir/style.css';
import {
  Bot,
  BrainCircuit,
  CheckCircle2,
  Circle,
  CircleDashed,
  Clock3,
  Loader2,
  PauseCircle,
  RotateCcw,
  ShieldAlert,
  Upload,
  XCircle,
  Trash2,
  ImageIcon,
  Sparkles,
  Link,
  Eye,
  EyeOff,
  Tags,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import ErrorBoundary from '@/components/ErrorBoundary';
import { toast } from 'sonner';
import {
  aiCasesApi,
  type AiCaseGenerationResult,
  type AiCaseWorkspaceDetail,
} from '@/api';
import {
  appendNodeAttachmentId,
  computeProgress,
  createInitialMindData,
  findNodeById,
  generateMindDataFromRequirement,
  normalizeMindData,
  removeNodeAttachmentId,
  setNodeStatus,
} from '@/lib/aiCaseMindMap';
import {
  deleteNodeAttachment,
  deleteStaleWorkspaceAttachments,
  getWorkspaceDocument,
  listNodeAttachments,
  saveNodeAttachment,
  saveWorkspaceDocument,
} from '@/lib/aiCaseStorage';
import {
  AI_CASE_WORKSPACE_ID,
  createAiCaseAttachmentId,
  type AiCaseAttachmentPreview,
  type AiCaseMindData,
  type AiCaseNode,
  type AiCaseNodeStatus,
  type AiCaseWorkspaceDocument,
  type AiCaseSyncMode,
  type AiCaseWorkspaceStatus,
} from '@/types/aiCases';

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

const STATUS_ACTIONS: Array<{ status: AiCaseNodeStatus; label: string; icon: ReactNode; className: string }> = [
  {
    status: 'todo',
    label: '待执行',
    icon: <Circle className="h-3.5 w-3.5" />,
    className: 'border-slate-300 text-slate-700 hover:bg-slate-100',
  },
  {
    status: 'doing',
    label: '执行中',
    icon: <Clock3 className="h-3.5 w-3.5" />,
    className: 'border-blue-300 text-blue-700 hover:bg-blue-50',
  },
  {
    status: 'blocked',
    label: '阻塞',
    icon: <ShieldAlert className="h-3.5 w-3.5" />,
    className: 'border-amber-300 text-amber-700 hover:bg-amber-50',
  },
  {
    status: 'passed',
    label: '通过',
    icon: <CheckCircle2 className="h-3.5 w-3.5" />,
    className: 'border-emerald-300 text-emerald-700 hover:bg-emerald-50',
  },
  {
    status: 'failed',
    label: '失败',
    icon: <XCircle className="h-3.5 w-3.5" />,
    className: 'border-rose-300 text-rose-700 hover:bg-rose-50',
  },
  {
    status: 'skipped',
    label: '跳过',
    icon: <PauseCircle className="h-3.5 w-3.5" />,
    className: 'border-purple-300 text-purple-700 hover:bg-purple-50',
  },
];

interface RemoteSyncMeta {
  syncMode: AiCaseSyncMode;
  remoteWorkspaceId: number | null;
  remoteVersion: number | null;
  remoteStatus: AiCaseWorkspaceStatus | null;
  lastRemoteSyncedAt: number | null;
}

const DEFAULT_REMOTE_SYNC_META: RemoteSyncMeta = {
  syncMode: 'local',
  remoteWorkspaceId: null,
  remoteVersion: null,
  remoteStatus: null,
  lastRemoteSyncedAt: null,
};

interface CleanupStaleAttachmentOptions {
  reason?: 'regular' | 'node_deleted';
  showCountToast?: boolean;
}

type TopPanelSection = 'requirement' | 'progress' | 'node' | 'attachment' | 'mode';
type StreamGenerateResultPayload =
  | AiCaseGenerationResult
  | { generated: AiCaseGenerationResult; workspace: AiCaseWorkspaceDetail };

const TOP_PANEL_TABS: Array<{ key: TopPanelSection; label: string }> = [
  { key: 'requirement', label: '需求输入' },
  { key: 'progress', label: '执行进度' },
  { key: 'node', label: '节点操作' },
  { key: 'attachment', label: '截图证据' },
  { key: 'mode', label: '模式提示' },
];

const MIN_CANVAS_SCALE = 0.6;
const MAX_CANVAS_SCALE = 1.8;
const CANVAS_SCALE_STEP = 0.1;
const NODE_TAG_VISIBILITY_STORAGE_KEY = 'ai-case-node-tags-visible';

function readNodeTagVisibilityPreference(): boolean {
  if (typeof window === 'undefined') {
    return true;
  }

  return window.localStorage.getItem(NODE_TAG_VISIBILITY_STORAGE_KEY) !== 'false';
}

function collectNodeIds(root: AiCaseNode): string[] {
  const stack: AiCaseNode[] = [root];
  const nodeIds: string[] = [];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) {
      continue;
    }

    nodeIds.push(current.id);

    for (const child of current.children ?? []) {
      stack.push(child as AiCaseNode);
    }
  }

  return nodeIds;
}

function resolveRemoteSyncMeta(doc: AiCaseWorkspaceDocument | null | undefined): RemoteSyncMeta {
  if (!doc) {
    return DEFAULT_REMOTE_SYNC_META;
  }

  return {
    syncMode: doc.syncMode ?? (doc.remoteWorkspaceId ? 'hybrid' : 'local'),
    remoteWorkspaceId: doc.remoteWorkspaceId ?? null,
    remoteVersion: doc.remoteVersion ?? null,
    remoteStatus: doc.remoteStatus ?? null,
    lastRemoteSyncedAt: doc.lastRemoteSyncedAt ?? null,
  };
}

function mergeRemoteWorkspaceToDoc(
  doc: AiCaseWorkspaceDocument,
  workspace: AiCaseWorkspaceDetail
): AiCaseWorkspaceDocument {
  return {
    ...doc,
    name: workspace.name,
    requirement: workspace.requirementText ?? doc.requirement,
    mapData: normalizeMindData(workspace.mapData),
    lastSelectedNodeId: workspace.mapData.nodeData?.id ?? doc.lastSelectedNodeId,
    syncMode: 'hybrid',
    remoteWorkspaceId: workspace.id,
    remoteVersion: workspace.version,
    remoteStatus: workspace.status,
    lastRemoteSyncedAt: Date.now(),
    updatedAt: Date.now(),
  };
}

function AiCasesInner() {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mindRef = useRef<MindElixirInstance | null>(null);
  const docRef = useRef<AiCaseWorkspaceDocument | null>(null);
  const saveTimerRef = useRef<number | null>(null);
  const selectedNodeIdRef = useRef<string | null>(null);
  const mindDataRef = useRef<AiCaseMindData | null>(null);
  const isUploadingRef = useRef(false);
  const showNodeKindTagsRef = useRef(readNodeTagVisibilityPreference());
  const generateProgressResetTimerRef = useRef<number | null>(null);
  const remoteSyncMetaRef = useRef<RemoteSyncMeta>(DEFAULT_REMOTE_SYNC_META);
  const cleanupStaleAttachmentsRef = useRef<(
    nextData: AiCaseMindData,
    options?: CleanupStaleAttachmentOptions
  ) => Promise<number>>(async () => 0);
  const schedulePersistRef = useRef<(nextData: AiCaseMindData, nextSelectedNodeId: string | null) => void>(
    () => undefined
  );

  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [workspaceName, setWorkspaceName] = useState('AI Testcase Workspace');
  const [requirementText, setRequirementText] = useState('');
  const [mindData, setMindData] = useState<AiCaseMindData | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
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
  const [activePanelSection, setActivePanelSection] = useState<TopPanelSection | null>('requirement');
  const [canvasScalePercent, setCanvasScalePercent] = useState(100);
  const [showNodeKindTags, setShowNodeKindTags] = useState<boolean>(() => readNodeTagVisibilityPreference());

  useEffect(() => {
    selectedNodeIdRef.current = selectedNodeId;
  }, [selectedNodeId]);

  useEffect(() => {
    mindDataRef.current = mindData;
  }, [mindData]);

  useEffect(() => {
    showNodeKindTagsRef.current = showNodeKindTags;
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(NODE_TAG_VISIBILITY_STORAGE_KEY, showNodeKindTags ? 'true' : 'false');
    }
  }, [showNodeKindTags]);

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
      clearGenerateProgressTimers();
    };
  }, [clearGenerateProgressTimers]);

  useEffect(() => {
    return () => {
      attachments.forEach((attachment) => URL.revokeObjectURL(attachment.previewUrl));
    };
  }, [attachments]);

  const persistDocument = useCallback(
    async (nextData: AiCaseMindData, nextSelectedNodeId: string | null) => {
      const now = Date.now();
      const currentDoc = docRef.current;
      const remoteMeta = remoteSyncMetaRef.current;
      const nextDoc: AiCaseWorkspaceDocument = {
        id: AI_CASE_WORKSPACE_ID,
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
      const shouldRefresh = options?.refreshMind ?? true;

      setMindData(normalized);
      mindDataRef.current = normalized;

      if (options?.selectedId !== undefined) {
        setSelectedNodeId(options.selectedId);
      }

      if (mindRef.current && shouldRefresh) {
        mindRef.current.refresh(normalized as MindElixirData);

        if (selectedId) {
          window.setTimeout(() => {
            if (!mindRef.current || !selectedId) {
              return;
            }
            try {
              const topic = mindRef.current.findEle(selectedId);
              mindRef.current.selectNode(topic);
            } catch {
              // no-op: node may not exist after refresh
            }
          }, 0);
        }
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

    const bootstrap = async () => {
      try {
        const storedDoc = await getWorkspaceDocument(AI_CASE_WORKSPACE_ID);
        if (!active) return;

        if (storedDoc) {
          const normalized = normalizeMindData(storedDoc.mapData, {
            showNodeKindTags: showNodeKindTagsRef.current,
          });
          const remoteMeta = resolveRemoteSyncMeta(storedDoc);
          remoteSyncMetaRef.current = remoteMeta;
          setRemoteSyncMeta(remoteMeta);

          docRef.current = {
            ...storedDoc,
            mapData: normalized,
            syncMode: remoteMeta.syncMode,
            remoteWorkspaceId: remoteMeta.remoteWorkspaceId,
            remoteVersion: remoteMeta.remoteVersion,
            remoteStatus: remoteMeta.remoteStatus,
            lastRemoteSyncedAt: remoteMeta.lastRemoteSyncedAt,
          };
          setWorkspaceName(storedDoc.name || 'AI Testcase Workspace');
          setRequirementText(storedDoc.requirement || '');
          setMindData(normalized);
          setSelectedNodeId(storedDoc.lastSelectedNodeId ?? normalized.nodeData.id);
          setSaveState('saved');
        } else {
          const initialData = normalizeMindData(createInitialMindData('AI Testcase Workspace'), {
            showNodeKindTags: showNodeKindTagsRef.current,
          });
          const initialDoc: AiCaseWorkspaceDocument = {
            id: AI_CASE_WORKSPACE_ID,
            name: 'AI Testcase Workspace',
            requirement: '',
            mapData: initialData,
            version: 1,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            lastSelectedNodeId: initialData.nodeData.id,
            syncMode: 'local',
            remoteWorkspaceId: null,
            remoteVersion: null,
            remoteStatus: null,
            lastRemoteSyncedAt: null,
          };

          await saveWorkspaceDocument(initialDoc);
          if (!active) return;

          remoteSyncMetaRef.current = resolveRemoteSyncMeta(initialDoc);
          setRemoteSyncMeta(remoteSyncMetaRef.current);
          docRef.current = initialDoc;
          setMindData(initialData);
          setSelectedNodeId(initialDoc.lastSelectedNodeId);
          setSaveState('saved');
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
          id: AI_CASE_WORKSPACE_ID,
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
    };
  }, []);

  useEffect(() => {
    if (isBootstrapping || !mapContainerRef.current || mindRef.current || !mindDataRef.current) {
      return;
    }

    const initialData = mindDataRef.current;
    const instance = new MindElixir({
      el: mapContainerRef.current,
      direction: MindElixir.SIDE,
      editable: true,
      contextMenu: true,
      toolBar: false,
      keypress: true,
      allowUndo: true,
      locale: 'en',
      overflowHidden: false,
    });

    const initError = instance.init(initialData as MindElixirData);
    if (initError) {
      toast.error('脑图初始化失败');
      console.error('[AICases] mind-elixir init failed', initError);
      return;
    }

    mindRef.current = instance;
    instance.toCenter();
    setCanvasScalePercent(Math.round((instance.scaleVal ?? 1) * 100));

    const onOperation = () => {
      if (!mindRef.current) {
        return;
      }

      const previousNodeIds = mindDataRef.current ? collectNodeIds(mindDataRef.current.nodeData) : [];
      const snapshot = normalizeMindData(mindRef.current.getData() as AiCaseMindData, {
        showNodeKindTags: showNodeKindTagsRef.current,
      });
      const nextNodeIdSet = new Set(collectNodeIds(snapshot.nodeData));
      const removedNodeCount = previousNodeIds.filter((nodeId) => !nextNodeIdSet.has(nodeId)).length;

      setMindData(snapshot);
      mindDataRef.current = snapshot;
      setCanvasScalePercent(Math.round((mindRef.current.scaleVal ?? 1) * 100));
      schedulePersistRef.current(snapshot, selectedNodeIdRef.current);

      if (removedNodeCount > 0) {
        void cleanupStaleAttachmentsRef.current(snapshot, {
          reason: 'node_deleted',
          showCountToast: true,
        }).then((cleanedCount) => {
          if (cleanedCount > 0) {
            setAttachmentReloadSeed((value) => value + 1);
          }
        });
      }
    };

    const onSelectNodes = (nodes: Array<{ id: string }>) => {
      const nextSelected = nodes[0]?.id ?? null;
      setSelectedNodeId(nextSelected);

      if (!mindRef.current) {
        return;
      }

      const snapshot = normalizeMindData(mindRef.current.getData() as AiCaseMindData, {
        showNodeKindTags: showNodeKindTagsRef.current,
      });
      setMindData(snapshot);
      mindDataRef.current = snapshot;
      schedulePersistRef.current(snapshot, nextSelected);
    };

    const onUnselectNodes = () => {
      setSelectedNodeId(null);

      if (!mindRef.current) {
        return;
      }

      const snapshot = normalizeMindData(mindRef.current.getData() as AiCaseMindData, {
        showNodeKindTags: showNodeKindTagsRef.current,
      });
      setMindData(snapshot);
      mindDataRef.current = snapshot;
      schedulePersistRef.current(snapshot, null);
    };

    instance.bus.addListener('operation', onOperation);
    instance.bus.addListener('selectNodes', onSelectNodes);
    instance.bus.addListener('unselectNodes', onUnselectNodes);

    return () => {
      instance.bus.removeListener('operation', onOperation);
      instance.bus.removeListener('selectNodes', onSelectNodes);
      instance.bus.removeListener('unselectNodes', onUnselectNodes);
      instance.destroy();
      mindRef.current = null;
    };
  }, [isBootstrapping]);

  const selectedNode = useMemo(() => {
    if (!mindData || !selectedNodeId) {
      return null;
    }
    return findNodeById(mindData.nodeData, selectedNodeId);
  }, [mindData, selectedNodeId]);

  const selectedNodeStatus = selectedNode?.metadata?.status ?? 'todo';
  const canEditSelectedNode = selectedNode?.metadata?.kind === 'testcase';

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

  const togglePanelSection = useCallback((section: TopPanelSection) => {
    setActivePanelSection((prev) => (prev === section ? null : section));
  }, []);

  const handleCanvasScale = useCallback((scale: number) => {
    if (!mindRef.current) {
      return;
    }

    const nextScale = Math.max(MIN_CANVAS_SCALE, Math.min(MAX_CANVAS_SCALE, scale));
    mindRef.current.scale(nextScale);
    setCanvasScalePercent(Math.round(nextScale * 100));
  }, []);

  const handleZoomOut = useCallback(() => {
    const current = mindRef.current?.scaleVal ?? canvasScalePercent / 100;
    handleCanvasScale(current - CANVAS_SCALE_STEP);
  }, [canvasScalePercent, handleCanvasScale]);

  const handleZoomIn = useCallback(() => {
    const current = mindRef.current?.scaleVal ?? canvasScalePercent / 100;
    handleCanvasScale(current + CANVAS_SCALE_STEP);
  }, [canvasScalePercent, handleCanvasScale]);

  const handleCenterCanvas = useCallback(() => {
    if (!mindRef.current) {
      return;
    }

    mindRef.current.toCenter();
    setCanvasScalePercent(Math.round((mindRef.current.scaleVal ?? 1) * 100));
  }, []);

  const handleFitCanvas = useCallback(() => {
    if (!mindRef.current) {
      return;
    }

    mindRef.current.scaleFit();
    setCanvasScalePercent(Math.round((mindRef.current.scaleVal ?? 1) * 100));
  }, []);

  const startGenerateProgress = useCallback(
    (initialStage: string = '正在连接后端流式通道...') => {
      clearGenerateProgressTimers();
      setGenerationProgress(2);
      setGenerationStageText(initialStage);
    },
    [clearGenerateProgressTimers]
  );

  const applyGenerateProgress = useCallback((event: { progress?: unknown; stage?: unknown }) => {
    if (typeof event.progress === 'number' && Number.isFinite(event.progress)) {
      const nextProgress = Math.max(0, Math.min(99, Math.round(event.progress)));
      setGenerationProgress((prev) => Math.max(prev, nextProgress));
    }

    if (typeof event.stage === 'string' && event.stage.trim()) {
      setGenerationStageText(event.stage.trim());
    }
  }, []);

  const finishGenerateProgress = useCallback(
    (nextStageText: string) => {
      clearGenerateProgressTimers();
      setGenerationStageText(nextStageText);
      setGenerationProgress(100);

      generateProgressResetTimerRef.current = window.setTimeout(() => {
        setGenerationProgress(0);
        setGenerationStageText('');
      }, 900);
    },
    [clearGenerateProgressTimers]
  );

  const streamGenerateFromBackend = useCallback(async (): Promise<StreamGenerateResultPayload> => {
    const token = localStorage.getItem('auth_token') || sessionStorage.getItem('auth_token');

    const response = await fetch('/api/ai-cases/generate/stream', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        requirementText,
        workspaceName,
        persist: false,
      }),
    });

    if (!response.ok) {
      let message = `流式生成失败（HTTP ${response.status}）`;
      try {
        const payload = await response.json();
        if (typeof payload?.message === 'string' && payload.message.trim()) {
          message = payload.message;
        }
      } catch {
        // no-op
      }
      throw new Error(message);
    }

    if (!response.body) {
      throw new Error('后端未返回可读取的流式响应');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let finalPayload: StreamGenerateResultPayload | null = null;

    const processEventBlock = (block: string): void => {
      let eventName = 'message';
      const dataLines: string[] = [];

      block.split('\n').forEach((line) => {
        if (!line || line.startsWith(':')) {
          return;
        }

        if (line.startsWith('event:')) {
          eventName = line.slice(6).trim();
          return;
        }

        if (line.startsWith('data:')) {
          dataLines.push(line.slice(5).trimStart());
        }
      });

      if (dataLines.length === 0) {
        return;
      }

      let payload: any;
      try {
        payload = JSON.parse(dataLines.join('\n'));
      } catch {
        return;
      }

      if (eventName === 'progress') {
        applyGenerateProgress(payload);
        return;
      }

      if (eventName === 'result') {
        finalPayload = payload?.data ?? null;
        return;
      }

      if (eventName === 'error') {
        throw new Error(
          typeof payload?.message === 'string' && payload.message.trim()
            ? payload.message
            : '远端 AI 生成失败'
        );
      }

      if (eventName === 'done' && payload?.success === false) {
        throw new Error(
          typeof payload?.message === 'string' && payload.message.trim()
            ? payload.message
            : '远端 AI 生成终止'
        );
      }
    };

    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');

      let separatorIndex = buffer.indexOf('\n\n');
      while (separatorIndex !== -1) {
        const block = buffer.slice(0, separatorIndex).trim();
        buffer = buffer.slice(separatorIndex + 2);

        if (block) {
          processEventBlock(block);
        }

        separatorIndex = buffer.indexOf('\n\n');
      }
    }

    buffer += decoder.decode().replace(/\r\n/g, '\n');
    if (buffer.trim()) {
      processEventBlock(buffer.trim());
    }

    if (!finalPayload) {
      throw new Error('流式响应未返回生成结果');
    }

    return finalPayload;
  }, [applyGenerateProgress, requirementText, workspaceName]);

  const handleToggleNodeKindTags = useCallback(() => {
    const nextVisible = !showNodeKindTagsRef.current;
    showNodeKindTagsRef.current = nextVisible;
    setShowNodeKindTags(nextVisible);

    const currentData = mindDataRef.current;
    if (currentData) {
      const nextData = normalizeMindData(currentData, {
        showNodeKindTags: nextVisible,
      });

      setDataAndSync(nextData, {
        selectedId: selectedNodeIdRef.current,
        refreshMind: true,
      });
    }

    toast.success(nextVisible ? '已开启节点标签展示' : '已隐藏节点标签');
  }, [setDataAndSync]);

  const applyWorkspaceDetail = useCallback(
    (workspace: AiCaseWorkspaceDetail, options?: { keepSelection?: boolean }) => {
      const now = Date.now();
      const fallbackDoc: AiCaseWorkspaceDocument = {
        id: AI_CASE_WORKSPACE_ID,
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
        const rows = await listNodeAttachments(AI_CASE_WORKSPACE_ID, selectedNodeId);
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
    if (isBootstrapping || !mindDataRef.current) {
      return;
    }

    schedulePersistRef.current(mindDataRef.current, selectedNodeIdRef.current);
  }, [workspaceName, requirementText, isBootstrapping, remoteSyncMeta]);

  const cleanupStaleAttachments = useCallback(
    async (nextData: AiCaseMindData, options?: CleanupStaleAttachmentOptions): Promise<number> => {
      const activeNodeIds = collectNodeIds(nextData.nodeData);

      try {
        const cleanedCount = await deleteStaleWorkspaceAttachments(AI_CASE_WORKSPACE_ID, activeNodeIds);

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
    async (inputFiles: File[], source: 'picker' | 'paste') => {
      const currentData = mindDataRef.current;
      const currentSelectedNodeId = selectedNodeIdRef.current;

      if (!currentData || !currentSelectedNodeId) {
        toast.error('请先选中一个测试节点，再上传截图');
        return;
      }

      const selectedNodeInData = findNodeById(currentData.nodeData, currentSelectedNodeId);
      if (selectedNodeInData?.metadata?.kind !== 'testcase') {
        toast.error('请先选中一个测试节点，再上传截图');
        return;
      }

      if (inputFiles.length === 0) {
        return;
      }

      if (isUploadingRef.current) {
        toast.warning('截图上传中，请稍候');
        return;
      }

      isUploadingRef.current = true;
      setIsUploading(true);

      try {
        let nextData = currentData;
        let successCount = 0;

        for (const [index, file] of inputFiles.entries()) {
          if (!file.type.startsWith('image/')) {
            toast.error(`${file.name || '截图文件'} 不是图片文件，已跳过`);
            continue;
          }

          if (file.size > MAX_UPLOAD_BYTES) {
            toast.error(`${file.name || '截图文件'} 超过 8MB，已跳过`);
            continue;
          }

          const normalizedFile = file.name
            ? file
            : new File([file], `clipboard-${Date.now()}-${index + 1}.png`, {
                type: file.type || 'image/png',
                lastModified: Date.now(),
              });

          const attachmentId = createAiCaseAttachmentId();
          await saveNodeAttachment({
            id: attachmentId,
            docId: AI_CASE_WORKSPACE_ID,
            nodeId: currentSelectedNodeId,
            name: normalizedFile.name,
            mimeType: normalizedFile.type,
            size: normalizedFile.size,
            createdAt: Date.now(),
            blob: normalizedFile,
          });

          nextData = appendNodeAttachmentId(nextData, currentSelectedNodeId, attachmentId);
          successCount += 1;
        }

        if (successCount > 0) {
          setDataAndSync(nextData, {
            selectedId: currentSelectedNodeId,
            refreshMind: false,
          });
          setAttachmentReloadSeed((value) => value + 1);
          toast.success(source === 'paste' ? `已粘贴 ${successCount} 张截图` : `已上传 ${successCount} 张截图`);
        }
      } catch (error) {
        console.error('[AICases] failed to upload attachment', error);
        toast.error('截图上传失败，请重试');
      } finally {
        isUploadingRef.current = false;
        setIsUploading(false);
      }
    },
    [setDataAndSync]
  );

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
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
  }, [uploadImageFiles]);

  const handleGenerate = async () => {
    if (!requirementText.trim()) {
      toast.error('请先输入需求描述，再执行 AI 生成');
      return;
    }

    startGenerateProgress();
    setIsGenerating(true);
    try {
      const payload = await streamGenerateFromBackend();
      const generated =
        payload && typeof payload === 'object' && 'generated' in payload
          ? payload.generated
          : payload;

      if (!generated || !generated.mapData) {
        throw new Error('AI 返回数据为空');
      }

      setGenerationStageText('正在回写脑图节点与结构化步骤...');
      const normalized = normalizeMindData(generated.mapData, {
        showNodeKindTags: showNodeKindTagsRef.current,
      });
      setDataAndSync(normalized, {
        selectedId: normalized.nodeData.id,
        refreshMind: true,
      });

      await cleanupStaleAttachments(normalized);
      setAttachmentReloadSeed((value) => value + 1);
      finishGenerateProgress(generated.source === 'llm' ? 'AI 生成完成' : '模板生成完成');
      toast.success(`AI 用例脑图生成完成（${generated.source === 'llm' ? '大模型' : '回退模板'}）`);
    } catch (error) {
      console.error('[AICases] remote stream generate failed, fallback local', error);
      setGenerationProgress(68);
      setGenerationStageText('远端流式生成失败，正在切换本地模板...');

      const generated = generateMindDataFromRequirement(requirementText, workspaceName);
      setDataAndSync(generated, {
        selectedId: generated.nodeData.id,
        refreshMind: true,
      });
      await cleanupStaleAttachments(generated);
      setAttachmentReloadSeed((value) => value + 1);
      finishGenerateProgress('本地模板生成完成');
      toast.warning('远端流式 AI 生成失败，已使用本地模板生成');
    } finally {
      setIsGenerating(false);
    }
  };

  const handlePublishRemote = async () => {
    if (!mindData) {
      toast.error('脑图尚未初始化，无法发布');
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
  };

  const handleSyncFromRemote = async () => {
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
  };

  const handleResetTemplate = async () => {
    const next = createInitialMindData(workspaceName || 'AI Testcase Workspace');
    setDataAndSync(next, {
      selectedId: next.nodeData.id,
      refreshMind: true,
    });
    await cleanupStaleAttachments(next);
    setAttachmentReloadSeed((value) => value + 1);
    toast.success('已恢复默认脑图模板');
  };

  const handleStatusChange = async (status: AiCaseNodeStatus) => {
    if (!mindData || !selectedNodeId || !canEditSelectedNode) {
      toast.error('请先选中一个可执行测试节点');
      return;
    }

    const remoteId = remoteSyncMetaRef.current.remoteWorkspaceId;
    if (remoteId) {
      setIsUpdatingNodeStatus(true);
      try {
        const response = await aiCasesApi.updateNodeStatus(remoteId, {
          nodeId: selectedNodeId,
          status,
          meta: {
            source: 'frontend_click',
            localUpdatedAt: Date.now(),
          },
        });

        if (!response.data?.workspace) {
          throw new Error('远端未返回工作台数据');
        }

        applyWorkspaceDetail(response.data.workspace, { keepSelection: true });
        toast.success('节点状态已同步到远端');
      } catch (error) {
        console.error('[AICases] update remote node status failed', error);
        toast.error(error instanceof Error ? error.message : '节点状态同步失败');
      } finally {
        setIsUpdatingNodeStatus(false);
      }
      return;
    }

    const next = setNodeStatus(mindData, selectedNodeId, status);
    setDataAndSync(next, {
      selectedId: selectedNodeId,
      refreshMind: true,
    });
  };

  const handleUploadAttachment = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    void uploadImageFiles(files, 'picker');
  };

  const handleDeleteAttachment = async (attachmentId: string) => {
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
  };

  const hasSelectedNode = Boolean(selectedNodeId);
  const selectedNodeLabel = selectedNode?.topic || '未选中节点';

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

  return (
    <div className="h-full min-h-0 flex flex-col gap-3 p-3 sm:p-4 bg-slate-50/50 dark:bg-slate-950/30">
      <section className="sticky top-0 z-20 rounded-xl border border-slate-200/80 dark:border-slate-700/60 bg-white/95 dark:bg-slate-900/95 backdrop-blur shadow-sm">
        <div className="border-b border-slate-200/80 dark:border-slate-700/60 px-4 py-3">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="min-w-0 flex items-center gap-3">
              <div className="shrink-0 p-2.5 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                <BrainCircuit className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <h1 className="text-lg font-semibold tracking-tight text-slate-900 dark:text-white">AI 用例工作台</h1>
                <p className="text-xs text-slate-500 dark:text-slate-400">Phase 1 Desktop 布局 · 画布优先</p>
              </div>
              <div className="min-w-[220px] flex-1 max-w-[420px]">
                <input
                  value={workspaceName}
                  onChange={(event) => setWorkspaceName(event.target.value)}
                  className="h-9 w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-sm"
                  placeholder="输入脑图标题"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2">
              <div className="rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 px-3 py-1.5 text-right">
                <div className="text-xs font-medium text-slate-600 dark:text-slate-300">{saveStateText}</div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">{remoteStatusText}</div>
              </div>
              <Button className="gap-1.5" onClick={handleGenerate} disabled={isGenerating || isPublishingRemote || isSyncingRemote}>
                {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bot className="h-4 w-4" />}
                AI 生成
              </Button>
              <Button
                variant="outline"
                className="gap-1.5"
                onClick={handleResetTemplate}
                disabled={isGenerating || isPublishingRemote || isSyncingRemote}
              >
                <RotateCcw className="h-4 w-4" />
                重置模板
              </Button>
              <Button
                variant="outline"
                className="gap-1.5"
                onClick={handlePublishRemote}
                disabled={isPublishingRemote || isGenerating || isSyncingRemote}
              >
                {isPublishingRemote ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                {isRemoteLinked ? '同步远端' : '发布远端'}
              </Button>
              <Button
                variant="outline"
                className="gap-1.5"
                onClick={handleSyncFromRemote}
                disabled={!isRemoteLinked || isSyncingRemote || isPublishingRemote}
              >
                {isSyncingRemote ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link className="h-4 w-4" />}
                拉取远端
              </Button>
              <Button
                type="button"
                variant="outline"
                className="gap-1.5"
                onClick={handleToggleNodeKindTags}
                disabled={isGenerating}
              >
                {showNodeKindTags ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                {showNodeKindTags ? '隐藏标签' : '显示标签'}
              </Button>
            </div>
          </div>
        </div>

        {(isGenerating || generationProgress > 0) ? (
          <div className="px-4 py-2 border-b border-slate-200/80 dark:border-slate-700/60 bg-indigo-50/70 dark:bg-indigo-500/10">
            <div className="flex items-center justify-between text-xs text-indigo-700 dark:text-indigo-200 mb-1">
              <span className="inline-flex items-center gap-1.5">
                <Loader2 className={`h-3.5 w-3.5 ${isGenerating ? 'animate-spin' : ''}`} />
                {generationStageText || '正在准备生成...'}
              </span>
              <span className="font-medium">{generationProgress}%</span>
            </div>
            <div className="h-2 rounded-full bg-indigo-100 dark:bg-indigo-500/20 overflow-hidden">
              <div
                className="h-full rounded-full bg-indigo-500 transition-[width] duration-300"
                style={{ width: `${generationProgress}%` }}
              />
            </div>
          </div>
        ) : null}

        <div className="px-4 py-2 border-b border-slate-200/80 dark:border-slate-700/60">
          <div className="flex flex-wrap items-center gap-2">
            {TOP_PANEL_TABS.map((tab) => {
              const isActive = activePanelSection === tab.key;
              const isNodeLinked = hasSelectedNode && (tab.key === 'node' || tab.key === 'attachment');
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => togglePanelSection(tab.key)}
                  className={`h-8 px-3 rounded-md border text-xs font-medium transition-colors ${
                    isActive
                      ? 'border-indigo-300 bg-indigo-50 text-indigo-700 dark:border-indigo-500/70 dark:bg-indigo-500/15 dark:text-indigo-200'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800'
                  } ${isNodeLinked ? 'ring-1 ring-indigo-300 dark:ring-indigo-500/60' : ''}`}
                >
                  <span className="inline-flex items-center gap-1.5">
                    {tab.label}
                    <span className="text-[10px]">{isActive ? '▾' : '▸'}</span>
                  </span>
                </button>
              );
            })}
            <div className="ml-auto rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 px-3 py-1 text-[11px] text-slate-600 dark:text-slate-300 max-w-full">
              当前节点：<span className="font-medium text-slate-900 dark:text-white">{selectedNodeLabel}</span>
              {hasSelectedNode ? <span className="ml-2">状态：{selectedNodeStatus}</span> : null}
            </div>
          </div>
        </div>

        {activePanelSection ? (
          <div className="px-4 pb-4 pt-3 border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900">
            {activePanelSection === 'requirement' ? (
              <div className="space-y-2">
                <label className="text-xs uppercase tracking-wide text-slate-500 font-semibold">需求输入</label>
                <textarea
                  value={requirementText}
                  onChange={(event) => setRequirementText(event.target.value)}
                  className="w-full min-h-[120px] rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 text-sm leading-6"
                  placeholder="粘贴 PRD、需求描述或技术方案，点击 AI 生成脑图"
                />
              </div>
            ) : null}

            {activePanelSection === 'progress' ? (
              <div className="grid grid-cols-2 xl:grid-cols-4 gap-2 text-xs">
                <div className="rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 p-2">总测试点: <span className="font-semibold">{progress.total}</span></div>
                <div className="rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 p-2">待执行: <span className="font-semibold text-slate-700 dark:text-slate-100">{progress.todo}</span></div>
                <div className="rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 p-2">执行中: <span className="font-semibold text-blue-600">{progress.doing}</span></div>
                <div className="rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 p-2">阻塞: <span className="font-semibold text-amber-600">{progress.blocked}</span></div>
                <div className="rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 p-2">通过: <span className="font-semibold text-emerald-600">{progress.passed}</span></div>
                <div className="rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 p-2">失败: <span className="font-semibold text-rose-600">{progress.failed}</span></div>
                <div className="rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 p-2">跳过: <span className="font-semibold text-purple-600">{progress.skipped}</span></div>
                <div className="rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 p-2">完成率: <span className="font-semibold">{progress.completionRate}%</span></div>
              </div>
            ) : null}

            {activePanelSection === 'node' ? (
              <div className="space-y-3">
                <div className="rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 p-3">
                  <div className="text-[11px] text-slate-500 mb-1">当前节点</div>
                  <div className="text-sm font-medium text-slate-900 dark:text-white break-words">{selectedNodeLabel}</div>
                  {hasSelectedNode ? (
                    <div className="mt-1 text-xs text-slate-500 dark:text-slate-300">
                      状态：<span className="font-medium">{selectedNodeStatus}</span>
                    </div>
                  ) : null}
                </div>
                <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-2">
                  {STATUS_ACTIONS.map((item) => (
                    <button
                      key={item.status}
                      type="button"
                      onClick={() => void handleStatusChange(item.status)}
                      disabled={!canEditSelectedNode || isUpdatingNodeStatus}
                      className={`h-9 rounded-md border text-xs font-medium flex items-center justify-center gap-1.5 transition-colors disabled:opacity-40 ${item.className} ${
                        selectedNodeStatus === item.status ? 'ring-2 ring-offset-1 ring-indigo-400' : ''
                      }`}
                    >
                      {item.icon}
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {activePanelSection === 'attachment' ? (
              <div className="space-y-3">
                <label className="inline-flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300 cursor-pointer">
                  <span className="inline-flex h-8 px-3 items-center rounded-md border border-dashed border-slate-300 hover:border-indigo-400 hover:text-indigo-600 transition-colors">
                    {isUploading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Upload className="h-3.5 w-3.5 mr-1" />}
                    上传截图
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={handleUploadAttachment}
                    disabled={!canEditSelectedNode || isUploading}
                  />
                </label>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">支持复制截图后按 Ctrl/Cmd + V 直接粘贴上传</div>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2 max-h-44 overflow-y-auto pr-1">
                  {attachments.length === 0 ? (
                    <div className="text-xs text-slate-500">当前节点暂无截图证据</div>
                  ) : (
                    attachments.map((attachment) => (
                      <div key={attachment.id} className="rounded border border-slate-200 dark:border-slate-700 p-2 bg-slate-50/70 dark:bg-slate-800/40">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="text-xs font-medium truncate">{attachment.name}</div>
                            <div className="text-[11px] text-slate-500">{Math.round(attachment.size / 1024)} KB</div>
                          </div>
                          <button
                            type="button"
                            className="text-slate-400 hover:text-rose-500 transition-colors"
                            onClick={() => handleDeleteAttachment(attachment.id)}
                            aria-label="删除截图"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        <a
                          href={attachment.previewUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-2 inline-flex items-center gap-1 text-[11px] text-indigo-600 hover:underline"
                        >
                          <ImageIcon className="h-3.5 w-3.5" />
                          预览截图
                        </a>
                      </div>
                    ))
                  )}
                </div>
              </div>
            ) : null}

            {activePanelSection === 'mode' ? (
              <div className="rounded-md border border-indigo-100 dark:border-indigo-500/30 bg-indigo-50/70 dark:bg-indigo-500/10 p-3 text-xs text-indigo-900 dark:text-indigo-200 leading-5 space-y-2">
                <div className="font-semibold flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5" />
                  Phase 2 双模式（本地草稿 + 远端同步）
                </div>
                <div>
                  当前模式：{remoteSyncMeta.syncMode === 'hybrid' ? 'Hybrid（已接入远端）' : 'Local（仅本地草稿）'}。
                  {isRemoteLinked ? ' 节点状态点击将直接调用远端接口并回写本地草稿。' : ' 发布到远端后可启用节点状态实时远端更新。'}
                </div>
                <div className="flex items-center justify-between rounded-md border border-indigo-200/80 dark:border-indigo-400/30 bg-white/70 dark:bg-slate-900/40 px-2.5 py-2 text-[11px]">
                  <span className="inline-flex items-center gap-1.5">
                    <Tags className="h-3.5 w-3.5" />
                    节点标签：{showNodeKindTags ? '全局显示中' : '全局隐藏中'}
                  </span>
                  <button
                    type="button"
                    className="underline underline-offset-2 hover:opacity-80"
                    onClick={handleToggleNodeKindTags}
                  >
                    {showNodeKindTags ? '隐藏标签' : '显示标签'}
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </section>

      <section className="flex-1 min-h-0 rounded-xl border border-slate-200/80 dark:border-slate-700/60 bg-white dark:bg-slate-900 shadow-sm overflow-hidden flex flex-col">
        <div className="h-11 px-3 border-b border-slate-200/80 dark:border-slate-700/60 flex items-center justify-between bg-slate-50/70 dark:bg-slate-800/40">
          <div className="text-xs text-slate-500 dark:text-slate-400">画布工具</div>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" className="h-8 px-2.5" onClick={handleZoomOut}>
              -
            </Button>
            <div className="w-14 text-center text-xs font-medium text-slate-600 dark:text-slate-300">{canvasScalePercent}%</div>
            <Button type="button" variant="outline" size="sm" className="h-8 px-2.5" onClick={handleZoomIn}>
              +
            </Button>
            <Button type="button" variant="outline" size="sm" className="h-8" onClick={handleCenterCanvas}>
              居中
            </Button>
            <Button type="button" variant="outline" size="sm" className="h-8" onClick={handleFitCanvas}>
              适配
            </Button>
          </div>
        </div>

        <div className="flex-1 min-h-[620px] [&_.map-container]:!bg-white dark:[&_.map-container]:!bg-slate-900">
          <div ref={mapContainerRef} className="h-full w-full" />
        </div>
      </section>

      <div className="text-[11px] text-slate-500 px-1 flex items-center gap-1.5">
        <CircleDashed className="h-3.5 w-3.5" />
        节点编辑、拖拽和快捷键由 Mind-Elixir 提供，节点状态和截图证据由工作台扩展。
      </div>
    </div>
  );
}

export default function AICases() {
  return (
    <ErrorBoundary>
      <AiCasesInner />
    </ErrorBoundary>
  );
}
