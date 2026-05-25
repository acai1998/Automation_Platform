/**
 * AICaseCreate 页面测试
 *
 * 覆盖：UI 主要交互、空状态、搜索排序、新增需求 Sheet 提交流程
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
    lastSelectedNodeId: null,
  };
}

// ─── 主页面渲染 ───────────────────────────────────────────────────────────────

describe('AICaseCreate – 页面基本渲染', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(aiCaseStorage.listAllWorkspaceDocuments).mockResolvedValue([]);
  });

  it('应渲染页面标题', async () => {
    render(<AICaseCreate />);
    await waitFor(() => {
      expect(screen.getByText('AI 智能用例工作台')).toBeInTheDocument();
    });
  });

  it('应渲染新建工作台按钮', async () => {
    render(<AICaseCreate />);
    await waitFor(() => {
      const btns = screen.getAllByRole('button', { name: /新建工作台/ });
      expect(btns.length).toBeGreaterThan(0);
    });
  });
});

// ─── 新增需求 Sheet 提交流程 ──────────────────────────────────────────────────

describe('AICaseCreate – 新增需求 Sheet 表单', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(aiCaseStorage.listAllWorkspaceDocuments).mockResolvedValue([]);
  });

  it('点击「新建工作台」按钮应打开 Sheet', async () => {
    render(<AICaseCreate />);

    await waitFor(() => {
      expect(screen.getByText('AI 智能用例工作台')).toBeInTheDocument();
    });

    const addBtn = screen.getAllByRole('button', { name: /新建工作台/ })[0];
    fireEvent.click(addBtn);

    await waitFor(() => {
      expect(screen.getByText('新增 AI 工作台')).toBeInTheDocument();
    });
  });

  it('需求文本为空时「创建并生成首版用例」按钮应处于 disabled', async () => {
    render(<AICaseCreate />);

    await waitFor(() => {
      expect(screen.getByText('AI 智能用例工作台')).toBeInTheDocument();
    });

    fireEvent.click(screen.getAllByRole('button', { name: /新建工作台/ })[0]);

    await waitFor(() => {
      const generateBtn = screen.getByRole('button', { name: /创建并生成首版用例/ });
      expect(generateBtn).toBeDisabled();
    });
  });

  it('填入需求文本后提交：Sheet 应关闭，表单可再次打开', async () => {
    render(<AICaseCreate />);

    await waitFor(() => {
      expect(screen.getByText('AI 智能用例工作台')).toBeInTheDocument();
    });

    // 打开 Sheet
    fireEvent.click(screen.getAllByRole('button', { name: /新建工作台/ })[0]);
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/粘贴 PRD/)).toBeInTheDocument();
    });

    // 填入需求文本
    fireEvent.change(screen.getByPlaceholderText(/粘贴 PRD/), {
      target: { value: '用户登录流程需求' },
    });

    // 点击创建并生成首版用例
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /创建并生成首版用例/ }));
      await Promise.resolve();
    });

    // Sheet 应已关闭
    await waitFor(() => {
      expect(screen.queryByText('新增 AI 工作台')).not.toBeInTheDocument();
    });

    // 再次打开 Sheet
    fireEvent.click(screen.getAllByRole('button', { name: /新建工作台/ })[0]);
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/粘贴 PRD/)).toBeInTheDocument();
    });

    // 新打开的 Sheet 中需求文本应已清空
    const textarea = screen.getByPlaceholderText(/粘贴 PRD/) as HTMLTextAreaElement;
    expect(textarea.value).toBe('');
  });
});

// ─── AiCaseHistoryCard - useMemo 依赖收窄到 doc.mapData ──────────────────────

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

    const initialModulesText = screen.getByText(/个模块/).textContent;

    const updatedDoc: AiCaseWorkspaceDocument = {
      ...baseDoc,
      name: '新名称',
      mapData: baseDoc.mapData,
    };

    rerender(
      <AiCaseHistoryCard
        doc={updatedDoc}
        onOpen={vi.fn()}
        onDeleted={vi.fn()}
      />
    );

    expect(screen.getByText(/个模块/).textContent).toBe(initialModulesText);
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

    expect(screen.queryByText(/条用例/)).not.toBeInTheDocument();
    expect(screen.getByText(/AI 正在分析需求/)).toBeInTheDocument();
    expect(screen.getByText(/45%/)).toBeInTheDocument();
  });
});

// ─── 空状态和搜索排序 ─────────────────────────────────────────────────────────

describe('AICaseCreate – 列表状态展示', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('无数据时应显示空状态', async () => {
    vi.mocked(aiCaseStorage.listAllWorkspaceDocuments).mockResolvedValue([]);

    render(<AICaseCreate />);

    await waitFor(() => {
      expect(screen.getByText('暂无最近工作台')).toBeInTheDocument();
    });
  });

  it('有数据时应显示搜索框和排序工具栏', async () => {
    vi.mocked(aiCaseStorage.listAllWorkspaceDocuments).mockResolvedValue([
      makeDoc('doc-1', '用例 A'),
    ]);

    render(<AICaseCreate />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/搜索/)).toBeInTheDocument();
    });

    expect(screen.getAllByText(/最近更新/).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /排序/ })).toBeInTheDocument();
  });

  it('加载失败时应显示错误 toast', async () => {
    vi.mocked(aiCaseStorage.listAllWorkspaceDocuments).mockRejectedValue(
      new Error('storage error')
    );

    render(<AICaseCreate />);

    await waitFor(() => {
      expect(vi.mocked(toast.error)).toHaveBeenCalled();
    });
  });
});
