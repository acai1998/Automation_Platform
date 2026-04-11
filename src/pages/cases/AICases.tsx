import { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import MindElixir, { type MindElixirData, type MindElixirInstance } from 'mind-elixir';
import 'mind-elixir/style.css';
import { BrainCircuit, History, Loader2, Menu, X, FileText, Bot, GripHorizontal } from 'lucide-react';
import { useLocation } from 'wouter';
import ErrorBoundary from '@/components/ErrorBoundary';
import { useAiGeneration } from '@/contexts/AiGenerationContext';
import { AiCaseSidebar } from './components/AiCaseSidebar';
import { AiCaseCanvasToolbar } from './components/AiCaseCanvasToolbar';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import {
  aiCasesApi,
  type AiCaseGenerationResult,
  type AiCaseWorkspaceDetail,
} from '@/api';
import { Button } from '@/components/ui/button';
import {
  appendNodeAttachmentId,
  collectDescendantTestcaseIds,
  computeProgress,
  createInitialMindData,
  expandImportedCaseNodesFromNote,
  findNodeById,
  generateMindDataFromRequirement,
  inferWorkspaceNameFromRequirement,
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
  createAiCaseNodeId,
  type AiCaseAttachmentPreview,
  type AiCaseMindData,
  type AiCaseNode,
  type AiCaseNodeStatus,
  type AiCaseWorkspaceDocument,
  type AiCaseSyncMode,
  type AiCaseWorkspaceStatus,
} from '@/types/aiCases';

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

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

type StreamGenerateResultPayload =
  | AiCaseGenerationResult
  | { generated: AiCaseGenerationResult; workspace: AiCaseWorkspaceDetail };

const MIN_CANVAS_SCALE = 0.6;
const MAX_CANVAS_SCALE = 1.8;
const CANVAS_SCALE_STEP = 0.1;
const NODE_TAG_VISIBILITY_STORAGE_KEY = 'ai-case-node-tags-visible';
const WAIT_COPY_MAGIC = 'MIND-ELIXIR-WAIT-COPY';
const SIDEBAR_WIDTH = 320;
const FLOAT_PANEL_WIDTH = 300;
const FLOAT_PANEL_DEFAULT_RIGHT = 16;
const FLOAT_PANEL_DEFAULT_TOP = 8;

/**
 * 浮动面板拖拽 hook
 * 返回面板位置、重置位置函数、拖拽把手事件处理函数
 */
function useDraggablePanel(containerRef: React.RefObject<HTMLElement | null>, panelOpen: boolean) {
  const PANEL_W = FLOAT_PANEL_WIDTH;
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const dragging = useRef(false);
  const startPointer = useRef({ x: 0, y: 0 });
  const startPanel = useRef({ x: 0, y: 0 });

  // 每次打开面板时重置到右上角默认位置
  useEffect(() => {
    if (panelOpen) {
      setPos(null);
    }
  }, [panelOpen]);

  /** 计算边界限制后的实际位置 */
  const clamp = useCallback((x: number, y: number): { x: number; y: number } => {
    const el = containerRef.current;
    if (!el) return { x, y };
    const { width, height } = el.getBoundingClientRect();
    // 面板高度用概估值（最大 80% 容器高）和最小展示高度
    const panelH = Math.min(height * 0.8, height - 16);
    const minX = 0;
    const maxX = width - PANEL_W;
    const minY = 0;
    const maxY = height - panelH;
    return {
      x: Math.max(minX, Math.min(maxX, x)),
      y: Math.max(minY, Math.min(maxY, y)),
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containerRef]);

  const onPointerDown = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    // 只响应主键
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragging.current = true;
    startPointer.current = { x: e.clientX, y: e.clientY };
    // 获取面板父元素，用于计算当前面板 left/top
    const panel = (e.currentTarget as HTMLElement).closest<HTMLElement>('[data-float-panel]');
    if (panel) {
      startPanel.current = { x: panel.offsetLeft, y: panel.offsetTop };
    }
  }, []);

  const onPointerMove = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    e.preventDefault();
    const dx = e.clientX - startPointer.current.x;
    const dy = e.clientY - startPointer.current.y;
    setPos(clamp(startPanel.current.x + dx, startPanel.current.y + dy));
  }, [clamp]);

  const onPointerUp = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    dragging.current = false;
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
  }, []);

  return { pos, onPointerDown, onPointerMove, onPointerUp };
}

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function cloneImportedNode(rawNode: unknown): AiCaseNode | null {
  if (!isRecord(rawNode)) {
    return null;
  }

  const node = rawNode as unknown as AiCaseNode;
  const topic = typeof node.topic === 'string' && node.topic.trim() ? node.topic.trim() : '未命名节点';
  const cloned: AiCaseNode = {
    ...node,
    id: createAiCaseNodeId(),
    topic,
    expanded: node.expanded ?? true,
  };

  if (Array.isArray(node.children) && node.children.length > 0) {
    const clonedChildren = node.children
      .map((child) => cloneImportedNode(child))
      .filter((child): child is AiCaseNode => Boolean(child));

    if (clonedChildren.length > 0) {
      cloned.children = clonedChildren;
    } else {
      delete cloned.children;
    }
  } else {
    delete cloned.children;
  }

  return cloned;
}

function sanitizeImportedNodes(rawNodes: unknown[]): AiCaseNode[] {
  return rawNodes
    .map((rawNode) => cloneImportedNode(rawNode))
    .filter((node): node is AiCaseNode => Boolean(node));
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
  const normalizedMapData = normalizeMindData(workspace.mapData);
  const expanded = expandImportedCaseNodesFromNote(normalizedMapData);

  return {
    ...doc,
    name: workspace.name,
    requirement: workspace.requirementText ?? doc.requirement,
    mapData: expanded.data,
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

const mapContainerRef = useRef<HTMLDivElement | null>(null);
const canvasSectionRef = useRef<HTMLElement | null>(null);
const canvasDivRef = useRef<HTMLDivElement | null>(null);
  const mindRef = useRef<MindElixirInstance | null>(null);
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
  // 多选节点 ID 列表（MindElixir 支持 Ctrl/Shift 多选）
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
  const [canvasScalePercent, setCanvasScalePercent] = useState(100);
  const [isCanvasFullscreen, setIsCanvasFullscreen] = useState(false);
  const [showNodeKindTags, setShowNodeKindTags] = useState<boolean>(() => readNodeTagVisibilityPreference());
  const [isImportingMindNodes, setIsImportingMindNodes] = useState(false);
// 移动端侧边栏抽屉
const [sidebarOpen, setSidebarOpen] = useState(false);
// 浮动面板（桌端）
const [panelOpen, setPanelOpen] = useState(false);
// 浮动面板拖拽
const { pos: panelPos, onPointerDown: panelDragDown, onPointerMove: panelDragMove, onPointerUp: panelDragUp } = useDraggablePanel(canvasDivRef, panelOpen);
  // 需求编辑弹窗
  const [isRequirementDialogOpen, setIsRequirementDialogOpen] = useState(false);

  useEffect(() => {
    selectedNodeIdRef.current = selectedNodeId;
  }, [selectedNodeId]);

  useEffect(() => {
    selectedNodeIdsRef.current = selectedNodeIds;
  }, [selectedNodeIds]);

  useEffect(() => {
    mindDataRef.current = mindData;
  }, [mindData]);

  useEffect(() => {
    showNodeKindTagsRef.current = showNodeKindTags;
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(NODE_TAG_VISIBILITY_STORAGE_KEY, showNodeKindTags ? 'true' : 'false');
    }
  }, [showNodeKindTags]);


  useEffect(() => {
    const onFullscreenChange = () => {
      setIsCanvasFullscreen(document.fullscreenElement === canvasSectionRef.current);
    };

    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', onFullscreenChange);
    };
  }, []);

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
            // 立即进入"生成中"状态，避免短暂闪出默认脑图
            setIsGenerating(true);
            setGenerationProgress(2);
            setGenerationStageText('正在连接后端流式通道...');
            // 延迟一点执行，确保 MindElixir 实例已挂载
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
            // 立即进入"生成中"状态，避免短暂闪出默认脑图
            setIsGenerating(true);
            setGenerationProgress(2);
            setGenerationStageText('正在连接后端流式通道...');
            // 延迟一点执行，确保 MindElixir 实例已挂载
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
      locale: 'zh_CN',
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
          // 保留完整多选列表，first ID 作为"主选中节点"（用于单选场景，如附件）
          const allIds = nodes.map((n) => n.id).filter(Boolean);
          const nextSelected = allIds[0] ?? null;
          setSelectedNodeId(nextSelected);
          setSelectedNodeIds(allIds);
          selectedNodeIdsRef.current = allIds;

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
          setSelectedNodeIds([]);
          selectedNodeIdsRef.current = [];

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

  const handleToggleCanvasFullscreen = useCallback(async () => {
    const section = canvasSectionRef.current;
    if (!section) {
      return;
    }

    try {
      if (document.fullscreenElement === section) {
        await document.exitFullscreen();
        return;
      }

      await section.requestFullscreen();
    } catch (error) {
      console.error('[AICases] toggle fullscreen failed', error);
      toast.error('切换全屏失败，请检查浏览器权限');
    }
  }, []);

  useEffect(() => {
    if (!mindRef.current) {
      return;
    }

    const timer = window.setTimeout(() => {
      if (!mindRef.current) {
        return;
      }

      mindRef.current.scaleFit();
      setCanvasScalePercent(Math.round((mindRef.current.scaleVal ?? 1) * 100));
    }, 80);

    return () => {
      window.clearTimeout(timer);
    };
  }, [isCanvasFullscreen]);

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

  const streamGenerateFromBackend = useCallback(async (): Promise<StreamGenerateResultPayload> => {
    // 中止上一次未完成的流式请求（如快速重复点击生成按钮）
    streamAbortControllerRef.current?.abort();
    const controller = new AbortController();
    streamAbortControllerRef.current = controller;

    const token = localStorage.getItem('auth_token') || sessionStorage.getItem('auth_token');

    const streamEndpoint =
      typeof window !== 'undefined'
        ? new URL('/api/ai-cases/generate/stream', window.location.origin).toString()
        : 'http://localhost:3000/api/ai-cases/generate/stream';

    const response = await fetch(streamEndpoint, {
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
      signal: controller.signal,
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

    // 渐进式渲染：收到第一个 node_module 时初始化骨架脑图
    let skeletonData: AiCaseMindData | null = null;

    const processEventBlock = (block: string): void => {
      // 如果请求已被中止，不再处理任何事件
      if (controller.signal.aborted) {
        return;
      }

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

      let payload: Record<string, unknown>;
      try {
        payload = JSON.parse(dataLines.join('\n'));
      } catch {
        return;
      }

      if (eventName === 'progress') {
        applyGenerateProgress(payload);
        return;
      }

      // 渐进式节点推送：每收到一个 module 节点，立即按索引位置替换到骨架脑图
      if (eventName === 'node_module') {
        const moduleNode = payload?.moduleNode;
        const moduleIndex: number = typeof payload?.moduleIndex === 'number' ? payload.moduleIndex : 0;
        const totalModules: number = typeof payload?.totalModules === 'number' ? payload.totalModules : 1;

        if (!moduleNode || typeof moduleNode !== 'object') {
          return;
        }

        if (!skeletonData) {
          // 第一个 module：创建最小骨架根节点（不生成默认子节点，避免白白创建再丢弃）
          const emptyRoot = normalizeMindData({
            nodeData: {
              id: `node-skeleton-root`,
              topic: workspaceName || 'AI Testcase Workspace',
              expanded: true,
              children: [],
            },
          }, { showNodeKindTags: showNodeKindTagsRef.current });
          skeletonData = emptyRoot;
        }

        // 性能优化：只对当前新模块做 normalize + expand，再按索引替换到骨架中
        // 避免每次全量 normalize 整棵树（旧逻辑每次 append 导致 O(n²) 开销）
        const singleModuleData: AiCaseMindData = {
          ...skeletonData,
          nodeData: {
            ...skeletonData.nodeData,
            children: [moduleNode as AiCaseNode],
          },
        };
        const normalizedSingleModule = normalizeMindData(singleModuleData, {
          showNodeKindTags: showNodeKindTagsRef.current,
        });
        const expandedSingleModule = expandImportedCaseNodesFromNote(normalizedSingleModule, {
          showNodeKindTags: showNodeKindTagsRef.current,
        });
        const normalizedModuleNode = expandedSingleModule.data.nodeData.children?.[0] as AiCaseNode | undefined;

        // 按索引替换（而非 append），防止并发推送或重试模块顺序错乱
        const nextChildren = [...(skeletonData.nodeData.children ?? [])];
        if (normalizedModuleNode) {
          nextChildren[moduleIndex] = normalizedModuleNode;
        }

        const nextSkeletonData: AiCaseMindData = {
          ...skeletonData,
          nodeData: {
            ...skeletonData.nodeData,
            children: nextChildren,
          },
        };
        skeletonData = nextSkeletonData;

        // 实时刷新脑图（使用 mindRef 直接刷新，不触发 schedulePersist 避免频繁写 IndexedDB）
        if (mindRef.current) {
          mindRef.current.refresh(nextSkeletonData as MindElixirData);
        }
        setMindData(nextSkeletonData);
        mindDataRef.current = nextSkeletonData;

        // 更新进度提示
        const progressPercent = Math.round(((moduleIndex + 1) / totalModules) * 40) + 55;
        setGenerationStageText(
          `正在生成功能模块 ${moduleIndex + 1}/${totalModules}：${String((moduleNode as Record<string, unknown>).topic ?? '').slice(0, 20)}`
        );
        setGenerationProgress(Math.min(95, progressPercent));
        return;
      }

      if (eventName === 'result') {
        finalPayload = (payload?.data ?? null) as StreamGenerateResultPayload | null;

        // 流式渲染结束时，立即用 AI 生成的 workspaceName 更新骨架脑图根节点 topic
        if (finalPayload !== null && typeof finalPayload === 'object') {
          const fp = finalPayload as Record<string, unknown>;
          const resultGenerated = 'generated' in fp
            ? (fp.generated as { workspaceName?: string } | undefined)
            : (fp as { workspaceName?: string });
          const resultWsName =
            typeof resultGenerated?.workspaceName === 'string' && resultGenerated.workspaceName.trim()
              ? resultGenerated.workspaceName.trim()
              : null;
          if (resultWsName && skeletonData) {
            const updatedSkeleton: AiCaseMindData = {
              ...skeletonData,
              nodeData: { ...skeletonData.nodeData, topic: resultWsName },
            };
            skeletonData = updatedSkeleton;
            if (mindRef.current) {
              mindRef.current.refresh(updatedSkeleton as MindElixirData);
            }
            setMindData(updatedSkeleton);
            mindDataRef.current = updatedSkeleton;
          }
        }
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

  // 用户在侧边栏手动修改工作台名称时调用，标记"已手动编辑"，后续不再自动推断覆盖
  const handleWorkspaceNameChange = useCallback((name: string) => {
    isWorkspaceNameUserEditedRef.current = true;
    setWorkspaceName(name);
  }, []);

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
          docId: docRef.current?.id ?? activeDocId,
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
                toast.error('当前脑图未初始化，无法导入复制节点');
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

  const handleGenerate = useCallback(async () => {
    if (!requirementText.trim()) {
      toast.error('请先输入需求描述，再执行 AI 生成');
      return;
    }

    setIsRequirementDialogOpen(false);
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

      // 用 AI 自动生成的工作台名称更新主节点和工作台名
      const aiWorkspaceName =
        typeof generated.workspaceName === 'string' && generated.workspaceName.trim()
          ? generated.workspaceName.trim()
          : workspaceName;

      // AI 生成后用 AI 给出的名称覆盖，标记为"已编辑"避免后续被自动推断再次覆盖
      isWorkspaceNameUserEditedRef.current = true;

      // 始终确保 mapData 根节点 topic 与最终 workspaceName 一致（创建新对象，不直接修改）
      const finalMapData =
        generated.mapData.nodeData.topic !== aiWorkspaceName
          ? {
              ...generated.mapData,
              nodeData: { ...generated.mapData.nodeData, topic: aiWorkspaceName },
            }
          : generated.mapData;

      setGenerationStageText('正在回写脑图节点与结构化步骤...');
      const normalized = normalizeMindData(finalMapData, {
        showNodeKindTags: showNodeKindTagsRef.current,
      });
      const expanded = expandImportedCaseNodesFromNote(normalized, {
        showNodeKindTags: showNodeKindTagsRef.current,
      });

      // 先更新 mindDataRef.current，再更新 workspaceName，避免因 React 状态更新异步特性
      // 导致 useEffect 在 mindDataRef.current 更新前触发，持久化旧数据覆盖新数据
      setDataAndSync(expanded.data, {
        selectedId: expanded.data.nodeData.id,
        refreshMind: true,
      });

      // 在 setDataAndSync 之后更新 workspaceName，确保 mindDataRef.current 已是新数据
      if (aiWorkspaceName !== workspaceName) {
        setWorkspaceName(aiWorkspaceName);
      }

      await cleanupStaleAttachments(expanded.data);
      setAttachmentReloadSeed((value) => value + 1);
      finishGenerateProgress(generated.source === 'llm' ? 'AI 生成完成' : '模板生成完成');

      // 判断用户是否已离开 AI 用例页，若已离开则弹跨页面 toast
      const isOnAiPage = window.location.pathname === '/cases/ai';
      if (isOnAiPage) {
        toast.success(`AI 用例脑图生成完成（${generated.source === 'llm' ? '大模型' : '回退模板'}）`);
      } else {
        toast.success('AI 用例生成完成，点击返回查看', {
          duration: 8000,
          action: {
            label: '返回查看',
            onClick: () => setLocation('/cases/ai'),
          },
        });
      }
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      console.error('[AICases] remote stream generate failed, fallback local', error);
      setGenerationProgress(68);
      setGenerationStageText('远端流式生成失败，正在切换本地模板...');
      // 通知全局 Context 进度更新（用于 Sidebar 角标）
      notifyProgress(68, '远端流式生成失败，正在切换本地模板...');

      const generated = generateMindDataFromRequirement(requirementText, workspaceName);
      const expanded = expandImportedCaseNodesFromNote(generated, {
        showNodeKindTags: showNodeKindTagsRef.current,
      });

      setDataAndSync(expanded.data, {
        selectedId: expanded.data.nodeData.id,
        refreshMind: true,
      });
      await cleanupStaleAttachments(expanded.data);
      setAttachmentReloadSeed((value) => value + 1);
      finishGenerateProgress('本地模板生成完成');

      // 认证失败单独提示，引导用户重新登录
      const isAuthError =
        errMsg.includes('未提供认证令牌') ||
        errMsg.includes('无效或过期的令牌') ||
        errMsg.includes('HTTP 401') ||
        errMsg.includes('未认证');

      const isOnAiPageOnError = window.location.pathname === '/cases/ai';
      if (isAuthError) {
        toast.warning('登录状态已过期，AI 生成已切换至本地模板。请重新登录后再试', {
          duration: 6000,
          action: {
            label: '去登录',
            onClick: () => window.location.replace('/login'),
          },
        });
      } else if (!isOnAiPageOnError) {
        toast.warning('AI 生成失败，已使用本地模板，点击返回查看', {
          duration: 8000,
          action: {
            label: '返回查看',
            onClick: () => setLocation('/cases/ai'),
          },
        });
      } else {
        toast.warning(`远端 AI 生成失败，已使用本地模板生成（${errMsg}）`, { duration: 5000 });
      }
    } finally {
      setIsGenerating(false);
    }
  }, [
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
    toast.success('已恢复默认脑图模板');
  }, [workspaceName, setDataAndSync, cleanupStaleAttachments]);

  const handleStatusChange = useCallback(async (status: AiCaseNodeStatus) => {
    if (!mindData || !canEditAnySelectedNode) {
      toast.error('请先选中一个可执行测试节点');
      return;
    }

    // 实际要操作的节点 ID 列表：所有选中节点中 kind=testcase 的
    const targetIds = selectedTestcaseNodeIds;
    if (targetIds.length === 0) {
      toast.error('请先选中一个可执行测试节点');
      return;
    }

    const remoteId = remoteSyncMetaRef.current.remoteWorkspaceId;
    if (remoteId) {
      setIsUpdatingNodeStatus(true);
      try {
        // 远端模式：串行更新每个 testcase 节点（API 每次只处理一个节点）
        let latestWorkspace = null;
        // 首次尝试前先做一次同步检查（只在第一个节点时处理 nodeId not found 问题）
        let needsSync = false;

        for (const nodeId of targetIds) {
          try {
            const resp = await aiCasesApi.updateNodeStatus(remoteId, {
              nodeId,
              status,
              meta: { source: 'frontend_click', localUpdatedAt: Date.now() },
            });
            if (resp.data?.workspace) {
              latestWorkspace = resp.data.workspace;
            }
          } catch (firstError) {
            const msg = firstError instanceof Error ? firstError.message : '';
            if (msg.includes('未找到指定 nodeId') && !needsSync) {
              // 首次遇到"未找到 nodeId"：同步 mapData 到远端后，重试当前节点
              needsSync = true;
              console.warn('[AICases] nodeId not found on remote, auto-syncing mapData then retrying...');
              const workspaceNameValue = workspaceName.trim() || 'AI Testcase Workspace';
              const syncResp = await aiCasesApi.updateWorkspace(remoteId, {
                name: workspaceNameValue,
                requirementText: requirementText.trim(),
                mapData: mindData,
                syncSource: 'mixed',
                status: remoteSyncMetaRef.current.remoteStatus ?? 'draft',
              });
              if (syncResp.data) {
                updateRemoteSyncMeta({
                  remoteVersion: syncResp.data.version,
                  remoteStatus: syncResp.data.status,
                  lastRemoteSyncedAt: Date.now(),
                });
              }
              // 同步后重试
              const retryResp = await aiCasesApi.updateNodeStatus(remoteId, {
                nodeId,
                status,
                meta: { source: 'frontend_click', localUpdatedAt: Date.now() },
              });
              if (retryResp.data?.workspace) {
                latestWorkspace = retryResp.data.workspace;
              }
            } else {
              throw firstError;
            }
          }
        }

        if (!latestWorkspace) {
          throw new Error('远端未返回工作台数据');
        }

        applyWorkspaceDetail(latestWorkspace, { keepSelection: true });
        toast.success(
          targetIds.length > 1
            ? `已同步 ${targetIds.length} 个节点状态到远端`
            : '节点状态已同步到远端'
        );
      } catch (error) {
        console.error('[AICases] update remote node status failed', error);
        toast.error(error instanceof Error ? error.message : '节点状态同步失败');
      } finally {
        setIsUpdatingNodeStatus(false);
      }
      return;
    }

    // 本地模式：一次性批量更新所有 testcase 节点状态
    let next = mindData;
    for (const nodeId of targetIds) {
      next = setNodeStatus(next, nodeId, status);
    }
    setDataAndSync(next, {
      // 保留当前主选中节点
      selectedId: selectedNodeId,
      refreshMind: true,
    });
    if (targetIds.length > 1) {
      toast.success(`已批量更新 ${targetIds.length} 个节点状态`);
    }
  }, [mindData, canEditAnySelectedNode, selectedTestcaseNodeIds, selectedNodeId, workspaceName, requirementText, applyWorkspaceDetail, updateRemoteSyncMeta, setDataAndSync]);

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
    <div className="h-full flex flex-col bg-white dark:bg-slate-950 overflow-hidden">

      {/* 顶部标题栏（全屏时隐藏） */}
      {!isCanvasFullscreen ? (
        <header className="shrink-0 h-12 flex items-center justify-between px-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          <div className="flex items-center gap-2.5">
            {/* 移动端汉堡菜单 */}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="lg:hidden h-8 w-8 p-0"
              onClick={() => setSidebarOpen((v) => !v)}
            >
              {sidebarOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </Button>
            <div className="p-1.5 rounded-md bg-indigo-500/10 text-indigo-600 dark:text-indigo-300">
              <BrainCircuit className="h-4 w-4" />
            </div>
            <h1 className="text-sm font-semibold text-slate-900 dark:text-white">AI 用例工作台</h1>
          </div>
          <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs gap-1.5 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white"
              onClick={() => setIsRequirementDialogOpen(true)}
            >
              <FileText className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">需求信息</span>
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs gap-1.5 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white"
              onClick={() => setLocation('/cases/ai-create')}
            >
              <History className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">用例记录</span>
            </Button>
            <span className="hidden sm:block">{saveStateText}</span>
            <span className="hidden md:block">{remoteStatusText}</span>
          </div>
        </header>
      ) : null}

      {/* 主体：左侧边栏 + 右侧画布 */}
      <div className="flex-1 min-h-0 flex relative">

        {/* 移动端侧边栏 Drawer（全屏时隐藏） */}
        {!isCanvasFullscreen && sidebarOpen ? (
          <div className="lg:hidden absolute inset-0 z-40 flex">
            {/* 遮罩 */}
            <div
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
              onClick={() => setSidebarOpen(false)}
            />
            {/* 侧边栏内容 */}
            <div
              className="relative z-50 h-full overflow-y-auto overflow-x-hidden bg-white dark:bg-slate-900 shadow-2xl"
              style={{ width: SIDEBAR_WIDTH }}
            >
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
        ) : null}

        {/* 右侧画布区域 */}
        <section
          ref={canvasSectionRef}
          className={`flex-1 min-w-0 flex flex-col overflow-hidden ${
            isCanvasFullscreen ? 'fixed inset-0 z-50 bg-white dark:bg-slate-900' : ''
          }`}
        >
          <AiCaseCanvasToolbar
            scalePercent={canvasScalePercent}
            isFullscreen={isCanvasFullscreen}
            showNodeKindTags={showNodeKindTags}
            panelOpen={panelOpen}
            onZoomIn={handleZoomIn}
            onZoomOut={handleZoomOut}
            onCenter={handleCenterCanvas}
            onFit={handleFitCanvas}
            onToggleFullscreen={() => void handleToggleCanvasFullscreen()}
            onToggleNodeTags={handleToggleNodeKindTags}
            onTogglePanel={() => setPanelOpen((v) => !v)}
          />

          <div
            ref={canvasDivRef}
            className="relative flex-1 min-h-0 [&_.map-container]:!bg-white dark:[&_.map-container]:!bg-slate-900 [&_.map-container_.map-canvas]:!transition-none"
          >
            <div ref={mapContainerRef} className="h-full w-full" />

            {/* 桌端浮动面板（全屏时也可显示，在 XMind 画布内可拖拽） */}
            {panelOpen ? (
              <div
                data-float-panel
                className="hidden lg:flex absolute z-40 flex-col rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden select-none"
                style={
                  panelPos
                    ? { width: FLOAT_PANEL_WIDTH, maxHeight: 'calc(100% - 16px)', left: panelPos.x, top: panelPos.y }
                    : { width: FLOAT_PANEL_WIDTH, maxHeight: 'calc(100% - 16px)', right: FLOAT_PANEL_DEFAULT_RIGHT, top: FLOAT_PANEL_DEFAULT_TOP }
                }
              >
                {/* 拖拽把手 */}
                <div
                  className="shrink-0 flex items-center justify-center h-7 cursor-grab active:cursor-grabbing bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  onPointerDown={panelDragDown}
                  onPointerMove={panelDragMove}
                  onPointerUp={panelDragUp}
                >
                  <GripHorizontal className="h-3.5 w-3.5 text-slate-400" />
                </div>
                {/* 面板内容 */}
                <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
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
            ) : null}

            {/* AI 生成进度覆盖层 */}
            {isGenerating && (
              <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-white dark:bg-slate-900">
                <div className="flex flex-col items-center gap-5 max-w-xs w-full px-8">
                  {/* 动效图标 */}
                  <div className="relative flex items-center justify-center">
                    <div className="absolute w-16 h-16 rounded-full bg-indigo-500/15 animate-ping" />
                    <div className="relative w-12 h-12 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center shadow-lg shadow-indigo-500/30">
                      <Bot className="h-6 w-6 text-white" />
                    </div>
                  </div>

                  {/* 文字区域 */}
                  <div className="text-center space-y-1">
                    <p className="text-sm font-semibold text-slate-800 dark:text-white">
                      AI 正在生成测试用例...
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 min-h-[1.25rem]">
                      {generationStageText || '正在分析需求内容'}
                    </p>
                  </div>

                  {/* 进度条 */}
                  <div className="w-full space-y-1.5">
                    <div className="flex items-center justify-between text-[11px] text-slate-500">
                      <span>生成进度</span>
                      <span className="font-medium tabular-nums">{generationProgress}%</span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-500 ease-out"
                        style={{ width: `${generationProgress}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>
      </div>

      {/* 需求编辑弹窗 */}
      <Dialog open={isRequirementDialogOpen} onOpenChange={setIsRequirementDialogOpen}>
        <DialogContent className="sm:max-w-[600px]">
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
                placeholder="粘贴 PRD、需求描述或技术方案，点击「AI 生成」按钮自动生成测试用例脑图..."
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

export default function AICases() {
  return (
    <ErrorBoundary>
      <AiCasesInner />
    </ErrorBoundary>
  );
}
