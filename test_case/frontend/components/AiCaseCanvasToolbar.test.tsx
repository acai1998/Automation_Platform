/**
 * AiCaseCanvasToolbar 组件测试
 * 覆盖：缩放显示、居中、适配、全屏切换、标签切换等交互
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AiCaseCanvasToolbar } from '@/pages/cases/components/AiCaseCanvasToolbar';

function renderToolbar(overrides: Partial<Parameters<typeof AiCaseCanvasToolbar>[0]> = {}) {
  const defaultProps = {
    scalePercent: 100,
    isFullscreen: false,
    showNodeKindTags: true,
    onZoomIn: vi.fn(),
    onZoomOut: vi.fn(),
    onCenter: vi.fn(),
    onFit: vi.fn(),
    onToggleFullscreen: vi.fn(),
    onToggleNodeTags: vi.fn(),
    ...overrides,
  };
  render(<AiCaseCanvasToolbar {...defaultProps} />);
  return defaultProps;
}

describe('AiCaseCanvasToolbar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('应正确渲染缩放百分比', () => {
    renderToolbar({ scalePercent: 120 });
    expect(screen.getByText('120%')).toBeInTheDocument();
  });

  it('非全屏时应显示"脑图画布"文本', () => {
    renderToolbar({ isFullscreen: false });
    expect(screen.getByText('脑图画布')).toBeInTheDocument();
  });

  it('全屏时应显示"沉浸全屏"文本', () => {
    renderToolbar({ isFullscreen: true });
    expect(screen.getByText('沉浸全屏')).toBeInTheDocument();
  });

  it('点击放大按钮应调用 onZoomIn', () => {
    const props = renderToolbar();
    // ZoomIn tooltip 按钮
    const zoomInBtn = screen.getByRole('button', { name: /放大/i });
    fireEvent.click(zoomInBtn);
    expect(props.onZoomIn).toHaveBeenCalledTimes(1);
  });

  it('点击缩小按钮应调用 onZoomOut', () => {
    const props = renderToolbar();
    const zoomOutBtn = screen.getByRole('button', { name: /缩小/i });
    fireEvent.click(zoomOutBtn);
    expect(props.onZoomOut).toHaveBeenCalledTimes(1);
  });

  it('点击居中按钮应调用 onCenter', () => {
    const props = renderToolbar();
    const centerBtn = screen.getByRole('button', { name: /居中/i });
    fireEvent.click(centerBtn);
    expect(props.onCenter).toHaveBeenCalledTimes(1);
  });

  it('点击适配按钮应调用 onFit', () => {
    const props = renderToolbar();
    const fitBtn = screen.getByRole('button', { name: /适配/i });
    fireEvent.click(fitBtn);
    expect(props.onFit).toHaveBeenCalledTimes(1);
  });

  it('点击全屏按钮应调用 onToggleFullscreen', () => {
    const props = renderToolbar({ isFullscreen: false });
    const fullscreenBtn = screen.getByRole('button', { name: /全屏/i });
    fireEvent.click(fullscreenBtn);
    expect(props.onToggleFullscreen).toHaveBeenCalledTimes(1);
  });

  it('全屏模式下全屏按钮应显示退出状态', () => {
    renderToolbar({ isFullscreen: true });
    // 有"退出全屏"相关提示
    const exitBtn = screen.getByRole('button', { name: /退出全屏/i });
    expect(exitBtn).toBeInTheDocument();
  });

  it('点击标签切换按钮应调用 onToggleNodeTags', () => {
    const props = renderToolbar({ showNodeKindTags: true });
    const tagsBtn = screen.getByRole('button', { name: /节点类型标签/i });
    fireEvent.click(tagsBtn);
    expect(props.onToggleNodeTags).toHaveBeenCalledTimes(1);
  });

  it('showNodeKindTags=true 时标签按钮应处于激活（active）样式', () => {
    renderToolbar({ showNodeKindTags: true });
    const tagsBtn = screen.getByRole('button', { name: /节点类型标签/i });
    // active 状态下有 indigo 主题类
    expect(tagsBtn.className).toMatch(/indigo/);
  });

  it('showNodeKindTags=false 时标签按钮不应有激活样式', () => {
    renderToolbar({ showNodeKindTags: false });
    const tagsBtn = screen.getByRole('button', { name: /节点类型标签/i });
    expect(tagsBtn.className).not.toMatch(/bg-indigo/);
  });
});
