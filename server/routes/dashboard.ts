import { Router } from 'express';
import { dashboardService } from '../services/DashboardService';
import { dailySummaryScheduler } from '../services/DailySummaryScheduler';
import logger from '../utils/logger';
import { LOG_CONTEXTS } from '../config/logging';

const router = Router();

/**
 * GET /api/dashboard/stats
 * 获取核心指标卡片数据
 */
router.get('/stats', async (req, res) => {
  try {
    const stats = await dashboardService.getStats();
    res.json({ success: true, data: stats });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ success: false, message });
  }
});

/**
 * GET /api/dashboard/today-execution
 * 获取今日执行统计（环形图数据）
 */
router.get('/today-execution', async (req, res) => {
  try {
    const data = await dashboardService.getTodayExecution();

    // ✅ Validate response data before sending
    if (!data || typeof data !== 'object') {
      logger.warn('Invalid today execution data received', {
        data,
        endpoint: '/today-execution',
      }, LOG_CONTEXTS.DASHBOARD);

      return res.status(500).json({
        success: false,
        message: 'Invalid data format received from service'
      });
    }

    // ✅ Ensure all required numeric fields are present and valid
    const validatedData = {
      total: Number.isInteger(data.total) ? data.total : 0,
      passed: Number.isInteger(data.passed) ? data.passed : 0,
      failed: Number.isInteger(data.failed) ? data.failed : 0,
      skipped: Number.isInteger(data.skipped) ? data.skipped : 0,
    };

    logger.debug('Today execution data validated', {
      originalData: data,
      validatedData,
      endpoint: '/today-execution',
    }, LOG_CONTEXTS.DASHBOARD);

    res.json({ success: true, data: validatedData });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';

    logger.errorLog(error, 'Failed to get today execution data', {
      endpoint: '/today-execution',
      errorType: error instanceof Error ? error.constructor.name : 'Unknown',
    });

    res.status(500).json({ success: false, message });
  }
});

/**
 * GET /api/dashboard/trend?days=30
 * 获取历史趋势数据
 */
router.get('/trend', async (req, res) => {
  try {
    const days = parseInt(req.query.days as string) || 30;

    // ✅ Validate input parameters
    if (days < 1 || days > 365) {
      return res.status(400).json({
        success: false,
        message: 'Days parameter must be between 1 and 365'
      });
    }

    // T-1 数据口径：查询用户请求的天数，SQL 中的 < CURDATE() 会自动排除今天
    const data = await dashboardService.getTrendData(days);

    // ✅ Validate response data before sending
    if (!Array.isArray(data)) {
      logger.warn('Invalid trend data received - not an array', {
        data,
        dataType: typeof data,
        endpoint: '/trend',
        requestedDays: days,
      }, LOG_CONTEXTS.DASHBOARD);

      return res.status(500).json({
        success: false,
        message: 'Invalid data format received from service'
      });
    }

    // ✅ Validate each trend data item
    const validatedData = data.map((item, index) => {
      if (!item || typeof item !== 'object') {
        logger.warn('Invalid trend data item', {
          index,
          item,
          endpoint: '/trend',
        }, LOG_CONTEXTS.DASHBOARD);

        return {
          date: '',
          totalExecutions: 0,
          passedCases: 0,
          failedCases: 0,
          skippedCases: 0,
          successRate: 0,
        };
      }

      return {
        date: item.date || '',
        totalExecutions: Number.isInteger(item.totalExecutions) ? item.totalExecutions : 0,
        passedCases: Number.isInteger(item.passedCases) ? item.passedCases : 0,
        failedCases: Number.isInteger(item.failedCases) ? item.failedCases : 0,
        skippedCases: Number.isInteger(item.skippedCases) ? item.skippedCases : 0,
        successRate: typeof item.successRate === 'number' ? item.successRate : 0,
      };
    });

    logger.debug('Trend data validated', {
      requestedDays: days,
      originalCount: data.length,
      validatedCount: validatedData.length,
      endpoint: '/trend',
    }, LOG_CONTEXTS.DASHBOARD);

    res.json({ success: true, data: validatedData });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';

    logger.errorLog(error, 'Failed to get trend data', {
      endpoint: '/trend',
      requestedDays: req.query.days,
      errorType: error instanceof Error ? error.constructor.name : 'Unknown',
    });

    res.status(500).json({ success: false, message });
  }
});

/**
 * GET /api/dashboard/comparison?days=30
 * 获取环比分析数据
 */
router.get('/comparison', async (req, res) => {
  try {
    const days = parseInt(req.query.days as string) || 30;
    const data = await dashboardService.getComparison(days);
    res.json({ success: true, data });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ success: false, message });
  }
});

/**
 * GET /api/dashboard/recent-runs?limit=10
 * 获取最近测试运行
 */
router.get('/recent-runs', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 10;
    const data = await dashboardService.getRecentRuns(limit);
    res.json({ success: true, data });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ success: false, message });
  }
});

// 辅助验证函数
const validateStats = (stats: unknown) => {
  if (stats !== null && typeof stats === 'object' && !Array.isArray(stats)) {
    const s = stats as Record<string, unknown>;
    return {
      totalCases: Number.isInteger(s['totalCases']) ? (s['totalCases'] as number) : 0,
      todayRuns: Number.isInteger(s['todayRuns']) ? (s['todayRuns'] as number) : 0,
      todaySuccessRate: typeof s['todaySuccessRate'] === 'number' ? (s['todaySuccessRate'] as number) : null,
      runningTasks: Number.isInteger(s['runningTasks']) ? (s['runningTasks'] as number) : 0,
    };
  }
  return { totalCases: 0, todayRuns: 0, todaySuccessRate: null, runningTasks: 0 };
};

const validateTodayExecution = (data: unknown) => {
  if (data !== null && typeof data === 'object' && !Array.isArray(data)) {
    const d = data as Record<string, unknown>;
    return {
      total: Number.isInteger(d['total']) ? (d['total'] as number) : 0,
      passed: Number.isInteger(d['passed']) ? (d['passed'] as number) : 0,
      failed: Number.isInteger(d['failed']) ? (d['failed'] as number) : 0,
      skipped: Number.isInteger(d['skipped']) ? (d['skipped'] as number) : 0,
    };
  }
  return { total: 0, passed: 0, failed: 0, skipped: 0 };
};

const validateTrendData = (data: unknown[]) => {
  if (Array.isArray(data)) {
    return data.map((rawItem: unknown) => {
      const item = (rawItem !== null && typeof rawItem === 'object' && !Array.isArray(rawItem))
        ? (rawItem as Record<string, unknown>)
        : null;
      return {
        date: typeof item?.['date'] === 'string' ? item['date'] : '',
        totalExecutions: Number.isInteger(item?.['totalExecutions']) ? (item!['totalExecutions'] as number) : 0,
        passedCases: Number.isInteger(item?.['passedCases']) ? (item!['passedCases'] as number) : 0,
        failedCases: Number.isInteger(item?.['failedCases']) ? (item!['failedCases'] as number) : 0,
        skippedCases: Number.isInteger(item?.['skippedCases']) ? (item!['skippedCases'] as number) : 0,
        successRate: typeof item?.['successRate'] === 'number' ? (item['successRate'] as number) : 0,
      };
    });
  }
  return [];
};

/**
 * GET /api/dashboard/all?timeRange=30d
 * 批量获取仪表盘所有数据
 */
router.get('/all', async (req, res) => {
  try {
    const { timeRange = '30d' } = req.query;
    const days = parseInt(timeRange as string) || 30;

    // ✅ Validate input parameters
    if (days < 1 || days > 365) {
      return res.status(400).json({
        success: false,
        message: 'timeRange parameter must be between 1 and 365 days'
      });
    }

    // T-1 数据口径：查询用户请求的天数，SQL 中的 < CURDATE() 会自动排除今天
    // 例如：今天是 2026-01-25，用户选择"近7天"，返回 2026-01-18 到 2026-01-24 共7条记录

    // 并行获取所有数据（移除 recentRuns 以减少性能压力）
    const [stats, todayExecution, trendData] = await Promise.all([
      dashboardService.getStats(),
      dashboardService.getTodayExecution(),
      dashboardService.getTrendData(days)
    ]);

    // ✅ Validate each data component before sending
    const validatedStats = validateStats(stats);
    const validatedTodayExecution = validateTodayExecution(todayExecution);
    const validatedTrendData = validateTrendData(trendData);

    logger.debug('Dashboard all data validated', {
      requestedDays: days,
      statsValid: !!stats,
      todayExecutionValid: !!todayExecution,
      trendDataCount: validatedTrendData.length,
      endpoint: '/all',
    }, LOG_CONTEXTS.DASHBOARD);

    res.json({
      success: true,
      data: {
        stats: validatedStats,
        todayExecution: validatedTodayExecution,
        trendData: validatedTrendData
      }
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';

    logger.errorLog(error, 'Failed to get dashboard all data', {
      endpoint: '/all',
      requestedTimeRange: req.query.timeRange,
      errorType: error instanceof Error ? error.constructor.name : 'Unknown',
    });

    res.status(500).json({ success: false, message });
  }
});

/**
 * POST /api/dashboard/refresh-summary
 * 刷新每日汇总数据
 */
router.post('/refresh-summary', async (req, res) => {
  try {
    const { date } = req.body;
    await dashboardService.refreshDailySummary(date);
    res.json({ success: true, message: 'Summary refreshed' });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ success: false, message });
  }
});

/**
 * GET /api/dashboard/summary-status
 * 获取每日汇总数据状态
 */
router.get('/summary-status', async (req, res) => {
  try {
    // 获取调度器状态
    const schedulerStatus = dailySummaryScheduler.getStatus();

    // 检查最近几天的汇总数据完整性
    const checkDays = 7; // 检查最近7天
    const summaryStats = await checkDailySummaryCompleteness(checkDays);

    res.json({
      success: true,
      data: {
        scheduler: schedulerStatus,
        dataCompleteness: summaryStats,
        timestamp: new Date().toISOString(),
      }
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ success: false, message });
  }
});

/**
 * POST /api/dashboard/trigger-manual-summary
 * 手动触发每日汇总生成
 */
router.post('/trigger-manual-summary', async (req, res) => {
  try {
    const { date } = req.body;
    await dailySummaryScheduler.triggerManualSummary(date);
    res.json({
      success: true,
      message: `Manual summary generation completed for ${date || 'yesterday'}`,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ success: false, message });
  }
});

/**
 * POST /api/dashboard/backfill-summaries
 * 批量生成历史汇总数据
 */
router.post('/backfill-summaries', async (req, res) => {
  try {
    const { days = 30 } = req.body;
    const result = await dailySummaryScheduler.backfillHistoricalSummaries(days);
    res.json({
      success: true,
      data: result,
      message: `Backfill completed: ${result.successCount}/${result.totalDays} days processed`,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ success: false, message });
  }
});

/**
 * 检查每日汇总数据完整性
 */
async function checkDailySummaryCompleteness(days: number): Promise<{
  totalDays: number;
  availableDays: number;
  missingDays: string[];
  completenessRate: number;
}> {
  try {
    // 获取最近几天的趋势数据，看看有多少天有数据
    const trendData = await dashboardService.getTrendData(days);

    // 生成期望的日期列表（T-1 逻辑，不包含今天）
    const expectedDates: string[] = [];
    const today = new Date();

    for (let i = 1; i <= days; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      expectedDates.push(date.toISOString().split('T')[0]);
    }

    // 检查哪些日期有数据
    const availableDates = trendData.map(item => {
      // 处理不同的日期格式
      if (item.date.includes('T')) {
        return new Date(item.date).toISOString().split('T')[0];
      }
      return item.date;
    });

    const missingDays = expectedDates.filter(date => !availableDates.includes(date));
    const completenessRate = Math.round(((days - missingDays.length) / days) * 100);

    return {
      totalDays: days,
      availableDays: days - missingDays.length,
      missingDays: missingDays.slice(0, 10), // 最多显示10个缺失日期
      completenessRate,
    };
  } catch (error) {
    return {
      totalDays: days,
      availableDays: 0,
      missingDays: [],
      completenessRate: 0,
    };
  }
}

export default router;