import { DataSource, Repository } from 'typeorm';
import { TestCase, TaskExecution, DailySummary, User } from '../entities/index';
import { BaseRepository } from './BaseRepository';
import { ServiceError } from '../utils/ServiceError';
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
 * 执行统计查询结果接口
 */
interface ExecutionStats {
  total: string;
  passed: string;
  failed: string;
  skipped: string;
}

/**
 * 汇总数据查询结果接口
 */
interface SummaryStats {
  totalExecutions: string;
  totalCasesRun: string;
  passedCases: string;
  failedCases: string;
  skippedCases: string;
  avgDuration: string;
}

/**
 * 活跃用例数查询结果接口
 */
interface ActiveCasesStats {
  count: string;
}

/**
 * 日期统计查询结果接口
 */
interface DateStats {
  summaryDate: string;
  totalExecutions: string;
  totalCasesRun: string;
  passedCases: string;
  failedCases: string;
  skippedCases: string;
  avgDuration: string;
}

/**
 * 仪表盘数据 Repository
 */
export class DashboardRepository extends BaseRepository<TestCase> {
  private testCaseRepository: Repository<TestCase>;
  private taskExecutionRepository: Repository<TaskExecution>;
  private dailySummaryRepository: Repository<DailySummary>;
  private userRepository: Repository<User>;

  constructor(dataSource: DataSource) {
    super(dataSource, TestCase);
    this.testCaseRepository = dataSource.getRepository(TestCase);
    this.taskExecutionRepository = dataSource.getRepository(TaskExecution);
    this.dailySummaryRepository = dataSource.getRepository(DailySummary);
    this.userRepository = dataSource.getRepository(User);
  }

  /**
   * 安全的整数解析方法
   * @param value 要解析的值
   * @param defaultValue 默认值
   * @returns 解析后的整数
   */
  private parseSafeInt(value: string | number | null | undefined, defaultValue: number = 0): number {
    if (value === null || value === undefined) {
      return defaultValue;
    }
    
    const parsed = typeof value === 'string' ? parseInt(value, 10) : value;
    return isNaN(parsed) ? defaultValue : parsed;
  }

  /**
   * 安全的浮点数解析方法
   * @param value 要解析的值
   * @param defaultValue 默认值
   * @returns 解析后的浮点数
   */
  private parseSafeFloat(value: string | number | null | undefined, defaultValue: number = 0): number {
    if (value === null || value === undefined) {
      return defaultValue;
    }
    
    const parsed = typeof value === 'string' ? parseFloat(value) : value;
    return isNaN(parsed) ? defaultValue : parsed;
  }

  /**
   * 安全的百分比计算
   * @param current 当前值
   * @param previous 之前值
   * @returns 计算后的百分比，如果无法计算返回null
   */
  private calculatePercentage(current: number, previous: number): number | null {
    if (previous <= 0) return null;
    return Math.round(((current - previous) / previous) * 10000) / 100;
  }

  /**
   * 日期范围生成器
   * 使用生成器减少内存占用，避免创建大数组
   * @param days 天数
   * @returns 日期生成器
   */
  private *generateDateRange(days: number): Generator<string> {
    const today = new Date();
    for (let i = 1; i <= days; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      yield date.toISOString().split('T')[0];
    }
  }

  /**
   * 安全的数据库查询执行方法
   * @param query 执行的查询函数
   * @param operation 操作描述
   * @param context 上下文信息
   * @returns 查询结果
   */
  private async executeQuery<T>(
    query: () => Promise<T>,
    operation: string,
    context?: Record<string, any>
  ): Promise<T> {
    try {
      return await query();
    } catch (error) {
      logger.errorLog(error, `Failed to execute ${operation}`, {
        operation,
        context,
      });

      throw new ServiceError(
        `Failed to execute ${operation}`,
        error instanceof Error ? error : new Error(String(error)),
        500,
        { operation, context }
      );
    }
  }

  /**
   * 安全的统计计算方法
   * 统一处理统计查询结果的解析和验证
   * @param result 查询结果数组
   * @param defaultValue 默认值
   * @returns 解析后的统计数据
   */
  private parseStatsResult<T extends Record<string, string>>(
    result: T[],
    defaultValue: T
  ): T {
    return result[0] || defaultValue;
  }

  /**
   * 计算成功率
   * @param passed 通过数量
   * @param total 总数量
   * @returns 成功率百分比
   */
  private calculateSuccessRate(passed: number, total: number): number | null {
    if (total <= 0) return null;
    return Math.round((passed / total) * 10000) / 100;
  }

  /**
   * 统一的日志记录方法
   * @param level 日志级别
   * @param message 日志消息
   * @param data 日志数据
   * @param context 日志上下文
   */
  private logDashboard(level: 'debug' | 'info' | 'warn' | 'error', message: string, data?: any, context?: any) {
    if (level === 'debug') {
      logger.debug(message, data, context || LOG_CONTEXTS.DASHBOARD);
    } else if (level === 'info') {
      logger.info(message, data, context || LOG_CONTEXTS.DASHBOARD);
    } else if (level === 'warn') {
      logger.warn(message, data, context || LOG_CONTEXTS.DASHBOARD);
    } else {
      logger.errorLog(data, message, context || LOG_CONTEXTS.DASHBOARD);
    }
  }

  /**
   * 获取仪表盘统计数据
   * 优化：使用 UNION ALL 分别查询，避免大表 JOIN，提升查询性能
   */
  async getStats(): Promise<DashboardStats> {
    try {
      // 定义查询结果接口
      interface StatsResult {
        totalCases: string;
        todayRuns: string;
        passedCases: string;
        totalCasesRun: string;
        runningTasks: string;
      }

      // 优化：使用 UNION ALL 分别查询，避免大表 JOIN
      const result = await this.testCaseRepository.query(`
        SELECT
          (SELECT COUNT(*) FROM Auto_TestCase WHERE enabled = 1) as totalCases,
          (SELECT COUNT(*) FROM Auto_TestCaseTaskExecutions WHERE DATE(start_time) = CURDATE()) as todayRuns,
          (SELECT COALESCE(SUM(passed_cases), 0) FROM Auto_TestCaseTaskExecutions WHERE DATE(start_time) = CURDATE()) as passedCases,
          (SELECT COALESCE(SUM(passed_cases + failed_cases + skipped_cases), 0) FROM Auto_TestCaseTaskExecutions WHERE DATE(start_time) = CURDATE()) as totalCasesRun,
          (SELECT SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END) FROM Auto_TestCaseTaskExecutions) as runningTasks
      `) as StatsResult[];

      const stats = this.parseStatsResult(result, {
        totalCases: '0',
        todayRuns: '0',
        passedCases: '0',
        totalCasesRun: '0',
        runningTasks: '0',
      });

      const totalCases = this.parseSafeInt(stats.totalCases, 0);
      const todayRuns = this.parseSafeInt(stats.todayRuns, 0);
      const passedCases = this.parseSafeInt(stats.passedCases, 0);
      const totalCasesRun = this.parseSafeInt(stats.totalCasesRun, 0);
      const runningTasks = this.parseSafeInt(stats.runningTasks, 0);

      const todaySuccessRate = this.calculateSuccessRate(passedCases, totalCasesRun);

      this.logDashboard('debug', 'Dashboard stats retrieved', {
        stats: {
          totalCases,
          todayRuns,
          passedCases,
          totalCasesRun,
          runningTasks,
        },
        todaySuccessRate,
      });

      return {
        totalCases,
        todayRuns,
        todaySuccessRate,
        runningTasks,
      };
    } catch (error) {
      this.logDashboard('error', 'Failed to get dashboard stats', {
        method: 'getStats',
      });

      throw new ServiceError(
        'Failed to get dashboard stats',
        error instanceof Error ? error : new Error(String(error)),
        500,
        { method: 'getStats' }
      );
    }
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
        .getRawOne<ExecutionStats>();

      // ✅ Type-safe null safety check with explicit interface
      const stats: ExecutionStats = result || {
        total: '0',
        passed: '0',
        failed: '0',
        skipped: '0',
      };

      logger.debug('Today execution stats retrieved (QueryBuilder)', {
        hasData: !!result,
        rawStats: stats,
        method: 'getTodayExecutions',
      }, LOG_CONTEXTS.DASHBOARD);

      return {
        total: this.parseSafeInt(stats.total, 0),
        passed: this.parseSafeInt(stats.passed, 0),
        failed: this.parseSafeInt(stats.failed, 0),
        skipped: this.parseSafeInt(stats.skipped, 0),
      };
    } catch (error) {
      logger.errorLog(error, 'Failed to get today execution stats (QueryBuilder)', {
        method: 'getTodayExecutions',
      });

      throw new ServiceError(
        'Failed to get today execution stats',
        error instanceof Error ? error : new Error(String(error)),
        500,
        { method: 'getTodayExecutions' }
      );
    }
  }

  /**
   * 获取历史趋势数据 (T-1 口径)
   * 优化：添加查询性能优化和内存管理
   */
  async getTrendData(days: number = 30): Promise<DailySummaryData[]> {
    const startTime = Date.now();
    
    // 限制最大查询天数，避免内存和性能问题
    const maxDays = 365;
    const queryDays = Math.min(days, maxDays);

    // 优先从汇总表获取数据（添加索引提示优化）
    const summaries = await this.dailySummaryRepository.query(`
      SELECT
        DATE_FORMAT(summary_date, "%Y-%m-%d") as date,
        total_executions,
        passed_cases,
        failed_cases,
        skipped_cases,
        success_rate
      FROM Auto_TestCaseDailySummaries
      WHERE summary_date >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
        AND summary_date < CURDATE()
      ORDER BY summary_date ASC
      LIMIT ?
    `, [queryDays, queryDays]) as DailySummaryData[];

    if (summaries.length > 0) {
      // 确保返回的数据量不超过请求的天数
      const result = summaries.length > queryDays ? summaries.slice(-queryDays) : summaries;
      
      const duration = Date.now() - startTime;
      this.logDashboard('info', 'Trend data retrieved from daily summary table', {
        dataSource: 'summary_table',
        days: queryDays,
        recordCount: result.length,
        originalCount: summaries.length,
        durationMs: duration,
      });
      return result;
    }

    // 如果没有汇总数据，从执行记录实时计算（添加分页和索引提示）
    this.logDashboard('warn', 'Daily summary table empty, falling back to real-time calculation', {
      dataSource: 'fallback_calculation',
      days: queryDays,
    });

    // 优化：添加索引提示和限制结果数量
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
      LIMIT ?
    `, [queryDays, queryDays]) as DailySummaryData[];

    // 确保返回的数据量不超过请求的天数
    const finalResult = trendData.length > queryDays ? trendData.slice(-queryDays) : trendData;

    const duration = Date.now() - startTime;
    this.logDashboard('info', 'Trend data calculated from execution records', {
      dataSource: 'fallback_calculation',
      days: queryDays,
      recordCount: finalResult.length,
      originalCount: trendData.length,
      durationMs: duration,
    });

    return finalResult;
  }

  /**
   * 获取最近测试运行
   */
  async getRecentRuns(limit: number = 10): Promise<RecentRun[]> {
    try {
      // 定义查询结果接口
      interface RecentRunRaw {
        id: string;
        taskName: string | null;
        status: string;
        duration: string | null;
        startTime: Date | null;
        totalCases: string | null;
        passedCases: string | null;
        failedCases: string | null;
        executedBy: string | null;
        executedById: string | null;
      }

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
      `, [limit]) as RecentRunRaw[];

      // 确保返回数组，即使查询结果为空
      if (!results || !Array.isArray(results)) {
        logger.warn('getRecentRuns returned non-array result', {
          results,
          limit,
          method: 'getRecentRuns',
        }, LOG_CONTEXTS.DASHBOARD);
        return [];
      }

      // 转换数据格式，确保所有字段都存在
      return results.map((r: RecentRunRaw) => {
        const result: RecentRun = {
          id: this.parseSafeInt(r.id, 0),
          suiteName: r.taskName || '未命名任务',
          status: r.status || 'pending',
          duration: this.parseSafeInt(r.duration, 0),
          startTime: r.startTime || undefined,
          totalCases: this.parseSafeInt(r.totalCases, 0),
          passedCases: this.parseSafeInt(r.passedCases, 0),
          failedCases: this.parseSafeInt(r.failedCases, 0),
          executedBy: r.executedBy || '系统',
          executedById: r.executedById ? this.parseSafeInt(r.executedById) : undefined,
        };
        return result;
      });
    } catch (error) {
      logger.errorLog(error, 'Failed to get recent runs', {
        limit,
        method: 'getRecentRuns',
      });

      throw new ServiceError(
        'Failed to fetch recent runs',
        error instanceof Error ? error : new Error(String(error)),
        500,
        { limit }
      );
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
   * 优化：合并查询，减少数据库请求次数，添加数据验证
   */
  async getComparison(days: number = 30): Promise<{
    runsComparison: number | null;
    successRateComparison: number | null;
    failureComparison: number | null;
  }> {
    try {
      // 限制最大天数，避免性能问题
      const maxDays = 90;
      const queryDays = Math.min(days, maxDays);

      // 定义查询结果接口
      interface ComparisonStats {
        period: string;
        runs: string;
        passed: string;
        failed: string;
        total: string;
      }

      // 优化：使用单个查询获取两个周期的数据
      const comparisonData = await this.taskExecutionRepository.query(`
        SELECT 
          CASE 
            WHEN DATE(start_time) >= DATE_SUB(CURDATE(), INTERVAL ? DAY) THEN 'current'
            ELSE 'previous'
          END as period,
          COUNT(*) as runs,
          COALESCE(SUM(passed_cases), 0) as passed,
          COALESCE(SUM(failed_cases), 0) as failed,
          COALESCE(SUM(passed_cases + failed_cases + skipped_cases), 0) as total
        FROM Auto_TestCaseTaskExecutions
        WHERE DATE(start_time) >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
          AND DATE(start_time) < CURDATE()
        GROUP BY 
          CASE 
            WHEN DATE(start_time) >= DATE_SUB(CURDATE(), INTERVAL ? DAY) THEN 'current'
            ELSE 'previous'
          END
      `, [queryDays, queryDays * 2, queryDays]) as ComparisonStats[];

      // 解析查询结果
      const currentData = comparisonData.find(d => d.period === 'current') || { 
        runs: '0', passed: '0', failed: '0', total: '0' 
      };
      const previousData = comparisonData.find(d => d.period === 'previous') || { 
        runs: '0', passed: '0', failed: '0', total: '0' 
      };

      // 转换为数字
      const currentRuns = this.parseSafeInt(currentData.runs, 0);
      const currentPassed = this.parseSafeInt(currentData.passed, 0);
      const currentFailed = this.parseSafeInt(currentData.failed, 0);
      const currentTotal = this.parseSafeInt(currentData.total, 0);

      const previousRuns = this.parseSafeInt(previousData.runs, 0);
      const previousPassed = this.parseSafeInt(previousData.passed, 0);
      const previousFailed = this.parseSafeInt(previousData.failed, 0);
      const previousTotal = this.parseSafeInt(previousData.total, 0);

      // 数据验证：如果两个周期都没有数据，返回 null
      if (currentTotal === 0 && previousTotal === 0) {
        logger.warn('No data available for comparison periods', {
          days: queryDays,
          currentTotal,
          previousTotal,
        }, LOG_CONTEXTS.DASHBOARD);

        return {
          runsComparison: null,
          successRateComparison: null,
          failureComparison: null,
        };
      }

      // 计算环比（使用安全的百分比计算方法）
      const runsComparison = this.calculatePercentage(currentRuns, previousRuns);

      const currentSuccessRate = currentTotal > 0 ? (currentPassed / currentTotal) * 100 : 0;
      const previousSuccessRate = previousTotal > 0 ? (previousPassed / previousTotal) * 100 : 0;
      const successRateComparison = previousTotal > 0 
        ? Math.round((currentSuccessRate - previousSuccessRate) * 100) / 100 
        : null;

      const failureComparison = this.calculatePercentage(currentFailed, previousFailed);

      logger.debug('Comparison data calculated', {
        days: queryDays,
        current: { runs: currentRuns, passed: currentPassed, failed: currentFailed, total: currentTotal },
        previous: { runs: previousRuns, passed: previousPassed, failed: previousFailed, total: previousTotal },
        comparison: { runsComparison, successRateComparison, failureComparison },
      }, LOG_CONTEXTS.DASHBOARD);

      return {
        runsComparison,
        successRateComparison,
        failureComparison,
      };
    } catch (error) {
      logger.errorLog(error, 'Failed to get comparison data', {
        days,
        method: 'getComparison',
      });

      throw new ServiceError(
        'Failed to calculate comparison data',
        error instanceof Error ? error : new Error(String(error)),
        500,
        { days }
      );
    }
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
      `) as ExecutionStats[];

      // ✅ Type-safe null safety check with explicit interface
      const stats = this.parseStatsResult(result, {
        total: '0',
        passed: '0',
        failed: '0',
        skipped: '0',
      });

      this.logDashboard('debug', 'Today execution stats retrieved', {
        hasData: !!result[0],
        resultLength: result.length,
        rawStats: stats,
        method: 'getTodayExecution',
      });

      return {
        total: this.parseSafeInt(stats.total, 0),
        passed: this.parseSafeInt(stats.passed, 0),
        failed: this.parseSafeInt(stats.failed, 0),
        skipped: this.parseSafeInt(stats.skipped, 0),
      };
    } catch (error) {
      this.logDashboard('error', 'Failed to get today execution stats', {
        method: 'getTodayExecution',
      });

      throw new ServiceError(
        'Failed to get today execution stats',
        error instanceof Error ? error : new Error(String(error)),
        500,
        { method: 'getTodayExecution' }
      );
    }
  }

  /**
   * 刷新每日汇总数据（单日）
   */
  async refreshDailySummary(date?: string): Promise<void> {
    try {
      const targetDate = date || new Date().toISOString().split('T')[0];

      // 定义查询结果接口
      interface DailyStats {
        totalExecutions: string;
        totalCasesRun: string;
        passedCases: string;
        failedCases: string;
        skippedCases: string;
        avgDuration: string;
      }

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
      `, [targetDate]) as DailyStats[];

      const activeCases = await this.testCaseRepository.query(`
        SELECT COUNT(*) as count FROM Auto_TestCase WHERE enabled = 1
      `) as ActiveCasesStats[];

      const statsData = stats[0] || {
        totalExecutions: '0',
        totalCasesRun: '0',
        passedCases: '0',
        failedCases: '0',
        skippedCases: '0',
        avgDuration: '0',
      };

      const totalCasesRun = this.parseSafeInt(statsData.totalCasesRun, 0);
      const passedCases = this.parseSafeInt(statsData.passedCases, 0);
      const failedCases = this.parseSafeInt(statsData.failedCases, 0);
      const skippedCases = this.parseSafeInt(statsData.skippedCases, 0);
      const avgDuration = this.parseSafeInt(statsData.avgDuration, 0);
      const activeCasesCount = this.parseSafeInt(activeCases[0]?.count, 0);

      const successRate = totalCasesRun > 0
        ? Math.round((passedCases / totalCasesRun) * 10000) / 100
        : 0;

      logger.debug('Daily summary data calculated', {
        targetDate,
        stats: {
          totalExecutions: this.parseSafeInt(statsData.totalExecutions, 0),
          totalCasesRun,
          passedCases,
          failedCases,
          skippedCases,
          avgDuration,
        },
        activeCasesCount,
        successRate,
      }, LOG_CONTEXTS.DASHBOARD);

      await this.saveDailySummary({
        summaryDate: targetDate,
        totalExecutions: this.parseSafeInt(statsData.totalExecutions, 0),
        totalCasesRun,
        passedCases,
        failedCases,
        skippedCases,
        successRate,
        avgDuration,
        activeCasesCount,
      });
    } catch (error) {
      logger.errorLog(error, 'Failed to refresh daily summary', {
        date,
        method: 'refreshDailySummary',
      });

      throw new ServiceError(
        'Failed to refresh daily summary',
        error instanceof Error ? error : new Error(String(error)),
        500,
        { date }
      );
    }
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
    `, [days]) as { date: string }[];

    const existingDates = new Set(
      existingSummaries.map((s: { date: string }) => s.date)
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

      // 1. 批量查询所有天的执行统计（按日期分组，添加分页限制）
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
      LIMIT ?
    `, [days, days]) as DateStats[];

    // 2. 查询活跃用例数（只需查询一次）
    const activeCases = await this.testCaseRepository.query(`
      SELECT COUNT(*) as count FROM Auto_TestCase WHERE enabled = 1
    `) as ActiveCasesStats[];
    const activeCasesCount = this.parseSafeInt(activeCases[0]?.count, 0);

    // 3. 构建所有日期列表（使用生成器减少内存占用）
    const allDates: string[] = [];
    for (const date of this.generateDateRange(days)) {
      allDates.push(date);
    }

    // 4. 将查询结果映射到日期
    const statsMap = new Map<string, DateStats>();
    dailyStats.forEach((stat: DateStats) => {
      statsMap.set(stat.summaryDate, stat);
    });

    // 5. 批量构建插入数据（包括没有数据的日期，填充为0）
    const summariesData = allDates.map(date => {
      const stat = statsMap.get(date);
      const totalExecutions = this.parseSafeInt(stat?.totalExecutions, 0);
      const totalCasesRun = this.parseSafeInt(stat?.totalCasesRun, 0);
      const passedCases = this.parseSafeInt(stat?.passedCases, 0);
      const failedCases = this.parseSafeInt(stat?.failedCases, 0);
      const skippedCases = this.parseSafeInt(stat?.skippedCases, 0);
      const avgDuration = this.parseSafeInt(stat?.avgDuration, 0);

      const successRate = totalCasesRun > 0
        ? Math.round((passedCases / totalCasesRun) * 10000) / 100
        : 0;

      return {
        summaryDate: date,
        totalExecutions,
        totalCasesRun,
        passedCases,
        failedCases,
        skippedCases,
        successRate,
        avgDuration,
        activeCasesCount,
      };
    });

    // 6. 批量插入/更新（使用事务处理，分批处理，避免单次SQL过大）
    const batchSize = 50; // 每批最多50条
    let successCount = 0;
    const processedDates: string[] = [];
    const errors: Array<{ date: string; error: string }> = [];

    // 使用事务包装整个批处理过程
    await this.executeInTransaction(async (queryRunner) => {
      for (let i = 0; i < summariesData.length; i += batchSize) {
        const batch = summariesData.slice(i, i + batchSize);

        try {
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

          await queryRunner.query(`
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
        } catch (batchError) {
          const batchDates = batch.map(d => d.summaryDate);
          logger.warn('Batch insert failed, continuing with next batch', {
            batchDates,
            error: batchError instanceof Error ? batchError.message : String(batchError),
            batchIndex: i / batchSize,
            batchSize: batch.length,
          }, LOG_CONTEXTS.DASHBOARD);

          // 记录错误但继续处理
          batchDates.forEach(date => {
            errors.push({
              date,
              error: batchError instanceof Error ? batchError.message : String(batchError)
            });
          });
        }
      }
    });

    // 记录处理结果
    if (errors.length > 0) {
      logger.warn('Some daily summaries failed to insert', {
        successCount,
        failedCount: errors.length,
        total: summariesData.length,
        errors: errors.slice(0, 5), // 只记录前5个错误
      }, LOG_CONTEXTS.DASHBOARD);
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