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

const STATUS_ORDER: AiCaseNodeStatus[] = ['todo', 'doing', 'blocked', 'passed', 'failed', 'skipped'];

function cloneMapData(data: AiCaseMapData): AiCaseMapData {
  if (typeof structuredClone === 'function') {
    return structuredClone(data);
  }
  return JSON.parse(JSON.stringify(data)) as AiCaseMapData;
}

function parseStatus(value: unknown, fallback: AiCaseNodeStatus = 'todo'): AiCaseNodeStatus {
  if (typeof value === 'string' && (STATUS_ORDER as string[]).includes(value)) {
    return value as AiCaseNodeStatus;
  }
  return fallback;
}

function parsePriority(value: unknown, fallback: AiCaseNodePriority = 'P2'): AiCaseNodePriority {
  if (value === 'P0' || value === 'P1' || value === 'P2' || value === 'P3') {
    return value;
  }
  return fallback;
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

function inferNodeKind(depth: number, childCount: number): AiCaseNodeKind {
  if (depth === 0) return 'root';
  if (childCount === 0) return 'testcase';
  if (depth === 1) return 'module';
  return 'scenario';
}

function normalizeNode(node: AiCaseMapNode, depth: number): AiCaseMapNode {
  const children = Array.isArray(node.children) ? node.children : [];
  const now = Date.now();
  const inferredKind = inferNodeKind(depth, children.length);
  const baseMetadata = createMetadata(inferredKind, now);
  const incoming = (node.metadata ?? {}) as Partial<AiCaseNodeMetadata>;
  const status = parseStatus(incoming.status, baseMetadata.status);

  const metadata: AiCaseNodeMetadata = {
    ...baseMetadata,
    ...incoming,
    kind: incoming.kind ?? inferredKind,
    status,
    priority: parsePriority(incoming.priority, baseMetadata.priority),
    owner: typeof incoming.owner === 'string' || incoming.owner === null ? incoming.owner : null,
    attachmentIds: Array.isArray(incoming.attachmentIds)
      ? [...new Set(incoming.attachmentIds.filter((id): id is string => typeof id === 'string' && id.length > 0))]
      : [],
    aiGenerated: typeof incoming.aiGenerated === 'boolean' ? incoming.aiGenerated : false,
    nodeVersion: typeof incoming.nodeVersion === 'number' && incoming.nodeVersion > 0 ? incoming.nodeVersion : 1,
    updatedAt: typeof incoming.updatedAt === 'number' ? incoming.updatedAt : now,
    statusHistory: Array.isArray(incoming.statusHistory) && incoming.statusHistory.length > 0
      ? incoming.statusHistory
          .map((item) => ({
            status: parseStatus(item.status, status),
            at: typeof item.at === 'number' ? item.at : now,
          }))
          .slice(-20)
      : [{ status, at: now }],
  };

  node.metadata = metadata;
  node.expanded = node.expanded ?? true;

  if (children.length > 0) {
    node.children = children.map((child) => normalizeNode(child, depth + 1));
  } else {
    delete node.children;
  }

  return node;
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

  return {
    id: createAiCaseNodeId(),
    topic,
    note: options?.note,
    expanded: true,
    metadata,
    children: options?.children,
  };
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

function composeCaseNote(testCase: AiCaseGenerationPlanCase): string {
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

  const lines: string[] = [];

  // 去掉"测试点:"中间层级，直接从前置条件开始，与前端展开格式保持一致
  lines.push('前置条件:');
  preconditions.forEach((item, index) => {
    lines.push(`${index + 1}. ${item}`);
  });

  lines.push('', '测试步骤:');
  steps.forEach((item, index) => {
    lines.push(`${index + 1}. ${item}`);
  });

  lines.push('', '预期结果:');
  expectedResults.forEach((item, index) => {
    lines.push(`${index + 1}. ${item}`);
  });

  return lines.join('\n');
}

export function createAiCaseNodeId(): string {
  return `node-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
}

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

  const visit = (node: AiCaseMapNode): void => {
    const children = Array.isArray(node.children) ? node.children : [];
    const kind = node.metadata?.kind ?? inferNodeKind(1, children.length);
    const shouldCount = kind === 'testcase' || children.length === 0;

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

    children.forEach((child) => visit(child));
  };

  visit(mapData.nodeData);
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
        nodeVersion: (metadata.nodeVersion ?? 1) + 1,
        updatedAt: now,
        statusHistory: [...(metadata.statusHistory ?? []), { status: nextStatus, at: now }].slice(-20),
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
        children: module.scenarios.flatMap((scenario) =>
          scenario.cases.map((testCase) =>
            createNode(testCase.title, 'testcase', {
              aiGenerated: true,
              priority: parsePriority(testCase.priority, 'P1'),
              note: composeCaseNote(testCase),
            })
          )
        ),
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
