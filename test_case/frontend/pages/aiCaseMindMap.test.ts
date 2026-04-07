/**
 * 测试 aiCaseMindMap 中关于本次改动的核心逻辑：
 * 1. buildCaseChain / buildSmokeCases / buildCoverageModules 节点带正确的 section tag
 * 2. createInitialMindData / generateMindDataFromRequirement 结构为 root→module→testcase→链式3节点
 * 3. migrateToChainFormat 旧格式迁移后也带 section tag
 * 4. expandNoteToChildren 解析 note 后返回链式嵌套结构
 */
import { describe, it, expect } from 'vitest';
import {
  createInitialMindData,
  generateMindDataFromRequirement,
  expandImportedCaseNodesFromNote,
  normalizeMindData,
} from '@/lib/aiCaseMindMap';
import type { AiCaseNode, AiCaseMindData } from '@/types/aiCases';

// ─── 辅助函数 ────────────────────────────────────────────────────────────────

function makeNode(
  id: string,
  topic: string,
  kind: 'root' | 'module' | 'scenario' | 'testcase',
  children: AiCaseNode[] = [],
  extra?: Partial<AiCaseNode>,
): AiCaseNode {
  return {
    id,
    topic,
    expanded: true,
    metadata: {
      kind,
      status: 'todo',
      priority: 'P1',
      owner: null,
      attachmentIds: [],
      aiGenerated: false,
      nodeVersion: 1,
      updatedAt: 0,
      statusHistory: [],
    },
    children,
    ...extra,
  } as unknown as AiCaseNode;
}

function makeMindData(root: AiCaseNode): AiCaseMindData {
  return {
    nodeData: root,
    linkData: {},
    theme: null as unknown as AiCaseMindData['theme'],
    direction: 2,
    locale: 'zh_CN',
    overflowHidden: false,
  };
}

/** 从节点 tags 中提取第一个 tag 的文本 */
function getFirstTagText(node: AiCaseNode): string | undefined {
  const tags = node.tags as Array<{ text: string }> | undefined;
  return tags?.[0]?.text;
}

/** 获取 testcase 节点的链式链路：[前置条件, 测试步骤, 预期结果] */
function getChainFromTestcase(testcase: AiCaseNode): [AiCaseNode | undefined, AiCaseNode | undefined, AiCaseNode | undefined] {
  const precondNode = testcase.children?.[0] as AiCaseNode | undefined;
  const stepsNode = precondNode?.children?.[0] as AiCaseNode | undefined;
  const expectedNode = stepsNode?.children?.[0] as AiCaseNode | undefined;
  return [precondNode, stepsNode, expectedNode];
}

// ─── 测试：createInitialMindData 结构 ────────────────────────────────────────

describe('createInitialMindData', () => {
  it('应生成 root→module→testcase 的3层结构（不含 scenario 中间层）', () => {
    const data = createInitialMindData('Test Workspace');
    const root = data.nodeData;

    expect(root.metadata?.kind).toBe('root');
    expect(root.children?.length).toBeGreaterThan(0);

    for (const child of root.children ?? []) {
      const module = child as AiCaseNode;
      expect(module.metadata?.kind).toBe('module');
      expect(module.children?.length).toBeGreaterThan(0);

      for (const subChild of module.children ?? []) {
        const testcase = subChild as AiCaseNode;
        expect(testcase.metadata?.kind).toBe('testcase');
      }
    }
  });

  it('testcase 节点应有唯一链式子节点（前置条件）', () => {
    const data = createInitialMindData();
    const firstModule = data.nodeData.children?.[0] as AiCaseNode;
    const firstTestcase = firstModule.children?.[0] as AiCaseNode;

    // testcase 有且只有一个直属子节点（前置条件）
    expect(firstTestcase.children?.length).toBe(1);
    const [precond, steps, expected] = getChainFromTestcase(firstTestcase);

    expect(precond).toBeDefined();
    expect(steps).toBeDefined();
    expect(expected).toBeDefined();
  });

  it('链式节点应携带正确的 section tag', () => {
    const data = createInitialMindData();
    const firstModule = data.nodeData.children?.[0] as AiCaseNode;
    const firstTestcase = firstModule.children?.[0] as AiCaseNode;
    const [precond, steps, expected] = getChainFromTestcase(firstTestcase);

    expect(getFirstTagText(precond!)).toBe('前置条件');
    expect(getFirstTagText(steps!)).toBe('测试步骤');
    expect(getFirstTagText(expected!)).toBe('预期结果');
  });

  it('module 节点应有 功能模块 tag，testcase 节点应有 测试点 tag', () => {
    const data = createInitialMindData();
    const firstModule = data.nodeData.children?.[0] as AiCaseNode;
    const firstTestcase = firstModule.children?.[0] as AiCaseNode;

    expect(getFirstTagText(firstModule)).toBe('功能模块');
    expect(getFirstTagText(firstTestcase)).toBe('测试点');
  });
});

// ─── 测试：generateMindDataFromRequirement 结构 ──────────────────────────────

describe('generateMindDataFromRequirement', () => {
  it('应生成 root→module→testcase 的3层结构（不含 scenario 中间层）', () => {
    const data = generateMindDataFromRequirement('用户登录功能需求');
    const root = data.nodeData;

    expect(root.metadata?.kind).toBe('root');

    for (const child of root.children ?? []) {
      const module = child as AiCaseNode;
      expect(module.metadata?.kind).toBe('module');

      for (const subChild of module.children ?? []) {
        const testcase = subChild as AiCaseNode;
        expect(testcase.metadata?.kind).toBe('testcase');

        // testcase 下第一个子节点应为 前置条件 链式节点
        const [precond] = getChainFromTestcase(testcase);
        expect(precond?.metadata?.kind).toBe('scenario');
      }
    }
  });

  it('链式节点 tag 颜色配置应为黄/蓝/粉', () => {
    const data = generateMindDataFromRequirement('测试需求');
    const firstModule = data.nodeData.children?.[0] as AiCaseNode;
    const firstTestcase = firstModule.children?.[0] as AiCaseNode;
    const [precond, steps, expected] = getChainFromTestcase(firstTestcase);

    const precondTags = precond!.tags as Array<{ text: string; style: Record<string, string> }>;
    const stepsTags = steps!.tags as Array<{ text: string; style: Record<string, string> }>;
    const expectedTags = expected!.tags as Array<{ text: string; style: Record<string, string> }>;

    // 前置条件：黄色背景
    expect(precondTags[0].style.background).toBe('#FEF9C3');
    // 测试步骤：蓝色背景
    expect(stepsTags[0].style.background).toBe('#DBEAFE');
    // 预期结果：粉色背景
    expect(expectedTags[0].style.background).toBe('#FCE7F3');
  });
});

// ─── 测试：expandImportedCaseNodesFromNote 旧格式迁移 ────────────────────────

describe('expandImportedCaseNodesFromNote - 旧格式迁移', () => {
  it('含 note 的旧格式 testcase 应被迁移为链式结构并带 section tag', () => {
    const noteContent = `前置条件：已有测试账号
测试步骤：
1. 打开登录页
2. 输入账号密码
预期结果：登录成功跳转到首页`;

    const testcase = makeNode('tc1', '登录测试', 'testcase', [], { note: noteContent });
    const module = makeNode('m1', '登录模块', 'module', [testcase]);
    const root = makeNode('root', '测试工作台', 'root', [module]);
    const data = makeMindData(root);

    const result = expandImportedCaseNodesFromNote(normalizeMindData(data));

    expect(result.expandedCount).toBe(1);

    const migratedTestcase = (result.data.nodeData.children![0] as AiCaseNode).children![0] as AiCaseNode;
    const [precond, steps, expected] = getChainFromTestcase(migratedTestcase);

    expect(precond).toBeDefined();
    expect(steps).toBeDefined();
    expect(expected).toBeDefined();

    expect(getFirstTagText(precond!)).toBe('前置条件');
    expect(getFirstTagText(steps!)).toBe('测试步骤');
    expect(getFirstTagText(expected!)).toBe('预期结果');
  });

  it('带旧前缀标签的子节点应被迁移为链式结构并带 section tag', () => {
    const child1 = makeNode('c1', '前置条件：系统正常运行', 'scenario');
    const child2 = makeNode('c2', '测试步骤：执行主流程操作', 'scenario');
    const child3 = makeNode('c3', '预期结果：操作成功', 'scenario');
    const testcase = makeNode('tc1', '主流程测试', 'testcase', [child1, child2, child3]);
    const root = makeNode('root', '根节点', 'root', [testcase]);
    const data = makeMindData(root);

    const result = expandImportedCaseNodesFromNote(normalizeMindData(data));

    expect(result.expandedCount).toBe(1);

    const migratedTestcase = result.data.nodeData.children![0] as AiCaseNode;
    const [precond, steps, expected] = getChainFromTestcase(migratedTestcase);

    expect(precond).toBeDefined();
    expect(steps).toBeDefined();
    expect(expected).toBeDefined();

    expect(getFirstTagText(precond!)).toBe('前置条件');
    expect(getFirstTagText(steps!)).toBe('测试步骤');
    expect(getFirstTagText(expected!)).toBe('预期结果');
  });

  it('已是新链式格式的节点不应被重复迁移', () => {
    // 构建一个已有链式结构的 testcase（带 section tag，无旧前缀）
    const precondNode = makeNode('precond', '已有可登录账号', 'scenario', [], {
      tags: [{ text: '前置条件', style: {} }] as AiCaseNode['tags'],
    });
    const testcase = makeNode('tc1', '新格式用例', 'testcase', [precondNode]);
    const root = makeNode('root', '根节点', 'root', [testcase]);
    const data = makeMindData(root);

    const result = expandImportedCaseNodesFromNote(normalizeMindData(data));

    // 已是新格式，不应触发迁移
    expect(result.expandedCount).toBe(0);
  });

  it('expandNoteToChildren 解析 note 后返回链式嵌套（只有1个根子节点）', () => {
    const noteContent = `前置条件：准备测试数据
测试步骤：
1. 打开页面
2. 点击提交
预期结果：提交成功`;

    const testcase = makeNode('tc1', '测试', 'testcase', [], { note: noteContent });
    const root = makeNode('root', '根', 'root', [testcase]);
    const data = makeMindData(root);

    const result = expandImportedCaseNodesFromNote(normalizeMindData(data));
    const migratedTestcase = result.data.nodeData.children![0] as AiCaseNode;

    // testcase 应只有 1 个直属子节点（前置条件，链式嵌套）
    expect(migratedTestcase.children?.length).toBe(1);

    const [precond, steps, expected] = getChainFromTestcase(migratedTestcase);
    expect(precond?.topic).toMatch(/准备测试数据/);
    expect(steps?.topic).toMatch(/打开页面/);
    expect(expected?.topic).toMatch(/提交成功/);
  });
});

// ─── 测试：normalizeMindData tag 保留逻辑 ────────────────────────────────────

describe('normalizeMindData - section tag 保留', () => {
  it('已有 section tag 的节点在 normalize 后不应被覆盖', () => {
    const precondNode = makeNode('p1', '前置条件内容', 'scenario', [], {
      tags: [{ text: '前置条件', style: { background: '#FEF9C3', color: '#854D0E' } }] as AiCaseNode['tags'],
    });
    const stepsNode = makeNode('s1', '步骤内容', 'scenario', [precondNode], {
      tags: [{ text: '测试步骤', style: { background: '#DBEAFE', color: '#1E40AF' } }] as AiCaseNode['tags'],
    });
    const testcase = makeNode('tc1', '测试用例', 'testcase', [stepsNode]);
    const module = makeNode('m1', '功能模块A', 'module', [testcase]);
    const root = makeNode('root', '根', 'root', [module]);
    const data = makeMindData(root);

    const normalized = normalizeMindData(data);
    const normalizedModule = normalized.nodeData.children![0] as AiCaseNode;
    const normalizedTestcase = normalizedModule.children![0] as AiCaseNode;
    const normalizedSteps = normalizedTestcase.children![0] as AiCaseNode;
    const normalizedPrecond = normalizedSteps.children![0] as AiCaseNode;

    // section tag 应被保留
    expect(getFirstTagText(normalizedSteps)).toBe('测试步骤');
    expect(getFirstTagText(normalizedPrecond)).toBe('前置条件');
  });
});
