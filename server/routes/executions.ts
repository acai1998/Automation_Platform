import { Router } from 'express';
import { executionService } from '../services/ExecutionService.js';

const router = Router();

/**
 * POST /api/executions/callback
 * Jenkins 执行结果回调接口
 */
router.post('/callback', async (req, res) => {
  try {
    const { executionId, status, results, duration, reportUrl } = req.body;

    if (!executionId || !status || !Array.isArray(results)) {
      return res.status(400).json({
        success: false,
        message: 'executionId, status, and results are required'
      });
    }

    await executionService.handleCallback({
      executionId,
      status,
      results,
      duration: duration || 0,
      reportUrl
    });

    res.json({ success: true, message: 'Callback processed successfully' });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ success: false, message });
  }
});

/**
 * POST /api/executions/:id/start
 * 标记执行开始运行（Jenkins 开始执行时调用）
 */
router.post('/:id/start', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await executionService.markExecutionRunning(id);
    res.json({ success: true, message: 'Execution marked as running' });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ success: false, message });
  }
});

/**
 * GET /api/executions/test-runs
 * 获取 Auto_TestRun 表的运行记录列表
 */
router.get('/test-runs', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;
    const result = await executionService.getAllTestRuns(limit, offset);
    res.json({ success: true, ...result });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ success: false, message });
  }
});

/**
 * GET /api/executions/:id/results
 * 获取执行批次的用例结果列表
 */
router.get('/:id/results', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const results = await executionService.getBatchExecutionResults(id);
    res.json({ success: true, data: results });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ success: false, message });
  }
});

/**
 * GET /api/executions/:id
 * 获取执行详情
 */
router.get('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const data = await executionService.getExecutionDetail(id);

    if (!data.execution) {
      return res.status(404).json({ success: false, message: 'Execution not found' });
    }

    res.json({ success: true, data });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ success: false, message });
  }
});

/**
 * GET /api/executions
 * 获取执行记录列表
 */
router.get('/', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 20;
    const data = await executionService.getRecentExecutions(limit);
    res.json({ success: true, data });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ success: false, message });
  }
});

/**
 * POST /api/executions/:id/cancel
 * 取消执行
 */
router.post('/:id/cancel', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await executionService.cancelExecution(id);
    res.json({ success: true, message: 'Execution cancelled' });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ success: false, message });
  }
});

export default router;