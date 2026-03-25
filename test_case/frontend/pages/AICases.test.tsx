import type { ReactNode } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AICases from '@/pages/cases/AICases';
import { createInitialMindData } from '@/lib/aiCaseMindMap';
import * as aiCaseStorage from '@/lib/aiCaseStorage';
import {
  AI_CASE_WORKSPACE_ID,
  type AiCaseAttachmentRecord,
  type AiCaseWorkspaceDocument,
} from '@/types/aiCases';
import { toast } from 'sonner';

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
    return createMockMindInstance();
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
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

function createStoredDoc(): AiCaseWorkspaceDocument {
  const mapData = createInitialMindData('已保存工作台');

  return {
    id: AI_CASE_WORKSPACE_ID,
    name: '已保存工作台',
    requirement: '初始需求',
    mapData,
    version: 3,
    createdAt: Date.now() - 10_000,
    updatedAt: Date.now() - 5_000,
    lastSelectedNodeId: mapData.nodeData.id,
  };
}

describe('AICases', () => {
  beforeEach(() => {
    vi.clearAllMocks();

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

    vi.mocked(aiCaseStorage.saveWorkspaceDocument).mockResolvedValue();
    vi.mocked(aiCaseStorage.listNodeAttachments).mockResolvedValue([]);
    vi.mocked(aiCaseStorage.saveNodeAttachment).mockResolvedValue();
    vi.mocked(aiCaseStorage.deleteNodeAttachment).mockResolvedValue();
    vi.mocked(aiCaseStorage.deleteStaleWorkspaceAttachments).mockResolvedValue(0);
  });

  it('初始化失败后应回退到默认脑图而不是永久 loading', async () => {
    vi.mocked(aiCaseStorage.getWorkspaceDocument).mockRejectedValue(new Error('indexeddb unavailable'));

    render(<AICases />);

    await waitFor(() => {
      expect(screen.getByText('AI 用例工作台')).toBeInTheDocument();
    });

    expect(screen.queryByText('初始化 AI 用例工作台...')).not.toBeInTheDocument();
    expect(vi.mocked(toast.error)).toHaveBeenCalledWith('初始化 AI 用例工作台失败，请刷新页面重试');
  });

  it('AI 生成和重置模板都应触发历史附件清理', async () => {
    vi.mocked(aiCaseStorage.getWorkspaceDocument).mockResolvedValue(createStoredDoc());

    render(<AICases />);

    await waitFor(() => {
      expect(screen.getByText('AI 用例工作台')).toBeInTheDocument();
    });

    const requirementInput = screen.getByPlaceholderText('粘贴 PRD、需求描述或技术方案，点击 AI 生成脑图');
    fireEvent.change(requirementInput, {
      target: { value: '登录流程支持手机号 + 验证码，需覆盖异常和权限场景' },
    });

    fireEvent.click(screen.getByRole('button', { name: /AI 生成/ }));

    await waitFor(() => {
      expect(aiCaseStorage.deleteStaleWorkspaceAttachments).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(screen.getByRole('button', { name: /重置模板/ }));

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

    render(<AICases />);

    await waitFor(() => {
      expect(screen.getByText('AI 用例工作台')).toBeInTheDocument();
    });

    const saveWorkspaceDocumentMock = vi.mocked(aiCaseStorage.saveWorkspaceDocument);
    saveWorkspaceDocumentMock.mockClear();

    const nameInput = screen.getByPlaceholderText('输入脑图标题');
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
});
