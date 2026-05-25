import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Sidebar } from '@/components/Sidebar';

vi.mock('wouter', () => ({
  useLocation: vi.fn(),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}));

vi.mock('@/contexts/NavCollapseContext', () => ({
  useNavCollapse: vi.fn(),
}));

vi.mock('@/contexts/AiGenerationContext', () => ({
  useAiGeneration: vi.fn(),
}));

vi.mock('react-dom', async () => {
  const actual = await vi.importActual<typeof import('react-dom')>('react-dom');
  return {
    ...actual,
    createPortal: (node: React.ReactNode) => node,
  };
});

vi.mock('lucide-react', () => {
  const icon = (name: string) => {
    const Component = ({ className }: { className?: string }) => (
      <span data-testid={`icon-${name}`} className={className}>{name}</span>
    );
    Component.displayName = name;
    return Component;
  };
  return {
    LayoutDashboard: icon('LayoutDashboard'),
    FolderOpen: icon('FolderOpen'),
    BarChart3: icon('BarChart3'),
    Settings: icon('Settings'),
    LogOut: icon('LogOut'),
    Boxes: icon('Boxes'),
    User: icon('User'),
    ChevronDown: icon('ChevronDown'),
    Code: icon('Code'),
    Monitor: icon('Monitor'),
    Gauge: icon('Gauge'),
    BrainCircuit: icon('BrainCircuit'),
    History: icon('History'),
    PanelLeftClose: icon('PanelLeftClose'),
    PanelLeftOpen: icon('PanelLeftOpen'),
  };
});

vi.mock('@/components/ThemeToggle', () => ({
  ThemeToggle: () => <div data-testid="theme-toggle" />,
}));

const mockSetLocation = vi.fn();

import { useLocation } from 'wouter';
import { useAuth } from '@/contexts/AuthContext';
import { useNavCollapse } from '@/contexts/NavCollapseContext';
import { useAiGeneration } from '@/contexts/AiGenerationContext';

function setupMocks({
  location = '/dashboard',
    user = { display_name: 'Test User', username: 'testuser' } as { display_name: string | null; username: string },
  navState = 'expanded' as 'expanded' | 'icon-only',
  isGenerating = false,
  progress = 0,
} = {}) {
  (useLocation as unknown as ReturnType<typeof vi.fn>).mockReturnValue([location, mockSetLocation]);
  (useAuth as unknown as ReturnType<typeof vi.fn>).mockReturnValue({ user, logout: vi.fn() });
  (useNavCollapse as unknown as ReturnType<typeof vi.fn>).mockReturnValue({ navState, toggleNav: vi.fn() });
  (useAiGeneration as unknown as ReturnType<typeof vi.fn>).mockReturnValue({ isGenerating, progress });
}

describe('Sidebar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupMocks();
  });

  describe('expanded mode', () => {
    it('renders all navigation items', () => {
      render(<Sidebar />);
      expect(screen.getByText('仪表盘')).toBeInTheDocument();
      expect(screen.getByText('用例管理')).toBeInTheDocument();
      expect(screen.getByText('AI 工作台')).toBeInTheDocument();
      expect(screen.getByText('任务管理')).toBeInTheDocument();
      expect(screen.getByText('运行记录')).toBeInTheDocument();
      expect(screen.getByText('系统设置')).toBeInTheDocument();
    });

    it('highlights active item based on current route', () => {
      setupMocks({ location: '/reports' });
      render(<Sidebar />);
      const activeButton = screen.getByText('运行记录').closest('button');
      expect(activeButton?.className).toContain('bg-primary');
    });

    it('shows user name in footer', () => {
      render(<Sidebar />);
      expect(screen.getByText('Test User')).toBeInTheDocument();
    });

    it('shows username fallback when display_name is missing', () => {
      setupMocks({ user: { display_name: null, username: 'fallbackuser' } });
      render(<Sidebar />);
      expect(screen.getByText('fallbackuser')).toBeInTheDocument();
    });

    it('renders logout button', () => {
      render(<Sidebar />);
      expect(screen.getByText('退出登录')).toBeInTheDocument();
    });
  });

  describe('icon-only mode', () => {
    it('renders in icon-only mode when navState is collapsed', () => {
      setupMocks({ navState: 'icon-only' });
      render(<Sidebar />);
      expect(screen.queryByText('仪表盘')).not.toBeInTheDocument();
      expect(screen.getByTitle('仪表盘')).toBeInTheDocument();
      expect(screen.getByTitle('退出登录')).toBeInTheDocument();
    });
  });
});
