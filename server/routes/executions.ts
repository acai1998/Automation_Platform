import { Router } from 'express';
import { executionService } from '../services/ExecutionService.js';
import { RunnerFactory } from '../runners/index.js';

const router = Router();

/**
 * POST /api/executions/run
 * 执行任务
 */
router.post('/run', async (req, res) => {
  try {
    const { taskId, triggeredBy = 1 } = req.body;

    if (!taskId) {
      return res.status(400).json({ success: false, message: 'taskId is required' });
    }

    const result = await executionService.executeTask({
      taskId,
      triggeredBy,
      triggerType: 'manual',
    });

    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /api/executions/:id
 * 获取执行详情
 */
router.get('/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const data = executionService.getExecutionDetail(id);

    if (!data.execution) {
      return res.status(404).json({ success: false, message: 'Execution not found' });
    }

    res.json({ success: true, data });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /api/executions
 * 获取执行记录列表
 */
router.get('/', (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 20;
    const data = executionService.getRecentExecutions(limit);
    res.json({ success: true, data });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * POST /api/executions/:id/cancel
 * 取消执行
 */
router.post('/:id/cancel', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    executionService.cancelExecution(id);
    res.json({ success: true, message: 'Execution cancelled' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /api/executions/runners/available
 * 获取可用的执行器
 */
router.get('/runners/available', async (req, res) => {
  try {
    const runners = await RunnerFactory.getAvailableRunners();
    res.json({ success: true, data: runners });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
