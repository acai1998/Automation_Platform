import { Router } from 'express';
import { dashboardService } from '../services/DashboardService.js';

const router = Router();

/**
 * GET /api/dashboard/stats
 * 获取核心指标卡片数据
 */
router.get('/stats', (req, res) => {
  try {
    const stats = dashboardService.getStats();
    res.json({ success: true, data: stats });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /api/dashboard/today-execution
 * 获取今日执行统计（环形图数据）
 */
router.get('/today-execution', (req, res) => {
  try {
    const data = dashboardService.getTodayExecution();
    res.json({ success: true, data });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /api/dashboard/trend?days=30
 * 获取历史趋势数据
 */
router.get('/trend', (req, res) => {
  try {
    const days = parseInt(req.query.days as string) || 30;
    const data = dashboardService.getTrendData(days);
    res.json({ success: true, data });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /api/dashboard/comparison?days=30
 * 获取环比分析数据
 */
router.get('/comparison', (req, res) => {
  try {
    const days = parseInt(req.query.days as string) || 30;
    const data = dashboardService.getComparison(days);
    res.json({ success: true, data });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /api/dashboard/recent-runs?limit=10
 * 获取最近测试运行
 */
router.get('/recent-runs', (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 10;
    const data = dashboardService.getRecentRuns(limit);
    res.json({ success: true, data });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * POST /api/dashboard/refresh-summary
 * 刷新每日汇总数据
 */
router.post('/refresh-summary', (req, res) => {
  try {
    const { date } = req.body;
    dashboardService.refreshDailySummary(date);
    res.json({ success: true, message: 'Summary refreshed' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
