import { query, queryOne, getPool } from '../config/database.js';

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
  /**
   * 获取核心指标卡片数据
   */
  async getStats(): Promise<DashboardStats> {
    // 使用单次查询获取所有统计数据
    const stats = await queryOne<{
      totalCases: number;
      todayRuns: number;
      passedCases: number;
      totalCasesRun: number;
      runningTasks: number;
    }>(`
      SELECT
        COUNT(CASE WHEN tc.enabled = 1 THEN 1 END) as totalCases,
        COUNT(CASE WHEN DATE(tr.start_time) = CURDATE() THEN 1 END) as todayRuns,
        COALESCE(SUM(CASE WHEN DATE(tr.start_time) = CURDATE() THEN tr.passed_cases END), 0) as passedCases,
        COALESCE(SUM(CASE WHEN DATE(tr.start_time) = CURDATE() THEN tr.passed_cases + tr.failed_cases + tr.skipped_cases END), 0) as totalCasesRun,
        SUM(CASE WHEN tr.status = 'running' THEN 1 ELSE 0 END) as runningTasks
      FROM Auto_TestCase tc
      LEFT JOIN Auto_TestRun tr ON DATE(tr.start_time) = CURDATE()
      WHERE tc.enabled = 1 OR tr.id IS NOT NULL
    `);

    const todaySuccessRate = stats && stats.totalCasesRun > 0
      ? Math.round((stats.passedCases / stats.totalCasesRun) * 10000) / 100
      : null;

    return {
      totalCases: stats?.totalCases ?? 0,
      todayRuns: stats?.todayRuns ?? 0,
      todaySuccessRate,
      runningTasks: stats?.runningTasks ?? 0,
    };
  }

  /**
   * 获取今日执行统计
   */
  async getTodayExecution(): Promise<TodayExecution> {
    const stats = await queryOne<{
      total: number;
      passed: number;
      failed: number;
      skipped: number;
    }>(`
      SELECT
        COALESCE(SUM(passed_cases + failed_cases + skipped_cases), 0) as total,
        COALESCE(SUM(passed_cases), 0) as passed,
        COALESCE(SUM(failed_cases), 0) as failed,
        COALESCE(SUM(skipped_cases), 0) as skipped
      FROM Auto_TestRun
      WHERE DATE(start_time) = CURDATE()
    `);

    return {
      total: stats?.total || 0,
      passed: stats?.passed || 0,
      failed: stats?.failed || 0,
      skipped: stats?.skipped || 0,
    };
  }

  /**
   * 获取历史趋势数据
   * 采用 T-1 数据口径：不展示当天数据，最新可展示日期 = 当前日期 - 1 天
   */
  async getTrendData(days: number = 30): Promise<DailySummary[]> {
    // 优先从 Auto_TestCaseDailySummaries 表获取（T-1 口径）
    const summaries = await query<DailySummary[]>(`
      SELECT
        summary_date as date,
        total_executions as totalExecutions,
        passed_cases as passedCases,
        failed_cases as failedCases,
        skipped_cases as skippedCases,
        success_rate as successRate
      FROM Auto_TestCaseDailySummaries
      WHERE summary_date >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
        AND summary_date < CURDATE()
      ORDER BY summary_date ASC
    `, [days]);

    // 确保返回数组
    const summaryArray = Array.isArray(summaries) ? summaries : [];
    if (summaryArray.length > 0) {
      return summaryArray;
    }

    // 如果没有汇总数据，从执行记录实时计算（T-1 口径）
    const trendData = await query<DailySummary[]>(`
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

    // 确保返回数组
    return Array.isArray(trendData) ? trendData : [];
  }

  /**
   * 获取环比分析数据
   */
  async getComparison(days: number = 30): Promise<ComparisonData> {
    // 当前周期数据
    const current = await queryOne<{
      runs: number;
      passed: number;
      failed: number;
      total: number;
    }>(`
      SELECT
        COUNT(*) as runs,
        COALESCE(SUM(passed_cases), 0) as passed,
        COALESCE(SUM(failed_cases), 0) as failed,
        COALESCE(SUM(passed_cases + failed_cases + skipped_cases), 0) as total
      FROM Auto_TestCaseTaskExecutions
      WHERE DATE(start_time) >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
    `, [days]);

    // 上一周期数据
    const previous = await queryOne<{
      runs: number;
      passed: number;
      failed: number;
      total: number;
    }>(`
      SELECT
        COUNT(*) as runs,
        COALESCE(SUM(passed_cases), 0) as passed,
        COALESCE(SUM(failed_cases), 0) as failed,
        COALESCE(SUM(passed_cases + failed_cases + skipped_cases), 0) as total
      FROM Auto_TestCaseTaskExecutions
      WHERE DATE(start_time) >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
        AND DATE(start_time) < DATE_SUB(CURDATE(), INTERVAL ? DAY)
    `, [days * 2, days]);

    // 计算环比
    const runsComparison = previous && previous.runs > 0
      ? Math.round(((current?.runs ?? 0) - previous.runs) / previous.runs * 10000) / 100
      : null;

    const currentSuccessRate = current && current.total > 0 ? current.passed / current.total : 0;
    const previousSuccessRate = previous && previous.total > 0 ? previous.passed / previous.total : 0;
    const successRateComparison = previousSuccessRate > 0
      ? Math.round((currentSuccessRate - previousSuccessRate) / previousSuccessRate * 10000) / 100
      : null;

    const failureComparison = previous && previous.failed > 0
      ? Math.round(((current?.failed ?? 0) - previous.failed) / previous.failed * 10000) / 100
      : null;

    return {
      runsComparison,
      successRateComparison,
      failureComparison,
    };
  }

  /**
   * 获取最近测试运行
   */
  async getRecentRuns(limit: number = 10) {
    try {
      return query(`
        SELECT
          r.id,
          r.task_name as suiteName,
          r.status,
          r.duration * 1000 as duration,
          r.start_time as startTime,
          r.total_cases as totalCases,
          r.passed_cases as passedCases,
          r.failed_cases as failedCases,
          u.display_name as executedBy,
          u.id as executedById
        FROM Auto_TestCaseTaskExecutions r
        LEFT JOIN Auto_Users u ON r.executed_by = u.id
        ORDER BY r.start_time DESC
        LIMIT ?
      `, [limit]);
    } catch (error: unknown) {
      console.error('DashboardService.getRecentRuns failed:', {
        error: error instanceof Error ? error.message : error,
        stack: error instanceof Error ? error.stack : undefined
      });
      throw error;
    }
  }

  /**
   * 刷新每日汇总数据
   */
  async refreshDailySummary(date?: string) {
    const targetDate = date || new Date().toISOString().split('T')[0];

    // 计算当日统计（使用 Auto_TestRun 表）
    const stats = await queryOne<{
      totalExecutions: number;
      totalCasesRun: number;
      passedCases: number;
      failedCases: number;
      skippedCases: number;
      avgDuration: number;
    }>(`
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

    const activeCases = await queryOne<{ count: number }>(`
      SELECT COUNT(*) as count FROM Auto_TestCase WHERE enabled = 1
    `);

    const totalCasesRun = stats?.totalCasesRun ?? 0;
    const passedCases = stats?.passedCases ?? 0;
    const successRate = totalCasesRun > 0
      ? Math.round(passedCases / totalCasesRun * 10000) / 100
      : 0;

    // 插入或更新汇总记录 (MariaDB 使用 ON DUPLICATE KEY UPDATE)
    const pool = getPool();
    await pool.execute(`
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
      targetDate,
      stats?.totalExecutions ?? 0,
      totalCasesRun,
      passedCases,
      stats?.failedCases ?? 0,
      stats?.skippedCases ?? 0,
      successRate,
      Math.round(stats?.avgDuration ?? 0),
      activeCases?.count ?? 0,
    ]);
  }
}

export const dashboardService = new DashboardService();