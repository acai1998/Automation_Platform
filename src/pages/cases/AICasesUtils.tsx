import type { ReactNode } from 'react';
import { BrainCircuit, FileText, PlayCircle, ShieldAlert } from 'lucide-react';
import { expandImportedCaseNodesFromNote, normalizeMindData } from '@/lib/aiCaseMindMap';
import { createAiCaseNodeId, type AiCaseMindData, type AiCaseNode, type AiCaseNodeMetadata, type AiCaseNodeStatus, type AiCaseSyncMode, type AiCaseWorkspaceDocument, type AiCaseWorkspaceStatus } from '@/types/aiCases';
import type { AiCaseGenerationResult, AiCaseWorkspaceDetail } from '@/api';
import type { AiWorkspaceTabItem } from './components/AiWorkspaceTabs';

export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

export interface RemoteSyncMeta {
  syncMode: AiCaseSyncMode;
  remoteWorkspaceId: number | null;
  remoteVersion: number | null;
  remoteStatus: AiCaseWorkspaceStatus | null;
  lastRemoteSyncedAt: number | null;
}

export const DEFAULT_REMOTE_SYNC_META: RemoteSyncMeta = {
  syncMode: 'local',
  remoteWorkspaceId: null,
  remoteVersion: null,
  remoteStatus: null,
  lastRemoteSyncedAt: null,
};

export interface CleanupStaleAttachmentOptions {
  reason?: 'regular' | 'node_deleted';
  showCountToast?: boolean;
}

export type StreamGenerateResultPayload =
  | AiCaseGenerationResult
  | { generated: AiCaseGenerationResult; workspace: AiCaseWorkspaceDetail };

export const NODE_TAG_VISIBILITY_STORAGE_KEY = 'ai-case-node-tags-visible';
export const WAIT_COPY_MAGIC = 'MIND-ELIXIR-WAIT-COPY';

export type WorkspaceTab = 'materials' | 'results' | 'coverage' | 'execution';
type RiskLevel = 'high' | 'medium' | 'low';

export interface GeneratedCaseListItem {
  id: string;
  title: string;
  moduleName: string;
  priority: string;
  status: AiCaseNodeStatus;
  riskLevel: RiskLevel;
  sourceLabel: string;
}

export const WORKSPACE_TAB_ITEMS: AiWorkspaceTabItem<WorkspaceTab>[] = [
  {
    id: 'materials',
    label: '输入材料',
    description: '准备 PRD、附件和外部来源',
    icon: <FileText className="h-4 w-4" />,
  },
  {
    id: 'results',
    label: '生成结果',
    description: '查看结构化结果与详情',
    icon: <BrainCircuit className="h-4 w-4" />,
  },
  {
    id: 'coverage',
    label: '覆盖与风险',
    description: '评估高风险点与覆盖缺口',
    icon: <ShieldAlert className="h-4 w-4" />,
  },
  {
    id: 'execution',
    label: '执行与回流',
    description: '发布、执行与质量沉淀',
    icon: <PlayCircle className="h-4 w-4" />,
  },
];

function inferRiskLevel(priority: string | undefined, status: AiCaseNodeStatus): RiskLevel {
  if (status === 'failed' || priority === 'P0') {
    return 'high';
  }
  if (priority === 'P1' || priority === 'P2' || status === 'blocked') {
    return 'medium';
  }
  return 'low';
}

export function collectGeneratedCases(mapData: AiCaseMindData): GeneratedCaseListItem[] {
  const modules = mapData.nodeData.children ?? [];
  const items: GeneratedCaseListItem[] = [];

  for (const moduleNode of modules) {
    const moduleName = typeof moduleNode.topic === 'string' && moduleNode.topic.trim()
      ? moduleNode.topic.trim()
      : '未命名模块';

    for (const caseNode of ((moduleNode.children ?? []) as AiCaseNode[])) {
      const metadata = caseNode.metadata as Partial<AiCaseNodeMetadata> | undefined;
      const priority = metadata?.priority ?? 'P2';
      const status = metadata?.status ?? 'todo';

      items.push({
        id: caseNode.id,
        title: caseNode.topic,
        moduleName,
        priority,
        status,
        riskLevel: inferRiskLevel(priority, status),
        sourceLabel: caseNode.metadata?.aiGenerated ? 'AI 生成' : '手动补充',
      });
    }
  }

  return items;
}

export function getFirstGeneratedCaseId(mapData: AiCaseMindData): string | null {
  return collectGeneratedCases(mapData)[0]?.id ?? null;
}

export function WorkspacePanelCard({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
      <div className="flex items-start justify-between gap-4 border-b border-slate-100 dark:border-slate-800 px-5 py-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{title}</h3>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{description}</p>
        </div>
        {action}
      </div>
      <div className="px-5 py-4">{children}</div>
    </div>
  );
}

/**
 * 浮动面板拖拽 hook
 * 返回面板位置、重置位置函数、拖拽把手事件处理函数
 */
export function readNodeTagVisibilityPreference(): boolean {
  if (typeof window === 'undefined') {
    return true;
  }

  return window.localStorage.getItem(NODE_TAG_VISIBILITY_STORAGE_KEY) !== 'false';
}

export function collectNodeIds(root: AiCaseNode): string[] {
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

export function sanitizeImportedNodes(rawNodes: unknown[]): AiCaseNode[] {
  return rawNodes
    .map((rawNode) => cloneImportedNode(rawNode))
    .filter((node): node is AiCaseNode => Boolean(node));
}

export function resolveRemoteSyncMeta(doc: AiCaseWorkspaceDocument | null | undefined): RemoteSyncMeta {
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

export function mergeRemoteWorkspaceToDoc(
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
