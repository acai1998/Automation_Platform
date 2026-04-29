/**
 * 前后端共享的 AI 用例节点元数据规范化工具
 *
 * 此文件统一维护：
 * 1. 节点 ID 生成规则（避免前后端各自维护一份导致格式漂移）
 * 2. 节点元数据字段校验规则（priority / status / statusHistory / attachmentIds）
 *
 * 前端引用：src/types/aiCases.ts 导出的 `createAiCaseNodeId` 应转发自此处
 * 后端引用：server/services/aiCaseStructureBuilder.ts 的 `createAiCaseNodeId` 应转发自此处
 *
 * @module shared/types/aiCaseNodeMetadata
 */

// ─── 类型定义（与前后端保持同步）────────────────────────────────────────────

export type AiCaseNodeStatus = 'todo' | 'doing' | 'blocked' | 'passed' | 'failed' | 'skipped';
export type AiCaseNodePriority = 'P0' | 'P1' | 'P2' | 'P3';
export type AiCaseNodeKind = 'root' | 'module' | 'scenario' | 'testcase';

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

// ─── 常量 ────────────────────────────────────────────────────────────────────

const STATUS_ORDER: AiCaseNodeStatus[] = ['todo', 'doing', 'blocked', 'passed', 'failed', 'skipped'];
const VALID_PRIORITIES: AiCaseNodePriority[] = ['P0', 'P1', 'P2', 'P3'];

/** statusHistory 最大保留条数 */
export const STATUS_HISTORY_MAX_LENGTH = 20;

/** 单个 attachmentId 的最大字节长度（防止异常数据写入） */
export const ATTACHMENT_ID_MAX_LENGTH = 256;

// ─── 校验函数 ─────────────────────────────────────────────────────────────────

/**
 * 校验 status 字段是否合法
 */
export function isAiCaseNodeStatus(value: unknown): value is AiCaseNodeStatus {
  return typeof value === 'string' && (STATUS_ORDER as string[]).includes(value);
}

/**
 * 校验 priority 字段是否合法
 */
export function isAiCaseNodePriority(value: unknown): value is AiCaseNodePriority {
  return (VALID_PRIORITIES as unknown[]).includes(value);
}

/**
 * 安全解析 status：非法值回退到 fallback
 */
export function parseStatus(value: unknown, fallback: AiCaseNodeStatus = 'todo'): AiCaseNodeStatus {
  return isAiCaseNodeStatus(value) ? value : fallback;
}

/**
 * 安全解析 priority：非法值回退到 fallback
 */
export function parsePriority(value: unknown, fallback: AiCaseNodePriority = 'P2'): AiCaseNodePriority {
  return isAiCaseNodePriority(value) ? value : fallback;
}

// ─── ID 生成（统一规则，前后端共用）─────────────────────────────────────────

/**
 * 生成节点 ID
 * 格式：`node-{8位随机字母数字}-{Base36时间戳}`
 * 此函数为前后端共用唯一实现，避免格式漂移。
 */
export function createAiCaseNodeId(): string {
  return `node-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
}

// ─── 元数据规范化（统一规则，前后端共用）─────────────────────────────────────

export interface NormalizeNodeMetadataOptions {
  /** 推断的节点类型（当 incoming 中无 kind 时使用） */
  inferredKind: AiCaseNodeKind;
  /** 当 incoming 中无 status 时使用的默认值 */
  defaultStatus?: AiCaseNodeStatus;
  /** 当 incoming 中无 priority 时使用的默认值 */
  defaultPriority?: AiCaseNodePriority;
}

/**
 * 规范化节点元数据：统一的字段校验与默认值填充规则
 *
 * 前后端均应使用此函数，而非各自维护一份校验逻辑。
 *
 * @param incoming - 原始 metadata（可能来自外部数据、旧版格式或 LLM 输出）
 * @param options - 推断参数
 * @returns 规范化后的完整 AiCaseNodeMetadata
 */
export function normalizeNodeMetadata(
  incoming: Partial<AiCaseNodeMetadata> | undefined | null,
  options: NormalizeNodeMetadataOptions
): AiCaseNodeMetadata {
  const now = Date.now();
  const src = incoming ?? {};
  const defaultStatus = options.defaultStatus ?? 'todo';
  const defaultPriority = options.defaultPriority ?? 'P2';

  // status：严格枚举校验
  const status = isAiCaseNodeStatus(src.status) ? src.status : defaultStatus;

  // priority：严格枚举校验
  const priority = isAiCaseNodePriority(src.priority) ? src.priority : defaultPriority;

  // attachmentIds：只保留非空字符串，去重，限制长度
  const attachmentIds: string[] = Array.isArray(src.attachmentIds)
    ? [...new Set(
        src.attachmentIds.filter(
          (id): id is string =>
            typeof id === 'string' && id.trim().length > 0 && id.length <= ATTACHMENT_ID_MAX_LENGTH
        )
      )]
    : [];

  // nodeVersion：必须是正整数，否则重置为 1
  const nodeVersion = typeof src.nodeVersion === 'number' && src.nodeVersion > 0 && Number.isFinite(src.nodeVersion)
    ? src.nodeVersion
    : 1;

  // updatedAt：必须是有效数字时间戳
  const updatedAt = typeof src.updatedAt === 'number' && src.updatedAt > 0 ? src.updatedAt : now;

  // statusHistory：校验每条记录的 status 合法性，限制最大长度
  const statusHistory: AiCaseStatusHistoryItem[] = Array.isArray(src.statusHistory) && src.statusHistory.length > 0
    ? src.statusHistory
        .map((item) => ({
          status: isAiCaseNodeStatus(item?.status) ? item.status : status,
          at: typeof item?.at === 'number' && item.at > 0 ? item.at : now,
        }))
        .slice(-STATUS_HISTORY_MAX_LENGTH)
    : [{ status, at: now }];

  return {
    kind: src.kind ?? options.inferredKind,
    status,
    priority,
    owner: typeof src.owner === 'string' || src.owner === null ? (src.owner ?? null) : null,
    attachmentIds,
    aiGenerated: typeof src.aiGenerated === 'boolean' ? src.aiGenerated : false,
    nodeVersion,
    updatedAt,
    statusHistory,
  };
}

/**
 * 安全递增 nodeVersion（防止 undefined/NaN 导致版本号异常）
 */
export function incrementNodeVersion(currentVersion: number | undefined): number {
  const safe = typeof currentVersion === 'number' && currentVersion > 0 && Number.isFinite(currentVersion)
    ? currentVersion
    : 1;
  return safe + 1;
}
