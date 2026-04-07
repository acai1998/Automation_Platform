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

/** 链式节点的 section tag 样式（前置条件/测试步骤/预期结果） */
const SECTION_TAG_STYLES: Record<string, Record<string, string>> = {
  '前置条件': { background: '#FEF9C3', color: '#854D0E', borderRadius: '8px', padding: '2px 6px' },
  '测试步骤': { background: '#DBEAFE', color: '#1E40AF', borderRadius: '8px', padding: '2px 6px' },
  '预期结果': { background: '#FCE7F3', color: '#9D174D', borderRadius: '8px', padding: '2px 6px' },
};

/**
 * testcase 节点的状态背景色映射（通过 mind-elixir 的 style 属性设置节点背景）
 * 仅在状态非 todo 时生效，todo 状态保留默认白色背景
 */
const STATUS_NODE_STYLE: Partial<Record<AiCaseNodeStatus, { background: string; color: string }>> = {
  passed:  { background: '#F0FDF4', color: '#166534' },
  failed:  { background: '#FFF1F2', color: '#9F1239' },
  doing:   { background: '#EFF6FF', color: '#1E40AF' },
  blocked: { background: '#FFFBEB', color: '#92400E' },
  skipped: { background: '#FAF5FF', color: '#6B21A8' },
};

/**
 * testcase 节点的状态 tag 映射（追加在节点 tags 数组尾部）
 * todo 状态不添加状态 tag，避免每个节点都显示"待执行"
 */
const STATUS_TAG_MAP: Partial<Record<AiCaseNodeStatus, { text: string; style: Record<string, string> }>> = {
  passed:  { text: '✓ 通过', style: { background: '#DCFCE7', color: '#166534', borderRadius: '8px', padding: '2px 6px', fontWeight: '600' } },
  failed:  { text: '✗ 失败', style: { background: '#FFE4E6', color: '#9F1239', borderRadius: '8px', padding: '2px 6px', fontWeight: '600' } },
  doing:   { text: '⏳ 进行中', style: { background: '#DBEAFE', color: '#1E40AF', borderRadius: '8px', padding: '2px 6px' } },
  blocked: { text: '⊘ 阻塞', style: { background: '#FEF3C7', color: '#92400E', borderRadius: '8px', padding: '2px 6px' } },
  skipped: { text: '— 跳过', style: { background: '#F3E8FF', color: '#6B21A8', borderRadius: '8px', padding: '2px 6px' } },
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
  // scenario / testcase 节点不添加节点类型标签：
  // - scenario：语义已通过节点名称和上下文清晰表达
  // - testcase：是链式结构起始节点，位置和上下文已足够表达语义；类型标签在每行重复出现视觉冗余
  if (!showNodeKindTags || kind === 'root' || kind === 'scenario' || kind === 'testcase') {
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

  // 若 showNodeKindTags=false：清除所有 tags（包括 section 标签），但 testcase 状态 tag 仍需保留
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

  // testcase 节点：应用状态背景色，并在显示 tags 时追加状态 tag
  if (merged.kind === 'testcase') {
    const nodeStyle = STATUS_NODE_STYLE[merged.status];
    if (nodeStyle) {
      // mind-elixir 通过 NodeObj 上的 style 字段设置节点背景色和文字色
      (node as AiCaseNode & { style?: Record<string, string> }).style = nodeStyle;
    } else {
      // todo 状态：清除之前可能设置过的颜色，恢复默认
      delete (node as AiCaseNode & { style?: Record<string, string> }).style;
    }

    if (options.showNodeKindTags && merged.status !== 'todo') {
      const statusTag = STATUS_TAG_MAP[merged.status];
      if (statusTag) {
        // 状态 tag 追加到尾部（section tag 之后，或作为唯一 tag）
        const existingTags = Array.isArray(node.tags) ? [...node.tags] : [];
        // 移除旧的状态 tag（避免重复追加），按 tag text 识别
        const statusTexts = new Set(Object.values(STATUS_TAG_MAP).map((t) => t?.text));
        const filteredTags = existingTags.filter(
          (t): t is { text: string; style: Record<string, string> } =>
            typeof t === 'object' && t !== null && 'text' in t && !statusTexts.has((t as { text: string }).text)
        );
        node.tags = [...filteredTags, { text: statusTag.text, style: statusTag.style }];
      }
    } else if (!options.showNodeKindTags || merged.status === 'todo') {
      // 隐藏 tags 或 todo 状态时，移除状态 tag（但保留 section tags 逻辑已在上方处理）
      if (Array.isArray(node.tags)) {
        const statusTexts = new Set(Object.values(STATUS_TAG_MAP).map((t) => t?.text));
        const filtered = node.tags.filter(
          (t): t is { text: string; style: Record<string, string> } =>
            typeof t === 'object' && t !== null && 'text' in t && !statusTexts.has((t as { text: string }).text)
        );
        if (filtered.length > 0) {
          node.tags = filtered;
        } else {
          delete node.tags;
        }
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
 * 将 note 字段解析为链式嵌套节点（前置条件→测试步骤→预期结果）。
 * 用于将仅有 note 的旧格式 testcase 迁移为新的链式格式。
 * 返回值为链式的第一个节点（前置条件），内部嵌套后续节点。
 */
function expandNoteToChildren(note: string): AiCaseNode[] {
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

  const parsedPreconditions = sections['前置条件'];
  const parsedSteps = sections['测试步骤'];
  const parsedExpectedResults = sections['预期结果'];

  // 无法解析各段时，把整个 note 作为前置条件节点（兜底）
  if (!parsedPreconditions && !parsedSteps && !parsedExpectedResults && note.trim()) {
    return [createNode(note.trim(), 'scenario', {
      aiGenerated: true,
      tags: [{ text: '前置条件', style: SECTION_TAG_STYLES['前置条件'] }],
    })];
  }

  const preconditions = parsedPreconditions ?? ['无特殊前置条件'];
  const steps = parsedSteps ?? ['执行目标操作'];
  const expectedResults = parsedExpectedResults ?? ['功能符合预期'];

  // 构建链式嵌套（与 buildCaseChain 保持一致），每个节点带 section tag
  const expectedNode = createNode(fmtInline(expectedResults), 'scenario', {
    aiGenerated: true,
    tags: [{ text: '预期结果', style: SECTION_TAG_STYLES['预期结果'] }],
  });
  const stepsNode = createNode(fmtInline(steps), 'scenario', {
    aiGenerated: true,
    children: [expectedNode],
    tags: [{ text: '测试步骤', style: SECTION_TAG_STYLES['测试步骤'] }],
  });
  return [createNode(fmtInline(preconditions), 'scenario', {
    aiGenerated: true,
    children: [stepsNode],
    tags: [{ text: '前置条件', style: SECTION_TAG_STYLES['前置条件'] }],
  })];
}


/**
 * 判断 testcase 节点是否已是新链式格式：
 * 新格式：testcase → 前置条件(scenario，无旧前缀标签) → 测试步骤 → 预期结果
 * 只要第一个子节点是 scenario 且 topic 不带旧前缀标签，视为新格式无需迁移。
 */
function isNewChainFormat(node: AiCaseNode): boolean {
  const children = (node.children ?? []) as AiCaseNode[];
  if (children.length === 0) return false;
  const first = children[0];
  if (!first) return false;
  // 子节点 topic 不带旧前缀标签，且 topic 是否为嵌套"测试点"层均为旧格式
  if (first.topic === '测试点') return false;
  return !LEGACY_LABEL_RE.test(first.topic);
}

/**
 * 将 testcase 节点的旧格式子节点迁移为新链式格式：
 *   新格式：testcase → 前置条件 → 测试步骤 → 预期结果（每级只有1个子节点）
 *
 * 处理两种旧格式：
 *  1. 仅有 note 字段（中间迁移格式）→ 解析 note 生成链式子节点
 *  2. 子节点带旧前缀标签（或嵌套"测试点"层）→ 去掉前缀并转为链式
 *
 * 返回迁移后的子节点列表（即前置条件节点，含链式嵌套）；null 表示无需迁移。
 */
function migrateToChainFormat(node: AiCaseNode): AiCaseNode[] | null {
  // 情况1：仅有 note，无子节点
  if (hasNoteOnlyFormat(node)) {
    return expandNoteToChildren(node.note as string);
  }

  const children = (node.children ?? []) as AiCaseNode[];

  // 无子节点 & 无 note：testcase 完全为空（保留不变）
  if (children.length === 0) return null;

  // 已是新链式格式，无需迁移
  if (isNewChainFormat(node)) return null;

  // 情况2：嵌套"测试点"层 → 提升其子节点再处理
  let flatChildren: AiCaseNode[];
  if (children[0]?.topic === '测试点' && (children[0]?.children?.length ?? 0) > 0) {
    flatChildren = (children[0].children ?? []) as AiCaseNode[];
  } else {
    flatChildren = children;
  }

  // 提取各段内容，去掉前缀标签
  const sections: Record<string, string[]> = {};
  const sectionOrder = ['前置条件', '测试步骤', '预期结果'];

  for (const child of flatChildren) {
    const labelMatch = child.topic.match(/^(前置条件|测试步骤|预期结果)[：:]\s*([\s\S]*)$/);
    if (labelMatch) {
      const label = labelMatch[1];
      const rawContent = labelMatch[2].trim();
      const lines = rawContent
        .split(/\r?\n/)
        .map((l) => l.replace(/^\d+[\.\)、]\s*/, '').trim())
        .filter(Boolean);
      sections[label] = lines.length > 0 ? lines : [rawContent];
    } else {
      // 无前缀标签的子节点：作为旧格式3个并列节点处理，按顺序分配
      const assigned = sectionOrder.find((s) => !sections[s]);
      if (assigned) {
        sections[assigned] = [child.topic.trim()];
      }
    }
  }

  const preconditions = sections['前置条件'] ?? ['无特殊前置条件'];
  const steps = sections['测试步骤'] ?? ['执行目标操作'];
  const expectedResults = sections['预期结果'] ?? ['功能符合预期'];

  // 重新构建链式结构，每个节点带上对应的 section tag
  const expectedNode = createNode(fmtInline(expectedResults), 'scenario', {
    aiGenerated: true,
    tags: [{ text: '预期结果', style: SECTION_TAG_STYLES['预期结果'] }],
  });
  const stepsNode = createNode(fmtInline(steps), 'scenario', {
    aiGenerated: true,
    children: [expectedNode],
    tags: [{ text: '测试步骤', style: SECTION_TAG_STYLES['测试步骤'] }],
  });
  return [createNode(fmtInline(preconditions), 'scenario', {
    aiGenerated: true,
    children: [stepsNode],
    tags: [{ text: '前置条件', style: SECTION_TAG_STYLES['前置条件'] }],
  })];
}

/**
 * 遍历脑图数据，将旧格式 testcase 节点迁移为新链式格式：
 *   testcase → 前置条件 → 测试步骤 → 预期结果（每级只有1个子节点，脑图中一行展示）
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

    const chainChildren = migrateToChainFormat(node);
    if (chainChildren === null) {
      return; // 已是新格式，无需迁移
    }

    if (chainChildren.length > 0) {
      node.children = chainChildren;
    } else {
      delete node.children;
    }
    delete node.note;

    const currentVersion = typeof metadata.nodeVersion === 'number' && metadata.nodeVersion > 0
      ? metadata.nodeVersion
      : 1;
    node.metadata = {
      ...metadata,
      nodeVersion: currentVersion + 1,
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
 * 构建 testcase 的 4 节点链式结构（脑图中横向展开为一行）：
 *   testcase → 前置条件（唯一子节点）→ 测试步骤（唯一子节点）→ 预期结果（叶子）
 * 每个节点内容直接写在 topic 里，多条用分号拼接
 */
function buildCaseChain(
  preconditions: string[],
  steps: string[],
  expectedResults: string[],
): AiCaseNode[] {
  const safePreconditions = preconditions.length > 0 ? preconditions : ['无特殊前置条件'];
  const safeSteps = steps.length > 0 ? steps : ['执行目标操作并记录结果'];
  const safeExpectedResults = expectedResults.length > 0 ? expectedResults : ['功能符合预期'];

  // 从尾到头链式嵌套：预期结果 ← 测试步骤 ← 前置条件
  // 每个节点带上对应的 section tag
  const expectedNode = createNode(fmtInline(safeExpectedResults), 'scenario', {
    aiGenerated: true,
    tags: [{ text: '预期结果', style: SECTION_TAG_STYLES['预期结果'] }],
  });
  const stepsNode = createNode(fmtInline(safeSteps), 'scenario', {
    aiGenerated: true,
    children: [expectedNode],
    tags: [{ text: '测试步骤', style: SECTION_TAG_STYLES['测试步骤'] }],
  });
  return [createNode(fmtInline(safePreconditions), 'scenario', {
    aiGenerated: true,
    children: [stepsNode],
    tags: [{ text: '前置条件', style: SECTION_TAG_STYLES['前置条件'] }],
  })];
}

function buildSmokeCases(anchor: string): AiCaseNode[] {
  return [
    createNode(`${anchor} 主流程可以顺利完成`, 'testcase', {
      priority: 'P0',
      aiGenerated: true,
      children: buildCaseChain(
        ['已有可登录测试账号，且目标环境可访问'],
        ['进入登录页面并输入有效账号密码', '点击登录并等待页面跳转'],
        ['登录成功并跳转到用户主页', '页面展示当前用户信息且会话状态有效'],
      ),
    }),
    createNode(`${anchor} 关键参数校验与提示正确`, 'testcase', {
      priority: 'P1',
      aiGenerated: true,
      children: buildCaseChain(
        ['已准备非法与合法输入组合'],
        ['输入非法参数并提交', '根据错误提示修正后再次提交'],
        ['非法参数有明确错误提示', '修正后可正常完成流程'],
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
          children: buildCaseChain(point.preconditions, point.steps, point.expectedResults),
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
