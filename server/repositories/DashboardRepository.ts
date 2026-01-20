import { DataSource } from 'typeorm';
import { TestCase, TaskExecution, DailySummary, User } from '../entities/index';
import { BaseRepository } from './BaseRepository';

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

/**
 * 仪表盘数据 Repository
 */
export class DashboardRepository extends BaseRepository<any> {
  private testCaseRepository: any;
  private taskExecutionRepository: any;
  private dailySummaryRepository: any;
  private userRepository: any;

  constructor(dataSource: DataSource) {
    super(dataSource, TestCase);
    this.testCaseRepository = dataSource.getRepository(TestCase);
    this.taskExecutionRepository = dataSource.getRepository(TaskExecution);
    this.dailySummaryRepository = dataSource.getRepository(DailySummary);
    this.userRepository = dataSource.getRepository(User);
  }

  /**
   * 获取仪表盘统计数据
   */
  async getStats(): Promise<DashboardStats> {
    const result = await this.testCaseRepository.query(`
      SELECT
        COUNT(CASE WHEN tc.enabled = 1 THEN 1 END) as totalCases,
        COUNT(CASE WHEN DATE(tr.start_time) = CURDATE() THEN 1 END) as todayRuns,
        COALESCE(SUM(CASE WHEN DATE(tr.start_time) = CURDATE() THEN tr.passed_cases END), 0) as passedCases,
        COALESCE(SUM(CASE WHEN DATE(tr.start_time) = CURDATE() THEN tr.passed_cases + tr.failed_cases + tr.skipped_cases END), 0) as totalCasesRun,
        SUM(CASE WHEN tr.status = 'running' THEN 1 ELSE 0 END) as runningTasks
      FROM Auto_TestCase tc
      LEFT JOIN Auto_TestCaseTaskExecutions tr ON DATE(tr.start_time) = CURDATE()
      WHERE tc.enabled = 1 OR tr.id IS NOT NULL
    `);

    const stats = result[0];
    const todaySuccessRate = stats.totalCasesRun > 0
      ? Math.round((stats.passedCases / stats.totalCasesRun) * 10000) / 100
      : null;

    return {
      totalCases: stats.totalCases || 0,
      todayRuns: stats.todayRuns || 0,
      todaySuccessRate,
      runningTasks: stats.runningTasks || 0,
    };
  }

  /**
   * 获取今日执行统计
   */
  async getTodayExecutions(): Promise<TodayExecution> {
    const result = await this.taskExecutionRepository.createQueryBuilder('execution')
      .select([
        'COUNT(*) as total',
        'SUM(execution.passedCases) as passed',
        'SUM(execution.failedCases) as failed',
        'SUM(execution.skippedCases) as skipped',
      ])
      .where('DATE(execution.startTime) = CURDATE()')
      .getRawOne();

    return {
      total: parseInt(result.total) || 0,
      passed: parseInt(result.passed) || 0,
      failed: parseInt(result.failed) || 0,
      skipped: parseInt(result.skipped) || 0,
    };
  }

  /**
   * 获取历史趋势数据 (T-1 口径)
   */
  async getTrendData(days: number = 30): Promise<DailySummaryData[]> {
    // 优先从汇总表获取数据
    const summaries = await this.dailySummaryRepository.createQueryBuilder('summary')
      .select([
        'summary.summaryDate as date',
        'summary.totalExecutions',
        'summary.passedCases',
        'summary.failedCases',
        'summary.skippedCases',
        'summary.successRate',
      ])
      .where('summary.summaryDate >= DATE_SUB(CURDATE(), INTERVAL :days DAY)', { days })
      .andWhere('summary.summaryDate < CURDATE()')
      .orderBy('summary.summaryDate', 'ASC')
      .getRawMany();

    if (summaries.length > 0) {
      return summaries;
    }

    // 如果没有汇总数据，从执行记录实时计算
    const trendData = await this.taskExecutionRepository.query(`
      SELECT
        DATE(start_time) as date,
        COUNT(*) as totalExecutions,
        COALESCE(SUM(passed_cases), 0) as passedCases,
        COALESCE(SUM(failed_cases), 0) as failedCases,
        COALESCE(SUM(skipped_cases), 0) as skippedCases,
        ROUND(SUM(passed_cases) * 100.0 / NULLIF(SUM(passed_cases + failed_cases + skipped_cases), 0), 2) as successRate
      FROM Auto_TestCaseTaskExecutions
      WHERE DATE(start_time) >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
        AND DATE(start_time) < CURDATE()
      GROUP BY DATE(start_time)
      ORDER BY date ASC
    `, [days]);

    return trendData;
  }

  /**
   * 获取最近测试运行
   */
  async getRecentRuns(limit: number = 10): Promise<RecentRun[]> {
    return this.taskExecutionRepository.createQueryBuilder('execution')
      .leftJoin('execution.executedByUser', 'user')
      .select([
        'execution.id',
        'execution.taskName',
        'execution.status',
        'execution.duration',
        'execution.startTime',
        'execution.totalCases',
        'execution.passedCases',
        'execution.failedCases',
        'user.displayName',
        'user.username',
        'user.id',
      ])
      .orderBy('execution.startTime', 'DESC')
      .limit(limit)
      .getRawMany()
      .then((results: any[]) => results.map((r: any) => ({
        id: r.execution_id,
        suiteName: r.execution_taskName,
        status: r.execution_status,
        duration: r.execution_duration,
        startTime: r.execution_startTime,
        totalCases: r.execution_totalCases,
        passedCases: r.execution_passedCases,
        failedCases: r.execution_failedCases,
        executedBy: r.user_displayName || r.user_username,
        executedById: r.user_id,
      })));
  }

  /**
   * 保存每日汇总数据
   */
  async saveDailySummary(summaryData: {
    summaryDate: string;
    totalExecutions: number;
    totalCasesRun: number;
    passedCases: number;
    failedCases: number;
    skippedCases: number;
    successRate: number;
    avgDuration: number;
    activeCasesCount: number;
  }): Promise<void> {
    await this.dailySummaryRepository.query(`
      INSERT INTO Auto_TestCaseDailySummaries (
        summary_date, total_executions, total_cases_run, passed_cases,
        failed_cases, skipped_cases, success_rate, avg_duration, active_cases_count
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        total_executions = VALUES(total_executions),
        total_cases_run = VALUES(total_cases_run),
        passed_cases = VALUES(passed_cases),
        failed_cases = VALUES(failed_cases),
        skipped_cases = VALUES(skipped_cases),
        success_rate = VALUES(success_rate),
        avg_duration = VALUES(avg_duration),
        active_cases_count = VALUES(active_cases_count)
    `, [
      summaryData.summaryDate,
      summaryData.totalExecutions,
      summaryData.totalCasesRun,
      summaryData.passedCases,
      summaryData.failedCases,
      summaryData.skippedCases,
      summaryData.successRate,
      summaryData.avgDuration,
      summaryData.activeCasesCount,
    ]);
  }

  /**
   * 获取环比分析数据
   */
  async getComparison(days: number = 30): Promise<{
    runsComparison: number | null;
    successRateComparison: number | null;
    failureComparison: number | null;
  }> {
    // 当前周期数据
    const current = await this.taskExecutionRepository.query(`
      SELECT
        COUNT(*) as runs,
        COALESCE(SUM(passed_cases), 0) as passed,
        COALESCE(SUM(failed_cases), 0) as failed,
        COALESCE(SUM(passed_cases + failed_cases + skipped_cases), 0) as total
      FROM Auto_TestCaseTaskExecutions
      WHERE DATE(start_time) >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
    `, [days]);

    // 上一周期数据
    const previous = await this.taskExecutionRepository.query(`
      SELECT
        COUNT(*) as runs,
        COALESCE(SUM(passed_cases), 0) as passed,
        COALESCE(SUM(failed_cases), 0) as failed,
        COALESCE(SUM(passed_cases + failed_cases + skipped_cases), 0) as total
      FROM Auto_TestCaseTaskExecutions
      WHERE DATE(start_time) >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
        AND DATE(start_time) < DATE_SUB(CURDATE(), INTERVAL ? DAY)
    `, [days * 2, days]);

    const currentData = current[0];
    const previousData = previous[0];

    // 计算环比
    const runsComparison = previousData && previousData.runs > 0
      ? Math.round(((currentData.runs - previousData.runs) / previousData.runs) * 10000) / 100
      : null;

    const currentSuccessRate = currentData.total > 0
      ? (currentData.passed / currentData.total) * 100
      : 0;
    const previousSuccessRate = previousData && previousData.total > 0
      ? (previousData.passed / previousData.total) * 100
      : 0;

    const successRateComparison = previousData && previousData.total > 0
      ? Math.round((currentSuccessRate - previousSuccessRate) * 100) / 100
      : null;

    const failureComparison = previousData && previousData.failed > 0
      ? Math.round(((currentData.failed - previousData.failed) / previousData.failed) * 10000) / 100
      : null;

    return {
      runsComparison,
      successRateComparison,
      failureComparison,
    };
  }

  /**
   * 获取今日执行统计
   */
  async getTodayExecution(): Promise<TodayExecution> {
    const result = await this.taskExecutionRepository.query(`
      SELECT
        COUNT(*) as total,
        COALESCE(SUM(passed_cases), 0) as passed,
        COALESCE(SUM(failed_cases), 0) as failed,
        COALESCE(SUM(skipped_cases), 0) as skipped
      FROM Auto_TestCaseTaskExecutions
      WHERE DATE(start_time) = CURDATE()
    `);

    const stats = result[0];
    return {
      total: stats.total || 0,
      passed: stats.passed || 0,
      failed: stats.failed || 0,
      skipped: stats.skipped || 0,
    };
  }

  /**
   * 刷新每日汇总数据
   */
  async refreshDailySummary(date?: string): Promise<void> {
    const targetDate = date || new Date().toISOString().split('T')[0];

    // 计算当日统计
    const stats = await this.taskExecutionRepository.query(`
      SELECT
        COUNT(*) as totalExecutions,
        COALESCE(SUM(passed_cases + failed_cases + skipped_cases), 0) as totalCasesRun,
        COALESCE(SUM(passed_cases), 0) as passedCases,
        COALESCE(SUM(failed_cases), 0) as failedCases,
        COALESCE(SUM(skipped_cases), 0) as skippedCases,
        COALESCE(AVG(duration), 0) as avgDuration
      FROM Auto_TestCaseTaskExecutions
      WHERE DATE(start_time) = ?
    `, [targetDate]);

    const activeCases = await this.testCaseRepository.query(`
      SELECT COUNT(*) as count FROM Auto_TestCase WHERE enabled = 1
    `);

    const totalCasesRun = stats[0]?.totalCasesRun ?? 0;
    const passedCases = stats[0]?.passedCases ?? 0;
    const failedCases = stats[0]?.failedCases ?? 0;
    const skippedCases = stats[0]?.skippedCases ?? 0;
    const avgDuration = stats[0]?.avgDuration ?? 0;

    const successRate = totalCasesRun > 0
      ? Math.round((passedCases / totalCasesRun) * 10000) / 100
      : 0;

    await this.saveDailySummary({
      summaryDate: targetDate,
      totalExecutions: stats[0]?.totalExecutions ?? 0,
      totalCasesRun,
      passedCases,
      failedCases,
      skippedCases,
      successRate,
      avgDuration: Math.round(avgDuration),
      activeCasesCount: activeCases[0]?.count ?? 0,
    });
  }
}