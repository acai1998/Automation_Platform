import type {
  AiCaseMindData,
  AiCaseNode,
  AiCaseNodeKind,
  AiCaseNodeMetadata,
  AiCaseNodePriority,
  AiCaseNodeStatus,
  AiCaseProgress,
} from '@/types/aiCases';
import { createAiCaseNodeId, isAiCaseNodeStatus } from '@/types/aiCases';

const STATUS_TAG_TEXT: Record<AiCaseNodeStatus, string> = {
  todo: 'TODO',
  doing: 'DOING',
  blocked: 'BLOCKED',
  passed: 'PASSED',
  failed: 'FAILED',
  skipped: 'SKIPPED',
};

const STATUS_TAG_STYLE: Record<AiCaseNodeStatus, Record<string, string>> = {
  todo: { background: '#CBD5E1', color: '#0F172A', borderRadius: '8px', padding: '2px 6px' },
  doing: { background: '#93C5FD', color: '#1E3A8A', borderRadius: '8px', padding: '2px 6px' },
  blocked: { background: '#FDE68A', color: '#92400E', borderRadius: '8px', padding: '2px 6px' },
  passed: { background: '#86EFAC', color: '#065F46', borderRadius: '8px', padding: '2px 6px' },
  failed: { background: '#FCA5A5', color: '#7F1D1D', borderRadius: '8px', padding: '2px 6px' },
  skipped: { background: '#D8B4FE', color: '#6B21A8', borderRadius: '8px', padding: '2px 6px' },
};

function cloneData(data: AiCaseMindData): AiCaseMindData {
  if (typeof structuredClone === 'function') {
    return structuredClone(data);
  }
  return JSON.parse(JSON.stringify(data)) as AiCaseMindData;
}

function inferNodeKind(depth: number, childrenCount: number): AiCaseNodeKind {
  if (depth === 0) return 'root';
  if (childrenCount === 0) return 'testcase';
  if (depth === 1) return 'module';
  return 'scenario';
}

function createDefaultMetadata(kind: AiCaseNodeKind): AiCaseNodeMetadata {
  const now = Date.now();
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

function normalizeNode(node: AiCaseNode, depth: number): AiCaseNode {
  const children = Array.isArray(node.children) ? (node.children as AiCaseNode[]) : [];
  const inferredKind = inferNodeKind(depth, children.length);
  const base = createDefaultMetadata(inferredKind);
  const incoming = (node.metadata ?? {}) as Partial<AiCaseNodeMetadata>;

  const status = incoming.status && isAiCaseNodeStatus(incoming.status) ? incoming.status : base.status;
  const merged: AiCaseNodeMetadata = {
    ...base,
    ...incoming,
    kind: incoming.kind ?? inferredKind,
    status,
    priority: incoming.priority ?? base.priority,
    attachmentIds: Array.isArray(incoming.attachmentIds)
      ? [...new Set(incoming.attachmentIds.filter(Boolean))]
      : [],
    nodeVersion: typeof incoming.nodeVersion === 'number' && incoming.nodeVersion > 0
      ? incoming.nodeVersion
      : base.nodeVersion,
    updatedAt: typeof incoming.updatedAt === 'number' ? incoming.updatedAt : Date.now(),
    statusHistory: Array.isArray(incoming.statusHistory) && incoming.statusHistory.length > 0
      ? incoming.statusHistory
      : [{ status, at: Date.now() }],
  };

  node.metadata = merged;
  node.expanded = node.expanded ?? true;

  if (children.length > 0) {
    node.children = children.map((child) => normalizeNode(child, depth + 1));
  } else {
    delete node.children;
  }

  if (merged.kind === 'testcase') {
    node.tags = [{ text: STATUS_TAG_TEXT[merged.status], style: STATUS_TAG_STYLE[merged.status] }];
  }

  return node;
}

function createNode(
  topic: string,
  kind: AiCaseNodeKind,
  options?: {
    priority?: AiCaseNodePriority;
    status?: AiCaseNodeStatus;
    aiGenerated?: boolean;
    note?: string;
    children?: AiCaseNode[];
  }
): AiCaseNode {
  const now = Date.now();
  const status = options?.status ?? 'todo';

  const metadata: AiCaseNodeMetadata = {
    kind,
    status,
    priority: options?.priority ?? 'P2',
    owner: null,
    attachmentIds: [],
    aiGenerated: options?.aiGenerated ?? false,
    nodeVersion: 1,
    updatedAt: now,
    statusHistory: [{ status, at: now }],
  };

  return {
    id: createAiCaseNodeId(),
    topic,
    expanded: true,
    note: options?.note,
    metadata,
    children: options?.children,
  };
}

function buildSmokeCases(anchor: string): AiCaseNode[] {
  return [
    createNode(`${anchor} 主流程可以顺利完成`, 'testcase', {
      priority: 'P0',
      aiGenerated: true,
      note: '前置条件:\n- 账号可登录\n\n步骤:\n1. 进入核心流程\n2. 执行关键操作\n\n预期:\n- 页面或接口返回成功\n- 关键结果可见',
    }),
    createNode(`${anchor} 关键参数校验与提示正确`, 'testcase', {
      priority: 'P1',
      aiGenerated: true,
      note: '前置条件:\n- 准备非法与合法参数\n\n步骤:\n1. 提交非法参数\n2. 再提交合法参数\n\n预期:\n- 非法参数有明确提示\n- 合法参数执行成功',
    }),
  ];
}

function buildCoverageScenarios(anchor: string): AiCaseNode[] {
  const blocks: Array<{ module: string; scenario: string; points: string[] }> = [
    {
      module: '功能正确性',
      scenario: '核心流程验证',
      points: [
        `${anchor} 正常路径验证`,
        `${anchor} 回退再提交验证`,
      ],
    },
    {
      module: '边界与等价类',
      scenario: '输入边界验证',
      points: [
        `${anchor} 最小边界输入`,
        `${anchor} 最大边界输入`,
      ],
    },
    {
      module: '异常与容错',
      scenario: '失败与恢复验证',
      points: [
        `${anchor} 依赖服务异常时提示`,
        `${anchor} 重试与恢复机制验证`,
      ],
    },
    {
      module: '权限与安全',
      scenario: '鉴权与数据保护',
      points: [
        `${anchor} 无权限访问拦截`,
        `${anchor} 敏感参数校验与脱敏`,
      ],
    },
    {
      module: '兼容性',
      scenario: '多端体验验证',
      points: [
        `${anchor} Chrome 最新版验证`,
        `${anchor} Safari 与移动端验证`,
      ],
    },
  ];

  return blocks.map((item) => {
    const scenarioChildren = item.points.map((point) =>
      createNode(point, 'testcase', {
        aiGenerated: true,
        priority: 'P1',
      })
    );

    return createNode(item.module, 'module', {
      aiGenerated: true,
      children: [
        createNode(item.scenario, 'scenario', {
          aiGenerated: true,
          children: scenarioChildren,
        }),
      ],
    });
  });
}

function extractAnchor(requirement: string): string {
  const firstLine = requirement
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);

  if (!firstLine) {
    return '目标功能';
  }

  return firstLine.length > 20 ? `${firstLine.slice(0, 20)}...` : firstLine;
}

export function createInitialMindData(title = 'AI Testcase Workspace'): AiCaseMindData {
  const root = createNode(title, 'root', {
    children: [
      createNode('Smoke Cases', 'module', {
        children: [
          createNode('Core Path', 'scenario', {
            children: buildSmokeCases('目标功能'),
          }),
        ],
      }),
      createNode('Coverage Matrix', 'module', {
        children: buildCoverageScenarios('目标功能'),
      }),
    ],
  });

  return normalizeMindData({
    nodeData: root,
  });
}

export function generateMindDataFromRequirement(requirement: string, title?: string): AiCaseMindData {
  const anchor = extractAnchor(requirement);
  const rootTitle = title?.trim() || `${anchor} - AI Testcase Plan`;

  const root = createNode(rootTitle, 'root', {
    aiGenerated: true,
    children: [
      createNode('Smoke Cases', 'module', {
        aiGenerated: true,
        children: [
          createNode('Priority P0', 'scenario', {
            aiGenerated: true,
            children: buildSmokeCases(anchor),
          }),
        ],
      }),
      ...buildCoverageScenarios(anchor),
    ],
  });

  return normalizeMindData({
    nodeData: root,
  });
}

export function normalizeMindData(data: AiCaseMindData): AiCaseMindData {
  const next = cloneData(data);
  next.nodeData = normalizeNode(next.nodeData, 0);
  return next;
}

export function findNodeById(root: AiCaseNode, nodeId: string): AiCaseNode | null {
  if (root.id === nodeId) {
    return root;
  }

  for (const child of root.children ?? []) {
    const found = findNodeById(child as AiCaseNode, nodeId);
    if (found) {
      return found;
    }
  }

  return null;
}

export function updateNodeById(
  data: AiCaseMindData,
  nodeId: string,
  updater: (node: AiCaseNode) => void
): AiCaseMindData {
  const next = cloneData(data);
  const target = findNodeById(next.nodeData, nodeId);

  if (!target) {
    return next;
  }

  updater(target);
  return normalizeMindData(next);
}

export function setNodeStatus(data: AiCaseMindData, nodeId: string, status: AiCaseNodeStatus): AiCaseMindData {
  return updateNodeById(data, nodeId, (node) => {
    const current = node.metadata ?? createDefaultMetadata('testcase');
    if (current.kind === 'root') {
      return;
    }

    const now = Date.now();
    node.metadata = {
      ...current,
      status,
      nodeVersion: current.nodeVersion + 1,
      updatedAt: now,
      statusHistory: [...current.statusHistory, { status, at: now }].slice(-20),
    };
  });
}

export function appendNodeAttachmentId(data: AiCaseMindData, nodeId: string, attachmentId: string): AiCaseMindData {
  return updateNodeById(data, nodeId, (node) => {
    const current = node.metadata ?? createDefaultMetadata('testcase');
    node.metadata = {
      ...current,
      attachmentIds: [...new Set([...(current.attachmentIds ?? []), attachmentId])],
      nodeVersion: current.nodeVersion + 1,
      updatedAt: Date.now(),
    };
  });
}

export function removeNodeAttachmentId(data: AiCaseMindData, nodeId: string, attachmentId: string): AiCaseMindData {
  return updateNodeById(data, nodeId, (node) => {
    const current = node.metadata ?? createDefaultMetadata('testcase');
    node.metadata = {
      ...current,
      attachmentIds: (current.attachmentIds ?? []).filter((id) => id !== attachmentId),
      nodeVersion: current.nodeVersion + 1,
      updatedAt: Date.now(),
    };
  });
}

export function computeProgress(data: AiCaseMindData): AiCaseProgress {
  const stats: AiCaseProgress = {
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

  const walk = (node: AiCaseNode): void => {
    const metadata = node.metadata;
    const kind = metadata?.kind ?? 'testcase';

    if (kind === 'testcase') {
      const status = metadata?.status && isAiCaseNodeStatus(metadata.status) ? metadata.status : 'todo';
      stats.total += 1;
      stats[status] += 1;
    }

    for (const child of node.children ?? []) {
      walk(child as AiCaseNode);
    }
  };

  walk(data.nodeData);
  stats.done = stats.passed + stats.failed + stats.skipped;
  stats.completionRate = stats.total === 0 ? 0 : Math.round((stats.done / stats.total) * 100);

  return stats;
}
