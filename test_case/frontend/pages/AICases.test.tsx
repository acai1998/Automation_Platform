import type { ReactNode } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AICases from '@/pages/cases/AICases';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { createInitialMindData } from '@/lib/aiCaseMindMap';
import * as aiCaseStorage from '@/lib/aiCaseStorage';
import { aiCasesApi } from '@/api';
import {
  AI_CASE_WORKSPACE_ID,
  type AiCaseAttachmentRecord,
  type AiCaseNode,
  type AiCaseWorkspaceDocument,
} from '@/types/aiCases';
import { toast } from 'sonner';

// ─── Mock aiCaseStorage 新增的工具函数 ────────────────────────────────────────
// 原有 mock 已覆盖 aiCaseStorage，这里仅在 module mock 内声明，
// 具体 mock 实现在 beforeEach 中追加。

interface MockMindBus {
  addListener: ReturnType<typeof vi.fn>;
  removeListener: ReturnType<typeof vi.fn>;
}

interface MockMindInstance {
  init: ReturnType<typeof vi.fn>;
  toCenter: ReturnType<typeof vi.fn>;
  refresh: ReturnType<typeof vi.fn>;
  findEle: ReturnType<typeof vi.fn>;
  selectNode: ReturnType<typeof vi.fn>;
  getData: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
  bus: MockMindBus;
}

let latestMindInstance: MockMindInstance | null = null;

function createMockMindInstance(): MockMindInstance {
  let currentData: unknown = null;

  return {
    init: vi.fn((initialData: unknown) => {
      currentData = initialData;
      return null;
    }),
    toCenter: vi.fn(),
    refresh: vi.fn((nextData: unknown) => {
      currentData = nextData;
    }),
    findEle: vi.fn(() => document.createElement('div')),
    selectNode: vi.fn(),
    getData: vi.fn(() => currentData),
    destroy: vi.fn(),
    bus: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    },
  };
}

vi.mock('mind-elixir', () => {
  function MindElixirMock() {
    latestMindInstance = createMockMindInstance();
    return latestMindInstance;
  }

  (MindElixirMock as unknown as { SIDE: string }).SIDE = 'SIDE';

  return {
    default: MindElixirMock,
  };
});

vi.mock('@/components/ErrorBoundary', () => ({
  default: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock('@/lib/aiCaseStorage', () => ({
  getWorkspaceDocument: vi.fn(),
  saveWorkspaceDocument: vi.fn(),
  listNodeAttachments: vi.fn(),
  saveNodeAttachment: vi.fn(),
  deleteNodeAttachment: vi.fn(),
  deleteStaleWorkspaceAttachments: vi.fn(),
  exportMindDataToMarkdown: vi.fn(() => '# Mock Markdown'),
  downloadTextFile: vi.fn(),
}));

vi.mock('@/api', () => ({
  aiCasesApi: {
    generate: vi.fn(),
    createWorkspace: vi.fn(),
    updateWorkspace: vi.fn(),
    getWorkspace: vi.fn(),
    updateNodeStatus: vi.fn(),
    listWorkspaces: vi.fn(),
  },
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
  },
}));

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
  AiGenerationProvider: ({ children }: { children: ReactNode }) => children,
}));

function findFirstTestcaseNodeId(root: AiCaseNode): string | null {
  const stack: AiCaseNode[] = [root];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) {
      continue;
    }

    if (current.metadata?.kind === 'testcase') {
      return current.id;
    }

    for (const child of current.children ?? []) {
      stack.push(child as AiCaseNode);
    }
  }

  return null;
}

function createStoredDoc(options?: { selectTestcase?: boolean }): AiCaseWorkspaceDocument {
  const mapData = createInitialMindData('已保存工作台');
  const testcaseNodeId = findFirstTestcaseNodeId(mapData.nodeData);

  return {
    id: AI_CASE_WORKSPACE_ID,
    name: '已保存工作台',
    requirement: '初始需求',
    mapData,
    version: 3,
    createdAt: Date.now() - 10_000,
    updatedAt: Date.now() - 5_000,
    lastSelectedNodeId: options?.selectTestcase ? testcaseNodeId ?? mapData.nodeData.id : mapData.nodeData.id,
  };
}

function renderAICases() {
  return render(
    <ThemeProvider>
      <AICases />
    </ThemeProvider>
  );
}

describe('AICases', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    latestMindInstance = null;

    Object.defineProperty(URL, 'createObjectURL', {
      writable: true,
      configurable: true,
      value: vi.fn(() => 'blob:preview-url'),
    });

    Object.defineProperty(URL, 'revokeObjectURL', {
      writable: true,
      configurable: true,
      value: vi.fn(),
    });

    vi.mocked(aiCasesApi.generate).mockResolvedValue({
      data: {
        generated: {
          mapData: createInitialMindData('远端生成结果'),
          source: 'llm',
        },
      },
    } as any);

    vi.mocked(aiCaseStorage.saveWorkspaceDocument).mockResolvedValue();
    vi.mocked(aiCaseStorage.listNodeAttachments).mockResolvedValue([]);
    vi.mocked(aiCaseStorage.saveNodeAttachment).mockResolvedValue();
    vi.mocked(aiCaseStorage.deleteNodeAttachment).mockResolvedValue();
    vi.mocked(aiCaseStorage.deleteStaleWorkspaceAttachments).mockResolvedValue(0);
  });

  it('初始化失败后应回退到默认脑图而不是永久 loading', async () => {
    vi.mocked(aiCaseStorage.getWorkspaceDocument).mockRejectedValue(new Error('indexeddb unavailable'));

    renderAICases();

    await waitFor(() => {
      expect(screen.getByText('AI 用例工作台')).toBeInTheDocument();
    });

    expect(screen.queryByText('初始化 AI 用例工作台...')).not.toBeInTheDocument();
    expect(vi.mocked(toast.error)).toHaveBeenCalledWith('初始化 AI 用例工作台失败，请刷新页面重试');
  });

  it('AI 生成和重置模板都应触发历史附件清理', async () => {
    vi.mocked(aiCaseStorage.getWorkspaceDocument).mockResolvedValue(createStoredDoc());

    renderAICases();

    await waitFor(() => {
      expect(screen.getByText('AI 用例工作台')).toBeInTheDocument();
    });

    // 需求信息 Dialog 中含有 PRD 输入框和 AI 生成按钮，先点击顶栏"需求信息"按钮打开弹窗
    const requirementBtn = screen.getByRole('button', { name: /需求信息/i });
    fireEvent.click(requirementBtn);

    const requirementInput = await screen.findByPlaceholderText(/粘贴 PRD/);
    fireEvent.change(requirementInput, {
      target: { value: '登录流程支持手机号 + 验证码，需覆盖异常和权限场景' },
    });

    fireEvent.click(screen.getByRole('button', { name: /AI 生成测试用例/i }));

    await waitFor(() => {
      expect(aiCaseStorage.deleteStaleWorkspaceAttachments).toHaveBeenCalledTimes(1);
    });

    // 重置模板按钮在浮动面板的"工作台操作" section，先打开面板
    const panelToggleBtn = screen.getByRole('button', { name: /工作台面板|打开工作台面板/i });
    fireEvent.click(panelToggleBtn);

    const opsSectionBtn = await screen.findByRole('button', { name: /工作台操作/i });
    fireEvent.click(opsSectionBtn);

    const resetBtn = await screen.findByRole('button', { name: /重置模板/ });
    fireEvent.click(resetBtn);

    await waitFor(() => {
      expect(aiCaseStorage.deleteStaleWorkspaceAttachments).toHaveBeenCalledTimes(2);
    });
  });

  it('附件列表刷新不应中断已排队的自动保存', async () => {
    vi.mocked(aiCaseStorage.getWorkspaceDocument).mockResolvedValue(createStoredDoc());

    let resolveAttachments: ((rows: AiCaseAttachmentRecord[]) => void) | null = null;
    const pendingAttachments = new Promise<AiCaseAttachmentRecord[]>((resolve) => {
      resolveAttachments = resolve;
    });

    vi.mocked(aiCaseStorage.listNodeAttachments)
      .mockReturnValueOnce(pendingAttachments)
      .mockResolvedValue([]);

    renderAICases();

    await waitFor(() => {
      expect(screen.getByText('AI 用例工作台')).toBeInTheDocument();
    });

    const saveWorkspaceDocumentMock = vi.mocked(aiCaseStorage.saveWorkspaceDocument);
    saveWorkspaceDocumentMock.mockClear();

    // 工作台名称输入框在顶栏 需求信息 Dialog 中，先打开弹窗
    const requirementBtn = screen.getByRole('button', { name: /需求信息/i });
    fireEvent.click(requirementBtn);
    const nameInput = await screen.findByPlaceholderText('输入工作台标题');
    fireEvent.change(nameInput, { target: { value: '新的工作台名称' } });

    await act(async () => {
      resolveAttachments?.([]);
      await Promise.resolve();
    });

    await waitFor(
      () => {
        expect(saveWorkspaceDocumentMock).toHaveBeenCalled();
      },
      { timeout: 1500 }
    );
  });

  it('节点删除后应即时清理附件并展示清理数量', async () => {
    vi.mocked(aiCaseStorage.getWorkspaceDocument).mockResolvedValue(createStoredDoc());
    vi.mocked(aiCaseStorage.deleteStaleWorkspaceAttachments).mockResolvedValue(3);

    renderAICases();

    await waitFor(() => {
      expect(screen.getByText('AI 用例工作台')).toBeInTheDocument();
    });

    const operationHandler = latestMindInstance?.bus.addListener.mock.calls.find((call) => call[0] === 'operation')?.[1] as
      | (() => void)
      | undefined;

    expect(operationHandler).toBeDefined();

    const reducedData = createInitialMindData('节点删除后');
    reducedData.nodeData.children = [];
    latestMindInstance?.getData.mockReturnValue(reducedData);

    await act(async () => {
      operationHandler?.();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(aiCaseStorage.deleteStaleWorkspaceAttachments).toHaveBeenCalled();
    });

    expect(vi.mocked(toast.success)).toHaveBeenCalledWith('检测到节点删除，已清理 3 条附件');
  });

  it('复制截图后可直接粘贴上传到当前测试节点', async () => {
    vi.mocked(aiCaseStorage.getWorkspaceDocument).mockResolvedValue(createStoredDoc({ selectTestcase: true }));

    renderAICases();

    await waitFor(() => {
      expect(screen.getByText('AI 用例工作台')).toBeInTheDocument();
    });

    const imageFile = new File(['image-binary'], 'clipboard.png', { type: 'image/png' });
    const pasteEvent = new Event('paste', { bubbles: true, cancelable: true }) as ClipboardEvent;

    Object.defineProperty(pasteEvent, 'clipboardData', {
      value: {
        items: [
          {
            kind: 'file',
            type: 'image/png',
            getAsFile: () => imageFile,
          },
        ],
      },
      configurable: true,
    });

    await act(async () => {
      window.dispatchEvent(pasteEvent);
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(aiCaseStorage.saveNodeAttachment).toHaveBeenCalledTimes(1);
    });

    expect(vi.mocked(toast.success)).toHaveBeenCalledWith('已粘贴 1 张截图');
  });
});

// ─── 新双栏布局集成测试 ─────────────────────────────────────────────────────

describe('AICases – 新双栏布局', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    latestMindInstance = null;

    Object.defineProperty(URL, 'createObjectURL', {
      writable: true, configurable: true,
      value: vi.fn(() => 'blob:preview-url'),
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      writable: true, configurable: true,
      value: vi.fn(),
    });

    vi.mocked(aiCaseStorage.saveWorkspaceDocument).mockResolvedValue();
    vi.mocked(aiCaseStorage.listNodeAttachments).mockResolvedValue([]);
    vi.mocked(aiCaseStorage.saveNodeAttachment).mockResolvedValue();
    vi.mocked(aiCaseStorage.deleteNodeAttachment).mockResolvedValue();
    vi.mocked(aiCaseStorage.deleteStaleWorkspaceAttachments).mockResolvedValue(0);
  });

  it('渲染后应显示顶部标题栏且点击需求信息可打开对话框', async () => {
    vi.mocked(aiCaseStorage.getWorkspaceDocument).mockResolvedValue(createStoredDoc());
    renderAICases();

    await waitFor(() => {
      expect(screen.getByText('AI 用例工作台')).toBeInTheDocument();
    });

    // 顶栏中的需求信息按钮
    expect(screen.getByRole('button', { name: /需求信息/i })).toBeInTheDocument();
    // 点击打开对话框后应能看到 AI 生成按钮
    fireEvent.click(screen.getByRole('button', { name: /需求信息/i }));
    expect(await screen.findByRole('button', { name: /AI 生成测试用例/i })).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/粘贴 PRD/)).toBeInTheDocument();
    // 画布工具栏中的缩放百分比
    expect(screen.getAllByText(/\d+%/).length).toBeGreaterThan(0);
  });

  it('顶部标题栏应显示工作台名称和保存状态', async () => {
    vi.mocked(aiCaseStorage.getWorkspaceDocument).mockResolvedValue(createStoredDoc());
    renderAICases();

    await waitFor(() => {
      expect(screen.getByText('AI 用例工作台')).toBeInTheDocument();
      // 保存完成后显示草稿状态
      expect(screen.getByText('本地草稿已保存')).toBeInTheDocument();
    });
  });

  it('初始化无存储记录时应自动创建并显示默认工作台名称', async () => {
    vi.mocked(aiCaseStorage.getWorkspaceDocument).mockResolvedValue(null);
    renderAICases();

    await waitFor(() => {
      expect(screen.getByText('AI 用例工作台')).toBeInTheDocument();
    });

    // 工作台名称输入框在需求信息 Dialog 中，先打开弹窗
    fireEvent.click(screen.getByRole('button', { name: /需求信息/i }));
    const nameInput = await screen.findByPlaceholderText('输入工作台标题') as HTMLInputElement;
    expect(nameInput.value).toBe('AI Testcase Workspace');
  });

  it('handleLoadHistoryWorkspace：加载历史工作台成功后应更新需求文本', async () => {
    vi.mocked(aiCaseStorage.getWorkspaceDocument).mockResolvedValue(createStoredDoc());

    const remoteWorkspace = {
      id: 88,
      name: '历史工作台 X',
      requirementText: '历史需求内容',
      mapData: createInitialMindData('历史工作台 X'),
      version: 5,
      status: 'published' as const,
      syncSource: 'mixed' as const,
      createdAt: Date.now() - 100_000,
      updatedAt: Date.now() - 50_000,
      counters: { totalCases: 3, doneCases: 1, completionRate: 33 },
    };

    vi.mocked(aiCasesApi.getWorkspace).mockResolvedValue({ data: remoteWorkspace } as any);

    renderAICases();
    await waitFor(() => {
      expect(screen.getByText('AI 用例工作台')).toBeInTheDocument();
    });

    // 历史工作台 section 在浮动面板中，需先打开面板
    const panelBtn = screen.getByRole('button', { name: /工作台面板|打开工作台面板/i });
    fireEvent.click(panelBtn);

    // 展开历史工作台 section
    const historySectionBtn = await screen.findByRole('button', { name: /历史工作台/i });
    fireEvent.click(historySectionBtn);

    // 模拟 API 返回历史列表
    vi.mocked(aiCasesApi.listWorkspaces).mockResolvedValue({
      data: [{ id: 88, name: '历史工作台 X', status: 'published', version: 5, counters: { totalCases: 3 } }],
    } as any);

    const expandLink = await screen.findByText('查看历史工作台记录');
    fireEvent.click(expandLink);

    await waitFor(() => {
      expect(screen.getByText('历史工作台 X')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('历史工作台 X'));

    await waitFor(() => {
      expect(aiCasesApi.getWorkspace).toHaveBeenCalledWith(88);
    });

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('已加载工作台：历史工作台 X');
    });

    // 需求文本应被更新为远端数据，打开 Dialog 查看
    fireEvent.click(screen.getByRole('button', { name: /需求信息/i }));
    const requirementTextarea = await screen.findByPlaceholderText(/粘贴 PRD/) as HTMLTextAreaElement;
    expect(requirementTextarea.value).toBe('历史需求内容');
  });

  it('handleLoadHistoryWorkspace：API 失败时应显示错误 toast', async () => {
    vi.mocked(aiCaseStorage.getWorkspaceDocument).mockResolvedValue(createStoredDoc());
    vi.mocked(aiCasesApi.getWorkspace).mockRejectedValue(new Error('network error'));

    renderAICases();
    await waitFor(() => {
      expect(screen.getByText('AI 用例工作台')).toBeInTheDocument();
    });

    // 历史工作台 section 在浮动面板中，需先打开面板
    const panelBtn = screen.getByRole('button', { name: /工作台面板|打开工作台面板/i });
    fireEvent.click(panelBtn);

    const historySectionBtn = await screen.findByRole('button', { name: /历史工作台/i });
    fireEvent.click(historySectionBtn);

    vi.mocked(aiCasesApi.listWorkspaces).mockResolvedValue({
      data: [{ id: 100, name: '失败工作台', status: 'draft', version: 1, counters: { totalCases: 0 } }],
    } as any);

    fireEvent.click(await screen.findByText('查看历史工作台记录'));

    await waitFor(() => {
      expect(screen.getByText('失败工作台')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('失败工作台'));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('加载历史工作台失败，请稍后重试');
    });
  });

  it('从侧边栏修改工作台名称应触发自动保存', async () => {
    vi.mocked(aiCaseStorage.getWorkspaceDocument).mockResolvedValue(createStoredDoc());
    renderAICases();

    await waitFor(() => {
      expect(screen.getByText('AI 用例工作台')).toBeInTheDocument();
    });

    const saveDocMock = vi.mocked(aiCaseStorage.saveWorkspaceDocument);
    saveDocMock.mockClear();

    // 工作台名称输入框在 Dialog 中，先打开
    fireEvent.click(screen.getByRole('button', { name: /需求信息/i }));
    const nameInput = await screen.findByPlaceholderText('输入工作台标题');
    fireEvent.change(nameInput, { target: { value: '修改后的名称' } });

    await waitFor(
      () => {
        expect(saveDocMock).toHaveBeenCalled();
      },
      { timeout: 1500 }
    );

    const savedDoc = saveDocMock.mock.calls[0][0] as AiCaseWorkspaceDocument;
    expect(savedDoc.name).toBe('修改后的名称');
  });

  it('点击工作台操作区"导出 Markdown"按钮应触发下载', async () => {
    vi.mocked(aiCaseStorage.getWorkspaceDocument).mockResolvedValue(createStoredDoc());
    renderAICases();

    await waitFor(() => {
      expect(screen.getByText('AI 用例工作台')).toBeInTheDocument();
    });

    // 工作台操作 section 在浮动面板中，先打开面板
    const panelBtn = screen.getByRole('button', { name: /工作台面板|打开工作台面板/i });
    fireEvent.click(panelBtn);
    const opsSectionBtn = await screen.findByRole('button', { name: /工作台操作/i });
    fireEvent.click(opsSectionBtn);

    const exportBtn = await screen.findByRole('button', { name: /导出 Markdown/i });
    fireEvent.click(exportBtn);

    await waitFor(() => {
      expect(aiCaseStorage.exportMindDataToMarkdown).toHaveBeenCalledTimes(1);
      expect(aiCaseStorage.downloadTextFile).toHaveBeenCalledTimes(1);
    });

    expect(toast.success).toHaveBeenCalledWith('测试用例已导出为 Markdown');
  });

  it('画布工具栏应渲染且可点击缩放按钮', async () => {
    vi.mocked(aiCaseStorage.getWorkspaceDocument).mockResolvedValue(createStoredDoc());
    renderAICases();

    await waitFor(() => {
      expect(screen.getByText('AI 用例工作台')).toBeInTheDocument();
    });

    // 画布工具栏中的放大按钮
    const zoomInBtn = screen.getByRole('button', { name: /放大/i });
    expect(zoomInBtn).toBeInTheDocument();
    // 缩放百分比显示
    expect(screen.getByText(/100%/)).toBeInTheDocument();
  });

  it('执行进度区应渲染并显示进度信息', async () => {
    vi.mocked(aiCaseStorage.getWorkspaceDocument).mockResolvedValue(createStoredDoc());
    renderAICases();

    // 等待组件初始化完成
    await waitFor(
      () => {
        expect(screen.getByText('AI 用例工作台')).toBeInTheDocument();
      },
      { timeout: 3000 }
    );

    // 执行进度 section 在浮动面板中，先打开面板
    const panelBtn = screen.getByRole('button', { name: /工作台面板|打开工作台面板/i });
    fireEvent.click(panelBtn);
    // 面板内的执行进度 section 标题按钮应存在
    expect(await screen.findByRole('button', { name: /执行进度/i })).toBeInTheDocument();
  });
});
