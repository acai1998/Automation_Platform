import {
  createAiCaseNodeId,
  parsePriority,
  type AiCaseNodeKind,
  type AiCaseNodeMetadata,
  type AiCaseNodePriority,
} from '@shared/types/aiCaseNodeMetadata';
import type {
  AiCaseGenerationPlan,
  AiCaseGenerationPlanCase,
  AiCaseGenerationPlanModule,
  AiCaseMapData,
  AiCaseMapNode,
} from '@shared/types/aiCaseMap';
import { normalizeMapData } from './normalization';

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

const SECTION_TAG_STYLES: Record<string, Record<string, string>> = {
  '前置条件': { background: '#FEF9C3', color: '#854D0E', borderRadius: '8px', padding: '2px 6px' },
  '测试步骤': { background: '#DBEAFE', color: '#1E40AF', borderRadius: '8px', padding: '2px 6px' },
  '预期结果': { background: '#FCE7F3', color: '#9D174D', borderRadius: '8px', padding: '2px 6px' },
};

function createNode(
  topic: string,
  kind: AiCaseNodeKind,
  options?: {
    priority?: AiCaseNodePriority;
    note?: string;
    aiGenerated?: boolean;
    children?: AiCaseMapNode[];
    tags?: AiCaseMapNode['tags'];
  },
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
    ...(options?.tags && Array.isArray(options.tags) && options.tags.length > 0 ? { tags: options.tags } : {}),
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

function fmtInline(items: string[]): string {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0];
  return items.map((item, i) => `${i + 1}.${item}`).join('；');
}

function buildCaseChainNodes(testCase: AiCaseGenerationPlanCase): AiCaseMapNode[] {
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

export function buildMapDataFromPlan(plan: AiCaseGenerationPlan): AiCaseMapData {
  const root = createNode(plan.workspaceName, 'root', {
    aiGenerated: true,
    children: plan.modules.map((module) => {
      const caseNodes = module.scenarios.flatMap((scenario) =>
        scenario.cases.map((testCase) =>
          createNode(testCase.title, 'testcase', {
            aiGenerated: true,
            priority: parsePriority(testCase.priority, 'P1'),
            children: buildCaseChainNodes(testCase),
          }),
        ),
      );
      return createNode(module.name, 'module', {
        aiGenerated: true,
        children: caseNodes,
      });
    }),
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
