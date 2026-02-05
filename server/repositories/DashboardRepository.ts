import { DataSource } from 'typeorm';
import { TestCase, TaskExecution, DailySummary, User } from '../entities/index';
import { BaseRepository } from './BaseRepository';
import logger from '../utils/logger';
import { LOG_CONTEXTS } from '../config/logging';

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
      totalCases: parseInt(stats.totalCases) || 0,
      todayRuns: parseInt(stats.todayRuns) || 0,
      todaySuccessRate,
      runningTasks: parseInt(stats.runningTasks) || 0,
    };
  }

  /**
   * 获取今日执行统计 (TypeORM QueryBuilder version)
   * 注意：此方法与 getTodayExecution() 功能重复，建议统一使用 getTodayExecution()
   * @deprecated 使用 getTodayExecution() 替代
   */
  async getTodayExecutions(): Promise<TodayExecution> {
    try {
      const result = await this.taskExecutionRepository.createQueryBuilder('execution')
        .select([
          'COUNT(*) as total',
          'SUM(execution.passedCases) as passed',
          'SUM(execution.failedCases) as failed',
          'SUM(execution.skippedCases) as skipped',
        ])
        .where('DATE(execution.startTime) = CURDATE()')
        .getRawOne();

      // ✅ Add null safety check - getRawOne() can return null
      const stats = result || {};

      logger.debug('Today execution stats retrieved (QueryBuilder)', {
        hasData: !!result,
        rawStats: stats,
        method: 'getTodayExecutions',
      }, LOG_CONTEXTS.DASHBOARD);

      return {
        total: parseInt(stats.total || '0') || 0,
        passed: parseInt(stats.passed || '0') || 0,
        failed: parseInt(stats.failed || '0') || 0,
        skipped: parseInt(stats.skipped || '0') || 0,
      };
    } catch (error) {
      logger.errorLog(error, 'Failed to get today execution stats (QueryBuilder)', {
        method: 'getTodayExecutions',
      });

      // Return safe default values on error
      return {
        total: 0,
        passed: 0,
        failed: 0,
        skipped: 0,
      };
    }
  }

  /**
   * 获取历史趋势数据 (T-1 口径)
   */
  async getTrendData(days: number = 30): Promise<DailySummaryData[]> {
    const startTime = Date.now();

    // 优先从汇总表获取数据
    const summaries = await this.dailySummaryRepository.createQueryBuilder('summary')
      .select([
        'DATE_FORMAT(summary.summaryDate, "%Y-%m-%d") as date',
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
      // 确保返回的数据量不超过请求的天数
      const result = summaries.length > days ? summaries.slice(-days) : summaries;
      
      const duration = Date.now() - startTime;
      logger.info('Trend data retrieved from daily summary table', {
        dataSource: 'summary_table',
        days,
        recordCount: result.length,
        originalCount: summaries.length,
        durationMs: duration,
      }, LOG_CONTEXTS.DASHBOARD);
      return result;
    }

    // 如果没有汇总数据，从执行记录实时计算
    logger.warn('Daily summary table empty, falling back to real-time calculation', {
      dataSource: 'fallback_calculation',
      days,
    }, LOG_CONTEXTS.DASHBOARD);

    const trendData = await this.taskExecutionRepository.query(`
      SELECT
        DATE_FORMAT(DATE(start_time), '%Y-%m-%d') as date,
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

    // 确保返回的数据量不超过请求的天数
    const finalResult = trendData.length > days ? trendData.slice(-days) : trendData;

    const duration = Date.now() - startTime;
    logger.info('Trend data calculated from execution records', {
      dataSource: 'fallback_calculation',
      days,
      recordCount: finalResult.length,
      originalCount: trendData.length,
      durationMs: duration,
    }, LOG_CONTEXTS.DASHBOARD);

    return finalResult;
  }

  /**
   * 获取最近测试运行
   */
  async getRecentRuns(limit: number = 10): Promise<RecentRun[]> {
    try {
      // 使用直接 SQL 查询，避免 QueryBuilder 字段映射问题
      const results = await this.taskExecutionRepository.query(`
        SELECT
          e.id,
          e.task_name as taskName,
          e.status,
          COALESCE(e.duration, 0) as duration,
          e.start_time as startTime,
          COALESCE(e.total_cases, 0) as totalCases,
          COALESCE(e.passed_cases, 0) as passedCases,
          COALESCE(e.failed_cases, 0) as failedCases,
          COALESCE(u.display_name, u.username, '系统') as executedBy,
          u.id as executedById
        FROM Auto_TestCaseTaskExecutions e
        LEFT JOIN Auto_Users u ON e.executed_by = u.id
        WHERE e.start_time IS NOT NULL
        ORDER BY e.start_time DESC
        LIMIT ?
      `, [limit]);

      // 确保返回数组，即使查询结果为空
      if (!results || !Array.isArray(results)) {
        console.warn('[DashboardRepository] getRecentRuns returned non-array result:', results);
        return [];
      }

      // 转换数据格式，确保所有字段都存在
      return results.map((r: any) => {
        const result: RecentRun = {
          id: parseInt(r.id) || 0,
          suiteName: r.taskName || '未命名任务',
          status: r.status || 'pending',
          duration: r.duration !== null && r.duration !== undefined ? parseInt(r.duration) : 0,
          startTime: r.startTime || undefined,
          totalCases: parseInt(r.totalCases) || 0,
          passedCases: parseInt(r.passedCases) || 0,
          failedCases: parseInt(r.failedCases) || 0,
          executedBy: r.executedBy || '系统',
          executedById: r.executedById ? parseInt(r.executedById) : undefined,
        };
        return result;
      });
    } catch (error) {
      console.error('[DashboardRepository] Failed to get recent runs:', error);
      // 返回空数组而不是抛出错误，避免影响整个仪表盘加载
      return [];
    }
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
    try {
      const result = await this.taskExecutionRepository.query(`
        SELECT
          COUNT(*) as total,
          COALESCE(SUM(passed_cases), 0) as passed,
          COALESCE(SUM(failed_cases), 0) as failed,
          COALESCE(SUM(skipped_cases), 0) as skipped
        FROM Auto_TestCaseTaskExecutions
        WHERE DATE(start_time) = CURDATE()
      `);

      // ✅ Add null safety check - provide default empty object if result is empty
      const stats = result[0] || {};

      logger.debug('Today execution stats retrieved', {
        hasData: !!result[0],
        resultLength: result.length,
        rawStats: stats,
      }, LOG_CONTEXTS.DASHBOARD);

      return {
        total: parseInt(stats.total || '0') || 0,
        passed: parseInt(stats.passed || '0') || 0,
        failed: parseInt(stats.failed || '0') || 0,
        skipped: parseInt(stats.skipped || '0') || 0,
      };
    } catch (error) {
      logger.errorLog(error, 'Failed to get today execution stats', {
        method: 'getTodayExecution',
      });

      // Return safe default values on error
      return {
        total: 0,
        passed: 0,
        failed: 0,
        skipped: 0,
      };
    }
  }

  /**
   * 刷新每日汇总数据（单日）
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

  /**
   * 检查缺失的日期汇总数据
   * 返回过去 N 天中没有汇总数据的日期列表
   * @param days 检查的天数
   * @returns 缺失日期列表
   */
  async getMissingDailySummaryDates(days: number): Promise<string[]> {
    // 1. 生成预期的日期列表（T-1 逻辑，不包含今天）
    const expectedDates: string[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let i = 1; i <= days; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      expectedDates.push(date.toISOString().split('T')[0]);
    }

    if (expectedDates.length === 0) {
      return [];
    }

    // 2. 查询已存在的汇总数据日期
    const existingSummaries = await this.dailySummaryRepository.query(`
      SELECT DATE_FORMAT(summary_date, "%Y-%m-%d") as date
      FROM Auto_TestCaseDailySummaries
      WHERE DATE(summary_date) >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
        AND DATE(summary_date) < CURDATE()
      ORDER BY summary_date DESC
    `, [days]);

    const existingDates = new Set(
      existingSummaries.map((s: any) => s.date)
    );

    // 3. 找出缺失的日期
    const missingDates = expectedDates.filter(date => !existingDates.has(date));

    logger.debug('Daily summary completeness check', {
      expectedCount: expectedDates.length,
      existingCount: existingDates.size,
      missingCount: missingDates.length,
      missingDates: missingDates.slice(0, 5), // 只显示前5个缺失日期
      days,
    }, LOG_CONTEXTS.DASHBOARD);

    return missingDates;
  }

  /**
   * 批量刷新每日汇总数据（多日）
   * 使用批量查询优化，减少数据库请求次数
   * 支持增量回填：仅处理指定的日期列表（如果为空，则处理全部）
   * @param days 要刷新的天数
   * @param onlyMissingDates 是否仅回填缺失日期（默认 false）
   * @returns 刷新成功的天数
   */
  async batchRefreshDailySummaries(
    days: number,
    onlyMissingDates: boolean = false
  ): Promise<{
    successCount: number;
    processedDates: string[];
    skippedDates?: string[];
  }> {
    const startTime = Date.now();

    // 0. 如果启用增量回填，先检查缺失日期
    let datesToProcess: string[] | null = null;
    if (onlyMissingDates) {
      datesToProcess = await this.getMissingDailySummaryDates(days);
      if (datesToProcess.length === 0) {
        logger.info('No missing daily summaries, skipping backfill', {
          days,
          durationMs: Date.now() - startTime,
        }, LOG_CONTEXTS.DASHBOARD);
        return {
          successCount: 0,
          processedDates: [],
          skippedDates: [],
        };
      }
    }

    // 1. 批量查询所有天的执行统计（按日期分组）
    const dailyStats = await this.taskExecutionRepository.query(`
      SELECT
        DATE(start_time) as summaryDate,
        COUNT(*) as totalExecutions,
        COALESCE(SUM(passed_cases + failed_cases + skipped_cases), 0) as totalCasesRun,
        COALESCE(SUM(passed_cases), 0) as passedCases,
        COALESCE(SUM(failed_cases), 0) as failedCases,
        COALESCE(SUM(skipped_cases), 0) as skippedCases,
        COALESCE(AVG(duration), 0) as avgDuration
      FROM Auto_TestCaseTaskExecutions
      WHERE DATE(start_time) >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
        AND DATE(start_time) < CURDATE()
      GROUP BY DATE(start_time)
      ORDER BY summaryDate DESC
    `, [days]);

    // 2. 查询活跃用例数（只需查询一次）
    const activeCases = await this.testCaseRepository.query(`
      SELECT COUNT(*) as count FROM Auto_TestCase WHERE enabled = 1
    `);
    const activeCasesCount = activeCases[0]?.count ?? 0;

    // 3. 构建所有日期列表（包括没有执行记录的日期）
    const today = new Date();
    const allDates: string[] = [];
    for (let i = 1; i <= days; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      allDates.push(date.toISOString().split('T')[0]);
    }

    // 4. 将查询结果映射到日期
    const statsMap = new Map<string, any>();
    dailyStats.forEach((stat: any) => {
      statsMap.set(stat.summaryDate, stat);
    });

    // 5. 批量构建插入数据（包括没有数据的日期，填充为0）
    const summariesData = allDates.map(date => {
      const stat = statsMap.get(date);
      const totalCasesRun = stat?.totalCasesRun ?? 0;
      const passedCases = stat?.passedCases ?? 0;
      const successRate = totalCasesRun > 0
        ? Math.round((passedCases / totalCasesRun) * 10000) / 100
        : 0;

      return {
        summaryDate: date,
        totalExecutions: stat?.totalExecutions ?? 0,
        totalCasesRun,
        passedCases,
        failedCases: stat?.failedCases ?? 0,
        skippedCases: stat?.skippedCases ?? 0,
        successRate,
        avgDuration: Math.round(stat?.avgDuration ?? 0),
        activeCasesCount,
      };
    });

    // 6. 批量插入/更新（分批处理，避免单次SQL过大）
    const batchSize = 50; // 每批最多50条
    let successCount = 0;
    const processedDates: string[] = [];

    for (let i = 0; i < summariesData.length; i += batchSize) {
      const batch = summariesData.slice(i, i + batchSize);

      // 构建批量插入SQL
      const values = batch.map(data =>
        `(?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).join(', ');

      const params = batch.flatMap(data => [
        data.summaryDate,
        data.totalExecutions,
        data.totalCasesRun,
        data.passedCases,
        data.failedCases,
        data.skippedCases,
        data.successRate,
        data.avgDuration,
        data.activeCasesCount,
      ]);

      await this.dailySummaryRepository.query(`
        INSERT INTO Auto_TestCaseDailySummaries (
          summary_date, total_executions, total_cases_run, passed_cases,
          failed_cases, skipped_cases, success_rate, avg_duration, active_cases_count
        ) VALUES ${values}
        ON DUPLICATE KEY UPDATE
          total_executions = VALUES(total_executions),
          total_cases_run = VALUES(total_cases_run),
          passed_cases = VALUES(passed_cases),
          failed_cases = VALUES(failed_cases),
          skipped_cases = VALUES(skipped_cases),
          success_rate = VALUES(success_rate),
          avg_duration = VALUES(avg_duration),
          active_cases_count = VALUES(active_cases_count)
      `, params);

      successCount += batch.length;
      processedDates.push(...batch.map(d => d.summaryDate));
    }

    const duration = Date.now() - startTime;
    const skippedCount = datesToProcess ? allDates.length - datesToProcess.length : 0;
    
    logger.info('Batch daily summaries refresh completed', {
      days,
      successCount,
      durationMs: duration,
      datesProcessed: processedDates.length,
      skippedCount: skippedCount > 0 ? skippedCount : undefined,
      queriesExecuted: datesToProcess ? 3 : Math.ceil(summariesData.length / batchSize) + 2, // 检查 + 两次查询 + 分批插入，或仅分批插入
      incrementalBackfill: onlyMissingDates,
    }, LOG_CONTEXTS.DASHBOARD);

    return {
      successCount,
      processedDates,
      skippedDates: datesToProcess && skippedCount > 0 ? allDates.filter(d => !datesToProcess!.includes(d)) : undefined,
    };
  }
}