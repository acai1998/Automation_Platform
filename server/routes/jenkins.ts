import { Router } from 'express';
import { executionService } from '../services/ExecutionService.js';

const router = Router();

/**
 * POST /api/jenkins/trigger
 * 触发 Jenkins Job 执行
 *
 * 此接口创建执行记录并返回 executionId，供 Jenkins 后续回调使用
 * 实际触发 Jenkins Job 的逻辑需要在此处或由调用方完成
 */
router.post('/trigger', async (req, res) => {
  try {
    const { taskId, triggeredBy = 1, jenkinsJobName } = req.body;

    if (!taskId) {
      return res.status(400).json({ success: false, message: 'taskId is required' });
    }

    // 创建执行记录
    const execution = await executionService.createExecution({
      taskId,
      triggeredBy,
      triggerType: 'ci_triggered',
    });

    res.json({
      success: true,
      data: {
        executionId: execution.executionId,
        totalCases: execution.totalCases,
        status: execution.status,
        jenkinsJobName: jenkinsJobName || null,
        message: 'Execution created. Waiting for Jenkins to start.'
      }
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ success: false, message });
  }
});

/**
 * GET /api/jenkins/tasks/:taskId/cases
 * 获取任务关联的用例列表
 *
 * Jenkins Job 可以调用此接口获取需要执行的用例信息
 */
router.get('/tasks/:taskId/cases', async (req, res) => {
  try {
    const taskId = parseInt(req.params.taskId);
    const cases = await executionService.getTaskCases(taskId);

    res.json({
      success: true,
      data: cases
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ success: false, message });
  }
});

/**
 * GET /api/jenkins/status/:executionId
 * 查询执行状态（预留接口）
 *
 * 用于查询 Jenkins Job 的执行状态
 */
router.get('/status/:executionId', async (req, res) => {
  try {
    const executionId = parseInt(req.params.executionId);
    const detail = await executionService.getExecutionDetail(executionId);

    if (!detail.execution) {
      return res.status(404).json({ success: false, message: 'Execution not found' });
    }

    const execution = detail.execution as Record<string, unknown>;

    res.json({
      success: true,
      data: {
        executionId,
        status: execution.status,
        totalCases: execution.total_cases,
        passedCases: execution.passed_cases,
        failedCases: execution.failed_cases,
        skippedCases: execution.skipped_cases,
        startTime: execution.start_time,
        endTime: execution.end_time,
        duration: execution.duration,
        // Jenkins 相关字段（预留）
        jenkinsStatus: null,
        buildNumber: null,
        consoleUrl: null
      }
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ success: false, message });
  }
});

export default router;
