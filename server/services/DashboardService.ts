import { getDatabase } from '../db/index.js';

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
  getStats(): DashboardStats {
    const db = getDatabase();

    // 自动化用例总数
    const totalCases = db.prepare(`
      SELECT COUNT(*) as count FROM test_cases WHERE status = 'active'
    `).get() as { count: number };

    // 今日执行总次数
    const todayRuns = db.prepare(`
      SELECT COUNT(*) as count FROM task_executions
      WHERE DATE(start_time) = DATE('now')
    `).get() as { count: number };

    // 今日成功率
    const todayStats = db.prepare(`
      SELECT
        SUM(passed_cases) as passed,
        SUM(passed_cases + failed_cases + skipped_cases) as total
      FROM task_executions
      WHERE DATE(start_time) = DATE('now')
    `).get() as { passed: number; total: number };

    const todaySuccessRate = todayStats.total > 0
      ? Math.round((todayStats.passed / todayStats.total) * 10000) / 100
      : null;

    // 当前运行中任务
    const runningTasks = db.prepare(`
      SELECT COUNT(*) as count FROM task_executions WHERE status = 'running'
    `).get() as { count: number };

    return {
      totalCases: totalCases.count,
      todayRuns: todayRuns.count,
      todaySuccessRate,
      runningTasks: runningTasks.count,
    };
  }

  /**
   * 获取今日执行统计
   */
  getTodayExecution(): TodayExecution {
    const db = getDatabase();

    const stats = db.prepare(`
      SELECT
        SUM(passed_cases + failed_cases + skipped_cases) as total,
        SUM(passed_cases) as passed,
        SUM(failed_cases) as failed,
        SUM(skipped_cases) as skipped
      FROM task_executions
      WHERE DATE(start_time) = DATE('now')
    `).get() as any;

    return {
      total: stats.total || 0,
      passed: stats.passed || 0,
      failed: stats.failed || 0,
      skipped: stats.skipped || 0,
    };
  }

  /**
   * 获取历史趋势数据
   */
  getTrendData(days: number = 30): DailySummary[] {
    const db = getDatabase();

    // 优先从 daily_summaries 表获取
    const summaries = db.prepare(`
      SELECT
        summary_date as date,
        total_executions as totalExecutions,
        passed_cases as passedCases,
        failed_cases as failedCases,
        skipped_cases as skippedCases,
        success_rate as successRate
      FROM daily_summaries
      WHERE summary_date >= DATE('now', '-' || ? || ' days')
      ORDER BY summary_date ASC
    `).all(days) as DailySummary[];

    if (summaries.length > 0) {
      return summaries;
    }

    // 如果没有汇总数据，从执行记录实时计算
    return db.prepare(`
      SELECT
        DATE(start_time) as date,
        COUNT(*) as totalExecutions,
        SUM(passed_cases) as passedCases,
        SUM(failed_cases) as failedCases,
        SUM(skipped_cases) as skippedCases,
        ROUND(SUM(passed_cases) * 100.0 / NULLIF(SUM(passed_cases + failed_cases + skipped_cases), 0), 2) as successRate
      FROM task_executions
      WHERE DATE(start_time) >= DATE('now', '-' || ? || ' days')
      GROUP BY DATE(start_time)
      ORDER BY date ASC
    `).all(days) as DailySummary[];
  }

  /**
   * 获取环比分析数据
   */
  getComparison(days: number = 30): ComparisonData {
    const db = getDatabase();

    // 当前周期数据
    const current = db.prepare(`
      SELECT
        COUNT(*) as runs,
        SUM(passed_cases) as passed,
        SUM(failed_cases) as failed,
        SUM(passed_cases + failed_cases + skipped_cases) as total
      FROM task_executions
      WHERE DATE(start_time) >= DATE('now', '-' || ? || ' days')
    `).get(days) as any;

    // 上一周期数据
    const previous = db.prepare(`
      SELECT
        COUNT(*) as runs,
        SUM(passed_cases) as passed,
        SUM(failed_cases) as failed,
        SUM(passed_cases + failed_cases + skipped_cases) as total
      FROM task_executions
      WHERE DATE(start_time) >= DATE('now', '-' || ? || ' days')
        AND DATE(start_time) < DATE('now', '-' || ? || ' days')
    `).get(days * 2, days) as any;

    // 计算环比
    const runsComparison = previous.runs > 0
      ? Math.round((current.runs - previous.runs) / previous.runs * 10000) / 100
      : null;

    const currentSuccessRate = current.total > 0 ? current.passed / current.total : 0;
    const previousSuccessRate = previous.total > 0 ? previous.passed / previous.total : 0;
    const successRateComparison = previousSuccessRate > 0
      ? Math.round((currentSuccessRate - previousSuccessRate) / previousSuccessRate * 10000) / 100
      : null;

    const failureComparison = previous.failed > 0
      ? Math.round((current.failed - previous.failed) / previous.failed * 10000) / 100
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
  getRecentRuns(limit: number = 10) {
    const db = getDatabase();

    return db.prepare(`
      SELECT
        te.id,
        te.task_name as suiteName,
        te.status,
        te.duration,
        te.start_time as startTime,
        te.total_cases as totalCases,
        te.passed_cases as passedCases,
        te.failed_cases as failedCases,
        u.display_name as executedBy,
        u.id as executedById
      FROM task_executions te
      LEFT JOIN users u ON te.executed_by = u.id
      ORDER BY te.start_time DESC
      LIMIT ?
    `).all(limit);
  }

  /**
   * 刷新每日汇总数据
   */
  refreshDailySummary(date?: string) {
    const db = getDatabase();
    const targetDate = date || new Date().toISOString().split('T')[0];

    // 计算当日统计
    const stats = db.prepare(`
      SELECT
        COUNT(*) as totalExecutions,
        SUM(passed_cases + failed_cases + skipped_cases) as totalCasesRun,
        SUM(passed_cases) as passedCases,
        SUM(failed_cases) as failedCases,
        SUM(skipped_cases) as skippedCases,
        AVG(duration) as avgDuration
      FROM task_executions
      WHERE DATE(start_time) = ?
    `).get(targetDate) as any;

    const activeCases = db.prepare(`
      SELECT COUNT(*) as count FROM test_cases WHERE status = 'active'
    `).get() as { count: number };

    const successRate = stats.totalCasesRun > 0
      ? Math.round(stats.passedCases / stats.totalCasesRun * 10000) / 100
      : 0;

    // 插入或更新汇总记录
    db.prepare(`
      INSERT INTO daily_summaries (
        summary_date, total_executions, total_cases_run, passed_cases,
        failed_cases, skipped_cases, success_rate, avg_duration, active_cases_count
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(summary_date) DO UPDATE SET
        total_executions = excluded.total_executions,
        total_cases_run = excluded.total_cases_run,
        passed_cases = excluded.passed_cases,
        failed_cases = excluded.failed_cases,
        skipped_cases = excluded.skipped_cases,
        success_rate = excluded.success_rate,
        avg_duration = excluded.avg_duration,
        active_cases_count = excluded.active_cases_count,
        updated_at = CURRENT_TIMESTAMP
    `).run(
      targetDate,
      stats.totalExecutions || 0,
      stats.totalCasesRun || 0,
      stats.passedCases || 0,
      stats.failedCases || 0,
      stats.skippedCases || 0,
      successRate,
      Math.round(stats.avgDuration) || 0,
      activeCases.count
    );
  }
}

export const dashboardService = new DashboardService();
