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
import { incrementNodeVersion } from '@shared/types/aiCaseNodeMetadata';

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
  const now = Date.now();
  const merged: AiCaseNodeMetadata = {
    ...base,
    ...incoming,
    kind: incoming.kind ?? inferredKind,
    status,
    // 严格枚举校验：priority 必须是合法值，否则回退到默认值
    priority: (incoming.priority === 'P0' || incoming.priority === 'P1' || incoming.priority === 'P2' || incoming.priority === 'P3')
      ? incoming.priority
      : base.priority,
    // 严格类型校验：attachmentIds 只接受非空字符串
    attachmentIds: Array.isArray(incoming.attachmentIds)
      ? [...new Set(incoming.attachmentIds.filter((id): id is string => typeof id === 'string' && id.trim().length > 0))]
      : [],
    nodeVersion: typeof incoming.nodeVersion === 'number' && incoming.nodeVersion > 0
      ? incoming.nodeVersion
      : base.nodeVersion,
    updatedAt: typeof incoming.updatedAt === 'number' ? incoming.updatedAt : now,
    // 校验每条历史记录的 status 合法性，并限制最多保留 20 条
    statusHistory: Array.isArray(incoming.statusHistory) && incoming.statusHistory.length > 0
      ? incoming.statusHistory
          .map((item) => ({
            status: isAiCaseNodeStatus(item.status) ? item.status : status,
            at: typeof item.at === 'number' ? item.at : now,
          }))
          .slice(-20)
      : [{ status, at: now }],
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
 * 判断 testcase 节点是否为旧格式（单独的 note 字段，没有前置条件/测试步骤/预期结果子节点）
 */
function hasNoteOnlyFormat(node: AiCaseNode): boolean {
  const hasNote = typeof node.note === 'string' && node.note.trim().length > 0;
  const hasChildren = (node.children?.length ?? 0) > 0;
  return hasNote && !hasChildren;
}

// 旧版前缀标签匹配（用于识别需要迁移的历史数据）
const LEGACY_LABEL_RE = /^(前置条件|测试步骤|预期结果)[：:]\s*/;

/**
 * 将 note 字段解析为前置条件/测试步骤/预期结果节点列表（新格式：纯内容+分号拼接）。
 * 用于将仅有 note 的旧格式 testcase 迁移为新的扁平兄弟节点格式。
 */
function expandNoteToChildren(note: string): AiCaseNode[] {
  const sectionPrefixes = ['前置条件', '测试步骤', '预期结果'] as const;
  const lines = note.split(/\r?\n/);
  const sections: Record<string, string[]> = {};
  let currentSection = '';

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    const match = line.match(/^(测试点|前置条件|测试步骤|预期结果)[：:]\s*(.*)$/);
    if (match) {
      currentSection = match[1];
      sections[currentSection] = sections[currentSection] ?? [];
      if (match[2].trim()) {
        sections[currentSection].push(match[2].trim());
      }
    } else if (currentSection) {
      // 去掉行首编号（"1. " / "1." / "①" 等）
      const cleaned = line.replace(/^\d+[\.\)、]\s*/, '').trim();
      if (cleaned) {
        sections[currentSection] = sections[currentSection] ?? [];
        sections[currentSection].push(cleaned);
      }
    }
  }

  const children: AiCaseNode[] = [];
  for (const prefix of sectionPrefixes) {
    const content = sections[prefix];
    if (content && content.length > 0) {
      // 新格式：多条用分号拼接，不加前缀标签
      children.push(createNode(fmtInline(content), 'scenario', { aiGenerated: true }));
    }
  }

  // 无法解析各段时，把整个 note 作为一个子节点（兜底）
  if (children.length === 0 && note.trim()) {
    children.push(createNode(note.trim(), 'scenario', { aiGenerated: true }));
  }

  return children;
}


/**
 * 提取 testcase 节点应展开的兄弟节点列表（前置条件/测试步骤/预期结果）。
 * 处理三类历史格式，统一转换为新的扁平兄弟节点格式：
 *  1. 仅有 note 字段（中间迁移格式）→ 解析 note 得到兄弟节点列表
 *  2. 嵌套"测试点"层（最旧格式）→ 提升并清理前缀标签后得到兄弟节点
 *  3. 旧格式（testcase 下已有 scenario 子节点）→ 将子节点提升为兄弟节点
 *
 * 返回 null 表示无需迁移（已是新格式：testcase 无子节点）。
 */
function extractCaseSiblings(node: AiCaseNode): AiCaseNode[] | null {
  // 情况1：仅有 note，无子节点（中间版本的迁移格式）
  if (hasNoteOnlyFormat(node)) {
    const siblings = expandNoteToChildren(node.note as string);
    return siblings.length > 0 ? siblings : null;
  }

  const children = (node.children ?? []) as AiCaseNode[];

  // 无子节点：已是新格式
  if (children.length === 0) {
    return null;
  }

  // 情况2：嵌套"测试点"层 → 先提升，再处理前缀标签
  // 情况3：旧格式 scenario 子节点（含前缀标签或不含）→ 处理后提升为兄弟节点
  let flatChildren: AiCaseNode[];
  if (children[0]?.topic === '测试点' && (children[0]?.children?.length ?? 0) > 0) {
    flatChildren = (children[0].children ?? []) as AiCaseNode[];
  } else {
    flatChildren = children;
  }

  const needsLabelStrip = flatChildren.some((c) => LEGACY_LABEL_RE.test(c.topic));
  if (needsLabelStrip) {
    const rebuilt: AiCaseNode[] = [];
    for (const child of flatChildren) {
      const labelMatch = child.topic.match(/^(前置条件|测试步骤|预期结果)[：:]\s*([\s\S]*)$/);
      if (labelMatch) {
        const rawContent = labelMatch[2].trim();
        const lines = rawContent
          .split(/\r?\n/)
          .map((l) => l.replace(/^\d+[\.\)、]\s*/, '').trim())
          .filter(Boolean);
        const newTopic = fmtInline(lines.length > 0 ? lines : [rawContent]);
        rebuilt.push(createNode(newTopic, 'scenario', { aiGenerated: child.metadata?.aiGenerated ?? true }));
      } else {
        rebuilt.push(child);
      }
    }
    return rebuilt;
  }

  // 子节点已是纯内容格式（scenario 节点），直接提升为兄弟节点
  return flatChildren;
}

/**
 * 遍历脑图数据，将所有需要迁移的 testcase 节点（含 note/旧子节点格式）
 * 重构为新的扁平兄弟节点格式：
 *   - testcase 节点本身不再有子节点
 *   - 前置条件/测试步骤/预期结果节点成为 testcase 的兄弟节点（挂在父节点下）
 */
export function expandImportedCaseNodesFromNote(
  data: AiCaseMindData,
  options?: {
    candidateNodeIds?: string[];
    showNodeKindTags?: boolean;
    /** 已废弃，保留参数以兼容旧调用方旧代码 */
    migrateLegacy?: boolean;
  }
): { data: AiCaseMindData; expandedCount: number } {
  const candidateSet = options?.candidateNodeIds && options.candidateNodeIds.length > 0
    ? new Set(options.candidateNodeIds)
    : null;

  const next = cloneData(data);
  let expandedCount = 0;

  /**
   * 遍历父节点，在其 children 中找到需要迁移的 testcase，
   * 将其子节点提升为兄弟节点（插在 testcase 之后）。
   */
  const walk = (parent: AiCaseNode): void => {
    const children = (parent.children ?? []) as AiCaseNode[];

    // 先递归处理深层节点
    for (const child of children) {
      walk(child);
    }

    let hasChanges = false;
    const nextChildren: AiCaseNode[] = [];

    for (const child of children) {
      const metadata = child.metadata ?? createDefaultMetadata('testcase');
      const isTestcase = metadata.kind === 'testcase';
      const inCandidateSet = candidateSet ? candidateSet.has(child.id) : true;

      if (!isTestcase || !inCandidateSet) {
        nextChildren.push(child);
        continue;
      }

      const siblings = extractCaseSiblings(child);

      if (siblings === null) {
        // 已是新格式（无子节点），无需迁移
        nextChildren.push(child);
        continue;
      }

      // 迁移：移除 testcase 的子节点，将兄弟节点插在 testcase 之后
      const currentVersion = typeof metadata.nodeVersion === 'number' && metadata.nodeVersion > 0
        ? metadata.nodeVersion
        : 1;

      const migratedTestcase: AiCaseNode = {
        ...child,
        metadata: {
          ...metadata,
          nodeVersion: currentVersion + 1,
          updatedAt: Date.now(),
        },
      };
      delete migratedTestcase.children;
      delete migratedTestcase.note;

      nextChildren.push(migratedTestcase, ...siblings);
      expandedCount += 1;
      hasChanges = true;
    }

    if (hasChanges) {
      parent.children = nextChildren;
    }
  };

  walk(next.nodeData);

  if (expandedCount === 0) {
    return { data, expandedCount: 0 };
  }

  return {
    data: normalizeMindData(next, {
      showNodeKindTags: options?.showNodeKindTags ?? true,
    }),
    expandedCount,
  };
}

/**
 * 将多条条目格式化为单行文本：
 * - 单条：直接返回原文
 * - 多条：1.xxx；2.xxx；3.xxx（分号拼接，不换行）
 */
function fmtInline(items: string[]): string {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0];
  return items.map((item, i) => `${i + 1}.${item}`).join('；');
}

/**
 * 构建单个 testcase 对应的 3 个兄弟节点（前置条件/测试步骤/预期结果），
 * 用于与 testcase 节点同级挂在父 scenario 下，而非作为 testcase 的子节点。
 *   节点2 = 前置条件内容（多条用分号拼接，写在 topic 里，不展开子节点）
 *   节点3 = 测试步骤内容（同上）
 *   节点4 = 预期结果内容（同上）
 */
function buildCaseSiblings(
  preconditions: string[],
  steps: string[],
  expectedResults: string[],
): AiCaseNode[] {
  const safePreconditions = preconditions.length > 0 ? preconditions : ['无特殊前置条件'];
  const safeSteps = steps.length > 0 ? steps : ['执行目标操作并记录结果'];
  const safeExpectedResults = expectedResults.length > 0 ? expectedResults : ['功能符合预期'];

  return [
    createNode(fmtInline(safePreconditions), 'scenario', { aiGenerated: true }),
    createNode(fmtInline(safeSteps), 'scenario', { aiGenerated: true }),
    createNode(fmtInline(safeExpectedResults), 'scenario', { aiGenerated: true }),
  ];
}

function buildSmokeCases(anchor: string): AiCaseNode[] {
  // 每个 testcase 展开为 4 个扁平节点：testcase 本身（无子节点）+ 前置条件 + 步骤 + 预期结果（均同级）
  return [
    createNode(`${anchor} 主流程可以顺利完成`, 'testcase', { priority: 'P0', aiGenerated: true }),
    ...buildCaseSiblings(
      ['已有可登录测试账号，且目标环境可访问'],
      ['进入登录页面并输入有效账号密码', '点击登录并等待页面跳转'],
      ['登录成功并跳转到用户主页', '页面展示当前用户信息且会话状态有效'],
    ),
    createNode(`${anchor} 关键参数校验与提示正确`, 'testcase', { priority: 'P1', aiGenerated: true }),
    ...buildCaseSiblings(
      ['已准备非法与合法输入组合'],
      ['输入非法参数并提交', '根据错误提示修正后再次提交'],
      ['非法参数有明确错误提示', '修正后可正常完成流程'],
    ),
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

  return blocks.map((item) => {
    // 每个 testcase 展开为 4 个扁平节点（testcase 本身 + 前置条件 + 步骤 + 预期结果），均作为 module 的子节点
    const caseNodes: AiCaseNode[] = [];
    for (const point of item.points) {
      caseNodes.push(
        createNode(point.title, 'testcase', {
          aiGenerated: true,
          priority: point.priority ?? 'P1',
        })
      );
      caseNodes.push(...buildCaseSiblings(point.preconditions, point.steps, point.expectedResults));
    }
    return createNode(item.module, 'module', {
      aiGenerated: true,
      children: caseNodes,
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
    // 安全递增：防止 nodeVersion 为 undefined/NaN
    const currentVersion = typeof current.nodeVersion === 'number' && current.nodeVersion > 0
      ? current.nodeVersion
      : 1;
    node.metadata = {
      ...current,
      status,
      nodeVersion: currentVersion + 1,
      updatedAt: now,
      statusHistory: [...(current.statusHistory ?? []), { status, at: now }].slice(-20),
    };
  });
}

export function appendNodeAttachmentId(data: AiCaseMindData, nodeId: string, attachmentId: string): AiCaseMindData {
  return updateNodeById(data, nodeId, (node) => {
    const current = node.metadata ?? createDefaultMetadata('testcase');
    node.metadata = {
      ...current,
      attachmentIds: [...new Set([...(current.attachmentIds ?? []), attachmentId])],
      // 使用 shared 层安全递增，防止 nodeVersion 为 undefined/NaN
      nodeVersion: incrementNodeVersion(current.nodeVersion),
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
      // 使用 shared 层安全递增，防止 nodeVersion 为 undefined/NaN
      nodeVersion: incrementNodeVersion(current.nodeVersion),
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
