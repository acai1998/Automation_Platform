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
  recentRuns: Array<{
    id: number;
    suiteName: string;
    status: 'pending' | 'running' | 'success' | 'failed' | 'cancelled';
    duration: number | null;
    startTime: string;
    totalCases: number;
    passedCases: number;
    failedCases: number;
    executedBy: string;
    executedById: number;
  }>;
}