export interface DashboardResponse {
  stats: {
    totalCases: number;
    todayRuns: number;
    todaySuccessRate: number | null;
    runningTasks: number;
  };
  todayExecution: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
  };
  trendData: Array<{
    date: string;
    totalExecutions: number;
    passedCases: number;
    failedCases: number;
    skippedCases: number;
    successRate: number;
  }>;
}

// RecentRun 类型定义（用于单独的 /api/dashboard/recent-runs 接口）
export interface RecentRun {
  id: number;
  suiteName: string;
  status: TestStatus;
  duration: number | null;
  startTime: string;
  totalCases: number;
  passedCases: number;
  failedCases: number;
  executedBy: string | null;
  executedById: number;
}

export type TestStatus = 'pending' | 'running' | 'success' | 'failed' | 'cancelled';

// Chart filter types for interactive features
export type TestStatusFilter = 'all' | 'passed' | 'failed' | 'skipped';

export interface ChartSegmentData {
  name: string;
  value: number;
  color: string;
  percentage: number;
  icon: string;
  status: TestStatusFilter;
}

export interface ChartFilterState {
  selectedStatus: TestStatusFilter;
  isActive: boolean;
}

export interface ChartInteractionHandlers {
  onSegmentClick: (status: TestStatusFilter) => void;
  onCenterClick: () => void;
  onFilterClear: () => void;
}