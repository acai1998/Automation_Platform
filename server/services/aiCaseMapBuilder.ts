import {
  createAiCaseNodeId,
  incrementNodeVersion,
  normalizeNodeMetadata,
  parseStatus,
  parsePriority,
  type AiCaseNodeStatus,
  type AiCaseNodePriority,
  type AiCaseNodeKind,
  type AiCaseNodeMetadata,
  type AiCaseStatusHistoryItem,
  STATUS_HISTORY_MAX_LENGTH,
} from '@shared/types/aiCaseNodeMetadata';

// ─── 重新导出 shared 层类型，保持向后兼容（下游直接 import 此文件的代码不需要改）────
export type { AiCaseNodeStatus, AiCaseNodePriority, AiCaseNodeKind, AiCaseNodeMetadata, AiCaseStatusHistoryItem };

export interface AiCaseMapNode {
  id: string;
  topic: string;
  note?: string;
  expanded?: boolean;
  tags?: Array<string | { text: string; style?: Record<string, string> }>;
  metadata?: Partial<AiCaseNodeMetadata>;
  children?: AiCaseMapNode[];
  [key: string]: unknown;
}

export interface AiCaseMapData {
  nodeData: AiCaseMapNode;
  arrows?: unknown[];
  summaries?: unknown[];
  direction?: 0 | 1 | 2;
  theme?: unknown;
  [key: string]: unknown;
}

export interface AiCaseWorkspaceCounters {
  totalCases: number;
  todoCases: number;
  doingCases: number;
  blockedCases: number;
  passedCases: number;
  failedCases: number;
  skippedCases: number;
}

export interface AiCaseGenerationPlanCase {
  title: string;
  priority?: AiCaseNodePriority;
  note?: string;
  preconditions?: string[];
  steps?: string[];
  expectedResults?: string[];
}

export interface AiCaseGenerationPlanScenario {
  name: string;
  cases: AiCaseGenerationPlanCase[];
}

export interface AiCaseGenerationPlanModule {
  name: string;
  scenarios: AiCaseGenerationPlanScenario[];
}

export interface AiCaseGenerationPlan {
  workspaceName: string;
  modules: AiCaseGenerationPlanModule[];
}

export interface AiCaseNodeStatusUpdateResult {
  updated: boolean;
  previousStatus: AiCaseNodeStatus | null;
  currentStatus: AiCaseNodeStatus;
  nodeTopic: string;
  nodePath: string | null;
  mapData: AiCaseMapData;
}

function cloneMapData(data: AiCaseMapData): AiCaseMapData {
  if (typeof structuredClone === 'function') {
    return structuredClone(data);
  }
  return JSON.parse(JSON.stringify(data)) as AiCaseMapData;
}

function inferNodeKind(depth: number, childCount: number): AiCaseNodeKind {
  if (depth === 0) return 'root';
  if (childCount === 0) return 'testcase';
  if (depth === 1) return 'module';
  return 'scenario';
}

function normalizeNode(node: AiCaseMapNode, depth: number): AiCaseMapNode {
  const children = Array.isArray(node.children) ? node.children : [];
  const inferredKind = inferNodeKind(depth, children.length);

  // 复用 shared 层统一校验逻辑，避免重复维护
  const metadata = normalizeNodeMetadata(node.metadata as Partial<AiCaseNodeMetadata> | undefined, {
    inferredKind,
  });

  node.metadata = metadata;
  node.expanded = node.expanded ?? true;

  if (children.length > 0) {
    node.children = children.map((child) => normalizeNode(child, depth + 1));
  } else {
    delete node.children;
  }

  return node;
}

function createMetadata(kind: AiCaseNodeKind, now: number): AiCaseNodeMetadata {
  return {
    kind,
    status: 'todo',
    priority: 'P2',
    owner: null,
    attachmentIds: [],
    aiGenerated: false,
    nodeVersion: 1,
    updatedAt: now,
    statusHistory: [{ status: 'todo', at: now }],
  };
}

function createNode(
  topic: string,
  kind: AiCaseNodeKind,
  options?: {
    priority?: AiCaseNodePriority;
    note?: string;
    aiGenerated?: boolean;
    children?: AiCaseMapNode[];
  }
): AiCaseMapNode {
  const now = Date.now();
  const metadata = createMetadata(kind, now);
  metadata.priority = options?.priority ?? 'P2';
  metadata.aiGenerated = options?.aiGenerated ?? false;

  const node: AiCaseMapNode = {
    id: createAiCaseNodeId(),
    topic,
    expanded: true,
    metadata,
    ...(options?.children !== undefined ? { children: options.children } : {}),
  };

  if (options?.note !== undefined) {
    node.note = options.note;
  }

  return node;
}

function sanitizeChecklist(lines: string[] | undefined, fallback: string[]): string[] {
  if (!Array.isArray(lines)) {
    return fallback;
  }

  const next = lines
    .map((line) => (typeof line === 'string' ? line.trim() : ''))
    .filter((line) => Boolean(line));

  return next.length > 0 ? next : fallback;
}

/**
 * 将多条条目格式化为单行文本（与前端 fmtInline 保持一致）：
 * - 单条：直接返回原文
 * - 多条：1.xxx；2.xxx；3.xxx（分号拼接，不换行，不加前缀标签）
 * 契约：调用方应保证 items 非空
 */
function fmtInline(items: string[]): string {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0];
  return items.map((item, i) => `${i + 1}.${item}`).join('；');
}

/**
 * 构建单个 testcase 对应的 4 个扁平节点（用于挂在父 scenario 下）：
 *   节点1 = testcase 自身（测试点标题）—— 调用方负责创建，此处只返回节点2/3/4
 *   节点2 = 前置条件内容（多条用分号拼接，写在 topic 里，不展开子节点）
 *   节点3 = 测试步骤内容（同上）
 *   节点4 = 预期结果内容（同上）
 *
 * 注意：返回的 3 个节点应与 testcase 节点同级（均为父 scenario 的子节点），
 * 而不是 testcase 的子节点。
 */
function buildCaseSiblingNodes(testCase: AiCaseGenerationPlanCase): AiCaseMapNode[] {
  const hint = typeof testCase.note === 'string' ? testCase.note.trim() : '';

  const preconditions = sanitizeChecklist(testCase.preconditions, [
    '测试环境可用，账号与基础数据已准备完成',
  ]);

  const steps = sanitizeChecklist(testCase.steps, [
    '进入目标功能页面或接口入口',
    hint || `执行测试点：${testCase.title}`,
    '记录执行结果并保存关键截图',
  ]);

  const expectedResults = sanitizeChecklist(testCase.expectedResults, [
    '系统返回成功状态或页面展示正确反馈',
    '业务数据与页面状态符合需求描述',
  ]);

  return [
    createNode(fmtInline(preconditions), 'scenario', { aiGenerated: true }),
    createNode(fmtInline(steps), 'scenario', { aiGenerated: true }),
    createNode(fmtInline(expectedResults), 'scenario', { aiGenerated: true }),
  ];
}

// ID 生成规则统一维护在 shared 层，此处转发以保持向后兼容
export { createAiCaseNodeId } from '@shared/types/aiCaseNodeMetadata';

export function normalizeMapData(raw: unknown): AiCaseMapData {
  if (!raw || typeof raw !== 'object') {
    throw new Error('mapData 必须是对象');
  }

  const candidate = raw as Partial<AiCaseMapData>;
  if (!candidate.nodeData || typeof candidate.nodeData !== 'object') {
    throw new Error('mapData.nodeData 缺失或格式不正确');
  }

  const cloned = cloneMapData(candidate as AiCaseMapData);
  cloned.nodeData = normalizeNode(cloned.nodeData, 0);
  return cloned;
}

export function calculateWorkspaceCounters(mapData: AiCaseMapData): AiCaseWorkspaceCounters {
  const stats: AiCaseWorkspaceCounters = {
    totalCases: 0,
    todoCases: 0,
    doingCases: 0,
    blockedCases: 0,
    passedCases: 0,
    failedCases: 0,
    skippedCases: 0,
  };

  const visit = (node: AiCaseMapNode, depth: number): void => {
    const children = Array.isArray(node.children) ? node.children : [];
    // 传递真实 depth 以防止深层节点 kind 推断错误
    const kind = node.metadata?.kind ?? inferNodeKind(depth, children.length);
    // 只统计 testcase 类型节点（scenario 子节点不计入）
    const shouldCount = kind === 'testcase';

    if (shouldCount) {
      const status = parseStatus(node.metadata?.status, 'todo');
      stats.totalCases += 1;
      if (status === 'todo') stats.todoCases += 1;
      if (status === 'doing') stats.doingCases += 1;
      if (status === 'blocked') stats.blockedCases += 1;
      if (status === 'passed') stats.passedCases += 1;
      if (status === 'failed') stats.failedCases += 1;
      if (status === 'skipped') stats.skippedCases += 1;
    }

    children.forEach((child) => visit(child, depth + 1));
  };

  visit(mapData.nodeData, 0);
  return stats;
}

export function updateNodeStatusInMap(
  mapData: AiCaseMapData,
  nodeId: string,
  nextStatus: AiCaseNodeStatus
): AiCaseNodeStatusUpdateResult {
  const normalized = normalizeMapData(mapData);
  const next = cloneMapData(normalized);
  let previousStatus: AiCaseNodeStatus | null = null;
  let nodeTopic = '';
  let nodePath: string | null = null;
  let updated = false;

  const visit = (node: AiCaseMapNode, path: string[]): boolean => {
    const currentPath = [...path, node.topic];
    if (node.id === nodeId) {
      const metadata = node.metadata as AiCaseNodeMetadata;
      previousStatus = parseStatus(metadata.status, 'todo');
      nodeTopic = node.topic;
      nodePath = currentPath.join(' / ');
      const now = Date.now();

      node.metadata = {
        ...metadata,
        status: nextStatus,
        // 使用 shared 层的安全递增函数，防止 nodeVersion 为 undefined/NaN
        nodeVersion: incrementNodeVersion(metadata.nodeVersion),
        updatedAt: now,
        statusHistory: [...(metadata.statusHistory ?? []), { status: nextStatus, at: now }].slice(-STATUS_HISTORY_MAX_LENGTH),
      };
      updated = true;
      return true;
    }

    for (const child of node.children ?? []) {
      if (visit(child, currentPath)) {
        return true;
      }
    }

    return false;
  };

  visit(next.nodeData, []);

  return {
    updated,
    previousStatus,
    currentStatus: nextStatus,
    nodeTopic,
    nodePath,
    mapData: next,
  };
}

export function buildMapDataFromPlan(plan: AiCaseGenerationPlan): AiCaseMapData {
  const root = createNode(plan.workspaceName, 'root', {
    aiGenerated: true,
    children: plan.modules.map((module) =>
      createNode(module.name, 'module', {
        aiGenerated: true,
        // 保留 scenario 层：每个 scenario 独立成为子节点，避免语义丢失
        children: module.scenarios.map((scenario) => {
          // 每个 testcase 展开为 4 个扁平节点（testcase 本身 + 前置条件 + 测试步骤 + 预期结果），
          // 均作为 scenario 的子节点，而非 testcase 的子节点。
          const caseNodes: AiCaseMapNode[] = [];
          for (const testCase of scenario.cases) {
            // 节点1：测试点（无子节点）
            caseNodes.push(
              createNode(testCase.title, 'testcase', {
                aiGenerated: true,
                priority: parsePriority(testCase.priority, 'P1'),
              })
            );
            // 节点2/3/4：前置条件、测试步骤、预期结果（同级，内容写在 topic 里）
            caseNodes.push(...buildCaseSiblingNodes(testCase));
          }
          return createNode(scenario.name, 'scenario', {
            aiGenerated: true,
            children: caseNodes,
          });
        }),
      })
    ),
  });

  return normalizeMapData({ nodeData: root });
}

function shortAnchor(input: string): string {
  const line = input
    .split(/\r?\n/)
    .map((item) => item.trim())
    .find(Boolean);

  if (!line) {
    return '目标需求';
  }

  return line.length > 24 ? `${line.slice(0, 24)}...` : line;
}

export function buildFallbackPlan(requirementText: string, workspaceName?: string): AiCaseGenerationPlan {
  const anchor = shortAnchor(requirementText);

  const modules: AiCaseGenerationPlanModule[] = [
    {
      name: '核心流程覆盖',
      scenarios: [
        {
          name: '主链路验证',
          cases: [
            {
              title: `${anchor} 正向主流程执行成功`,
              priority: 'P0',
              note: '步骤:\n1. 准备基础数据\n2. 执行主流程\n3. 校验最终结果',
            },
            {
              title: `${anchor} 回退与重试流程稳定`,
              priority: 'P1',
            },
          ],
        },
      ],
    },
    {
      name: '边界与异常',
      scenarios: [
        {
          name: '参数边界验证',
          cases: [
            { title: `${anchor} 最小边界输入校验`, priority: 'P1' },
            { title: `${anchor} 最大边界输入校验`, priority: 'P1' },
          ],
        },
        {
          name: '异常恢复验证',
          cases: [
            { title: `${anchor} 依赖服务异常提示`, priority: 'P1' },
            { title: `${anchor} 重试后可恢复执行`, priority: 'P2' },
          ],
        },
      ],
    },
    {
      name: '权限与兼容',
      scenarios: [
        {
          name: '权限与角色',
          cases: [
            { title: `${anchor} 无权限用户访问拦截`, priority: 'P1' },
            { title: `${anchor} 不同角色数据隔离`, priority: 'P1' },
          ],
        },
        {
          name: '多端兼容性',
          cases: [
            { title: `${anchor} Chrome 最新版兼容`, priority: 'P2' },
            { title: `${anchor} Safari/移动端兼容`, priority: 'P2' },
          ],
        },
      ],
    },
  ];

  return {
    workspaceName: workspaceName?.trim() || `${anchor} - AI Testcase Plan`,
    modules,
  };
}
