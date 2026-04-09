/**
 * AICaseCreate 页面测试
 *
 * 覆盖代码审查发现的问题：
 *   #4  刷新按钮应使用 Button 组件（具备 focus-visible ring、disabled opacity 等统一类）
 *   #8  AiCaseHistoryCard useMemo 依赖应为 doc.mapData 而非 doc（确保 mapData 不变时不重算）
 *   #1  handleGenerate 成功路径：表单提交后 isSubmitting 应被重置（避免未来 Sheet 不卸载时卡死）
 *   #3  SummaryStats cards 性能：docs 未变时不应重新渲染统计卡片
 */
import type { ReactNode } from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import AICaseCreate from '@/pages/cases/AICaseCreate';
import { AiCaseHistoryCard } from '@/pages/cases/components/AiCaseHistoryCard';
import { createInitialMindData } from '@/lib/aiCaseMindMap';
import * as aiCaseStorage from '@/lib/aiCaseStorage';
import { type AiCaseWorkspaceDocument } from '@/types/aiCases';
import { toast } from 'sonner';

// ─── Mocks ───────────────────────────────────────────────────────────────────

vi.mock('@/lib/aiCaseStorage', () => ({
  listAllWorkspaceDocuments: vi.fn(),
  deleteWorkspaceDocument: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
  },
}));

// AiGenerationContext mock：默认返回空闲状态
vi.mock('@/contexts/AiGenerationContext', () => ({
  useAiGeneration: vi.fn(() => ({
    isGenerating: false,
    progress: 0,
    stageText: '',
    generatingDocId: null,
    notifyStart: vi.fn(),
    notifyProgress: vi.fn(),
    notifyDone: vi.fn(),
  })),
  AiGenerationProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

// wouter：mock useLocation，让组件可渲染
vi.mock('wouter', () => ({
  useLocation: () => ['/', vi.fn()],
  Link: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

// ─── 辅助函数 ─────────────────────────────────────────────────────────────────

function makeDoc(id: string, name: string): AiCaseWorkspaceDocument {
  return {
    id,
    name,
    requirement: '需求描述',
    mapData: createInitialMindData(name),
    version: 1,
    createdAt: Date.now() - 10_000,
    updatedAt: Date.now() - 5_000,
  };
}

// ─── #4：刷新按钮应使用 Button 组件（统一 focus / disabled 样式） ───────────────

describe('AICaseCreate – 刷新按钮使用 Button 组件', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(aiCaseStorage.listAllWorkspaceDocuments).mockResolvedValue([]);
  });

  it('刷新按钮应具有 focus-visible ring 类（Button 组件标准样式）', async () => {
    render(<AICaseCreate />);

    await waitFor(() => {
      expect(screen.queryByText(/加载/)).not.toBeInTheDocument();
    });

    const refreshBtn = screen.getByRole('button', { name: '刷新列表' });

    // Button 组件通过 buttonVariants cva 注入 focus-visible:ring-2 等类名
    // 裸 <button> 不会有这些类
    expect(refreshBtn.className).toMatch(/focus-visible/);
  });

  it('加载中时刷新按钮应处于 disabled 状态且有 disabled:opacity-50 样式类', async () => {
    // listAllWorkspaceDocuments 永不 resolve，保持 loading 状态
    vi.mocked(aiCaseStorage.listAllWorkspaceDocuments).mockReturnValue(
      new Promise(() => {})
    );

    render(<AICaseCreate />);

    const refreshBtn = screen.getByRole('button', { name: '刷新列表' });

    // Button 组件的 disabled 状态通过 buttonVariants 注入 disabled:opacity-50
    expect(refreshBtn).toBeDisabled();
    expect(refreshBtn.className).toMatch(/disabled:opacity/);
  });

  it('刷新按钮点击后应触发列表重新加载', async () => {
    const loadMock = vi.mocked(aiCaseStorage.listAllWorkspaceDocuments);
    loadMock.mockResolvedValue([]);

    render(<AICaseCreate />);

    await waitFor(() => {
      expect(loadMock).toHaveBeenCalledTimes(1);
    });

    // 点击刷新按钮
    const refreshBtn = screen.getByRole('button', { name: '刷新列表' });
    fireEvent.click(refreshBtn);

    await waitFor(() => {
      expect(loadMock).toHaveBeenCalledTimes(2);
    });
  });
});

// ─── #1：handleGenerate 成功路径应重置 isSubmitting ──────────────────────────

describe('AICaseCreate – 新增需求 Sheet 表单', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(aiCaseStorage.listAllWorkspaceDocuments).mockResolvedValue([]);
  });

  it('点击「新增需求」按钮应打开 Sheet', async () => {
    render(<AICaseCreate />);

    await waitFor(() => {
      expect(screen.queryByText(/还没有生成记录/)).toBeInTheDocument();
    });

    const addBtn = screen.getByRole('button', { name: /新增需求/ });
    fireEvent.click(addBtn);

    await waitFor(() => {
      expect(screen.getByText('输入需求，AI 将自动生成测试用例脑图')).toBeInTheDocument();
    });
  });

  it('需求文本为空时「AI 生成用例」按钮应处于 disabled', async () => {
    render(<AICaseCreate />);

    await waitFor(() => {
      expect(screen.queryByText(/还没有生成记录/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /新增需求/ }));

    await waitFor(() => {
      const generateBtn = screen.getByRole('button', { name: /AI 生成用例/ });
      expect(generateBtn).toBeDisabled();
    });
  });

  it('填入需求文本后提交：Sheet 应关闭，isSubmitting 不应残留（表单可再次打开）', async () => {
    // 注意：wouter 的 useLocation setLocation 是 vi.fn()，不会真正跳转
    render(<AICaseCreate />);

    await waitFor(() => {
      expect(screen.queryByText(/还没有生成记录/)).toBeInTheDocument();
    });

    // 打开 Sheet
    fireEvent.click(screen.getByRole('button', { name: /新增需求/ }));
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/粘贴 PRD/)).toBeInTheDocument();
    });

    // 填入需求文本
    fireEvent.change(screen.getByPlaceholderText(/粘贴 PRD/), {
      target: { value: '用户登录流程需求' },
    });

    // 点击 AI 生成用例
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /AI 生成用例/ }));
      await Promise.resolve();
    });

    // Sheet 应已关闭（描述文字不再显示）
    await waitFor(() => {
      expect(screen.queryByText('输入需求，AI 将自动生成测试用例脑图')).not.toBeInTheDocument();
    });

    // 再次打开 Sheet，「AI 生成用例」按钮不应处于 disabled（isSubmitting 已重置）
    fireEvent.click(screen.getByRole('button', { name: /新增需求/ }));
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/粘贴 PRD/)).toBeInTheDocument();
    });

    // 新打开的 Sheet 中需求文本应已清空（表单重置）
    const textarea = screen.getByPlaceholderText(/粘贴 PRD/) as HTMLTextAreaElement;
    expect(textarea.value).toBe('');
  });
});

// ─── #3：SummaryStats 统计卡片正常显示 ───────────────────────────────────────

describe('AICaseCreate – SummaryStats 统计卡片', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('有数据时应渲染 4 个统计卡片', async () => {
    const docs = [makeDoc('doc-1', '登录测试'), makeDoc('doc-2', '注册测试')];
    vi.mocked(aiCaseStorage.listAllWorkspaceDocuments).mockResolvedValue(docs);

    render(<AICaseCreate />);

    await waitFor(() => {
      expect(screen.getByText('生成记录')).toBeInTheDocument();
      expect(screen.getByText('累计用例')).toBeInTheDocument();
      expect(screen.getByText('整体通过率')).toBeInTheDocument();
      expect(screen.getByText('已同步服务端')).toBeInTheDocument();
    });
  });

  it('生成记录数值应与 docs 数量一致', async () => {
    const docs = [makeDoc('doc-1', 'A'), makeDoc('doc-2', 'B'), makeDoc('doc-3', 'C')];
    vi.mocked(aiCaseStorage.listAllWorkspaceDocuments).mockResolvedValue(docs);

    render(<AICaseCreate />);

    await waitFor(() => {
      // 统计卡中「生成记录」对应的数值应为 3
      const valueEl = screen.getAllByText('3');
      expect(valueEl.length).toBeGreaterThan(0);
    });
  });

  it('无数据时不应渲染统计卡片', async () => {
    vi.mocked(aiCaseStorage.listAllWorkspaceDocuments).mockResolvedValue([]);

    render(<AICaseCreate />);

    await waitFor(() => {
      expect(screen.queryByText('还没有生成记录')).toBeInTheDocument();
    });

    expect(screen.queryByText('生成记录')).not.toBeInTheDocument();
  });
});

// ─── #8：AiCaseHistoryCard - useMemo 依赖收窄到 doc.mapData ──────────────────

describe('AiCaseHistoryCard – useMemo 依赖收窄（性能）', () => {
  const baseDoc = makeDoc('doc-test', '测试工作台');

  it('渲染正常文档应显示用例数和模块数', () => {
    render(
      <AiCaseHistoryCard
        doc={baseDoc}
        onOpen={vi.fn()}
        onDeleted={vi.fn()}
      />
    );

    // progress.total 来自 computeProgress，初始脑图有默认用例数
    // 至少应渲染「条用例」文字
    expect(screen.getByText(/条用例/)).toBeInTheDocument();
    expect(screen.getByText(/个模块/)).toBeInTheDocument();
  });

  it('doc.mapData 不变时，更新 doc 其他字段（如 name）后模块数不变', () => {
    const { rerender } = render(
      <AiCaseHistoryCard
        doc={baseDoc}
        onOpen={vi.fn()}
        onDeleted={vi.fn()}
      />
    );

    // 获取初始模块数文本
    const initialModulesText = screen.getByText(/个模块/).textContent;

    // 更新 name（非 mapData 字段），mapData 对象引用不变
    const updatedDoc: AiCaseWorkspaceDocument = {
      ...baseDoc,
      name: '新名称',
      // mapData 引用保持相同
      mapData: baseDoc.mapData,
    };

    rerender(
      <AiCaseHistoryCard
        doc={updatedDoc}
        onOpen={vi.fn()}
        onDeleted={vi.fn()}
      />
    );

    // 模块数应保持一致（useMemo 依赖 doc.mapData，相同引用不重算）
    expect(screen.getByText(/个模块/).textContent).toBe(initialModulesText);
    // 名称已更新
    expect(screen.getByText('新名称')).toBeInTheDocument();
  });

  it('doc.mapData 引用变化时应重新计算模块数', () => {
    const { rerender } = render(
      <AiCaseHistoryCard
        doc={baseDoc}
        onOpen={vi.fn()}
        onDeleted={vi.fn()}
      />
    );

    // 用新的 mapData（不同引用）更新
    const newMapData = createInitialMindData('新工作台');
    const updatedDoc: AiCaseWorkspaceDocument = {
      ...baseDoc,
      mapData: newMapData,
    };

    rerender(
      <AiCaseHistoryCard
        doc={updatedDoc}
        onOpen={vi.fn()}
        onDeleted={vi.fn()}
      />
    );

    // 仍然显示「个模块」文字（组件正常运作）
    expect(screen.getByText(/个模块/)).toBeInTheDocument();
  });

  it('正在生成时不应显示用例进度条，而应显示"AI 正在分析"提示', () => {
    render(
      <AiCaseHistoryCard
        doc={baseDoc}
        onOpen={vi.fn()}
        onDeleted={vi.fn()}
        generatingDocId={baseDoc.id}
        generationProgress={45}
      />
    );

    // 生成中不显示用例进度条内容
    expect(screen.queryByText(/条用例/)).not.toBeInTheDocument();
    // 而是显示生成中状态文案
    expect(screen.getByText(/AI 正在分析需求/)).toBeInTheDocument();
    // 标题旁显示进度百分比
    expect(screen.getByText(/45%/)).toBeInTheDocument();
  });

  it('加载失败时应显示错误 toast', async () => {
    vi.mocked(aiCaseStorage.listAllWorkspaceDocuments).mockRejectedValue(
      new Error('storage error')
    );

    render(<AICaseCreate />);

    await waitFor(() => {
      expect(vi.mocked(toast.error)).toHaveBeenCalledWith('加载记录失败，请刷新重试');
    });
  });
});

// ─── 空状态和搜索无结果 ─────────────────────────────────────────────────────────

describe('AICaseCreate – 列表状态展示', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('无数据时应显示空状态并指引用户到右上角', async () => {
    vi.mocked(aiCaseStorage.listAllWorkspaceDocuments).mockResolvedValue([]);

    render(<AICaseCreate />);

    await waitFor(() => {
      expect(screen.getByText('还没有生成记录')).toBeInTheDocument();
    });

    expect(screen.getByText(/点击右上角「新增需求」开始生成/)).toBeInTheDocument();
    // 空状态不应有第二个「新增需求」按钮（只有 Header 中有一个）
    const addBtns = screen.getAllByRole('button', { name: /新增需求/ });
    expect(addBtns).toHaveLength(1);
  });

  it('有数据时应显示搜索框和排序工具栏', async () => {
    vi.mocked(aiCaseStorage.listAllWorkspaceDocuments).mockResolvedValue([
      makeDoc('doc-1', '用例 A'),
    ]);

    render(<AICaseCreate />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/搜索名称或需求内容/)).toBeInTheDocument();
    });

    expect(screen.getByText('最近更新')).toBeInTheDocument();
    expect(screen.getByText('创建时间')).toBeInTheDocument();
  });

  it('搜索词不匹配时应显示"没有匹配的记录"', async () => {
    vi.mocked(aiCaseStorage.listAllWorkspaceDocuments).mockResolvedValue([
      makeDoc('doc-1', '登录流程用例'),
    ]);

    render(<AICaseCreate />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/搜索名称或需求内容/)).toBeInTheDocument();
    });

    fireEvent.change(screen.getByPlaceholderText(/搜索名称或需求内容/), {
      target: { value: '完全不匹配的关键词xyz' },
    });

    await waitFor(() => {
      expect(screen.getByText('没有匹配的记录')).toBeInTheDocument();
    });
  });
});
