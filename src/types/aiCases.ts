export const AI_CASE_WORKSPACE_ID = 'ai-case-workspace-default';

export type AiCaseNodeStatus = 'todo' | 'doing' | 'blocked' | 'passed' | 'failed' | 'skipped';
export type AiCaseNodePriority = 'P0' | 'P1' | 'P2' | 'P3';
export type AiCaseNodeKind = 'root' | 'module' | 'scenario' | 'testcase';
export type AiCaseWorkspaceStatus = 'draft' | 'published' | 'archived';
export type AiCaseSyncMode = 'local' | 'hybrid';

export interface AiCaseStatusHistoryItem {
  status: AiCaseNodeStatus;
  at: number;
}

export interface AiCaseNodeMetadata {
  kind: AiCaseNodeKind;
  status: AiCaseNodeStatus;
  priority: AiCaseNodePriority;
  owner: string | null;
  attachmentIds: string[];
  aiGenerated: boolean;
  nodeVersion: number;
  updatedAt: number;
  statusHistory: AiCaseStatusHistoryItem[];
}

export interface AiCaseNodeTag {
  text: string;
  style?: Record<string, string>;
}

export interface AiCaseNode {
  id: string;
  topic: string;
  children?: AiCaseNode[];
  expanded?: boolean;
  note?: string;
  tags?: AiCaseNodeTag[];
  style?: Record<string, string>;
  metadata?: AiCaseNodeMetadata;
  [key: string]: unknown;
}

export interface AiCaseMindData {
  nodeData: AiCaseNode;
  [key: string]: unknown;
}

export interface AiCaseWorkspaceDocument {
  id: string;
  name: string;
  requirement: string;
  mapData: AiCaseMindData;
  version: number;
  createdAt: number;
  updatedAt: number;
  lastSelectedNodeId: string | null;
  syncMode?: AiCaseSyncMode;
  remoteWorkspaceId?: number | null;
  remoteVersion?: number | null;
  remoteStatus?: AiCaseWorkspaceStatus | null;
  lastRemoteSyncedAt?: number | null;
}

export interface AiCaseAttachmentRecord {
  id: string;
  docId: string;
  nodeId: string;
  name: string;
  mimeType: string;
  size: number;
  createdAt: number;
  blob: Blob;
}

export interface AiCaseAttachmentPreview extends AiCaseAttachmentRecord {
  previewUrl: string;
}

export interface AiCaseProgress {
  total: number;
  todo: number;
  doing: number;
  blocked: number;
  passed: number;
  failed: number;
  skipped: number;
  done: number;
  completionRate: number;
}

export const AI_CASE_NODE_STATUS_ORDER: AiCaseNodeStatus[] = [
  'todo',
  'doing',
  'blocked',
  'passed',
  'failed',
  'skipped',
];

export { createAiCaseNodeId } from '@shared/types/aiCaseNodeMetadata';

export function createAiCaseAttachmentId(): string {
  return `attachment-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
}

export function isAiCaseNodeStatus(value: string): value is AiCaseNodeStatus {
  return (AI_CASE_NODE_STATUS_ORDER as string[]).includes(value);
}