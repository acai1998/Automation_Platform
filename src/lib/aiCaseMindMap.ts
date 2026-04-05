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

// testcase 子节点（四段式）各段的标签样式
type CaseSectionLabel = '测试点' | '前置条件' | '测试步骤' | '预期结果';

const CASE_SECTION_TAG_STYLE: Record<CaseSectionLabel, Record<string, string>> = {
  测试点: {
    background: '#DCFCE7',
    color: '#166534',
    borderRadius: '6px',
    padding: '1px 6px',
    fontSize: '11px',
  },
  前置条件: {
    background: '#FEF9C3',
    color: '#854D0E',
    borderRadius: '6px',
    padding: '1px 6px',
    fontSize: '11px',
  },
  测试步骤: {
    background: '#DBEAFE',
    color: '#1E40AF',
    borderRadius: '6px',
    padding: '1px 6px',
    fontSize: '11px',
  },
  预期结果: {
    background: '#FCE7F3',
    color: '#9D174D',
    borderRadius: '6px',
    padding: '1px 6px',
    fontSize: '11px',
  },
};

function makeSectionTag(label: CaseSectionLabel): { text: string; style: Record<string, string> } {
  return { text: label, style: CASE_SECTION_TAG_STYLE[label] };
}

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
  // scenario 节点现在用于 testcase 下的 section 标题（前置条件/测试步骤/预期结果）
  // 这些节点本身已经是语义清晰的中文标题，不需要额外的"测试场景"标签
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

function toChecklist(lines: string[]): string[] {
  return lines.map((line) => line.trim()).filter((line) => Boolean(line));
}


interface ParsedCaseNoteSections {
  testPoint: string[];
  preconditions: string[];
  steps: string[];
  expectedResults: string[];
}

type CaseNoteSectionKey = keyof ParsedCaseNoteSections;

const CASE_NOTE_SECTION_KEY_MAP: Record<'测试点' | '前置条件' | '测试步骤' | '预期结果', CaseNoteSectionKey> = {
  测试点: 'testPoint',
  前置条件: 'preconditions',
  测试步骤: 'steps',
  预期结果: 'expectedResults',
};

// 同时作为 CASE_NOTE_SECTION_TITLE_MAP（CaseNoteSectionKey → 中文标题）和
// section 节点标签标识（CaseSectionLabel），消除两份相同映射
const SECTION_LABEL_MAP: Record<CaseNoteSectionKey, CaseSectionLabel> = {
  testPoint: '测试点',
  preconditions: '前置条件',
  steps: '测试步骤',
  expectedResults: '预期结果',
};

// 保留旧名称兼容内部使用
const CASE_NOTE_SECTION_TITLE_MAP: Record<CaseNoteSectionKey, string> = SECTION_LABEL_MAP;

function normalizeChecklistItem(line: string): string {
  return line
    .replace(/^[-*•]\s*/, '')
    .replace(/^\d+[\.\)、]\s*/, '')
    .trim();
}

function parseCaseNoteSections(note: string): ParsedCaseNoteSections {
  const sections: ParsedCaseNoteSections = {
    testPoint: [],
    preconditions: [],
    steps: [],
    expectedResults: [],
  };

  let activeSection: CaseNoteSectionKey | null = null;

  for (const rawLine of note.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }

    const withColon = line.match(/^(测试点|前置条件|测试步骤|预期结果)\s*[:：]\s*(.*)$/);
    if (withColon) {
      activeSection = CASE_NOTE_SECTION_KEY_MAP[withColon[1] as keyof typeof CASE_NOTE_SECTION_KEY_MAP];
      const inlineItem = normalizeChecklistItem(withColon[2]);
      if (inlineItem) {
        sections[activeSection].push(inlineItem);
      }
      continue;
    }

    const pureHeader = line.match(/^(测试点|前置条件|测试步骤|预期结果)$/);
    if (pureHeader) {
      activeSection = CASE_NOTE_SECTION_KEY_MAP[pureHeader[1] as keyof typeof CASE_NOTE_SECTION_KEY_MAP];
      continue;
    }

    if (!activeSection) {
      continue;
    }

    const normalizedItem = normalizeChecklistItem(line);
    if (normalizedItem) {
      sections[activeSection].push(normalizedItem);
    }
  }

  return sections;
}

function buildCaseNoteChildren(
  sections: ParsedCaseNoteSections,
  aiGenerated: boolean,
  fallbackTestPoint: string
): AiCaseNode[] {
  // 四段固定顺序：测试点 / 前置条件 / 测试步骤 / 预期结果
  // 每段生成一个节点，内容全写在 topic 里（多项换行展示，不拆子节点）
  const orderedSections: CaseNoteSectionKey[] = ['testPoint', 'preconditions', 'steps', 'expectedResults'];

  const withFallback: ParsedCaseNoteSections = {
    ...sections,
    testPoint: sections.testPoint.length > 0 ? sections.testPoint : [fallbackTestPoint],
  };

  return orderedSections
    .map((key) => ({ key, items: toChecklist(withFallback[key]) }))
    .filter((section) => section.items.length > 0)
    .map((section) => {
      // topic = 纯内容（多项换行），通过 tag 标识段落类型
      const topic = section.items.length === 1
        ? section.items[0]
        : section.items.map((item, i) => `${i + 1}. ${item}`).join('\n');
      return createNode(topic, 'scenario', {
        aiGenerated,
        tags: [makeSectionTag(SECTION_LABEL_MAP[section.key])],
      });
    });
}

/**
 * 判断一个 testcase 节点是否是旧格式（testcase 第一个子节点的 topic=="测试点" 且 kind=="scenario"）
 * 旧格式：testcase -> 测试点（scenario）-> 前置条件（scenario）-> ...
 * 新格式：testcase 子节点的 topic 是具体内容，通过 tags 标识类型
 */
function isLegacyExpandedTestcase(node: AiCaseNode): boolean {
  const children = node.children as AiCaseNode[] | undefined;
  if (!children || children.length === 0) {
    return false;
  }
  const firstChild = children[0];
  // 旧格式特征：topic 是"测试点"且 kind 是 scenario（排除用户手动输入“测试点”内容的误判）
  return firstChild?.topic === '测试点' &&
    (firstChild?.metadata as Partial<AiCaseNodeMetadata> | undefined)?.kind === 'scenario';
}

export function expandImportedCaseNodesFromNote(
  data: AiCaseMindData,
  options?: {
    candidateNodeIds?: string[];
    showNodeKindTags?: boolean;
    /** 是否强制迁移旧格式节点（已有子节点但第一子节点 topic==="测试点"）*/
    migrateLegacy?: boolean;
  }
): { data: AiCaseMindData; expandedCount: number } {
  const candidateSet = options?.candidateNodeIds && options.candidateNodeIds.length > 0
    ? new Set(options.candidateNodeIds)
    : null;
  const migrateLegacy = options?.migrateLegacy ?? false;

  const next = cloneData(data);
  let expandedCount = 0;

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

    // 如果已有子节点：仅在 migrateLegacy=true 且是旧格式时才重建
    if (hasChildren) {
      if (!migrateLegacy || !isLegacyExpandedTestcase(node)) {
        return;
      }
      // 旧格式迁移：清除旧 children，从 note 重新展开
      delete node.children;
    }

    const note = typeof node.note === 'string' ? node.note.trim() : '';
    if (!note) {
      return;
    }

    const sections = parseCaseNoteSections(note);
    const children = buildCaseNoteChildren(sections, metadata.aiGenerated, node.topic);
    if (children.length === 0) {
      return;
    }

    node.children = children;
    node.expanded = true;
    node.metadata = {
      ...metadata,
      nodeVersion: metadata.nodeVersion + 1,
      updatedAt: Date.now(),
    };
    expandedCount += 1;
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

function buildCaseChildren(
  preconditions: string[],
  steps: string[],
  expectedResults: string[],
  title: string
): AiCaseNode[] {
  const fmtContent = (items: string[]): string | null => {
    if (items.length === 0) return null;
    if (items.length === 1) return items[0];
    return items.map((item, i) => `${i + 1}. ${item}`).join('\n');
  };

  const sections: Array<{ label: CaseSectionLabel; content: string | null }> = [
    { label: '测试点', content: title.trim() || null },
    { label: '前置条件', content: fmtContent(preconditions) },
    { label: '测试步骤', content: fmtContent(steps) },
    { label: '预期结果', content: fmtContent(expectedResults) },
  ];

  return sections
    .filter((s): s is { label: CaseSectionLabel; content: string } => s.content !== null)
    .map((s) =>
      createNode(s.content, 'scenario', {
        aiGenerated: true,
        tags: [makeSectionTag(s.label)],
      })
    );
}

function buildSmokeCases(anchor: string): AiCaseNode[] {
  return [
    createNode(`${anchor} 主流程可以顺利完成`, 'testcase', {
      priority: 'P0',
      aiGenerated: true,
      children: buildCaseChildren(
        ['已有可登录测试账号，且目标环境可访问'],
        ['进入登录页面并输入有效账号密码', '点击登录并等待页面跳转'],
        ['登录成功并跳转到用户主页', '页面展示当前用户信息且会话状态有效'],
        `${anchor} 主流程可以顺利完成`
      ),
    }),
    createNode(`${anchor} 关键参数校验与提示正确`, 'testcase', {
      priority: 'P1',
      aiGenerated: true,
      children: buildCaseChildren(
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
          children: buildCaseChildren(point.preconditions, point.steps, point.expectedResults, point.title),
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
