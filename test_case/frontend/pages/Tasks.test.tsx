import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Tasks from '@/pages/tasks/Tasks';
import * as useTasksHooks from '@/hooks/useTasks';
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

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    vi.clearAllMocks();
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
});
