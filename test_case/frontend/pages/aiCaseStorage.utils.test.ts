/**
 * 测试 aiCaseStorage 中的工具函数：
 * - exportMindDataToMarkdown：将脑图数据转为 Markdown 文本
 * - downloadTextFile：触发浏览器下载文本文件
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { exportMindDataToMarkdown, downloadTextFile } from '@/lib/aiCaseStorage';
import type { AiCaseMindData, AiCaseNode } from '@/types/aiCases';

// ─── 辅助构造函数 ───────────────────────────────────────────────────────────

function makeNode(
  id: string,
  topic: string,
  kind: 'root' | 'module' | 'scenario' | 'testcase',
  children: AiCaseNode[] = [],
  extra?: Partial<AiCaseNode>
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

function makeTestMindData(): AiCaseMindData {
  const testcase1 = makeNode('tc1', '正常登录', 'testcase', []);
  const testcase2 = makeNode('tc2', '密码错误 [P0]', 'testcase', [], {
    metadata: {
      kind: 'testcase',
      status: 'failed',
      priority: 'P0',
      owner: null,
      attachmentIds: [],
      aiGenerated: true,
      nodeVersion: 1,
      updatedAt: 0,
      statusHistory: [],
    } as AiCaseNode['metadata'],
  } as Partial<AiCaseNode>);
  const testcase3 = makeNode('tc3', '带备注用例', 'testcase', [], {
    note: '这是备注内容\n第二行',
  } as Partial<AiCaseNode>);

  const scenario1 = makeNode('s1', '登录场景', 'scenario', [testcase1, testcase2]);
  const scenario2 = makeNode('s2', '密码场景', 'scenario', [testcase3]);
  const module1 = makeNode('m1', '用户认证', 'module', [scenario1, scenario2]);
  const root = makeNode('root', 'AI 测试工作台', 'root', [module1]);

  return {
    nodeData: root,
    linkData: {},
    theme: null as unknown as AiCaseMindData['theme'],
    direction: 2,
    locale: 'zh_CN',
    overflowHidden: false,
  };
}

// ─── exportMindDataToMarkdown 测试 ──────────────────────────────────────────

describe('exportMindDataToMarkdown', () => {
  it('根节点应生成一级标题', () => {
    const data = makeTestMindData();
    const md = exportMindDataToMarkdown(data);
    expect(md).toMatch(/^# AI 测试工作台/m);
  });

  it('module 节点应生成二级标题', () => {
    const data = makeTestMindData();
    const md = exportMindDataToMarkdown(data);
    expect(md).toMatch(/^## 用户认证/m);
  });

  it('scenario 节点应生成三级标题', () => {
    const data = makeTestMindData();
    const md = exportMindDataToMarkdown(data);
    expect(md).toMatch(/^### 登录场景/m);
    expect(md).toMatch(/^### 密码场景/m);
  });

  it('testcase 节点应生成任务列表项', () => {
    const data = makeTestMindData();
    const md = exportMindDataToMarkdown(data);
    expect(md).toMatch(/^- \[ \] \*\*正常登录\*\*/m);
  });

  it('topic 中的 [标签] 标注应被自动剥离，priority 字段以独立 [P0] 形式附加在末尾', () => {
    // "密码错误 [P0] (failed)" 的 [P0] 是手动加在 topic 中的标注，应先被去除
    // 导出时 priority 字段会在行末重新附加 [P0]，所以 Markdown 中仍会出现 [P0]，
    // 但来源是 metadata.priority 而非 topic 文本本身
    const data = makeTestMindData();
    const md = exportMindDataToMarkdown(data);
    // topic 被清洗后应保留主体文字
    expect(md).toMatch(/密码错误/);
    // priority 字段单独附加在末尾（来自 metadata）
    expect(md).toMatch(/\[P0\]/);
    // 最终行格式：- [ ] **密码错误** [P0] (failed)
    expect(md).toMatch(/- \[ \] \*\*密码错误\*\* \[P0\]/);
  });

  it('带 note 的 testcase 应将 note 以缩进列表项追加（每行一个）', () => {
    const data = makeTestMindData();
    const md = exportMindDataToMarkdown(data);
    // note 每行作为独立的缩进列表项输出
    expect(md).toMatch(/^\s+- 这是备注内容/m);
    expect(md).toMatch(/^\s+- 第二行/m);
  });

  it('空脑图（只有根节点）不应报错', () => {
    const emptyRoot = makeNode('root', '空工作台', 'root', []);
    const data: AiCaseMindData = {
      nodeData: emptyRoot,
      linkData: {},
      theme: null as unknown as AiCaseMindData['theme'],
      direction: 2,
      locale: 'zh_CN',
      overflowHidden: false,
    };
    expect(() => exportMindDataToMarkdown(data)).not.toThrow();
    const md = exportMindDataToMarkdown(data);
    expect(md).toMatch(/^# 空工作台/m);
  });

  it('topic 为空的节点应被跳过', () => {
    const emptyTopicNode = makeNode('empty', '', 'testcase', []);
    const root = makeNode('root', '根节点', 'root', [emptyTopicNode]);
    const data: AiCaseMindData = {
      nodeData: root,
      linkData: {},
      theme: null as unknown as AiCaseMindData['theme'],
      direction: 2,
      locale: 'zh_CN',
      overflowHidden: false,
    };
    const md = exportMindDataToMarkdown(data);
    // 空 topic 节点不应出现空列表项
    expect(md).not.toMatch(/^- \[ \] \*\*\*\*/m);
  });

  it('testcase 的链式子节点应以 **标签**：内容 形式展示（前置条件/测试步骤/预期结果）', () => {
    const step = makeNode('step1', '输入用户名', 'scenario', []);
    const tc = makeNode('tc', '登录流程', 'testcase', [step]);
    const root = makeNode('root', '根', 'root', [tc]);
    const data: AiCaseMindData = {
      nodeData: root,
      linkData: {},
      theme: null as unknown as AiCaseMindData['theme'],
      direction: 2,
      locale: 'zh_CN',
      overflowHidden: false,
    };
    const md = exportMindDataToMarkdown(data);
    // 链式第一个子节点作为前置条件展示
    expect(md).toMatch(/^\s+- \*\*前置条件\*\*：输入用户名/m);
  });

  it('testcase 链式结构应输出前置条件/测试步骤/预期结果三行', () => {
    const expectedNode = makeNode('gc1', '操作成功', 'scenario', []);
    const stepsNode = makeNode('step1', '点击提交按钮', 'scenario', [expectedNode]);
    const precondNode = makeNode('precond', '页面已打开', 'scenario', [stepsNode]);
    const tc = makeNode('tc', '提交流程', 'testcase', [precondNode]);
    const root = makeNode('root', '根', 'root', [tc]);
    const data: AiCaseMindData = {
      nodeData: root,
      linkData: {},
      theme: null as unknown as AiCaseMindData['theme'],
      direction: 2,
      locale: 'zh_CN',
      overflowHidden: false,
    };
    const md = exportMindDataToMarkdown(data);
    // 链式三个节点应分别展示
    expect(md).toMatch(/- \*\*前置条件\*\*：页面已打开/);
    expect(md).toMatch(/- \*\*测试步骤\*\*：点击提交按钮/);
    expect(md).toMatch(/- \*\*预期结果\*\*：操作成功/);
  });

  it('priority 字段应附加在 testcase 行末', () => {
    const tc = makeNode('tc1', '优先级测试', 'testcase', [], {
      metadata: {
        kind: 'testcase',
        status: 'todo',
        priority: 'P0',
        owner: null,
        attachmentIds: [],
        aiGenerated: false,
        nodeVersion: 1,
        updatedAt: 0,
        statusHistory: [],
      } as AiCaseNode['metadata'],
    } as Partial<AiCaseNode>);
    const root = makeNode('root', '根', 'root', [tc]);
    const data: AiCaseMindData = {
      nodeData: root,
      linkData: {},
      theme: null as unknown as AiCaseMindData['theme'],
      direction: 2,
      locale: 'zh_CN',
      overflowHidden: false,
    };
    const md = exportMindDataToMarkdown(data);
    expect(md).toMatch(/- \[ \] \*\*优先级测试\*\* \[P0\]/);
  });

  it('status 字段应以括号形式附加在 testcase 行末', () => {
    const tc = makeNode('tc1', '失败用例', 'testcase', [], {
      metadata: {
        kind: 'testcase',
        status: 'failed',
        priority: 'P1',
        owner: null,
        attachmentIds: [],
        aiGenerated: false,
        nodeVersion: 1,
        updatedAt: 0,
        statusHistory: [],
      } as AiCaseNode['metadata'],
    } as Partial<AiCaseNode>);
    const root = makeNode('root', '根', 'root', [tc]);
    const data: AiCaseMindData = {
      nodeData: root,
      linkData: {},
      theme: null as unknown as AiCaseMindData['theme'],
      direction: 2,
      locale: 'zh_CN',
      overflowHidden: false,
    };
    const md = exportMindDataToMarkdown(data);
    expect(md).toMatch(/- \[ \] \*\*失败用例\*\*.*\(failed\)/);
  });
});

// ─── downloadTextFile 测试 ──────────────────────────────────────────────────

describe('downloadTextFile', () => {
  let mockCreateObjectURL: ReturnType<typeof vi.fn>;
  let mockRevokeObjectURL: ReturnType<typeof vi.fn>;
  // 记录由 downloadTextFile 创建的 <a> 元素，用于断言属性
  let capturedAnchor: { href: string; download: string } | null = null;
  let capturedClickCalled = false;

  beforeEach(() => {
    capturedAnchor = null;
    capturedClickCalled = false;

    mockCreateObjectURL = vi.fn(() => 'blob:mock-url-123');
    mockRevokeObjectURL = vi.fn();

    vi.spyOn(URL, 'createObjectURL').mockImplementation(mockCreateObjectURL);
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(mockRevokeObjectURL);

    // 使用 Object.defineProperty 替换 document.createElement，
    // 避免 vi.spyOn + mockImplementation 可能引发的无限递归
    const originalCreateElement = document.createElement.bind(document);
    Object.defineProperty(document, 'createElement', {
      configurable: true,
      value: (tag: string, ...args: unknown[]) => {
        const el = originalCreateElement(tag, ...(args as []));
        if (tag === 'a') {
          // 用 Proxy 拦截 click，记录 href/download 并标记点击
          return new Proxy(el, {
            set(target, prop, value) {
              if (prop === 'href' || prop === 'download') {
                if (!capturedAnchor) capturedAnchor = { href: '', download: '' };
                (capturedAnchor as Record<string, string>)[String(prop)] = String(value);
              }
              (target as unknown as Record<string, unknown>)[String(prop)] = value;
              return true;
            },
            get(target, prop) {
              if (prop === 'click') {
                return () => { capturedClickCalled = true; };
              }
              const val = (target as unknown as Record<string, unknown>)[String(prop)];
              return typeof val === 'function' ? val.bind(target) : val;
            },
          });
        }
        return el;
      },
    });
  });

  afterEach(() => {
    // 恢复 createElement
    Object.defineProperty(document, 'createElement', {
      configurable: true,
      value: HTMLDocument.prototype.createElement,
    });
    vi.restoreAllMocks();
  });

  it('应创建 Blob 并以 markdown MIME 类型调用 createObjectURL', () => {
    downloadTextFile('# 测试内容', 'test.md');
    expect(mockCreateObjectURL).toHaveBeenCalledTimes(1);
    const blob = mockCreateObjectURL.mock.calls[0][0] as Blob;
    expect(blob.type).toBe('text/markdown;charset=utf-8');
  });

  it('应将 href 和 download 属性设置到 anchor 上', () => {
    downloadTextFile('# 测试', 'output.md');
    expect(capturedAnchor?.href).toContain('blob:mock-url-123');
    expect(capturedAnchor?.download).toBe('output.md');
  });

  it('应触发 anchor.click() 启动下载', () => {
    downloadTextFile('# 测试', 'output.md');
    expect(capturedClickCalled).toBe(true);
  });

  it('点击后应调用 revokeObjectURL 释放内存', () => {
    downloadTextFile('# 测试', 'output.md');
    expect(mockRevokeObjectURL).toHaveBeenCalledWith('blob:mock-url-123');
  });

  it('可指定自定义 MIME 类型', () => {
    downloadTextFile('plain text', 'output.txt', 'text/plain');
    const blob = mockCreateObjectURL.mock.calls[0][0] as Blob;
    expect(blob.type).toBe('text/plain;charset=utf-8');
  });
});
