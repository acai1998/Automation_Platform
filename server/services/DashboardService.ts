import { DashboardRepository } from '../repositories/DashboardRepository';
import { AppDataSource } from '../config/database';

export interface DashboardStats {
  totalCases: number;
  todayRuns: number;
  todaySuccessRate: number | null;
  runningTasks: number;
}

export interface TodayExecution {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
}

export interface DailySummary {
  date: string;
  totalExecutions: number;
  passedCases: number;
  failedCases: number;
  skippedCases: number;
  successRate: number;
}

export interface ComparisonData {
  runsComparison: number | null;
  successRateComparison: number | null;
  failureComparison: number | null;
}

/**
 * Dashboard 数据服务
 */
export class DashboardService {
  private dashboardRepository: DashboardRepository;

  constructor() {
    this.dashboardRepository = new DashboardRepository(AppDataSource);
  }
  /**
   * 获取核心指标卡片数据
   */
  async getStats(): Promise<DashboardStats> {
    return this.dashboardRepository.getStats();
  }

  /**
   * 获取今日执行统计
   */
  async getTodayExecution(): Promise<TodayExecution> {
    return this.dashboardRepository.getTodayExecution();
  }

  /**
   * 获取历史趋势数据
   * 采用 T-1 数据口径：不展示当天数据，最新可展示日期 = 当前日期 - 1 天
   */
  async getTrendData(days: number = 30): Promise<DailySummary[]> {
    return this.dashboardRepository.getTrendData(days);
  }

  /**
   * 获取环比分析数据
   */
  async getComparison(days: number = 30): Promise<ComparisonData> {
    return this.dashboardRepository.getComparison(days);
  }

  /**
   * 获取最近测试运行
   */
  async getRecentRuns(limit: number = 10) {
    return this.dashboardRepository.getRecentRuns(limit);
  }

  /**
   * 刷新每日汇总数据（单日）
   */
  async refreshDailySummary(date?: string) {
    return this.dashboardRepository.refreshDailySummary(date);
  }

  /**
   * 批量刷新每日汇总数据（多日）
   * 使用批量查询优化，减少数据库请求次数
   */
  async batchRefreshDailySummaries(days: number) {
    return this.dashboardRepository.batchRefreshDailySummaries(days);
  }
}

export const dashboardService = new DashboardService();