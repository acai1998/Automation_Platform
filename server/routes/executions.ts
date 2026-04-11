import { Router } from 'express';
import { executionService } from '../services/ExecutionService';
import logger from '../utils/logger';
import { LOG_CONTEXTS, createTimer } from '../config/logging';
import { authenticate, requireAdmin } from '../middleware/auth';

const router = Router();

/**
 * POST /api/executions/callback
 * Jenkins 执行结果回调接口
 */
router.post('/callback', async (req, res) => {
  const timer = createTimer();
  const clientIP = req.headers['x-forwarded-for'] || req.connection.remoteAddress;

  try {
    const { executionId, status, results, duration, reportUrl } = req.body;

    logger.info('Jenkins callback received', {
      executionId,
      status,
      resultsCount: Array.isArray(results) ? results.length : 0,
      duration,
      reportUrl,
      clientIP,
      userAgent: req.headers['user-agent'],
      contentType: req.headers['content-type'],
    }, LOG_CONTEXTS.EXECUTION);

    if (!executionId || !status || !Array.isArray(results)) {
      logger.warn('Jenkins callback validation failed', {
        executionId,
        status,
        resultsType: typeof results,
        clientIP,
        missingFields: {
          executionId: !executionId,
          status: !status,
          results: !Array.isArray(results),
        },
      }, LOG_CONTEXTS.EXECUTION);

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

    const processingTime = timer();
    logger.info('Jenkins callback processed successfully', {
      executionId,
      status,
      resultsCount: results.length,
      processingTime: `${processingTime}ms`,
      clientIP,
    }, LOG_CONTEXTS.EXECUTION);

    res.json({ success: true, message: 'Callback processed successfully' });
  } catch (error: unknown) {
    const processingTime = timer();
    logger.errorLog(error, 'Jenkins callback processing failed', {
      executionId: req.body?.executionId,
      status: req.body?.status,
      clientIP,
      processingTime: `${processingTime}ms`,
      requestBody: req.body,
    });

    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ success: false, message });
  }
});

/**
 * POST /api/executions/:id/start
 * 标记执行开始运行（Jenkins 开始执行时调用）
 */
router.post('/:id/start', async (req, res) => {
  const timer = createTimer();
  const clientIP = req.headers['x-forwarded-for'] || req.connection.remoteAddress;

  try {
    const id = parseInt(req.params.id);

    logger.info('Marking execution as running', {
      executionId: id,
      clientIP,
      userAgent: req.headers['user-agent'],
    }, LOG_CONTEXTS.EXECUTION);

    await executionService.markExecutionRunning(id);

    const processingTime = timer();
    logger.info('Execution marked as running successfully', {
      executionId: id,
      processingTime: `${processingTime}ms`,
      clientIP,
    }, LOG_CONTEXTS.EXECUTION);

    res.json({ success: true, message: 'Execution marked as running' });
  } catch (error: unknown) {
    const processingTime = timer();
    logger.errorLog(error, 'Failed to mark execution as running', {
      executionId: req.params.id,
      clientIP,
      processingTime: `${processingTime}ms`,
    });

    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ success: false, message });
  }
});

/**
 * GET /api/executions/test-runs
 * 获取 Auto_TestRun 表的运行记录列表
 * 支持筛选参数：triggerType、status、startDate（YYYY-MM-DD）、endDate（YYYY-MM-DD）
 */
router.get('/test-runs', async (req, res) => {
  try {
    // 分页上限保护：默认 50，最大 100
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 50));
    const offset = Math.max(0, parseInt(req.query.offset as string) || 0);

    const filters: {
      triggerType?: string[];
      status?: string[];
      startDate?: string;
      endDate?: string;
    } = {};

    const parseMultiQuery = (value: unknown): string[] | undefined => {
      if (typeof value !== "string") return undefined;
      const items = value.split(",").map(item => item.trim()).filter(Boolean);
      return items.length > 0 ? items : undefined;
    };

    const triggerTypes = parseMultiQuery(req.query.triggerType);
    if (triggerTypes) {
      filters.triggerType = triggerTypes;
    }

    const statuses = parseMultiQuery(req.query.status);
    if (statuses) {
      filters.status = statuses;
    }

    // 日期格式验证：YYYY-MM-DD
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (req.query.startDate && typeof req.query.startDate === 'string' && dateRegex.test(req.query.startDate)) {
      filters.startDate = req.query.startDate;
    }
    if (req.query.endDate && typeof req.query.endDate === 'string' && dateRegex.test(req.query.endDate)) {
      filters.endDate = req.query.endDate;
    }

    const result = await executionService.getAllTestRuns(limit, offset, filters);
    res.json({ success: true, ...result });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ success: false, message });
  }
});

/**
 * GET /api/executions/stale-summary
 * 获取历史卡住执行汇总（用于运行记录页提示条）
 */
router.get('/stale-summary', authenticate, async (req, res) => {
  try {
    const maxAgeHours = Math.min(168, Math.max(1, parseInt(String(req.query.maxAgeHours ?? '24'), 10) || 24));
    const stalePendingMinutes = Math.min(24 * 60, Math.max(1, parseInt(String(req.query.stalePendingMinutes ?? '10'), 10) || 10));

    const summary = await executionService.getStaleExecutionSummary(maxAgeHours, stalePendingMinutes);

    res.json({
      success: true,
      data: {
        ...summary,
        maxAgeHours,
        stalePendingMinutes,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ success: false, message });
  }
});

/**
 * POST /api/executions/cleanup-stale
 * 一次性清理历史卡住执行（pending/running -> aborted）
 */
router.post('/cleanup-stale', authenticate, requireAdmin, async (req, res) => {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const dryRun = typeof body.dryRun === 'boolean' ? body.dryRun : false;
    const maxAgeHours = Math.min(168, Math.max(1, Number(body.maxAgeHours) || 24));
    const stalePendingMinutes = Math.min(24 * 60, Math.max(1, Number(body.stalePendingMinutes) || 10));

    const result = await executionService.cleanupStaleExecutions(maxAgeHours, stalePendingMinutes, dryRun);

    res.json({
      success: true,
      data: {
        ...result,
        maxAgeHours,
        stalePendingMinutes,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ success: false, message });
  }
});

/**
 * GET /api/executions/test-runs/:runId/results
 * 根据 Auto_TestRun.id（runId）获取该批次的用例结果列表
 * 注意：此路由必须放在 /:id/results 之前，防止被 Express 误匹配
 */
router.get("/test-runs/:runId/results", async (req, res) => {
  try {
    const runId = parseInt(req.params.runId);
    const result = await executionService.getResultsByRunId(runId);
    res.json({ success: true, data: result.data, total: result.total });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ success: false, message });
  }
});

/**
 * GET /api/executions/:id/results
 * 获取运行批次的用例结果列表，:id 为 Auto_TestRun.id（runId）
 * 内部通过 execution_id 字段（优先）或时间窗口反查 executionId，再取用例结果
 */
router.get("/:id/results", async (req, res) => {
  try {
    const runId = parseInt(req.params.id);
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = Math.min(100, parseInt(req.query.pageSize as string) || 20);
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const keyword = typeof req.query.keyword === "string" ? req.query.keyword.trim() || undefined : undefined;
    const result = await executionService.getResultsByRunId(runId, { page, pageSize, status, keyword });
    res.json({ success: true, data: result.data, total: result.total, page, pageSize });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ success: false, message });
  }
});
/**
 * GET /api/executions/:id
 * 获取 TestRun 运行详情，:id 为 Auto_TestRun.id（runId）
 */
router.get("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const data = await executionService.getTestRunDetailRow(id);
    res.json({ success: true, data });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    if (message.includes("not found")) return res.status(404).json({ success: false, message });
    res.status(500).json({ success: false, message });
  }
});

 /**
 * GET /api/executions
 * 获取运行记录列表
 */
router.get('/', async (req, res) => {
  try {
    // 分页上限保护：默认 20，最大 100
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
    const data = await executionService.getRecentExecutions(limit);
    res.json({ success: true, data });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ success: false, message });
  }
});

/**
 * POST /api/executions/:id/sync
 * 手动同步执行状态（从Jenkins获取最新状态）
 */
router.post('/:id/sync', async (req, res) => {
  try {
    const id = parseInt(req.params.id);

    if (isNaN(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid execution ID'
      });
    }

    console.log(`[MANUAL-SYNC] Starting manual sync for execution ${id}`);

    const syncResult = await executionService.syncExecutionStatusFromJenkins(id);

    console.log(`[MANUAL-SYNC] Sync result for execution ${id}:`, syncResult);

    res.json({
      success: syncResult.success,
      data: {
        updated: syncResult.updated,
        message: syncResult.message,
        currentStatus: syncResult.currentStatus,
        jenkinsStatus: syncResult.jenkinsStatus,
        executionId: id
      }
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[MANUAL-SYNC] Failed to sync execution %s:', req.params.id, message);
    res.status(500).json({ success: false, message });
  }
});

/**
 * POST /api/executions/sync-stuck
 * 批量同步可能卡住的执行（状态为running但时间较长）
 */
router.post('/sync-stuck', async (req, res) => {
  try {
    const rawTimeoutMinutes = (req.body as Record<string, unknown>)['timeoutMinutes'];
    const rawMaxExecutions = (req.body as Record<string, unknown>)['maxExecutions'];
    const timeoutMinutes = typeof rawTimeoutMinutes === 'number' ? rawTimeoutMinutes : 10;
    const maxExecutions = typeof rawMaxExecutions === 'number' ? rawMaxExecutions : 20;
    const timeoutMs = timeoutMinutes * 60 * 1000;

    console.log(`[BULK-SYNC] Starting bulk sync for stuck executions (timeout: ${timeoutMinutes}min, max: ${maxExecutions})`);

    // Use the existing timeout check method with custom parameters
    const result = await executionService.checkAndHandleTimeouts(timeoutMs);

    console.log(`[BULK-SYNC] Bulk sync completed:`, result);

    res.json({
      success: true,
      data: {
        checked: result.checked,
        timedOut: result.timedOut,
        updated: result.updated,
        timeoutMinutes,
        message: `Checked ${result.checked} executions, updated ${result.updated}, marked ${result.timedOut} as timed out`
      }
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[BULK-SYNC] Failed to perform bulk sync:`, message);
    res.status(500).json({ success: false, message });
  }
});

/**
 * GET /api/executions/stuck
 * 获取可能卡住的执行列表（状态为running/pending但时间较长）
 */
router.get('/stuck', async (req, res) => {
  try {
    const timeoutMinutes = parseInt(req.query.timeout as string) || 10;
    const timeoutMs = timeoutMinutes * 60 * 1000;
    const timeoutThreshold = new Date(Date.now() - timeoutMs);

    // Query stuck executions
    const { query } = await import('../config/database');
    const stuckExecutions = await query<Array<{
      id: number;
      status: string;
      jenkins_job?: string;
      jenkins_build_id?: string;
      jenkins_url?: string;
      start_time: Date;
      duration_minutes: number;
      trigger_by_name?: string;
    }>>(`
      SELECT id, status, jenkins_job, jenkins_build_id, jenkins_url,
             start_time, TIMESTAMPDIFF(MINUTE, start_time, NOW()) as duration_minutes,
             trigger_by_name
      FROM Auto_TestRun
      WHERE status IN ('pending', 'running')
        AND start_time < ?
      ORDER BY start_time ASC
      LIMIT 50
    `, [timeoutThreshold]);

    res.json({
      success: true,
      data: {
        executions: stuckExecutions,
        timeoutMinutes,
        count: stuckExecutions.length
      }
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[STUCK-QUERY] Failed to query stuck executions:`, message);
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
