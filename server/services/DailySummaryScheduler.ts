import { dashboardService } from './DashboardService';
import logger from '../utils/logger';
import { LOG_CONTEXTS } from '../config/logging';

/**
 * 每日汇总数据调度器
 * 负责定时生成每日汇总数据，确保趋势图有完整的数据源
 */
export class DailySummaryScheduler {
  private dailyTimer: NodeJS.Timeout | null = null;
  private isRunning = false;

  /**
   * 启动每日汇总调度器
   * 在每天午夜 00:05 执行前一天的汇总数据生成
   */
  start(): void {
    if (this.isRunning) {
      logger.info('Daily summary scheduler is already running', {}, LOG_CONTEXTS.SCHEDULER);
      return;
    }

    logger.info('Starting daily summary scheduler...', {}, LOG_CONTEXTS.SCHEDULER);
    this.isRunning = true;

    // 计算到下一个午夜 00:05 的时间
    this.scheduleNextExecution();

    logger.info('Daily summary scheduler started successfully', {}, LOG_CONTEXTS.SCHEDULER);
  }

  /**
   * 停止每日汇总调度器
   */
  stop(): void {
    logger.info('Stopping daily summary scheduler...', {}, LOG_CONTEXTS.SCHEDULER);
    this.isRunning = false;

    if (this.dailyTimer) {
      clearTimeout(this.dailyTimer);
      this.dailyTimer = null;
    }

    logger.info('Daily summary scheduler stopped', {}, LOG_CONTEXTS.SCHEDULER);
  }

  /**
   * 计算并调度下一次执行
   */
  private scheduleNextExecution(): void {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 5, 0, 0); // 设置为明天 00:05

    const timeUntilNextRun = tomorrow.getTime() - now.getTime();

    logger.debug('Scheduling next daily summary execution', {
      currentTime: now.toISOString(),
      nextRunTime: tomorrow.toISOString(),
      delayMs: timeUntilNextRun,
    }, LOG_CONTEXTS.SCHEDULER);

    this.dailyTimer = setTimeout(() => {
      this.executeDailySummary();
    }, timeUntilNextRun);
  }

  /**
   * 执行每日汇总数据生成
   */
  private async executeDailySummary(): Promise<void> {
    try {
      // 生成前一天的汇总数据（T-1 逻辑）
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().split('T')[0]; // YYYY-MM-DD 格式

      logger.info('Starting daily summary generation', {
        targetDate: yesterdayStr,
        executionTime: new Date().toISOString(),
      }, LOG_CONTEXTS.SCHEDULER);

      await dashboardService.refreshDailySummary(yesterdayStr);

      logger.info('Daily summary generation completed successfully', {
        targetDate: yesterdayStr,
        completedAt: new Date().toISOString(),
      }, LOG_CONTEXTS.SCHEDULER);

    } catch (error) {
      logger.errorLog(error, 'Failed to generate daily summary', {
        scheduledTime: new Date().toISOString(),
      });
    } finally {
      // 调度下一次执行
      if (this.isRunning) {
        this.scheduleNextExecution();
      }
    }
  }

  /**
   * 手动触发每日汇总生成（用于测试或修复）
   * @param date 可选的日期字符串，格式为 YYYY-MM-DD，默认为昨天
   */
  async triggerManualSummary(date?: string): Promise<void> {
    const targetDate = date || (() => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      return yesterday.toISOString().split('T')[0];
    })();

    logger.info('Manual daily summary generation triggered', {
      targetDate,
      triggeredAt: new Date().toISOString(),
    }, LOG_CONTEXTS.SCHEDULER);

    try {
      await dashboardService.refreshDailySummary(targetDate);
      logger.info('Manual daily summary generation completed', {
        targetDate,
        completedAt: new Date().toISOString(),
      }, LOG_CONTEXTS.SCHEDULER);
    } catch (error) {
      logger.errorLog(error, 'Manual daily summary generation failed', {
        targetDate,
        failedAt: new Date().toISOString(),
      });
      throw error;
    }
  }

  /**
   * 获取调度器状态
   */
  getStatus(): {
    isRunning: boolean;
    nextExecution?: string;
  } {
    const status = {
      isRunning: this.isRunning,
      nextExecution: undefined as string | undefined,
    };

    if (this.isRunning) {
      // 计算下一次执行时间
      const now = new Date();
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(0, 5, 0, 0);
      status.nextExecution = tomorrow.toISOString();
    }

    return status;
  }

  /**
   * 批量生成历史汇总数据
   * @param days 要生成的天数，默认90天
   */
  async backfillHistoricalSummaries(days: number = 90): Promise<{
    totalDays: number;
    successCount: number;
    failedCount: number;
    errors: Array<{ date: string; error: string }>;
  }> {
    logger.info('Starting historical daily summaries backfill (batch mode)', {
      days,
      startTime: new Date().toISOString(),
      mode: 'batch_query_optimized',
    }, LOG_CONTEXTS.SCHEDULER);

    const result = {
      totalDays: days,
      successCount: 0,
      failedCount: 0,
      errors: [] as Array<{ date: string; error: string }>,
    };

    try {
      // 使用批量查询优化方法，大幅减少数据库请求次数
      const batchResult = await dashboardService.batchRefreshDailySummaries(days);
      
      result.successCount = batchResult.successCount;
      
      logger.info('Historical daily summaries backfill completed (batch mode)', {
        ...result,
        completedAt: new Date().toISOString(),
        processedDates: batchResult.processedDates.length,
        optimization: 'Reduced from ~270 queries to ~4 queries',
      }, LOG_CONTEXTS.SCHEDULER);

    } catch (error) {
      // 如果批量处理失败，回退到逐个处理模式
      logger.warn('Batch backfill failed, falling back to individual mode', {
        error: error instanceof Error ? error.message : String(error),
      }, LOG_CONTEXTS.SCHEDULER);

      const today = new Date();

      for (let i = 1; i <= days; i++) {
        const targetDate = new Date(today);
        targetDate.setDate(targetDate.getDate() - i);
        const dateStr = targetDate.toISOString().split('T')[0];

        try {
          logger.debug('Generating historical summary (fallback mode)', {
            date: dateStr,
            progress: `${i}/${days}`,
          }, LOG_CONTEXTS.SCHEDULER);

          await dashboardService.refreshDailySummary(dateStr);
          result.successCount++;

          // 添加小延迟，避免数据库负载过高
          if (i % 10 === 0) {
            await new Promise(resolve => setTimeout(resolve, 100));
          }

        } catch (error) {
          result.failedCount++;
          const errorMessage = error instanceof Error ? error.message : String(error);
          result.errors.push({ date: dateStr, error: errorMessage });

          logger.warn('Failed to generate historical summary', {
            date: dateStr,
            error: errorMessage,
            progress: `${i}/${days}`,
          }, LOG_CONTEXTS.SCHEDULER);
        }
      }

      logger.info('Historical daily summaries backfill completed (fallback mode)', {
        ...result,
        completedAt: new Date().toISOString(),
      }, LOG_CONTEXTS.SCHEDULER);
    }

    return result;
  }
}

// 导出单例
export const dailySummaryScheduler = new DailySummaryScheduler();