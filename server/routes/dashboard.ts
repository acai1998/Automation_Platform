import { Router } from 'express';
import { dashboardService } from '../services/DashboardService.js';

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
    res.json({ success: true, data });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
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
    const data = await dashboardService.getTrendData(days);
    res.json({ success: true, data });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
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

/**
 * GET /api/dashboard/all?timeRange=30d
 * 批量获取仪表盘所有数据
 */
router.get('/all', async (req, res) => {
  try {
    const { timeRange = '30d' } = req.query;
    const days = parseInt(timeRange as string) || 30;

    // 并行获取所有数据
    const [stats, todayExecution, trendData, recentRuns] = await Promise.all([
      dashboardService.getStats(),
      dashboardService.getTodayExecution(),
      dashboardService.getTrendData(days),
      dashboardService.getRecentRuns(10)
    ]);

    res.json({
      success: true,
      data: {
        stats,
        todayExecution,
        trendData,
        recentRuns
      }
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
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

export default router;
