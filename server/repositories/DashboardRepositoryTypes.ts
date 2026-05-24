export interface DashboardStats {
  totalCases: number;
  todayRuns: number;
  todaySuccessRate: number;
  runningTasks: number;
}

export interface TodayExecution {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
}

export interface DailySummaryData {
  date: string;
  totalExecutions: number;
  passedCases: number;
  failedCases: number;
  skippedCases: number;
  successRate: number;
}

export interface RecentRun {
  id: number;
  suiteName?: string;
  status: string;
  duration: number;
  startTime?: Date;
  totalCases: number;
  passedCases: number;
  failedCases: number;
  executedBy?: string;
  executedById?: number;
}

export interface TrendDebugSourceStats {
  source: 'daily_summary' | 'test_run' | 'task_execution';
  rowCount: number;
  daysWithData: number;
  totalExecutions: number;
  passedCases: number;
  failedCases: number;
  skippedCases: number;
  latestDate: string | null;
}

export interface TrendDebugInfo {
  days: number;
  dateRange: {
    startDate: string;
    endDate: string;
  };
  sources: TrendDebugSourceStats[];
}

export interface ExecutionStats {
  total: string;
  passed: string;
  failed: string;
  skipped: string;
}

export interface SummaryStats {
  totalExecutions: string;
  totalCasesRun: string;
  passedCases: string;
  failedCases: string;
  skippedCases: string;
  avgDuration: string;
}

export interface ActiveCasesStats {
  count: string;
}

export interface DateStats {
  summaryDate: string;
  totalExecutions: string;
  totalCasesRun: string;
  passedCases: string;
  failedCases: string;
  skippedCases: string;
  avgDuration: string;
}
