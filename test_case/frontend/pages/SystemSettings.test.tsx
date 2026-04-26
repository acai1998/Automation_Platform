import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SystemSettings from '@/pages/settings/SystemSettings';
import { useJenkinsHealthStatus } from '@/hooks/useExecutions';

vi.mock('@/hooks/useExecutions', () => ({
  useJenkinsHealthStatus: vi.fn(),
}));

const mockUseJenkinsHealthStatus = vi.mocked(useJenkinsHealthStatus);

describe('SystemSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders modular settings sections including Jenkins and placeholders', () => {
    mockUseJenkinsHealthStatus.mockReturnValue({
      data: {
        connected: true,
        message: 'Jenkins connected',
        checkedAt: '2026-04-11T00:00:00.000Z',
      },
      isLoading: false,
    } as any);

    render(<SystemSettings />);

    expect(screen.getByRole('heading', { name: '系统设置' })).toBeInTheDocument();
    expect(screen.getByText('Jenkins 集成监控')).toBeInTheDocument();
    expect(screen.getByText('通知设置（预留）')).toBeInTheDocument();
    expect(screen.getByText('执行治理策略（预留）')).toBeInTheDocument();
    expect(screen.getByText('系统变量（预留）')).toBeInTheDocument();
  });

  it('shows Jenkins available status when connected', () => {
    mockUseJenkinsHealthStatus.mockReturnValue({
      data: {
        connected: true,
        message: 'Jenkins version 2.0',
        checkedAt: '2026-04-11T00:00:00.000Z',
      },
      isLoading: false,
    } as any);

    render(<SystemSettings />);

    expect(screen.getByText('可用')).toBeInTheDocument();
    expect(screen.getByText('Jenkins version 2.0')).toBeInTheDocument();
  });

  it('shows Jenkins unavailable status when disconnected', () => {
    mockUseJenkinsHealthStatus.mockReturnValue({
      data: {
        connected: false,
        message: 'Jenkins 暂时不可用，请稍后重试',
        checkedAt: '2026-04-11T00:00:00.000Z',
      },
      isLoading: false,
    } as any);

    render(<SystemSettings />);

    expect(screen.getByText('不可用')).toBeInTheDocument();
    expect(screen.getByText('Jenkins 暂时不可用，请稍后重试')).toBeInTheDocument();
  });
});
