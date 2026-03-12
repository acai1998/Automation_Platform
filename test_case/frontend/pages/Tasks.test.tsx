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

      // 使用 getAllByText 因为错误消息可能在多个地方出现
      const errorElements = screen.getAllByText(errorMessage);
      expect(errorElements.length).toBeGreaterThan(0);
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
    it('should open create dialog when clicking create button', () => {
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

      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText(TASK_MESSAGES.FORM_CREATE_TITLE)).toBeInTheDocument();
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
