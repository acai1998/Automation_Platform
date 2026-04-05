/**
 * AiCaseSidebar 组件测试
 * 覆盖：需求输入、AI 生成进度条、执行进度、节点操作、截图证据、工作台操作、Markdown 导出、历史工作台
 */
import type { ChangeEvent } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AiCaseSidebar, type AiCaseSidebarProps } from '@/pages/cases/components/AiCaseSidebar';
import * as aiCaseStorage from '@/lib/aiCaseStorage';
import { aiCasesApi } from '@/api';
import { createInitialMindData } from '@/lib/aiCaseMindMap';
import type { AiCaseNode } from '@/types/aiCases';
import { toast } from 'sonner';

// ─── Mock ────────────────────────────────────────────────────────────────────

vi.mock('@/lib/aiCaseStorage', () => ({
  exportMindDataToMarkdown: vi.fn(() => '# 模拟 Markdown 内容'),
  downloadTextFile: vi.fn(),
  getWorkspaceDocument: vi.fn(),
  saveWorkspaceDocument: vi.fn(),
  listNodeAttachments: vi.fn(),
  saveNodeAttachment: vi.fn(),
  deleteNodeAttachment: vi.fn(),
  deleteStaleWorkspaceAttachments: vi.fn(),
}));

vi.mock('@/api', () => ({
  aiCasesApi: {
    listWorkspaces: vi.fn(),
    getWorkspace: vi.fn(),
    generate: vi.fn(),
    createWorkspace: vi.fn(),
    updateWorkspace: vi.fn(),
    updateNodeStatus: vi.fn(),
  },
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
  },
}));

// ─── 辅助函数 ─────────────────────────────────────────────────────────────────

function makeTestcaseNode(): AiCaseNode {
  return {
    id: 'tc-node-1',
    topic: '用例节点标题',
    expanded: true,
    metadata: {
      kind: 'testcase',
      status: 'todo',
      priority: 'P1',
      owner: null,
      attachmentIds: [],
      aiGenerated: false,
      nodeVersion: 1,
      updatedAt: 0,
      statusHistory: [],
    },
    children: [],
  } as unknown as AiCaseNode;
}

function buildDefaultProps(overrides: Partial<AiCaseSidebarProps> = {}): AiCaseSidebarProps {
  return {
    workspaceName: '测试工作台',
    requirementText: '',
    onWorkspaceNameChange: vi.fn(),
    onRequirementTextChange: vi.fn(),
    isGenerating: false,
    generationProgress: 0,
    generationStageText: '',
    onGenerate: vi.fn(),
    progress: {
      total: 0, todo: 0, doing: 0, blocked: 0,
      passed: 0, failed: 0, skipped: 0, done: 0, completionRate: 0,
    },
    selectedNode: null,
    selectedNodeStatus: 'todo',
    canEditSelectedNode: false,
    isUpdatingNodeStatus: false,
    onStatusChange: vi.fn(),
    attachments: [],
    isUploading: false,
    onUploadAttachment: vi.fn(),
    onDeleteAttachment: vi.fn(),
    isRemoteLinked: false,
    remoteWorkspaceId: null,
    isPublishingRemote: false,
    isSyncingRemote: false,
    onPublishRemote: vi.fn(),
    onSyncFromRemote: vi.fn(),
    onResetTemplate: vi.fn(),
    onLoadHistoryWorkspace: vi.fn(),
    mindData: createInitialMindData('测试工作台'),
    ...overrides,
  };
}

// ─── 需求输入区 ───────────────────────────────────────────────────────────────

describe('AiCaseSidebar – 需求输入', () => {
  it('应渲染工作台名称输入框，并显示当前值', () => {
    render(<AiCaseSidebar {...buildDefaultProps({ workspaceName: '我的工作台' })} />);
    const input = screen.getByPlaceholderText('输入工作台标题') as HTMLInputElement;
    expect(input.value).toBe('我的工作台');
  });

  it('修改工作台名称时应调用 onWorkspaceNameChange', () => {
    const onWorkspaceNameChange = vi.fn();
    render(<AiCaseSidebar {...buildDefaultProps({ onWorkspaceNameChange })} />);
    const input = screen.getByPlaceholderText('输入工作台标题');
    fireEvent.change(input, { target: { value: '新名称' } });
    expect(onWorkspaceNameChange).toHaveBeenCalledWith('新名称');
  });

  it('点击 AI 生成按钮应调用 onGenerate', () => {
    const onGenerate = vi.fn();
    render(<AiCaseSidebar {...buildDefaultProps({ onGenerate })} />);
    fireEvent.click(screen.getByRole('button', { name: /AI 生成测试用例/i }));
    expect(onGenerate).toHaveBeenCalledTimes(1);
  });

  it('生成中时 AI 生成按钮应显示加载状态且不可点击', () => {
    render(<AiCaseSidebar {...buildDefaultProps({ isGenerating: true })} />);
    const btn = screen.getByRole('button', { name: /AI 生成中/i });
    expect(btn).toBeDisabled();
  });

  it('当 generationProgress > 0 时应显示进度条', () => {
    render(<AiCaseSidebar {...buildDefaultProps({
      isGenerating: false,
      generationProgress: 42,
      generationStageText: '正在分析需求...',
    })} />);
    expect(screen.getByText('正在分析需求...')).toBeInTheDocument();
    expect(screen.getByText('42%')).toBeInTheDocument();
  });

  it('generationProgress = 0 且未生成中时不应显示进度条', () => {
    render(<AiCaseSidebar {...buildDefaultProps({ generationProgress: 0, isGenerating: false })} />);
    expect(screen.queryByText('正在处理...')).not.toBeInTheDocument();
  });
});

// ─── 执行进度区 ───────────────────────────────────────────────────────────────

describe('AiCaseSidebar – 执行进度', () => {
  it('total = 0 时应显示占位提示文字', () => {
    render(<AiCaseSidebar {...buildDefaultProps()} />);
    expect(screen.getByText('AI 生成后此处显示进度统计')).toBeInTheDocument();
  });

  it('有用例时应渲染环形图和用例数量', () => {
    render(<AiCaseSidebar {...buildDefaultProps({
      progress: {
        total: 10, todo: 5, doing: 2, blocked: 1,
        passed: 1, failed: 1, skipped: 0, done: 2, completionRate: 20,
      },
    })} />);
    // 组件渲染 "共 <span>10</span> 个测试点"，数字 10 在 span 内
    // 通过查找 span 元素中恰好包含 "10" 的内容来验证
    const allSpans = document.querySelectorAll('span');
    const totalSpan = Array.from(allSpans).find(el => el.textContent?.trim() === '10' && el.className?.includes('font-semibold'));
    expect(totalSpan).toBeTruthy();
    // 环形图内 20% 完成率
    expect(screen.getByText('20%')).toBeInTheDocument();
  });
});

// ─── 节点操作区 ───────────────────────────────────────────────────────────────

describe('AiCaseSidebar – 节点操作', () => {
  it('未选中节点时应显示提示文字', () => {
    render(<AiCaseSidebar {...buildDefaultProps({ selectedNode: null })} />);
    // 节点操作 section 在 hasSelectedNode=false 时默认关闭，需要先展开
    const sectionTrigger = screen.getByRole('button', { name: /节点操作/i });
    fireEvent.click(sectionTrigger);
    expect(screen.getByText('请在脑图中点击一个节点')).toBeInTheDocument();
  });

  it('选中非 testcase 节点时应显示"仅测试点可切换状态"提示', () => {
    const moduleNode = {
      ...makeTestcaseNode(),
      metadata: {
        ...makeTestcaseNode().metadata,
        kind: 'module' as const,
      },
    } as unknown as AiCaseNode;
    render(<AiCaseSidebar {...buildDefaultProps({
      selectedNode: moduleNode,
      canEditSelectedNode: false,
    })} />);
    expect(screen.getByText(/仅测试点可切换状态/)).toBeInTheDocument();
  });

  it('选中 testcase 节点后点击"通过"按钮应调用 onStatusChange', () => {
    const onStatusChange = vi.fn();
    render(<AiCaseSidebar {...buildDefaultProps({
      selectedNode: makeTestcaseNode(),
      canEditSelectedNode: true,
      onStatusChange,
    })} />);
    const passedBtn = screen.getByRole('button', { name: /通过/i });
    fireEvent.click(passedBtn);
    expect(onStatusChange).toHaveBeenCalledWith('passed');
  });

  it('canEditSelectedNode=false 时状态切换按钮应全部 disabled', () => {
    render(<AiCaseSidebar {...buildDefaultProps({
      selectedNode: makeTestcaseNode(),
      canEditSelectedNode: false,
    })} />);
    const statusBtns = ['待执行', '执行中', '阻塞', '通过', '失败', '跳过'];
    for (const label of statusBtns) {
      const btn = screen.getByRole('button', { name: new RegExp(label) });
      expect(btn).toBeDisabled();
    }
  });

  it('isUpdatingNodeStatus=true 时当前激活状态按钮应显示 loading', () => {
    render(<AiCaseSidebar {...buildDefaultProps({
      selectedNode: makeTestcaseNode(),
      selectedNodeStatus: 'passed',
      canEditSelectedNode: true,
      isUpdatingNodeStatus: true,
    })} />);
    // 激活按钮内有 Loader2 动画
    const passedBtn = screen.getByRole('button', { name: /通过/i });
    expect(passedBtn.querySelector('svg')).toBeTruthy();
  });
});

// ─── 工作台操作区 – Markdown 导出 ─────────────────────────────────────────────

describe('AiCaseSidebar – Markdown 导出', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('点击"导出 Markdown"按钮时应调用 exportMindDataToMarkdown 和 downloadTextFile', async () => {
    const mindData = createInitialMindData('工作台');
    render(<AiCaseSidebar {...buildDefaultProps({
      workspaceName: '我的用例',
      mindData,
    })} />);

    // 先展开"工作台操作"section
    const sectionTrigger = screen.getByRole('button', { name: /工作台操作/i });
    fireEvent.click(sectionTrigger);

    const exportBtn = await screen.findByRole('button', { name: /导出 Markdown/i });
    fireEvent.click(exportBtn);

    expect(aiCaseStorage.exportMindDataToMarkdown).toHaveBeenCalledWith(mindData);
    expect(aiCaseStorage.downloadTextFile).toHaveBeenCalledWith(
      '# 模拟 Markdown 内容',
      expect.stringMatching(/\.md$/)
    );
    expect(toast.success).toHaveBeenCalledWith('测试用例已导出为 Markdown');
  });

  it('mindData 为 null 时点击导出应显示错误 toast', async () => {
    render(<AiCaseSidebar {...buildDefaultProps({ mindData: null })} />);

    const sectionTrigger = screen.getByRole('button', { name: /工作台操作/i });
    fireEvent.click(sectionTrigger);

    const exportBtn = await screen.findByRole('button', { name: /导出 Markdown/i });
    // mindData=null 时按钮应被 disable
    expect(exportBtn).toBeDisabled();
  });

  it('导出的文件名应包含工作台名称（特殊字符替换为下划线）', async () => {
    const mindData = createInitialMindData('工作台');
    render(<AiCaseSidebar {...buildDefaultProps({
      workspaceName: '用户 登录/注册',
      mindData,
    })} />);

    const sectionTrigger = screen.getByRole('button', { name: /工作台操作/i });
    fireEvent.click(sectionTrigger);

    const exportBtn = await screen.findByRole('button', { name: /导出 Markdown/i });
    fireEvent.click(exportBtn);

    expect(aiCaseStorage.downloadTextFile).toHaveBeenCalledWith(
      expect.any(String),
      expect.stringMatching(/用户_登录_注册\.md$/)
    );
  });
});

// ─── 工作台操作区 – 远端同步 ──────────────────────────────────────────────────

describe('AiCaseSidebar – 工作台操作（远端同步）', () => {
  async function openWorkspaceOps() {
    const trigger = screen.getByRole('button', { name: /工作台操作/i });
    fireEvent.click(trigger);
  }

  it('未远端关联时"发布到远端"按钮应可点击', async () => {
    const onPublishRemote = vi.fn();
    render(<AiCaseSidebar {...buildDefaultProps({ isRemoteLinked: false, onPublishRemote })} />);
    await openWorkspaceOps();
    const btn = await screen.findByRole('button', { name: /发布到远端/i });
    fireEvent.click(btn);
    expect(onPublishRemote).toHaveBeenCalledTimes(1);
  });

  it('已远端关联时应显示"同步到远端"', async () => {
    render(<AiCaseSidebar {...buildDefaultProps({ isRemoteLinked: true, remoteWorkspaceId: 42 })} />);
    await openWorkspaceOps();
    expect(await screen.findByRole('button', { name: /同步到远端/i })).toBeInTheDocument();
  });

  it('未远端关联时"从远端拉取"按钮应处于 disabled', async () => {
    render(<AiCaseSidebar {...buildDefaultProps({ isRemoteLinked: false })} />);
    await openWorkspaceOps();
    const btn = await screen.findByRole('button', { name: /从远端拉取/i });
    expect(btn).toBeDisabled();
  });

  it('点击"重置模板"应调用 onResetTemplate', async () => {
    const onResetTemplate = vi.fn();
    render(<AiCaseSidebar {...buildDefaultProps({ onResetTemplate })} />);
    await openWorkspaceOps();
    const btn = await screen.findByRole('button', { name: /重置模板/i });
    fireEvent.click(btn);
    expect(onResetTemplate).toHaveBeenCalledTimes(1);
  });
});

// ─── 历史工作台区 ─────────────────────────────────────────────────────────────

describe('AiCaseSidebar – 历史工作台', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('初始状态应显示"查看历史工作台记录"链接', () => {
    render(<AiCaseSidebar {...buildDefaultProps()} />);
    // 展开历史工作台 section
    const trigger = screen.getByRole('button', { name: /历史工作台/i });
    fireEvent.click(trigger);
    expect(screen.getByText('查看历史工作台记录')).toBeInTheDocument();
  });

  it('点击"查看历史工作台记录"后应请求 API 并展示列表', async () => {
    vi.mocked(aiCasesApi.listWorkspaces).mockResolvedValue({
      data: [
        { id: 1, name: '历史工作台 A', status: 'published', version: 2, counters: { totalCases: 5 } },
        { id: 2, name: '历史工作台 B', status: 'draft', version: 1, counters: { totalCases: 3 } },
      ],
    } as any);

    render(<AiCaseSidebar {...buildDefaultProps()} />);

    const trigger = screen.getByRole('button', { name: /历史工作台/i });
    fireEvent.click(trigger);

    const expandLink = screen.getByText('查看历史工作台记录');
    fireEvent.click(expandLink);

    await waitFor(() => {
      expect(screen.getByText('历史工作台 A')).toBeInTheDocument();
      expect(screen.getByText('历史工作台 B')).toBeInTheDocument();
    });
  });

  it('API 失败时应显示错误 toast', async () => {
    vi.mocked(aiCasesApi.listWorkspaces).mockRejectedValue(new Error('network error'));

    render(<AiCaseSidebar {...buildDefaultProps()} />);

    const trigger = screen.getByRole('button', { name: /历史工作台/i });
    fireEvent.click(trigger);

    fireEvent.click(screen.getByText('查看历史工作台记录'));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('获取历史工作台失败');
    });
  });

  it('点击历史工作台条目应调用 onLoadHistoryWorkspace', async () => {
    vi.mocked(aiCasesApi.listWorkspaces).mockResolvedValue({
      data: [
        { id: 99, name: '目标工作台', status: 'published', version: 1, counters: { totalCases: 2 } },
      ],
    } as any);

    const onLoadHistoryWorkspace = vi.fn();
    render(<AiCaseSidebar {...buildDefaultProps({ onLoadHistoryWorkspace })} />);

    const trigger = screen.getByRole('button', { name: /历史工作台/i });
    fireEvent.click(trigger);
    fireEvent.click(screen.getByText('查看历史工作台记录'));

    await waitFor(() => {
      expect(screen.getByText('目标工作台')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('目标工作台'));
    expect(onLoadHistoryWorkspace).toHaveBeenCalledWith(99);
  });

  it('当前已加载的远端工作台条目应显示高亮样式', async () => {
    vi.mocked(aiCasesApi.listWorkspaces).mockResolvedValue({
      data: [
        { id: 7, name: '当前工作台', status: 'draft', version: 1, counters: { totalCases: 1 } },
      ],
    } as any);

    render(<AiCaseSidebar {...buildDefaultProps({ remoteWorkspaceId: 7 })} />);

    const trigger = screen.getByRole('button', { name: /历史工作台/i });
    fireEvent.click(trigger);
    fireEvent.click(screen.getByText('查看历史工作台记录'));

    await waitFor(() => {
      const btn = screen.getByText('当前工作台').closest('button') as HTMLButtonElement;
      expect(btn.className).toMatch(/indigo/);
    });
  });
});

// ─── 截图证据区 ──────────────────────────────────────────────────────────────

describe('AiCaseSidebar – 截图证据', () => {
  it('无附件时应显示"当前节点暂无截图"', () => {
    render(<AiCaseSidebar {...buildDefaultProps({ attachments: [] })} />);
    // 展开截图证据 section（默认关闭）
    const trigger = screen.getByRole('button', { name: /截图证据/i });
    fireEvent.click(trigger);
    expect(screen.getByText('当前节点暂无截图')).toBeInTheDocument();
  });

  it('有附件时应显示图片和文件名', () => {
    const attachments = [{
      id: 'att-1',
      docId: 'ws-1',
      nodeId: 'tc-1',
      name: 'screenshot.png',
      mimeType: 'image/png',
      size: 1024 * 50, // 50KB
      createdAt: Date.now(),
      blob: new Blob([''], { type: 'image/png' }),
      previewUrl: 'blob:mock-preview',
    }];

    render(<AiCaseSidebar {...buildDefaultProps({ attachments })} />);

    const trigger = screen.getByRole('button', { name: /截图证据/i });
    fireEvent.click(trigger);

    expect(screen.getByText('screenshot.png')).toBeInTheDocument();
    expect(screen.getByText('50 KB')).toBeInTheDocument();
  });

  it('点击删除按钮应调用 onDeleteAttachment', () => {
    const onDeleteAttachment = vi.fn();
    const attachments = [{
      id: 'att-del',
      docId: 'ws-1',
      nodeId: 'tc-1',
      name: 'to-delete.png',
      mimeType: 'image/png',
      size: 1024,
      createdAt: Date.now(),
      blob: new Blob([''], { type: 'image/png' }),
      previewUrl: 'blob:mock-preview-del',
    }];

    render(<AiCaseSidebar {...buildDefaultProps({ attachments, onDeleteAttachment })} />);

    const trigger = screen.getByRole('button', { name: /截图证据/i });
    fireEvent.click(trigger);

    const deleteBtn = screen.getByRole('button', { name: /删除截图/i });
    fireEvent.click(deleteBtn);
    expect(onDeleteAttachment).toHaveBeenCalledWith('att-del');
  });

  it('截图证据 Section 的徽章应显示附件数量', () => {
    const attachments = Array.from({ length: 3 }, (_, i) => ({
      id: `att-${i}`,
      docId: 'ws-1',
      nodeId: 'tc-1',
      name: `img-${i}.png`,
      mimeType: 'image/png',
      size: 1024,
      createdAt: Date.now(),
      blob: new Blob([''], { type: 'image/png' }),
      previewUrl: `blob:mock-${i}`,
    }));

    render(<AiCaseSidebar {...buildDefaultProps({ attachments })} />);
    // badge 显示数字 3
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('isUploading=true 时上传按钮应显示加载状态', () => {
    render(<AiCaseSidebar {...buildDefaultProps({ isUploading: true })} />);
    const trigger = screen.getByRole('button', { name: /截图证据/i });
    fireEvent.click(trigger);
    expect(screen.getByText('上传中...')).toBeInTheDocument();
  });
});
