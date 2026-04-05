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

const NODE_KIND_TAG_TEXT: Record<Exclude<AiCaseNodeKind, 'root'>, string> = {
  module: '功能模块',
  scenario: '测试场景',
  testcase: '测试点',
};

const NODE_KIND_TAG_STYLE: Record<Exclude<AiCaseNodeKind, 'root'>, Record<string, string>> = {
  module: {
    background: '#E0E7FF',
    color: '#3730A3',
    borderRadius: '8px',
    padding: '2px 6px',
  },
  scenario: {
    background: '#DBEAFE',
    color: '#1D4ED8',
    borderRadius: '8px',
    padding: '2px 6px',
  },
  testcase: {
    background: '#DCFCE7',
    color: '#166534',
    borderRadius: '8px',
    padding: '2px 6px',
  },
};

interface NormalizeMindDataOptions {
  showNodeKindTags?: boolean;
}

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

function resolveNodeKindTags(kind: AiCaseNodeKind, showNodeKindTags: boolean): AiCaseNode['tags'] | undefined {
  // scenario 节点不添加节点类型标签：其语义已通过节点名称和上下文清晰表达
  // testcase 现在是叶子节点，展示详情不再依赖 scenario 子节点
  if (!showNodeKindTags || kind === 'root' || kind === 'scenario') {
    return undefined;
  }

  return [{
    text: NODE_KIND_TAG_TEXT[kind],
    style: NODE_KIND_TAG_STYLE[kind],
  }];
}

function normalizeNode(
  node: AiCaseNode,
  depth: number,
  options: Required<NormalizeMindDataOptions>
): AiCaseNode {
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
    node.children = children.map((child) => normalizeNode(child, depth + 1, options));
  } else {
    delete node.children;
  }

  // 若 showNodeKindTags=false：清除所有 tags（包括 section 标签）
  // 若 showNodeKindTags=true 且节点已有自定义 section tags：保留它们
  // 否则按 kind 自动生成 tags
  if (!options.showNodeKindTags) {
    delete node.tags;
  } else {
    const hasSectionTag = Array.isArray(node.tags) && node.tags.length > 0;
    if (!hasSectionTag) {
      const tags = resolveNodeKindTags(merged.kind, options.showNodeKindTags);
      if (tags) {
        node.tags = tags;
      } else {
        delete node.tags;
      }
    }
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
    /** 自定义标签，会覆盖 normalizeNode 自动生成的 kind 标签 */
    tags?: AiCaseNode['tags'];
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
    ...(options?.tags && options.tags.length > 0 ? { tags: options.tags } : {}),
  };
}

/**
 * 判断一个 testcase 节点是否包含旧格式的展开子节点
 * 旧格式1：第一个子节点 topic === "测试点" 且 kind === "scenario"（最旧格式）
 * 旧格式2：子节点带有 section tag（前置条件/测试步骤/预期结果 标签）
 */
function isLegacyExpandedTestcase(node: AiCaseNode): boolean {
  const children = node.children as AiCaseNode[] | undefined;
  if (!children || children.length === 0) {
    return false;
  }
  const firstChild = children[0];
  // 最旧格式：topic 是"测试点"
  if (firstChild?.topic === '测试点' &&
    (firstChild?.metadata as Partial<AiCaseNodeMetadata> | undefined)?.kind === 'scenario') {
    return true;
  }
  // 新旧格式：子节点带有 section tag（通过 tag text 识别）
  const sectionLabels = new Set(['测试点', '前置条件', '测试步骤', '预期结果']);
  return children.some((child) => {
    const tags = (child as AiCaseNode).tags;
    return Array.isArray(tags) && tags.some((t) => {
      const text = typeof t === 'string' ? t : t?.text;
      return typeof text === 'string' && sectionLabels.has(text);
    });
  });
}

/**
 * 将旧格式的展开子节点收回到 note 字段（迁移）。
 * 旧格式：testcase 下有「前置条件」「测试步骤」「预期结果」等 section 子节点。
 * 新格式：testcase 是叶子节点，详情存在 note 里，脑图中每条 case 占一行。
 */
function collapseChildrenToNote(node: AiCaseNode): string {
  const children = (node.children ?? []) as AiCaseNode[];
  const sectionLabels = ['测试点', '前置条件', '测试步骤', '预期结果'];
  const parts: string[] = [];

  for (const child of children) {
    // 识别 section label：优先从 tag，其次从 topic 前缀
    let label: string | null = null;
    const tags = child.tags;
    if (Array.isArray(tags)) {
      for (const t of tags) {
        const text = typeof t === 'string' ? t : t?.text;
        if (typeof text === 'string' && sectionLabels.includes(text)) {
          label = text;
          break;
        }
      }
    }
    if (!label) {
      for (const sl of sectionLabels) {
        if (child.topic.startsWith(`${sl}：`) || child.topic.startsWith(`${sl}:`)) {
          label = sl;
          break;
        }
      }
    }

    const content = label
      ? child.topic.replace(new RegExp(`^${label}[：:]\\s*`), '').trim()
      : child.topic.trim();

    if (content) {
      parts.push(label ? `${label}：${content}` : content);
    }
  }

  return parts.join('\n');
}

/**
 * 迁移旧格式的展开子节点为叶子节点（note 存储详情）。
 * 不再把 note 展开为子节点——新格式下 testcase 始终是叶子节点，每条 case 在脑图中占一行。
 * 当 migrateLegacy=true 时，会把已有子节点的旧格式 testcase 收回为叶子节点。
 */
export function expandImportedCaseNodesFromNote(
  data: AiCaseMindData,
  options?: {
    candidateNodeIds?: string[];
    showNodeKindTags?: boolean;
    /** 是否强制迁移旧格式节点（已有子节点的旧格式）到叶子节点 */
    migrateLegacy?: boolean;
  }
): { data: AiCaseMindData; expandedCount: number } {
  const candidateSet = options?.candidateNodeIds && options.candidateNodeIds.length > 0
    ? new Set(options.candidateNodeIds)
    : null;
  const migrateLegacy = options?.migrateLegacy ?? false;

  const next = cloneData(data);
  let migratedCount = 0;

  const walk = (node: AiCaseNode): void => {
    for (const child of node.children ?? []) {
      walk(child as AiCaseNode);
    }

    if (candidateSet && !candidateSet.has(node.id)) {
      return;
    }

    const metadata = node.metadata ?? createDefaultMetadata('testcase');
    if (metadata.kind !== 'testcase') {
      return;
    }

    const hasChildren = (node.children?.length ?? 0) > 0;

    // 如果有子节点（旧格式），且开启了迁移，则收回子节点内容到 note，成为叶子节点
    if (hasChildren && migrateLegacy && isLegacyExpandedTestcase(node)) {
      const noteFromChildren = collapseChildrenToNote(node);
      if (noteFromChildren) {
        node.note = noteFromChildren;
      }
      delete node.children;
      node.metadata = {
        ...metadata,
        nodeVersion: metadata.nodeVersion + 1,
        updatedAt: Date.now(),
      };
      migratedCount += 1;
    }
    // 新格式：testcase 已经是叶子节点，note 存储详情，直接保留，不做任何展开
  };

  walk(next.nodeData);

  if (migratedCount === 0) {
    return { data, expandedCount: 0 };
  }

  return {
    data: normalizeMindData(next, {
      showNodeKindTags: options?.showNodeKindTags ?? true,
    }),
    expandedCount: migratedCount,
  };
}

function buildCaseNote(
  preconditions: string[],
  steps: string[],
  expectedResults: string[],
  title: string
): string {
  const fmtLines = (items: string[]): string => {
    if (items.length === 0) return '';
    if (items.length === 1) return items[0];
    return items.map((item, i) => `${i + 1}. ${item}`).join('\n');
  };

  const lines: string[] = [`测试点：${title.trim()}`];
  if (preconditions.length > 0) lines.push(`前置条件：${fmtLines(preconditions)}`);
  if (steps.length > 0) lines.push(`测试步骤：${fmtLines(steps)}`);
  if (expectedResults.length > 0) lines.push(`预期结果：${fmtLines(expectedResults)}`);
  return lines.join('\n');
}

function buildSmokeCases(anchor: string): AiCaseNode[] {
  return [
    createNode(`${anchor} 主流程可以顺利完成`, 'testcase', {
      priority: 'P0',
      aiGenerated: true,
      note: buildCaseNote(
        ['已有可登录测试账号，且目标环境可访问'],
        ['进入登录页面并输入有效账号密码', '点击登录并等待页面跳转'],
        ['登录成功并跳转到用户主页', '页面展示当前用户信息且会话状态有效'],
        `${anchor} 主流程可以顺利完成`
      ),
    }),
    createNode(`${anchor} 关键参数校验与提示正确`, 'testcase', {
      priority: 'P1',
      aiGenerated: true,
      note: buildCaseNote(
        ['已准备非法与合法输入组合'],
        ['输入非法参数并提交', '根据错误提示修正后再次提交'],
        ['非法参数有明确错误提示', '修正后可正常完成流程'],
        `${anchor} 关键参数校验与提示正确`
      ),
    }),
  ];
}

function buildCoverageModules(anchor: string): AiCaseNode[] {
  const blocks: Array<{
    module: string;
    points: Array<{
      title: string;
      preconditions: string[];
      steps: string[];
      expectedResults: string[];
      priority?: AiCaseNodePriority;
    }>;
  }> = [
    {
      module: '功能正确性',
      points: [
        {
          title: `${anchor} 正常路径验证`,
          priority: 'P1',
          preconditions: ['核心依赖服务可用，测试数据准备完整'],
          steps: ['执行主流程关键操作', '检查流程关键节点输出'],
          expectedResults: ['主流程执行成功', '流程结果与需求一致'],
        },
        {
          title: `${anchor} 回退再提交验证`,
          priority: 'P1',
          preconditions: ['可重复提交，且支持回退操作'],
          steps: ['执行一次完整流程后回退', '再次提交并观察状态变化'],
          expectedResults: ['回退后状态正确恢复', '再次提交仍可成功完成'],
        },
      ],
    },
    {
      module: '边界与等价类',
      points: [
        {
          title: `${anchor} 最小边界输入`,
          priority: 'P1',
          preconditions: ['已定义字段最小边界值'],
          steps: ['输入最小边界值并提交', '记录系统返回结果'],
          expectedResults: ['边界值输入被正确处理', '提示信息与规则一致'],
        },
        {
          title: `${anchor} 最大边界输入`,
          priority: 'P1',
          preconditions: ['已定义字段最大边界值'],
          steps: ['输入最大边界值并提交', '检查处理耗时与结果'],
          expectedResults: ['系统可稳定处理最大边界值', '返回结果满足预期'],
        },
      ],
    },
    {
      module: '异常与容错',
      points: [
        {
          title: `${anchor} 依赖服务异常时提示`,
          priority: 'P1',
          preconditions: ['可模拟依赖服务超时或异常'],
          steps: ['触发依赖服务异常场景', '检查界面与日志提示'],
          expectedResults: ['用户收到明确的失败提示', '系统日志记录可追踪原因'],
        },
        {
          title: `${anchor} 重试与恢复机制验证`,
          priority: 'P2',
          preconditions: ['系统已开启自动重试或手动重试机制'],
          steps: ['首次请求失败后触发重试', '观察恢复后的最终状态'],
          expectedResults: ['重试机制按策略执行', '恢复后流程可继续完成'],
        },
      ],
    },
    {
      module: '权限与安全',
      points: [
        {
          title: `${anchor} 无权限访问拦截`,
          priority: 'P1',
          preconditions: ['准备无权限账号并登录系统'],
          steps: ['使用无权限账号访问目标功能', '记录返回码和页面提示'],
          expectedResults: ['访问请求被拒绝', '错误提示符合权限策略'],
        },
        {
          title: `${anchor} 敏感参数校验与脱敏`,
          priority: 'P1',
          preconditions: ['已准备包含敏感参数的测试请求'],
          steps: ['提交含敏感信息的请求', '检查响应与日志输出'],
          expectedResults: ['敏感字段在日志中被脱敏', '接口返回不泄露敏感信息'],
        },
      ],
    },
    {
      module: '兼容性',
      points: [
        {
          title: `${anchor} Chrome 最新版验证`,
          priority: 'P2',
          preconditions: ['使用 Chrome 最新稳定版浏览器'],
          steps: ['执行关键业务路径', '检查交互、样式与数据一致性'],
          expectedResults: ['功能与展示均正常', '无明显兼容性问题'],
        },
        {
          title: `${anchor} Safari 与移动端验证`,
          priority: 'P2',
          preconditions: ['准备 Safari 浏览器与移动端设备/模拟器'],
          steps: ['执行核心流程并触发关键交互', '检查布局和输入行为'],
          expectedResults: ['移动端与 Safari 下功能可用', '布局与交互符合预期'],
        },
      ],
    },
  ];

  return blocks.map((item) =>
    createNode(item.module, 'module', {
      aiGenerated: true,
      children: item.points.map((point) =>
        createNode(point.title, 'testcase', {
          aiGenerated: true,
          priority: point.priority ?? 'P1',
          note: buildCaseNote(point.preconditions, point.steps, point.expectedResults, point.title),
        })
      ),
    })
  );
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

/**
 * 根据需求文本推断工作台名称（本地逻辑，无需 AI）。
 * 规则：取需求文本的第一个非空行，截取前 20 字符，作为工作台名称。
 * 若需求为空则返回 null（调用方可保持当前名称不变）。
 */
export function inferWorkspaceNameFromRequirement(requirement: string): string | null {
  const trimmed = requirement.trim();
  if (!trimmed) {
    return null;
  }
  const anchor = extractAnchor(trimmed);
  // extractAnchor 已含截断逻辑，直接使用
  return anchor === '目标功能' ? null : anchor;
}

export function createInitialMindData(title = 'AI Testcase Workspace'): AiCaseMindData {
  const root = createNode(title, 'root', {
    children: [
      createNode('Smoke Cases', 'module', {
        children: buildSmokeCases('目标功能'),
      }),
      ...buildCoverageModules('目标功能'),
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
        children: buildSmokeCases(anchor),
      }),
      ...buildCoverageModules(anchor),
    ],
  });

  return normalizeMindData({
    nodeData: root,
  });
}

export function normalizeMindData(data: AiCaseMindData, options?: NormalizeMindDataOptions): AiCaseMindData {
  const next = cloneData(data);
  next.nodeData = normalizeNode(next.nodeData, 0, {
    showNodeKindTags: options?.showNodeKindTags ?? true,
  });
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
