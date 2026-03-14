import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Tasks from '@/pages/tasks/Tasks';
import * as useTasksHooks from '@/hooks/useTasks';
import type { AuditLogsResult, SchedulerStatus } from '@/hooks/useTasks';
import { TASK_MESSAGES, TASK_PAGE } from '@/constants/messages';

// Mock wouter
vi.mock('wouter', () => ({
  useLocation: () => ['/tasks', vi.fn()],
}));

// Mock UI components
vi.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, disabled, ...props }: any) => (
    <button onClick={onClick} disabled={disabled} {...props}>
      {children}
    </button>
  ),
}));

vi.mock('@/components/ui/card', () => ({
  Card: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  CardHeader: ({ children }: any) => <div>{children}</div>,
  CardTitle: ({ children }: any) => <div>{children}</div>,
  CardDescription: ({ children }: any) => <div>{children}</div>,
  CardContent: ({ children }: any) => <div>{children}</div>,
  CardFooter: ({ children }: any) => <div>{children}</div>,
}));

vi.mock('@/components/ui/badge', () => ({
  Badge: ({ children }: any) => <span>{children}</span>,
}));

vi.mock('@/components/ui/input', () => ({
  Input: (props: any) => <input {...props} />,
}));

vi.mock('@/components/ui/textarea', () => ({
  Textarea: (props: any) => <textarea {...props} />,
}));

vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ open, children }: any) => (open ? <div role="dialog">{children}</div> : null),
  DialogContent: ({ children }: any) => <div>{children}</div>,
  DialogHeader: ({ children }: any) => <div>{children}</div>,
  DialogTitle: ({ children }: any) => <h2>{children}</h2>,
  DialogDescription: ({ children }: any) => <p>{children}</p>,
  DialogFooter: ({ children }: any) => <div>{children}</div>,
}));

vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: any) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: any) => <div>{children}</div>,
  DropdownMenuContent: ({ children }: any) => <div>{children}</div>,
  DropdownMenuItem: ({ children, onClick }: any) => <div onClick={onClick}>{children}</div>,
  DropdownMenuSeparator: () => <hr />,
}));

// Mock sonner
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe('Tasks Page', () => {
  let queryClient: QueryClient;

  const mockTasks = [
    {
      id: 1,
      name: 'Test Task 1',
      description: 'Test description',
      status: 'active',
      trigger_type: 'manual',
      project_name: 'Test Project',
      environment_name: 'Test Env',
      updated_at: '2025-01-01',
      recentExecutions: [
        {
          id: 1,
          status: 'success',
          start_time: '2025-01-01',
          passed_cases: 10,
          failed_cases: 0,
          total_cases: 10,
        },
      ],
    },
    {
      id: 2,
      name: 'Test Task 2',
      description: 'Another test',
      status: 'paused',
      trigger_type: 'scheduled',
      cron_expression: '0 2 * * *',
      project_name: 'Test Project',
      environment_name: 'Test Env',
      updated_at: '2025-01-02',
      recentExecutions: [],
    },
  ];

  // 统一默认 hook mock（每个 it 块可按需 override）
  const defaultHookMocks = () => {
    vi.spyOn(useTasksHooks, 'useRunTask').mockReturnValue({ mutateAsync: vi.fn(), isPending: false, variables: undefined } as any);
    vi.spyOn(useTasksHooks, 'useCreateTask').mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as any);
    vi.spyOn(useTasksHooks, 'useUpdateTask').mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as any);
    vi.spyOn(useTasksHooks, 'useUpdateTaskStatus').mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as any);
    vi.spyOn(useTasksHooks, 'useDeleteTask').mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as any);
    vi.spyOn(useTasksHooks, 'useCancelExecution').mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as any);
    vi.spyOn(useTasksHooks, 'useTaskStats').mockReturnValue({ data: undefined, isLoading: false, error: null } as any);
    vi.spyOn(useTasksHooks, 'useTaskAuditLogs').mockReturnValue({ data: undefined, isLoading: false, error: null } as any);
    vi.spyOn(useTasksHooks, 'useSchedulerStatus').mockReturnValue({
      data: { running: [], queued: [], scheduled: [], concurrencyLimit: 3 },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as any);
  };

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    vi.clearAllMocks();
    defaultHookMocks();
  });

  const renderWithProviders = (ui: React.ReactElement) => {
    return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
  };

  describe('Loading State', () => {
    it('should render loading state', () => {
      vi.spyOn(useTasksHooks, 'useTasks').mockReturnValue({
        data: undefined,
        isLoading: true,
        error: null,
        refetch: vi.fn(),
      } as any);

      vi.spyOn(useTasksHooks, 'useRunTask').mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as any);
      vi.spyOn(useTasksHooks, 'useCreateTask').mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as any);
      vi.spyOn(useTasksHooks, 'useUpdateTask').mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as any);
      vi.spyOn(useTasksHooks, 'useUpdateTaskStatus').mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as any);
      vi.spyOn(useTasksHooks, 'useDeleteTask').mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as any);

      renderWithProviders(<Tasks />);

      expect(screen.getByText(TASK_MESSAGES.LOADING_TASKS)).toBeInTheDocument();
    });
  });

  describe('Error State', () => {
    it('should render error state', () => {
      const errorMessage = 'Failed to load tasks';
      vi.spyOn(useTasksHooks, 'useTasks').mockReturnValue({
        data: undefined,
        isLoading: false,
        error: new Error(errorMessage),
        refetch: vi.fn(),
      } as any);

      vi.spyOn(useTasksHooks, 'useRunTask').mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as any);
      vi.spyOn(useTasksHooks, 'useCreateTask').mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as any);
      vi.spyOn(useTasksHooks, 'useUpdateTask').mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as any);
      vi.spyOn(useTasksHooks, 'useUpdateTaskStatus').mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as any);
      vi.spyOn(useTasksHooks, 'useDeleteTask').mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as any);

      renderWithProviders(<Tasks />);

      // 检查错误消息是否存在于页面中
      expect(screen.getByText(errorMessage, { exact: false })).toBeInTheDocument();
      // 检查重试按钮是否存在
      expect(screen.getByText(TASK_MESSAGES.BTN_RETRY)).toBeInTheDocument();
    });

    it('should allow retry on error', () => {
      const refetch = vi.fn();
      vi.spyOn(useTasksHooks, 'useTasks').mockReturnValue({
        data: undefined,
        isLoading: false,
        error: new Error('Test error'),
        refetch,
      } as any);

      vi.spyOn(useTasksHooks, 'useRunTask').mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as any);
      vi.spyOn(useTasksHooks, 'useCreateTask').mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as any);
      vi.spyOn(useTasksHooks, 'useUpdateTask').mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as any);
      vi.spyOn(useTasksHooks, 'useUpdateTaskStatus').mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as any);
      vi.spyOn(useTasksHooks, 'useDeleteTask').mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as any);

      renderWithProviders(<Tasks />);

      const retryButton = screen.getByText(TASK_MESSAGES.BTN_RETRY);
      fireEvent.click(retryButton);

      expect(refetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('Empty State', () => {
    it('should render empty state when no tasks', () => {
      vi.spyOn(useTasksHooks, 'useTasks').mockReturnValue({
        data: { data: [], total: 0, stats: { activeCount: 0, todayRuns: 0 } },
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      } as any);

      vi.spyOn(useTasksHooks, 'useRunTask').mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as any);
      vi.spyOn(useTasksHooks, 'useCreateTask').mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as any);
      vi.spyOn(useTasksHooks, 'useUpdateTask').mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as any);
      vi.spyOn(useTasksHooks, 'useUpdateTaskStatus').mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as any);
      vi.spyOn(useTasksHooks, 'useDeleteTask').mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as any);

      renderWithProviders(<Tasks />);

      expect(screen.getByText(TASK_MESSAGES.NO_TASKS_CREATE_NEW)).toBeInTheDocument();
    });
  });

  describe('Task List', () => {
    it('should render task list correctly', () => {
      vi.spyOn(useTasksHooks, 'useTasks').mockReturnValue({
        data: {
          data: mockTasks,
          total: 2,
          stats: { activeCount: 1, todayRuns: 5 },
        },
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      } as any);

      vi.spyOn(useTasksHooks, 'useRunTask').mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as any);
      vi.spyOn(useTasksHooks, 'useCreateTask').mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as any);
      vi.spyOn(useTasksHooks, 'useUpdateTask').mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as any);
      vi.spyOn(useTasksHooks, 'useUpdateTaskStatus').mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as any);
      vi.spyOn(useTasksHooks, 'useDeleteTask').mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as any);

      renderWithProviders(<Tasks />);

      expect(screen.getByText('Test Task 1')).toBeInTheDocument();
      expect(screen.getByText('Test Task 2')).toBeInTheDocument();
    });

    it('should display correct statistics', () => {
      vi.spyOn(useTasksHooks, 'useTasks').mockReturnValue({
        data: {
          data: mockTasks,
          total: 10,
          stats: { activeCount: 7, todayRuns: 15 },
        },
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      } as any);

      vi.spyOn(useTasksHooks, 'useRunTask').mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as any);
      vi.spyOn(useTasksHooks, 'useCreateTask').mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as any);
      vi.spyOn(useTasksHooks, 'useUpdateTask').mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as any);
      vi.spyOn(useTasksHooks, 'useUpdateTaskStatus').mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as any);
      vi.spyOn(useTasksHooks, 'useDeleteTask').mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as any);

      renderWithProviders(<Tasks />);

      expect(screen.getByText(TASK_PAGE.STATS_TOTAL)).toBeInTheDocument();
      expect(screen.getByText('10')).toBeInTheDocument();
      expect(screen.getByText(TASK_PAGE.STATS_ACTIVE)).toBeInTheDocument();
      expect(screen.getByText('7')).toBeInTheDocument();
      expect(screen.getByText(TASK_PAGE.STATS_TODAY_RUNS)).toBeInTheDocument();
      expect(screen.getByText('15')).toBeInTheDocument();
    });
  });

  describe('Search and Filter', () => {
    it('should handle keyword search', async () => {
      const mockRefetch = vi.fn();
      vi.spyOn(useTasksHooks, 'useTasks').mockReturnValue({
        data: { data: mockTasks, total: 2, stats: { activeCount: 1, todayRuns: 0 } },
        isLoading: false,
        error: null,
        refetch: mockRefetch,
      } as any);

      vi.spyOn(useTasksHooks, 'useRunTask').mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as any);
      vi.spyOn(useTasksHooks, 'useCreateTask').mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as any);
      vi.spyOn(useTasksHooks, 'useUpdateTask').mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as any);
      vi.spyOn(useTasksHooks, 'useUpdateTaskStatus').mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as any);
      vi.spyOn(useTasksHooks, 'useDeleteTask').mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as any);

      renderWithProviders(<Tasks />);

      const searchInput = screen.getByPlaceholderText('搜索任务名称...');
      fireEvent.change(searchInput, { target: { value: 'Test' } });

      // 等待防抖
      await waitFor(() => {
        expect(searchInput).toHaveValue('Test');
      }, { timeout: 500 });
    });
  });

  describe('Create Task', () => {
    it('should open create dialog when clicking create button', async () => {
      vi.spyOn(useTasksHooks, 'useTasks').mockReturnValue({
        data: { data: [], total: 0, stats: { activeCount: 0, todayRuns: 0 } },
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      } as any);

      vi.spyOn(useTasksHooks, 'useRunTask').mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as any);
      vi.spyOn(useTasksHooks, 'useCreateTask').mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as any);
      vi.spyOn(useTasksHooks, 'useUpdateTask').mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as any);
      vi.spyOn(useTasksHooks, 'useUpdateTaskStatus').mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as any);
      vi.spyOn(useTasksHooks, 'useDeleteTask').mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as any);

      renderWithProviders(<Tasks />);

      const createButton = screen.getByText(TASK_MESSAGES.BTN_CREATE);
      fireEvent.click(createButton);

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });

      // 检查表单标题（使用 heading role）
      expect(screen.getByRole('heading', { name: /新建任务/i })).toBeInTheDocument();
    });
  });

  // ─── P1/P2 增强功能测试 ───

  describe('Cancel Execution', () => {
    it('should show cancel option when task has running execution', () => {
      const taskWithRunning = {
        ...mockTasks[0],
        recentExecutions: [
          {
            id: 10,
            status: 'running',
            passed_cases: 0,
            failed_cases: 0,
            total_cases: 5,
          },
        ],
      };

      vi.spyOn(useTasksHooks, 'useTasks').mockReturnValue({
        data: { data: [taskWithRunning], total: 1, stats: { activeCount: 1, todayRuns: 1 } },
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      } as any);
      vi.spyOn(useTasksHooks, 'useRunTask').mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as any);
      vi.spyOn(useTasksHooks, 'useCreateTask').mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as any);
      vi.spyOn(useTasksHooks, 'useUpdateTask').mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as any);
      vi.spyOn(useTasksHooks, 'useUpdateTaskStatus').mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as any);
      vi.spyOn(useTasksHooks, 'useDeleteTask').mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as any);
      vi.spyOn(useTasksHooks, 'useCancelExecution').mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as any);
      vi.spyOn(useTasksHooks, 'useTaskStats').mockReturnValue({ data: undefined, isLoading: false, error: null } as any);

      renderWithProviders(<Tasks />);

      expect(screen.getByText('取消运行')).toBeInTheDocument();
    });

    it('should NOT show cancel option when task has no active execution', () => {
      vi.spyOn(useTasksHooks, 'useTasks').mockReturnValue({
        data: { data: mockTasks, total: 2, stats: { activeCount: 1, todayRuns: 0 } },
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      } as any);
      vi.spyOn(useTasksHooks, 'useRunTask').mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as any);
      vi.spyOn(useTasksHooks, 'useCreateTask').mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as any);
      vi.spyOn(useTasksHooks, 'useUpdateTask').mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as any);
      vi.spyOn(useTasksHooks, 'useUpdateTaskStatus').mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as any);
      vi.spyOn(useTasksHooks, 'useDeleteTask').mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as any);
      vi.spyOn(useTasksHooks, 'useCancelExecution').mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as any);
      vi.spyOn(useTasksHooks, 'useTaskStats').mockReturnValue({ data: undefined, isLoading: false, error: null } as any);

      renderWithProviders(<Tasks />);

      expect(screen.queryByText('取消运行')).not.toBeInTheDocument();
    });

    it('should call cancelExecution mutation when clicking cancel', async () => {
      const taskWithRunning = {
        ...mockTasks[0],
        recentExecutions: [
          {
            id: 10,
            status: 'running',
            passed_cases: 0,
            failed_cases: 0,
            total_cases: 5,
          },
        ],
      };
      const mockCancel = vi.fn().mockResolvedValue({});

      vi.spyOn(useTasksHooks, 'useTasks').mockReturnValue({
        data: { data: [taskWithRunning], total: 1, stats: { activeCount: 1, todayRuns: 1 } },
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      } as any);
      vi.spyOn(useTasksHooks, 'useRunTask').mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as any);
      vi.spyOn(useTasksHooks, 'useCreateTask').mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as any);
      vi.spyOn(useTasksHooks, 'useUpdateTask').mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as any);
      vi.spyOn(useTasksHooks, 'useUpdateTaskStatus').mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as any);
      vi.spyOn(useTasksHooks, 'useDeleteTask').mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as any);
      vi.spyOn(useTasksHooks, 'useCancelExecution').mockReturnValue({ mutateAsync: mockCancel, isPending: false } as any);
      vi.spyOn(useTasksHooks, 'useTaskStats').mockReturnValue({ data: undefined, isLoading: false, error: null } as any);

      renderWithProviders(<Tasks />);

      const cancelBtn = screen.getByText('取消运行');
      fireEvent.click(cancelBtn);

      await waitFor(() => {
        expect(mockCancel).toHaveBeenCalledWith({ taskId: 1, execId: 10 });
      });
    });
  });

  describe('Task Stats Dialog', () => {
    it('should open stats dialog when clicking 查看统计', async () => {
      const mockStats = {
        summary: { total: 20, successCount: 18, failedCount: 2, successRate: 90, avgDurationSec: 30, lastRunAt: '2026-03-12', periodDays: 30 },
        trend: [],
        topErrors: [],
      };

      vi.spyOn(useTasksHooks, 'useTasks').mockReturnValue({
        data: { data: mockTasks, total: 2, stats: { activeCount: 1, todayRuns: 5 } },
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      } as any);
      vi.spyOn(useTasksHooks, 'useRunTask').mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as any);
      vi.spyOn(useTasksHooks, 'useCreateTask').mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as any);
      vi.spyOn(useTasksHooks, 'useUpdateTask').mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as any);
      vi.spyOn(useTasksHooks, 'useUpdateTaskStatus').mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as any);
      vi.spyOn(useTasksHooks, 'useDeleteTask').mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as any);
      vi.spyOn(useTasksHooks, 'useCancelExecution').mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as any);
      vi.spyOn(useTasksHooks, 'useTaskStats').mockReturnValue({ data: mockStats, isLoading: false, error: null } as any);

      renderWithProviders(<Tasks />);

      const statsBtn = screen.getAllByText('查看统计')[0];
      fireEvent.click(statsBtn);

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
        expect(screen.getByText('90%')).toBeInTheDocument(); // successRate
        expect(screen.getByText('20')).toBeInTheDocument(); // total
      });
    });
  });

  describe('Run Task via New API', () => {
    it('should call useRunTask mutation when clicking run now', async () => {
      const mockRun = vi.fn().mockResolvedValue({ message: '任务已提交执行队列' });

      vi.spyOn(useTasksHooks, 'useTasks').mockReturnValue({
        data: { data: mockTasks, total: 2, stats: { activeCount: 1, todayRuns: 0 } },
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      } as any);
      vi.spyOn(useTasksHooks, 'useRunTask').mockReturnValue({
        mutateAsync: mockRun,
        isPending: false,
        variables: undefined,
      } as any);
      vi.spyOn(useTasksHooks, 'useCreateTask').mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as any);
      vi.spyOn(useTasksHooks, 'useUpdateTask').mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as any);
      vi.spyOn(useTasksHooks, 'useUpdateTaskStatus').mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as any);
      vi.spyOn(useTasksHooks, 'useDeleteTask').mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as any);
      vi.spyOn(useTasksHooks, 'useCancelExecution').mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as any);
      vi.spyOn(useTasksHooks, 'useTaskStats').mockReturnValue({ data: undefined, isLoading: false, error: null } as any);

      renderWithProviders(<Tasks />);

      const runBtns = screen.getAllByText(TASK_MESSAGES.BTN_RUN_NOW);
      fireEvent.click(runBtns[0]);

      await waitFor(() => {
        expect(mockRun).toHaveBeenCalledWith(1);
      });
    });
  });

  describe('Audit Log Tab in Stats Dialog', () => {
    it('should show audit log tab when stats dialog is open', async () => {
      const mockStats = {
        summary: { total: 5, successCount: 4, failedCount: 1, successRate: 80, avgDurationSec: 15, lastRunAt: null, periodDays: 30 },
        trend: [],
        topErrors: [],
      };

      const mockAuditData: AuditLogsResult = {
        data: [
          {
            id: 1,
            action: 'created',
            operatorId: 1,
            operatorName: 'admin',
            metadata: { name: 'Test Task' },
            createdAt: '2026-03-12T10:00:00Z',
          },
          {
            id: 2,
            action: 'manually_triggered',
            operatorId: 2,
            operatorName: 'user1',
            metadata: { triggeredBy: 2 },
            createdAt: '2026-03-12T11:00:00Z',
          },
        ],
        total: 2,
      };

      vi.spyOn(useTasksHooks, 'useTasks').mockReturnValue({
        data: { data: mockTasks, total: 2, stats: { activeCount: 1, todayRuns: 0 } },
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      } as any);
      vi.spyOn(useTasksHooks, 'useTaskStats').mockReturnValue({ data: mockStats, isLoading: false, error: null } as any);
      vi.spyOn(useTasksHooks, 'useTaskAuditLogs').mockReturnValue({ data: mockAuditData, isLoading: false, error: null } as any);

      renderWithProviders(<Tasks />);

      // 打开统计弹窗
      const statsBtn = screen.getAllByText('查看统计')[0];
      fireEvent.click(statsBtn);

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });

      // 验证两个标签页都存在
      expect(screen.getByText('执行统计（近30天）')).toBeInTheDocument();
      expect(screen.getByText('操作审计')).toBeInTheDocument();
    });

    it('should switch to audit log tab and show log entries', async () => {
      const mockAuditData: AuditLogsResult = {
        data: [
          {
            id: 1,
            action: 'created',
            operatorId: 1,
            operatorName: 'admin',
            metadata: {},
            createdAt: '2026-03-12T10:00:00Z',
          },
        ],
        total: 1,
      };

      vi.spyOn(useTasksHooks, 'useTasks').mockReturnValue({
        data: { data: mockTasks, total: 2, stats: { activeCount: 1, todayRuns: 0 } },
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      } as any);
      vi.spyOn(useTasksHooks, 'useTaskStats').mockReturnValue({ data: undefined, isLoading: true, error: null } as any);
      vi.spyOn(useTasksHooks, 'useTaskAuditLogs').mockReturnValue({ data: mockAuditData, isLoading: false, error: null } as any);

      renderWithProviders(<Tasks />);

      const statsBtn = screen.getAllByText('查看统计')[0];
      fireEvent.click(statsBtn);

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });

      // 切换到审计日志标签
      const auditTab = screen.getByText('操作审计');
      fireEvent.click(auditTab);

      await waitFor(() => {
        expect(screen.getByText('创建任务')).toBeInTheDocument();
        expect(screen.getByText('admin')).toBeInTheDocument();
        expect(screen.getByText('共 1 条操作记录（显示最近 50 条）')).toBeInTheDocument();
      });
    });

    it('should show empty state when no audit logs', async () => {
      const emptyAuditData: AuditLogsResult = { data: [], total: 0 };

      vi.spyOn(useTasksHooks, 'useTasks').mockReturnValue({
        data: { data: mockTasks, total: 2, stats: { activeCount: 1, todayRuns: 0 } },
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      } as any);
      vi.spyOn(useTasksHooks, 'useTaskStats').mockReturnValue({ data: undefined, isLoading: false, error: null } as any);
      vi.spyOn(useTasksHooks, 'useTaskAuditLogs').mockReturnValue({ data: emptyAuditData, isLoading: false, error: null } as any);

      renderWithProviders(<Tasks />);

      const statsBtn = screen.getAllByText('查看统计')[0];
      fireEvent.click(statsBtn);

      await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());

      // 切换到审计日志标签
      fireEvent.click(screen.getByText('操作审计'));

      await waitFor(() => {
        expect(screen.getByText('暂无操作记录')).toBeInTheDocument();
      });
    });

    it('should show audit action count badge when total > 0', async () => {
      const mockAuditData: AuditLogsResult = {
        data: [],
        total: 15,
      };

      vi.spyOn(useTasksHooks, 'useTasks').mockReturnValue({
        data: { data: mockTasks, total: 2, stats: { activeCount: 1, todayRuns: 0 } },
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      } as any);
      vi.spyOn(useTasksHooks, 'useTaskStats').mockReturnValue({ data: undefined, isLoading: false, error: null } as any);
      vi.spyOn(useTasksHooks, 'useTaskAuditLogs').mockReturnValue({ data: mockAuditData, isLoading: false, error: null } as any);

      renderWithProviders(<Tasks />);

      const statsBtn = screen.getAllByText('查看统计')[0];
      fireEvent.click(statsBtn);

      await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());

      // 验证审计计数徽标显示
      expect(screen.getByText('15')).toBeInTheDocument();
    });
  });

  describe('Scheduler Monitor Dialog', () => {
    it('should open scheduler monitor when clicking 调度器监控 button', async () => {
      vi.spyOn(useTasksHooks, 'useTasks').mockReturnValue({
        data: { data: [], total: 0, stats: { activeCount: 0, todayRuns: 0 } },
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      } as any);

      const mockSchedulerStatus: SchedulerStatus = {
        running: [
          { taskId: 1, runId: 101, elapsedMs: 5000 },
          { taskId: 2, runId: 102, elapsedMs: 3000 },
        ],
        queued: [
          { taskId: 3, triggerReason: 'manual', waitMs: 1000, priority: 1, queuePosition: 1 },
        ],
        directQueued: [],
        scheduled: [4, 5],
        concurrencyLimit: 3,
        queueDepth: 1,
        directQueueDepth: 0,
        maxQueueDepth: 50,
      };
      vi.spyOn(useTasksHooks, 'useSchedulerStatus').mockReturnValue({
        data: mockSchedulerStatus,
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      } as any);

      renderWithProviders(<Tasks />);

      const monitorBtn = screen.getByText('调度器监控');
      fireEvent.click(monitorBtn);

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
        expect(screen.getByText('调度器实时状态')).toBeInTheDocument();
      });
    });

    it('should display running and queued task counts', async () => {
      vi.spyOn(useTasksHooks, 'useTasks').mockReturnValue({
        data: { data: [], total: 0, stats: { activeCount: 0, todayRuns: 0 } },
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      } as any);

      const mockSchedulerStatus: SchedulerStatus = {
        running: [
          { taskId: 1, runId: 101, elapsedMs: 5000 },
          { taskId: 2, runId: 102, elapsedMs: 3000 },
        ],
        queued: [
          { taskId: 3, triggerReason: 'manual', waitMs: 1000, priority: 1, queuePosition: 1 },
          { taskId: 4, triggerReason: 'scheduled', waitMs: 2000, priority: 2, queuePosition: 2 },
          { taskId: 5, triggerReason: 'retry', waitMs: 3000, priority: 3, queuePosition: 3 },
        ],
        directQueued: [],
        scheduled: [6],
        concurrencyLimit: 3,
        queueDepth: 3,
        directQueueDepth: 0,
        maxQueueDepth: 50,
      };
      vi.spyOn(useTasksHooks, 'useSchedulerStatus').mockReturnValue({
        data: mockSchedulerStatus,
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      } as any);

      renderWithProviders(<Tasks />);

      fireEvent.click(screen.getByText('调度器监控'));

      await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());

      // 验证运行中/队列/已计划数量
      expect(screen.getByText('运行中 (2)')).toBeInTheDocument();
      expect(screen.getByText('等待队列 (3)')).toBeInTheDocument();
      expect(screen.getByText('已计划定时触发 (1)')).toBeInTheDocument();
    });

    it('should show idle message when no tasks running', async () => {
      vi.spyOn(useTasksHooks, 'useTasks').mockReturnValue({
        data: { data: [], total: 0, stats: { activeCount: 0, todayRuns: 0 } },
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      } as any);

      const emptyStatus: SchedulerStatus = {
        running: [],
        queued: [],
        directQueued: [],
        scheduled: [],
        concurrencyLimit: 3,
        queueDepth: 0,
        directQueueDepth: 0,
        maxQueueDepth: 50,
      };
      vi.spyOn(useTasksHooks, 'useSchedulerStatus').mockReturnValue({
        data: emptyStatus,
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      } as any);

      renderWithProviders(<Tasks />);

      fireEvent.click(screen.getByText('调度器监控'));

      await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());

      expect(screen.getByText('调度器空闲，无任务运行')).toBeInTheDocument();
    });

    it('should display concurrency limit info', async () => {
      vi.spyOn(useTasksHooks, 'useTasks').mockReturnValue({
        data: { data: [], total: 0, stats: { activeCount: 0, todayRuns: 0 } },
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      } as any);

      const mockStatus: SchedulerStatus = {
        running: [
          { taskId: 1, runId: 201, elapsedMs: 10000 },
        ],
        queued: [],
        directQueued: [],
        scheduled: [],
        concurrencyLimit: 5,
        queueDepth: 0,
        directQueueDepth: 0,
        maxQueueDepth: 50,
      };
      vi.spyOn(useTasksHooks, 'useSchedulerStatus').mockReturnValue({
        data: mockStatus,
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      } as any);

      renderWithProviders(<Tasks />);

      fireEvent.click(screen.getByText('调度器监控'));

      await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());

      // 验证并发限制显示
      expect(screen.getByText('上限 5')).toBeInTheDocument();
      expect(screen.getByText('1 / 5')).toBeInTheDocument();
    });
  });

  describe('Form Validation', () => {
    it('should validate required name field', async () => {
      vi.spyOn(useTasksHooks, 'useTasks').mockReturnValue({
        data: { data: [], total: 0, stats: { activeCount: 0, todayRuns: 0 } },
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      } as any);

      vi.spyOn(useTasksHooks, 'useRunTask').mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as any);
      const mockCreate = vi.fn();
      vi.spyOn(useTasksHooks, 'useCreateTask').mockReturnValue({ mutateAsync: mockCreate, isPending: false } as any);
      vi.spyOn(useTasksHooks, 'useUpdateTask').mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as any);
      vi.spyOn(useTasksHooks, 'useUpdateTaskStatus').mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as any);
      vi.spyOn(useTasksHooks, 'useDeleteTask').mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as any);

      renderWithProviders(<Tasks />);

      const createButton = screen.getByText(TASK_MESSAGES.BTN_CREATE);
      fireEvent.click(createButton);

      const saveButton = screen.getByText(TASK_MESSAGES.BTN_CREATE_TASK);
      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(screen.getByText(TASK_MESSAGES.NAME_REQUIRED)).toBeInTheDocument();
      });

      expect(mockCreate).not.toHaveBeenCalled();
    });

    it('should validate cron expression for scheduled tasks', async () => {
      vi.spyOn(useTasksHooks, 'useTasks').mockReturnValue({
        data: { data: [], total: 0, stats: { activeCount: 0, todayRuns: 0 } },
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      } as any);

      vi.spyOn(useTasksHooks, 'useRunTask').mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as any);
      const mockCreate = vi.fn();
      vi.spyOn(useTasksHooks, 'useCreateTask').mockReturnValue({ mutateAsync: mockCreate, isPending: false } as any);
      vi.spyOn(useTasksHooks, 'useUpdateTask').mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as any);
      vi.spyOn(useTasksHooks, 'useUpdateTaskStatus').mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as any);
      vi.spyOn(useTasksHooks, 'useDeleteTask').mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as any);

      renderWithProviders(<Tasks />);

      const createButton = screen.getByText(TASK_MESSAGES.BTN_CREATE);
      fireEvent.click(createButton);

      // 输入任务名称
      const nameInput = screen.getByPlaceholderText(TASK_MESSAGES.FORM_NAME_PLACEHOLDER);
      fireEvent.change(nameInput, { target: { value: 'Test Scheduled Task' } });

      // 选择定时触发
      const scheduledButton = screen.getByText('定时触发');
      fireEvent.click(scheduledButton);

      // 不输入 cron 表达式，直接保存
      const saveButton = screen.getByText(TASK_MESSAGES.BTN_CREATE_TASK);
      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(screen.getByText(TASK_MESSAGES.CRON_REQUIRED)).toBeInTheDocument();
      });

      expect(mockCreate).not.toHaveBeenCalled();
    });
  });

  // ─── 补充测试：删除确认、编辑、状态切换、分页 ───

  describe('Delete Task', () => {
    const setupMocks = (mockDelete = vi.fn().mockResolvedValue({})) => {
      vi.spyOn(useTasksHooks, 'useTasks').mockReturnValue({
        data: { data: mockTasks, total: 2, stats: { activeCount: 1, todayRuns: 0 } },
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      } as any);
      vi.spyOn(useTasksHooks, 'useRunTask').mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as any);
      vi.spyOn(useTasksHooks, 'useCreateTask').mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as any);
      vi.spyOn(useTasksHooks, 'useUpdateTask').mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as any);
      vi.spyOn(useTasksHooks, 'useUpdateTaskStatus').mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as any);
      vi.spyOn(useTasksHooks, 'useDeleteTask').mockReturnValue({ mutateAsync: mockDelete, isPending: false } as any);
      vi.spyOn(useTasksHooks, 'useCancelExecution').mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as any);
      vi.spyOn(useTasksHooks, 'useTaskStats').mockReturnValue({ data: undefined, isLoading: false, error: null } as any);
      return mockDelete;
    };

    it('should show delete confirmation dialog when clicking delete button', async () => {
      setupMocks();
      renderWithProviders(<Tasks />);

      // 点击删除任务按钮（位于下拉菜单中）
      const deleteButtons = screen.getAllByText(TASK_MESSAGES.BTN_DELETE_TASK);
      fireEvent.click(deleteButtons[0]);

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
        expect(screen.getByText(TASK_MESSAGES.DELETE_CONFIRM_TITLE)).toBeInTheDocument();
      });
    });

    it('should call deleteTask mutation after confirming deletion', async () => {
      const mockDelete = setupMocks();
      renderWithProviders(<Tasks />);

      const deleteButtons = screen.getAllByText(TASK_MESSAGES.BTN_DELETE_TASK);
      fireEvent.click(deleteButtons[0]);

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });

      // 点击确认删除按钮
      const confirmBtn = screen.getByText(TASK_MESSAGES.BTN_DELETE);
      fireEvent.click(confirmBtn);

      await waitFor(() => {
        expect(mockDelete).toHaveBeenCalledWith(1);
      });
    });

    it('should NOT call deleteTask when cancelling the confirmation dialog', async () => {
      const mockDelete = setupMocks();
      renderWithProviders(<Tasks />);

      const deleteButtons = screen.getAllByText(TASK_MESSAGES.BTN_DELETE_TASK);
      fireEvent.click(deleteButtons[0]);

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });

      // 点击取消按钮
      const cancelBtn = screen.getByText(TASK_MESSAGES.BTN_CANCEL);
      fireEvent.click(cancelBtn);

      expect(mockDelete).not.toHaveBeenCalled();
    });
  });

  describe('Edit Task', () => {
    it('should open edit dialog with pre-filled data when clicking edit button', async () => {
      vi.spyOn(useTasksHooks, 'useTasks').mockReturnValue({
        data: { data: mockTasks, total: 2, stats: { activeCount: 1, todayRuns: 0 } },
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      } as any);
      vi.spyOn(useTasksHooks, 'useRunTask').mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as any);
      vi.spyOn(useTasksHooks, 'useCreateTask').mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as any);
      vi.spyOn(useTasksHooks, 'useUpdateTask').mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as any);
      vi.spyOn(useTasksHooks, 'useUpdateTaskStatus').mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as any);
      vi.spyOn(useTasksHooks, 'useDeleteTask').mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as any);
      vi.spyOn(useTasksHooks, 'useCancelExecution').mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as any);
      vi.spyOn(useTasksHooks, 'useTaskStats').mockReturnValue({ data: undefined, isLoading: false, error: null } as any);

      renderWithProviders(<Tasks />);

      const editButtons = screen.getAllByText(TASK_MESSAGES.BTN_EDIT_TASK);
      fireEvent.click(editButtons[0]);

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: /编辑任务/i })).toBeInTheDocument();
      });

      // 验证表单中已预填了任务名称
      const nameInput = screen.getByPlaceholderText(TASK_MESSAGES.FORM_NAME_PLACEHOLDER) as HTMLInputElement;
      expect(nameInput.value).toBe('Test Task 1');
    });

    it('should call updateTask mutation with correct data on save', async () => {
      const mockUpdate = vi.fn().mockResolvedValue({});

      vi.spyOn(useTasksHooks, 'useTasks').mockReturnValue({
        data: { data: mockTasks, total: 2, stats: { activeCount: 1, todayRuns: 0 } },
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      } as any);
      vi.spyOn(useTasksHooks, 'useRunTask').mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as any);
      vi.spyOn(useTasksHooks, 'useCreateTask').mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as any);
      vi.spyOn(useTasksHooks, 'useUpdateTask').mockReturnValue({ mutateAsync: mockUpdate, isPending: false } as any);
      vi.spyOn(useTasksHooks, 'useUpdateTaskStatus').mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as any);
      vi.spyOn(useTasksHooks, 'useDeleteTask').mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as any);
      vi.spyOn(useTasksHooks, 'useCancelExecution').mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as any);
      vi.spyOn(useTasksHooks, 'useTaskStats').mockReturnValue({ data: undefined, isLoading: false, error: null } as any);

      renderWithProviders(<Tasks />);

      const editButtons = screen.getAllByText(TASK_MESSAGES.BTN_EDIT_TASK);
      fireEvent.click(editButtons[0]);

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });

      // 修改任务名称
      const nameInput = screen.getByPlaceholderText(TASK_MESSAGES.FORM_NAME_PLACEHOLDER);
      fireEvent.change(nameInput, { target: { value: 'Updated Task Name' } });

      // 点击保存
      const saveBtn = screen.getByText(TASK_MESSAGES.BTN_SAVE);
      fireEvent.click(saveBtn);

      await waitFor(() => {
        expect(mockUpdate).toHaveBeenCalledWith(
          expect.objectContaining({ id: 1, name: 'Updated Task Name' })
        );
      });
    });
  });

  describe('Status Toggle', () => {
    it('should call updateTaskStatus with paused when clicking pause on active task', async () => {
      const mockUpdateStatus = vi.fn().mockResolvedValue({});

      vi.spyOn(useTasksHooks, 'useTasks').mockReturnValue({
        data: { data: mockTasks, total: 2, stats: { activeCount: 1, todayRuns: 0 } },
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      } as any);
      vi.spyOn(useTasksHooks, 'useRunTask').mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as any);
      vi.spyOn(useTasksHooks, 'useCreateTask').mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as any);
      vi.spyOn(useTasksHooks, 'useUpdateTask').mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as any);
      vi.spyOn(useTasksHooks, 'useUpdateTaskStatus').mockReturnValue({ mutateAsync: mockUpdateStatus, isPending: false } as any);
      vi.spyOn(useTasksHooks, 'useDeleteTask').mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as any);
      vi.spyOn(useTasksHooks, 'useCancelExecution').mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as any);
      vi.spyOn(useTasksHooks, 'useTaskStats').mockReturnValue({ data: undefined, isLoading: false, error: null } as any);

      renderWithProviders(<Tasks />);

      // mockTasks[0] 是 active 状态，应显示「暂停任务」
      const pauseBtn = screen.getAllByText(TASK_MESSAGES.BTN_PAUSE_TASK)[0];
      fireEvent.click(pauseBtn);

      await waitFor(() => {
        expect(mockUpdateStatus).toHaveBeenCalledWith({ id: 1, status: 'paused' });
      });
    });

    it('should call updateTaskStatus with active when clicking enable on paused task', async () => {
      const mockUpdateStatus = vi.fn().mockResolvedValue({});

      vi.spyOn(useTasksHooks, 'useTasks').mockReturnValue({
        data: { data: mockTasks, total: 2, stats: { activeCount: 1, todayRuns: 0 } },
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      } as any);
      vi.spyOn(useTasksHooks, 'useRunTask').mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as any);
      vi.spyOn(useTasksHooks, 'useCreateTask').mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as any);
      vi.spyOn(useTasksHooks, 'useUpdateTask').mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as any);
      vi.spyOn(useTasksHooks, 'useUpdateTaskStatus').mockReturnValue({ mutateAsync: mockUpdateStatus, isPending: false } as any);
      vi.spyOn(useTasksHooks, 'useDeleteTask').mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as any);
      vi.spyOn(useTasksHooks, 'useCancelExecution').mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as any);
      vi.spyOn(useTasksHooks, 'useTaskStats').mockReturnValue({ data: undefined, isLoading: false, error: null } as any);

      renderWithProviders(<Tasks />);

      // mockTasks[1] 是 paused 状态，应显示「启用任务」
      const enableBtn = screen.getAllByText(TASK_MESSAGES.BTN_ENABLE_TASK)[0];
      fireEvent.click(enableBtn);

      await waitFor(() => {
        expect(mockUpdateStatus).toHaveBeenCalledWith({ id: 2, status: 'active' });
      });
    });
  });

  describe('Pagination', () => {
    it('should display correct total count in statistics', () => {
      vi.spyOn(useTasksHooks, 'useTasks').mockReturnValue({
        data: { data: mockTasks, total: 50, stats: { activeCount: 30, todayRuns: 8 } },
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      } as any);
      vi.spyOn(useTasksHooks, 'useRunTask').mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as any);
      vi.spyOn(useTasksHooks, 'useCreateTask').mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as any);
      vi.spyOn(useTasksHooks, 'useUpdateTask').mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as any);
      vi.spyOn(useTasksHooks, 'useUpdateTaskStatus').mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as any);
      vi.spyOn(useTasksHooks, 'useDeleteTask').mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as any);

      renderWithProviders(<Tasks />);

      // 总任务数应显示 50
      expect(screen.getByText('50')).toBeInTheDocument();
      // 活跃任务应显示 30
      expect(screen.getByText('30')).toBeInTheDocument();
      // 今日运行应显示 8
      expect(screen.getByText('8')).toBeInTheDocument();
    });

    it('should render pagination when total > limit', async () => {
      // 模拟第一页数据：total=25，pageSize=12 => 共3页
      vi.spyOn(useTasksHooks, 'useTasks').mockReturnValue({
        data: { data: mockTasks, total: 25, stats: { activeCount: 2, todayRuns: 0 } },
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      } as any);
      vi.spyOn(useTasksHooks, 'useRunTask').mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as any);
      vi.spyOn(useTasksHooks, 'useCreateTask').mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as any);
      vi.spyOn(useTasksHooks, 'useUpdateTask').mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as any);
      vi.spyOn(useTasksHooks, 'useUpdateTaskStatus').mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as any);
      vi.spyOn(useTasksHooks, 'useDeleteTask').mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as any);

      renderWithProviders(<Tasks />);

      // 总数 25 > pageSize 12，应当显示分页信息
      // 分页按钮使用图标（ChevronLeft/ChevronRight），通过文本内容验证分页导航区存在
      await waitFor(() => {
        expect(screen.getByText(/共 25 条/)).toBeInTheDocument();
      });
    });

    it('should disable next page button when on last page', () => {
      // total=2，pageSize 默认 20，第一页即最后一页
      vi.spyOn(useTasksHooks, 'useTasks').mockReturnValue({
        data: { data: mockTasks, total: 2, stats: { activeCount: 1, todayRuns: 0 } },
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      } as any);
      vi.spyOn(useTasksHooks, 'useRunTask').mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as any);
      vi.spyOn(useTasksHooks, 'useCreateTask').mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as any);
      vi.spyOn(useTasksHooks, 'useUpdateTask').mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as any);
      vi.spyOn(useTasksHooks, 'useUpdateTaskStatus').mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as any);
      vi.spyOn(useTasksHooks, 'useDeleteTask').mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as any);

      renderWithProviders(<Tasks />);

      const nextPageBtn = screen.queryByRole('button', { name: /下一页|next/i });
      // 总数 2 <= pageSize，下一页按钮应禁用或不存在
      if (nextPageBtn) {
        expect(nextPageBtn).toBeDisabled();
      } else {
        expect(nextPageBtn).toBeNull();
      }
    });
  });
});
