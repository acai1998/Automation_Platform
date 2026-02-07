import { Router, Request, Response } from 'express';
import { executionService } from '../services/ExecutionService';
import { jenkinsService } from '../services/JenkinsService';
import { ipWhitelistMiddleware, rateLimitMiddleware } from '../middleware/JenkinsAuthMiddleware';
import { requestValidator } from '../middleware/RequestValidator';
import logger from '../utils/logger';
import { LOG_CONTEXTS, createTimer } from '../config/logging';

const router = Router();

/**
 * 净化错误消息，移除敏感信息以防止信息泄露
 * @param error 原始错误对象
 * @param context 错误上下文，用于日志记录
 * @returns 净化后的错误消息
 */
function sanitizeErrorMessage(error: unknown, context: string): string {
  const originalMessage = error instanceof Error ? error.message : 'Unknown error';

  // 记录详细错误信息到服务器日志
  console.error(`[${context}] Detailed error:`, {
    message: originalMessage,
    stack: error instanceof Error ? error.stack : undefined,
    timestamp: new Date().toISOString()
  });

  // 检查是否包含敏感信息关键词
  const sensitiveKeywords = [
    'password', 'token', 'secret', 'key', 'credential',
    'database', 'connection', 'host', 'port', 'path',
    'file not found', 'permission denied', 'access denied',
    'ENOENT', 'EACCES', 'EPERM', 'ETIMEDOUT'
  ];

  const lowerMessage = originalMessage.toLowerCase();
  const containsSensitiveInfo = sensitiveKeywords.some(keyword =>
    lowerMessage.includes(keyword.toLowerCase())
  );

  if (containsSensitiveInfo || process.env.NODE_ENV === 'production') {
    // 生产环境或包含敏感信息时返回通用错误消息
    return 'An internal error occurred. Please contact support if the issue persists.';
  }

  // 开发环境且不包含敏感信息时返回原始消息
  return originalMessage;
}

/**
 * POST /api/jenkins/trigger
 * 触发 Jenkins Job 执行
 *
 * 此接口创建执行记录并返回 executionId，供 Jenkins 后续回调使用
 * 实际触发 Jenkins Job 的逻辑需要在此处或由调用方完成
 */
router.post('/trigger', async (req: Request, res: Response) => {
  try {
    const { caseIds, projectId = 1, triggeredBy = 1, jenkinsJobName } = req.body;

    if (!caseIds || !Array.isArray(caseIds) || caseIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'caseIds is required and must be a non-empty array'
      });
    }

    // 创建执行记录
    const execution = await executionService.triggerTestExecution({
      caseIds,
      projectId,
      triggeredBy,
      triggerType: 'jenkins',
      jenkinsJob: jenkinsJobName,
    });

    res.json({
      success: true,
      data: {
        runId: execution.runId,
        totalCases: execution.totalCases,
        status: 'pending',
        jenkinsJobName: jenkinsJobName || null,
        message: 'Execution created. Waiting for Jenkins to start.'
      }
    });
  } catch (error: unknown) {
    const sanitizedMessage = sanitizeErrorMessage(error, 'JENKINS_TRIGGER');
    res.status(500).json({ success: false, message: sanitizedMessage });
  }
});

/**
 * POST /api/jenkins/run-case
 * 触发单个用例执行
 */
router.post('/run-case', [
  rateLimitMiddleware.limit,
  requestValidator.validateSingleExecution
], async (req: Request, res: Response) => {
  const timer = createTimer();
  try {
    const { caseId, projectId, triggeredBy = 1 } = req.body;
    
    logger.info('Starting single case execution', {
      caseId,
      projectId,
      triggeredBy,
    }, LOG_CONTEXTS.JENKINS);

    // 创建执行批次记录
    const execution = await executionService.triggerTestExecution({
      caseIds: [caseId],
      projectId,
      triggeredBy,
      triggerType: 'manual',
    });
    
    logger.info('Execution record created', {
      runId: execution.runId,
      executionId: execution.executionId,
      totalCases: execution.totalCases,
      caseIds: execution.caseIds,
    }, LOG_CONTEXTS.JENKINS);

    // 触发Jenkins Job
    const callbackUrl = `${process.env.API_CALLBACK_URL || 'http://localhost:3000'}/api/executions/callback`;
    logger.debug('Triggering Jenkins job', {
      runId: execution.runId,
      caseId,
      callbackUrl,
    }, LOG_CONTEXTS.JENKINS);

    const triggerResult = await jenkinsService.triggerBatchJob(
      execution.runId,
      [caseId],
      [],
      callbackUrl
    );
    
    logger.info('Jenkins trigger result', {
      success: triggerResult.success,
      message: triggerResult.message,
      buildUrl: triggerResult.buildUrl,
      queueId: triggerResult.queueId,
    }, LOG_CONTEXTS.JENKINS);

    if (triggerResult.success) {
      // 更新Jenkins构建信息
      if (triggerResult.buildUrl) {
        // 解析Jenkins URL获取build ID
        const buildIdMatch = triggerResult.buildUrl.match(/\/(\d+)\/$/);
        const buildId = buildIdMatch ? buildIdMatch[1] : 'unknown';
        
        logger.debug('Updating Jenkins info', {
          runId: execution.runId,
          buildId,
          buildUrl: triggerResult.buildUrl
        }, LOG_CONTEXTS.JENKINS);
        
        await executionService.updateBatchJenkinsInfo(execution.runId, {
          buildId,
          buildUrl: triggerResult.buildUrl,
        });

        logger.info('Jenkins info updated successfully', {
          runId: execution.runId,
          buildId,
        }, LOG_CONTEXTS.JENKINS);
      }
    } else {
      logger.warn('Jenkins trigger failed', {
        runId: execution.runId,
        message: triggerResult.message,
      }, LOG_CONTEXTS.JENKINS);
    }

    const duration = timer();
    res.json({
      success: triggerResult.success,
      data: {
        runId: execution.runId,
        buildUrl: triggerResult.buildUrl,
      },
      message: triggerResult.message,
    });
  } catch (error: unknown) {
    const duration = timer();
    logger.errorLog(error, 'Single case execution failed', {
      caseId: req.body?.caseId,
      projectId: req.body?.projectId,
      durationMs: duration,
    });
    const sanitizedMessage = sanitizeErrorMessage(error, 'JENKINS_RUN_CASE');
    res.status(500).json({ success: false, message: sanitizedMessage });
  }
});

/**
 * POST /api/jenkins/run-batch
 * 触发批量用例执行
 */
router.post('/run-batch', [
  rateLimitMiddleware.limit,
  requestValidator.validateBatchExecution
], async (req: Request, res: Response) => {
  const timer = createTimer();
  try {
    const { caseIds, projectId, triggeredBy = 1 } = req.body;
    
    logger.info('Starting batch case execution', {
      caseCount: caseIds.length,
      caseIds,
      projectId,
      triggeredBy,
    }, LOG_CONTEXTS.JENKINS);

    // 创建执行批次记录
    const execution = await executionService.triggerTestExecution({
      caseIds,
      projectId,
      triggeredBy,
      triggerType: 'manual',
    });
    
    logger.info('Batch execution record created', {
      runId: execution.runId,
      executionId: execution.executionId,
      totalCases: execution.totalCases,
      caseIds: execution.caseIds,
    }, LOG_CONTEXTS.JENKINS);

    // 触发Jenkins Job
    const callbackUrl = `${process.env.API_CALLBACK_URL || 'http://localhost:3000'}/api/executions/callback`;
    logger.debug('Triggering Jenkins job for batch', {
      runId: execution.runId,
      caseCount: caseIds.length,
      callbackUrl,
    }, LOG_CONTEXTS.JENKINS);

    const triggerResult = await jenkinsService.triggerBatchJob(
      execution.runId,
      caseIds,
      [],
      callbackUrl
    );
    
    logger.info('Jenkins trigger result', {
      success: triggerResult.success,
      message: triggerResult.message,
      buildUrl: triggerResult.buildUrl,
      queueId: triggerResult.queueId,
    }, LOG_CONTEXTS.JENKINS);

    if (triggerResult.success) {
      // 更新Jenkins构建信息
      if (triggerResult.buildUrl) {
        const buildIdMatch = triggerResult.buildUrl.match(/\/(\d+)\/$/);
        const buildId = buildIdMatch ? buildIdMatch[1] : 'unknown';
        
        logger.debug('Updating batch Jenkins info', {
          runId: execution.runId,
          buildId,
          buildUrl: triggerResult.buildUrl
        }, LOG_CONTEXTS.JENKINS);
        
        await executionService.updateBatchJenkinsInfo(execution.runId, {
          buildId,
          buildUrl: triggerResult.buildUrl,
        });

        logger.info('Batch Jenkins info updated successfully', {
          runId: execution.runId,
          buildId,
        }, LOG_CONTEXTS.JENKINS);
      }
    } else {
      logger.warn('Batch Jenkins trigger failed', {
        runId: execution.runId,
        message: triggerResult.message,
      }, LOG_CONTEXTS.JENKINS);
    }

    const duration = timer();
    res.json({
      success: triggerResult.success,
      data: {
        runId: execution.runId,
        totalCases: execution.totalCases,
        buildUrl: triggerResult.buildUrl,
      },
      message: triggerResult.message,
    });
  } catch (error: unknown) {
    const duration = timer();
    logger.errorLog(error, 'Batch case execution failed', {
      caseIds: req.body?.caseIds,
      projectId: req.body?.projectId,
      durationMs: duration,
    });
    const sanitizedMessage = sanitizeErrorMessage(error, 'JENKINS_RUN_BATCH');
    res.status(500).json({ success: false, message: sanitizedMessage });
  }
});

/**
 * GET /api/jenkins/tasks/:taskId/cases
 * 获取任务关联的用例列表
 *
 * Jenkins Job 可以调用此接口获取需要执行的用例信息
 */
router.get('/tasks/:taskId/cases', async (req: Request, res: Response) => {
  try {
    const taskId = parseInt(req.params.taskId);
    const cases = await executionService.getRunCases(taskId);

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
router.get('/status/:executionId', async (req: Request, res: Response) => {
  try {
    const executionId = parseInt(req.params.executionId);
    const detail = await executionService.getExecutionDetail(executionId);

    if (!detail || !detail.execution) {
      return res.status(404).json({ success: false, message: 'Execution not found' });
    }

    const execution = detail.execution as any;

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

/**
 * POST /api/jenkins/callback
 * Jenkins 执行结果回调接口
 * 通过 IP 白名单验证，无需额外认证
 */
router.post('/callback', [
  ipWhitelistMiddleware.verify,
  rateLimitMiddleware.limit,
  requestValidator.validateCallback
], async (req: Request, res: Response) => {
  const timer = createTimer();
  let callbackStatus = 'unknown';
  const clientIP = req.ip || req.socket?.remoteAddress || 'unknown';

  try {
    const { runId, status, passedCases = 0, failedCases = 0, skippedCases = 0, durationMs = 0, results = [] } = req.body;
    callbackStatus = status;

    // Enhanced logging with more context
    logger.info('Jenkins callback received', {
      runId,
      status,
      passedCases,
      failedCases,
      skippedCases,
      durationMs,
      resultsCount: results.length,
      clientIP,
      userAgent: req.get('User-Agent'),
    }, LOG_CONTEXTS.JENKINS);

    // Validate data consistency
    const totalReportedCases = passedCases + failedCases + skippedCases;
    if (results.length > 0 && totalReportedCases !== results.length) {
      logger.warn('Data inconsistency detected', {
        runId,
        reportedTotal: totalReportedCases,
        actualResults: results.length,
      }, LOG_CONTEXTS.JENKINS);
    }

    // Validate status value
    const validStatuses = ['success', 'failed', 'cancelled'];
    if (!validStatuses.includes(status)) {
      logger.warn('Invalid status received', {
        runId,
        providedStatus: status,
        validStatuses,
        treatAs: 'failed',
      }, LOG_CONTEXTS.JENKINS);
    }

    logger.debug('Processing batch execution completion', {
      runId,
      status: validStatuses.includes(status) ? status : 'failed',
      resultsCount: results.length,
    }, LOG_CONTEXTS.JENKINS);

    // 完成执行批次
    await executionService.completeBatchExecution(runId, {
      status: validStatuses.includes(status) ? status : 'failed',
      passedCases,
      failedCases,
      skippedCases,
      durationMs,
      results,
    });

    const processingTime = timer();
    logger.info('Callback processed successfully', {
      runId,
      status: callbackStatus,
      processingTimeMs: processingTime,
    }, LOG_CONTEXTS.JENKINS);

    res.json({
      success: true,
      message: 'Callback processed successfully',
      processingTimeMs: processingTime
    });
  } catch (error: unknown) {
    const processingTime = timer();

    logger.errorLog(error, 'Failed to process Jenkins callback', {
      runId: req.body?.runId,
      status: callbackStatus,
      processingTimeMs: processingTime,
      clientIP,
    });

    // Try to update execution status to failed if we have a runId
    if (req.body?.runId) {
      try {
        logger.warn('Attempting fallback: marking execution as failed', {
          runId: req.body.runId,
        }, LOG_CONTEXTS.JENKINS);

        await executionService.completeBatchExecution(req.body.runId, {
          status: 'failed',
          passedCases: 0,
          failedCases: 1,
          skippedCases: 0,
          durationMs: 0,
          results: [{
            caseId: 0,
            caseName: 'Callback Processing Error',
            status: 'failed',
            duration: 0,
            errorMessage: `Callback processing failed: ${sanitizeErrorMessage(error, 'CALLBACK_FALLBACK')}`
          }],
        });

        logger.info('Fallback: Successfully marked execution as failed', {
          runId: req.body.runId,
        }, LOG_CONTEXTS.JENKINS);
      } catch (fallbackError) {
        logger.errorLog(fallbackError, 'Fallback failed: Unable to mark execution as failed', {
          runId: req.body.runId,
        });
      }
    }

    const sanitizedMessage = sanitizeErrorMessage(error, 'JENKINS_CALLBACK');
    res.status(500).json({
      success: false,
      message: sanitizedMessage,
      processingTimeMs: processingTime
    });
  }
});

/**
 * GET /api/jenkins/batch/:runId
 * 获取执行批次详情
 */
router.get('/batch/:runId', async (req: Request, res: Response) => {
  try {
    const runId = parseInt(req.params.runId);
    const batch = await executionService.getBatchExecution(runId);

    res.json({
      success: true,
      data: batch.execution
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ success: false, message });
  }
});

/**
 * POST /api/jenkins/callback/test
 * 测试回调连接 - 支持传入真实数据进行测试处理
 * 可选参数: runId, status, passedCases, failedCases, skippedCases, durationMs, results
 * 如果提供了 runId，则会真实处理回调数据；否则仅测试连接
 * 通过 IP 白名单验证
 */
router.post('/callback/test', [
  ipWhitelistMiddleware.verify,
  rateLimitMiddleware.limit
], async (req: Request, res: Response) => {
  const startTime = Date.now();
  try {
    const clientIP = req.ip || req.socket?.remoteAddress || 'unknown';
    const timestamp = new Date().toISOString();
    
    // 检查是否提供了真实的回调数据
    const { 
      testMessage = 'test',
      runId,
      status,
      passedCases,
      failedCases,
      skippedCases,
      durationMs,
      results
    } = req.body;

    const isRealDataTest = !!runId && !!status;

    console.log(`[CALLBACK-TEST] Received test callback from ${clientIP}`, {
      timestamp,
      isRealDataTest,
      runId,
      status,
      dataMode: isRealDataTest ? 'REAL_DATA' : 'CONNECTION_TEST',
      headers: {
        contentType: req.headers['content-type'],
      }
    });

    // 如果提供了真实回调数据，则处理它
    if (isRealDataTest) {
      console.log(`[CALLBACK-TEST] Processing real callback data:`, {
        runId,
        status,
        passedCases: passedCases || 0,
        failedCases: failedCases || 0,
        skippedCases: skippedCases || 0,
        durationMs: durationMs || 0,
        resultsCount: results?.length || 0
      });

      try {
        // 真实处理回调
        await executionService.completeBatchExecution(runId, {
          status: status || 'failed',
          passedCases: passedCases || 0,
          failedCases: failedCases || 0,
          skippedCases: skippedCases || 0,
          durationMs: durationMs || 0,
          results: results || [],
        });

        const processingTime = Date.now() - startTime;

        console.log(`[CALLBACK-TEST] Successfully processed real callback for runId ${runId} in ${processingTime}ms`);

        res.json({
          success: true,
          message: 'Test callback processed successfully - 测试回调数据已处理',
          mode: 'REAL_DATA',
          details: {
            receivedAt: timestamp,
            clientIP,
            testMessage,
            processedData: {
              runId,
              status,
              passedCases: passedCases || 0,
              failedCases: failedCases || 0,
              skippedCases: skippedCases || 0,
              durationMs: durationMs || 0,
              resultsCount: results?.length || 0
            }
          },
          diagnostics: {
            platform: process.env.NODE_ENV,
            jenkinsUrl: process.env.JENKINS_URL,
            callbackReceived: true,
            networkConnectivity: 'OK',
            dataProcessing: 'SUCCESS',
            timestamp,
            processingTimeMs: processingTime
          },
          recommendations: [
            '✅ 网络连接正常',
            '✅ 回调数据已成功处理',
            '✅ 可以开始集成 Jenkins'
          ]
        });
      } catch (processError) {
        const errorMessage = processError instanceof Error ? processError.message : 'Unknown error';
        const processingTime = Date.now() - startTime;

        console.error(`[CALLBACK-TEST] Failed to process real callback for runId ${runId}:`, {
          error: errorMessage,
          stack: processError instanceof Error ? processError.stack : undefined,
          processingTimeMs: processingTime
        });

        res.status(500).json({
          success: false,
          message: `Failed to process callback data: ${errorMessage}`,
          mode: 'REAL_DATA',
          details: {
            error: errorMessage,
            timestamp: new Date().toISOString(),
            runId,
            processingTimeMs: processingTime,
            suggestions: [
              '检查 runId 是否存在于数据库',
              '查看后端日志获取详细错误信息',
              '确保所有必需字段都已提供'
            ]
          }
        });
      }
    } else {
      // 仅测试连接
      res.json({
        success: true,
        message: 'Callback test successful - 回调连接测试通过',
        mode: 'CONNECTION_TEST',
        details: {
          receivedAt: timestamp,
          clientIP,
          testMessage,
        },
        diagnostics: {
          platform: process.env.NODE_ENV,
          jenkinsUrl: process.env.JENKINS_URL,
          callbackReceived: true,
          networkConnectivity: 'OK',
          timestamp,
        },
        recommendations: [
          '✅ 网络连接正常',
          '✅ 可以开始集成 Jenkins',
          '💡 提示：可以传入 runId、status 等参数来测试真实回调处理'
        ]
      });
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[CALLBACK-TEST] ❌ Test failed:`, {
      error: message,
      stack: error instanceof Error ? error.stack : undefined,
      timestamp: new Date().toISOString()
    });
    res.status(500).json({ 
      success: false, 
      message,
      details: {
        error: message,
        timestamp: new Date().toISOString(),
        suggestions: [
          '检查请求头中的认证信息',
          '验证 IP 地址是否在白名单中',
          '确保请求格式正确'
        ]
      }
    });
  }
});

/**
 * POST /api/jenkins/callback/manual-sync/:runId
 * 手动同步执行状态 - 用于修复卡住的执行记录
 * 从数据库查询当前状态并允许手动更新
 * 通过 IP 白名单验证
 */
router.post('/callback/manual-sync/:runId', [
  ipWhitelistMiddleware.verify,
  rateLimitMiddleware.limit
], async (req: Request, res: Response) => {
  try {
    const runId = parseInt(req.params.runId);
    const { 
      status, 
      passedCases, 
      failedCases, 
      skippedCases, 
      durationMs, 
      results,
      force = false 
    } = req.body;

    if (isNaN(runId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid runId - must be a number'
      });
    }

    console.log(`[MANUAL-SYNC] Starting manual sync for runId: ${runId}`, {
      status,
      passedCases,
      failedCases,
      skippedCases,
      durationMs,
      resultsCount: results?.length || 0,
      force,
      timestamp: new Date().toISOString()
    });

    // 查询现有执行记录
    const execution = await executionService.getBatchExecution(runId);
    
    if (!execution.execution) {
      return res.status(404).json({
        success: false,
        message: `Execution not found: runId=${runId}`
      });
    }

    const executionData = execution.execution as any;
    const currentStatus = executionData.status;

    // 检查是否允许更新
    if (!force && ['success', 'failed', 'cancelled'].includes(currentStatus)) {
      return res.status(400).json({
        success: false,
        message: `Execution is already completed with status: ${currentStatus}. Use force=true to override.`,
        current: {
          id: runId,
          status: currentStatus,
          totalCases: executionData.total_cases,
          passedCases: executionData.passed_cases,
          failedCases: executionData.failed_cases,
          skippedCases: executionData.skipped_cases,
          updatedAt: executionData.updated_at || executionData.created_at
        }
      });
    }

    // 必须提供新状态
    if (!status) {
      return res.status(400).json({
        success: false,
        message: 'status field is required for manual sync'
      });
    }

    // 执行更新
    const startTime = Date.now();

    await executionService.completeBatchExecution(runId, {
      status: status as 'success' | 'failed' | 'cancelled',
      passedCases: passedCases || 0,
      failedCases: failedCases || 0,
      skippedCases: skippedCases || 0,
      durationMs: durationMs || 0,
      results: results || [],
    });

    const processingTime = Date.now() - startTime;

    console.log(`[MANUAL-SYNC] Successfully synced runId ${runId} in ${processingTime}ms`);

    // 查询更新后的数据
    const updated = await executionService.getBatchExecution(runId);

    const updatedData = updated.execution as any;

    res.json({
      success: true,
      message: 'Manual sync completed successfully',
      previous: {
        id: runId,
        status: currentStatus,
        totalCases: executionData.total_cases,
        passedCases: executionData.passed_cases,
        failedCases: executionData.failed_cases,
        skippedCases: executionData.skipped_cases
      },
      updated: {
        id: runId,
        status: updatedData.status,
        totalCases: updatedData.total_cases,
        passedCases: updatedData.passed_cases,
        failedCases: updatedData.failed_cases,
        skippedCases: updatedData.skipped_cases,
        endTime: updatedData.end_time,
        durationMs: updatedData.duration_ms
      },
      timing: {
        processingTimeMs: processingTime,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const errorDetails = error instanceof Error ? error.stack : undefined;

    console.error(`[MANUAL-SYNC] Failed to sync runId:`, {
      error: message,
      stack: errorDetails,
      timestamp: new Date().toISOString()
    });

    res.status(500).json({
      success: false,
      message: `Manual sync failed: ${message}`,
      details: {
        error: message,
        timestamp: new Date().toISOString(),
        suggestions: [
          '检查 runId 是否存在于数据库',
          '确保传入的状态值有效（success、failed、aborted）',
          '查看后端日志获取详细错误信息',
          '如果执行已完成，使用 force=true 强制更新'
        ]
      }
    });
  }
});

/**
 * POST /api/jenkins/callback/diagnose
 * 诊断回调连接问题 - 通过 IP 白名单验证以保护系统信息
 */
router.post('/callback/diagnose',
  rateLimitMiddleware.limit,
  ipWhitelistMiddleware.verify,
  async (req: Request, res: Response) => {
  try {
    const clientIP = req.ip || req.socket?.remoteAddress || 'unknown';
    const timestamp = new Date().toISOString();

    console.log(`[CALLBACK-DIAGNOSE] Diagnostic request from ${clientIP}`, {
      timestamp,
      headers: Object.keys(req.headers).filter(k => k.toLowerCase().includes('auth') || k.toLowerCase().includes('jenkins'))
    });

    // 分析回调配置
    const diagnostics: any = {
      timestamp,
      clientIP,
      environmentVariablesConfigured: {
        jenkins_url: !!process.env.JENKINS_URL,
        jenkins_user: !!process.env.JENKINS_USER,
        jenkins_token: !!process.env.JENKINS_TOKEN,
        jenkins_allowed_ips: !!process.env.JENKINS_ALLOWED_IPS,
      },
      requestHeaders: {
        hasContentType: !!req.headers['content-type'],
      },
      suggestions: [] as string[],
    };

    // 分析问题并给出建议
    if (!diagnostics.environmentVariablesConfigured.jenkins_token) {
      diagnostics.suggestions.push('⚠️  未配置 JENKINS_TOKEN，Jenkins API 集成可能无法正常工作');
    }
    if (!diagnostics.environmentVariablesConfigured.jenkins_allowed_ips) {
      diagnostics.suggestions.push('⚠️  未配置 JENKINS_ALLOWED_IPS，将允许所有 IP 访问回调接口');
    }

    if (diagnostics.suggestions.length === 0) {
      diagnostics.suggestions.push('✅ 所有必需的环境变量已配置');
      diagnostics.suggestions.push('✅ 回调接口已就绪');
    }

    // 提供配置步骤
    diagnostics.nextSteps = [
      '1️⃣ 配置 JENKINS_ALLOWED_IPS 以限制回调源 IP（推荐）',
      '2️⃣ 配置 JENKINS_URL、JENKINS_USER、JENKINS_TOKEN 用于 API 集成',
      '3️⃣ 使用 curl 测试回调：',
      '   curl -X POST http://localhost:3000/api/jenkins/callback/test \\',
      '     -H "Content-Type: application/json" \\',
      '     -d \'{"testMessage": "hello"}\'',
      '4️⃣ 如果收到成功响应，可以开始集成 Jenkins',
      '📚 详细文档：docs/JENKINS_CONFIG_GUIDE.md'
    ];

    res.json({
      success: true,
      data: diagnostics,
      message: 'Diagnostic report generated'
    });

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[CALLBACK-DIAGNOSE] Error:`, message);
    res.status(500).json({
      success: false,
      message: `Diagnostic failed: ${message}`
    });
  }
});

/**
 * GET /api/jenkins/health
 * Jenkins 连接健康检查 - 包括详细的诊断信息
 */
router.get('/health', async (req: Request, res: Response) => {
  const startTime = Date.now();

  try {
    console.log(`[/api/jenkins/health] Starting Jenkins health check...`);

    // 测试 Jenkins 连接
    const jenkinsUrl = process.env.JENKINS_URL || 'http://jenkins.wiac.xyz:8080/';
    const jenkinsUser = process.env.JENKINS_USER || 'root';
    const jenkinsToken = process.env.JENKINS_TOKEN || '';
    
    // 健康检查数据
    const healthCheckData: any = {
      timestamp: new Date().toISOString(),
      duration: 0,
      checks: {
        connectionTest: { success: false, duration: 0 },
        authenticationTest: { success: false, duration: 0 },
        apiResponseTest: { success: false, duration: 0 },
      },
      diagnostics: {
        configPresent: {
          url: !!jenkinsUrl,
          user: !!jenkinsUser,
          token: !!jenkinsToken,
        }
      },
      issues: [] as string[],
      recommendations: [] as string[],
    };

    // 1. 测试基础连接
    console.log(`[/api/jenkins/health] Testing connection to:`, jenkinsUrl);
    const connStartTime = Date.now();
    
    // 构建 API URL（处理 URL 尾部斜杠）
    let apiUrl = jenkinsUrl;
    if (!apiUrl.endsWith('/')) {
      apiUrl += '/';
    }
    apiUrl += 'api/json';
    
    console.log(`[/api/jenkins/health] Final API URL:`, apiUrl);
    
    const credentials = Buffer.from(`${jenkinsUser}:${jenkinsToken}`).toString('base64');
    
    // 设置超时
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10秒超时
    
    try {
      const response = await fetch(apiUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Basic ${credentials}`,
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      healthCheckData.checks.connectionTest.duration = Date.now() - connStartTime;
      healthCheckData.checks.connectionTest.success = response.ok;
      healthCheckData.diagnostics.connectionStatus = response.status;
      healthCheckData.diagnostics.statusText = response.statusText;

      console.log(`[/api/jenkins/health] Response status:`, response.status);

      if (response.ok) {
        const data = await response.json() as any;
        healthCheckData.checks.authenticationTest.success = true;
        healthCheckData.checks.apiResponseTest.success = true;
        
        res.json({
          success: true,
          data: {
            connected: true,
            jenkinsUrl,
            version: data.version || 'unknown',
            timestamp: new Date().toISOString(),
            details: healthCheckData,
          },
          message: 'Jenkins is healthy'
        });
      } else if (response.status === 401 || response.status === 403) {
        healthCheckData.issues.push('❌ 认证失败：API Token 或用户名可能不正确');
        healthCheckData.recommendations.push('检查 JENKINS_USER 和 JENKINS_TOKEN 环境变量');
        
        res.status(response.status).json({
          success: false,
          data: {
            connected: false,
            status: response.status,
            statusText: response.statusText,
            details: healthCheckData,
          },
          message: 'Jenkins service authentication failed. Please check configuration.'
        });
      } else {
        healthCheckData.issues.push(`❌ Jenkins 返回错误状态: ${response.status} ${response.statusText}`);
        healthCheckData.recommendations.push('检查 Jenkins 服务是否正常运行');
        healthCheckData.recommendations.push('检查 JENKINS_URL 是否正确');
        
        res.status(response.status).json({
          success: false,
          data: {
            connected: false,
            status: response.status,
            statusText: response.statusText,
            details: healthCheckData,
          },
          message: `Jenkins returned ${response.status}: ${response.statusText}`
        });
      }
    } catch (fetchError) {
      clearTimeout(timeoutId);
      
      const fetchErrorMsg = fetchError instanceof Error ? fetchError.message : String(fetchError);
      healthCheckData.checks.connectionTest.duration = Date.now() - connStartTime;
      
      if (fetchErrorMsg.includes('ECONNREFUSED')) {
        healthCheckData.issues.push('❌ 连接被拒绝：Jenkins 服务可能未运行');
        healthCheckData.recommendations.push('确保 Jenkins 服务已启动');
      } else if (fetchErrorMsg.includes('ENOTFOUND')) {
        healthCheckData.issues.push('❌ DNS 解析失败：无法解析 Jenkins 域名');
        healthCheckData.recommendations.push('检查 JENKINS_URL 中的域名是否正确');
        healthCheckData.recommendations.push('检查网络连接和 DNS 配置');
      } else if (fetchErrorMsg.includes('Aborted')) {
        healthCheckData.issues.push('❌ 请求超时：Jenkins 响应时间过长（> 10秒）');
        healthCheckData.recommendations.push('检查 Jenkins 服务状态和网络连接');
        healthCheckData.recommendations.push('考虑增加超时时间');
      } else {
        healthCheckData.issues.push(`❌ 网络错误：${fetchErrorMsg}`);
      }
      
      throw fetchError;
    }
  } catch (error: unknown) {
    const sanitizedMessage = sanitizeErrorMessage(error, 'JENKINS_HEALTH');

    res.status(500).json({
      success: false,
      data: {
        connected: false,
        error: sanitizedMessage,
        details: {
          timestamp: new Date().toISOString(),
          duration: Date.now() - startTime,
          issues: [
            '❌ 无法连接到 Jenkins',
            '请检查Jenkins服务状态和网络连接'
          ],
          recommendations: [
            '检查 Jenkins 服务是否运行',
            '检查网络连接',
            '验证 Jenkins URL 配置',
            '查看应用日志获取详细错误信息'
          ]
        },
        stack: process.env.NODE_ENV === 'development' ? (error instanceof Error ? error.stack : undefined) : undefined
      },
      message: `Failed to connect to Jenkins: ${sanitizedMessage}`
    });
  }
});

/**
 * GET /api/jenkins/diagnose
 * 诊断执行问题 - 通过 IP 白名单验证以保护系统信息
 */
router.get('/diagnose',
  rateLimitMiddleware.limit,
  ipWhitelistMiddleware.verify,
  async (req: Request, res: Response) => {
  try {
    const runId = parseInt(req.query.runId as string);
    
    if (!runId) {
      return res.status(400).json({
        success: false,
        message: 'runId parameter is required'
      });
    }

    console.log(`[/api/jenkins/diagnose] Diagnosing execution ${runId}...`);

    // 获取执行批次信息
    const batch = await executionService.getBatchExecution(runId);
    const execution = batch.execution;

    // 计算执行时长
    const startTime = execution.startTime ? new Date(execution.startTime).getTime() : null;
    const currentTime = Date.now();
    const executionDuration = startTime ? currentTime - startTime : 0;

    // 检查Jenkins连接状态
    let jenkinsConnectivity: any = null;
    if (execution.jenkinsJob && execution.jenkinsBuildId) {
      try {
        const { jenkinsStatusService } = await import('../services/JenkinsStatusService');
        const buildStatus = await jenkinsStatusService.getBuildStatus(
          execution.jenkinsJob as string,
          execution.jenkinsBuildId as string
        );
        jenkinsConnectivity = {
          canConnect: !!buildStatus,
          buildStatus: buildStatus ? {
            building: buildStatus.building,
            result: buildStatus.result,
            duration: buildStatus.duration,
            url: buildStatus.url
          } : null
        };
      } catch (error) {
        jenkinsConnectivity = {
          canConnect: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        };
      }
    }

    // 收集诊断信息
    const diagnostics = {
      executionId: execution.id,
      status: execution.status,
      jenkinsJob: execution.jenkinsJob,
      jenkinsBuildId: execution.jenkinsBuildId,
      jenkinsUrl: execution.jenkinsUrl,
      startTime: execution.startTime,
      createdAt: execution.createdAt,
      totalCases: execution.totalCases,
      passedCases: execution.passedCases,
      failedCases: execution.failedCases,
      skippedCases: execution.skippedCases,
      executionDuration,

      // 诊断信息
      diagnostics: {
        jenkinsInfoMissing: !execution.jenkinsJob || !execution.jenkinsBuildId || !execution.jenkinsUrl,
        startTimeMissing: !execution.startTime,
        stillPending: execution.status === 'pending',
        stillRunning: execution.status === 'running',
        noTestResults: execution.passedCases === 0 && execution.failedCases === 0 && execution.skippedCases === 0,
        longRunning: executionDuration > 5 * 60 * 1000, // 超过5分钟
        veryLongRunning: executionDuration > 10 * 60 * 1000, // 超过10分钟
        jenkinsConnectivity,

        // 时间分析
        timeAnalysis: {
          executionAge: executionDuration,
          executionAgeMinutes: Math.round(executionDuration / 60000),
          isOld: executionDuration > 30 * 60 * 1000, // 超过30分钟
          createdRecently: startTime && execution.createdAt ? (currentTime - new Date(execution.createdAt).getTime()) < 60 * 1000 : false
        },

        // 建议
        suggestions: [] as string[]
      }
    };

    // 生成建议
    const sugg = diagnostics.diagnostics.suggestions;

    if (diagnostics.diagnostics.jenkinsInfoMissing) {
      sugg.push('🚨 Jenkins 信息未被填充。这通常表示 Jenkins 触发失败。请检查后端日志查找错误信息。');
    }

    if (diagnostics.diagnostics.startTimeMissing) {
      sugg.push('⏳ 执行开始时间为空。这表示 Jenkins 尚未开始构建。请等待几秒后重试。');
    }

    if (diagnostics.diagnostics.stillPending) {
      if (diagnostics.diagnostics.timeAnalysis.executionAgeMinutes > 2) {
        sugg.push('⚠️ 执行已处于 pending 状态超过2分钟，可能存在问题。建议手动同步状态。');
      } else {
        sugg.push('⏳ 执行仍处于 pending 状态。这是正常的，系统正在等待 Jenkins 接收任务。');
      }
    }

    if (diagnostics.diagnostics.stillRunning) {
      if (diagnostics.diagnostics.veryLongRunning) {
        sugg.push('🚨 执行已运行超过10分钟，可能卡住了。建议检查Jenkins构建状态或手动同步。');
      } else if (diagnostics.diagnostics.longRunning) {
        sugg.push('⚠️ 执行已运行超过5分钟，请检查是否正常。可以尝试手动同步状态。');
      }
    }

    if (diagnostics.diagnostics.noTestResults && !diagnostics.diagnostics.stillPending) {
      sugg.push('❌ 测试结果为空。这可能表示 Jenkins 任务失败或回调未到达。请检查 Jenkins 的执行日志。');
    }

    // Jenkins连接性建议
    if (jenkinsConnectivity) {
      if (!jenkinsConnectivity.canConnect) {
        sugg.push('🔌 无法连接到Jenkins获取构建状态。请检查Jenkins服务器状态和网络连接。');
      } else if (jenkinsConnectivity.buildStatus) {
        const buildStatus = jenkinsConnectivity.buildStatus;
        if (!buildStatus.building && buildStatus.result) {
          if (execution.status === 'running') {
            sugg.push(`🔄 Jenkins显示构建已完成(${buildStatus.result})，但平台状态仍为running。建议立即手动同步。`);
          }
        }
      }
    }

    // 基于时间的建议
    if (diagnostics.diagnostics.timeAnalysis.isOld) {
      sugg.push('🕐 执行时间过长(超过30分钟)，建议检查或取消该执行。');
    }

    if (sugg.length === 0) {
      sugg.push('✅ 执行状态良好，无明显问题。');
    }

    res.json({
      success: true,
      data: diagnostics
    });

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[/api/jenkins/diagnose] Error:`, message);
    res.status(500).json({
      success: false,
      message: `Diagnosis failed: ${message}`
    });
  }
});

/**
 * GET /api/jenkins/monitoring/stats
 * 获取监控统计信息
 */
router.get('/monitoring/stats', async (_req, res) => {
  try {
    console.log(`[MONITORING] Getting monitoring statistics...`);

    // 获取混合同步服务的统计信息
    const { hybridSyncService } = await import('../services/HybridSyncService');
    const syncStats = hybridSyncService.getMonitoringStats();

    // 获取最近的执行统计
    const recentExecutions = await executionService.getRecentExecutions(50) as any[];
    const statusCounts = recentExecutions.reduce((acc: Record<string, number>, exec: any) => {
      acc[exec.status] = (acc[exec.status] || 0) + 1;
      return acc;
    }, {});

    // 计算卡住的执行数量
    const stuckExecutions = recentExecutions.filter((exec: any) => {
      if (!['running', 'pending'].includes(exec.status) || !exec.start_time) return false;
      const duration = Date.now() - new Date(exec.start_time).getTime();
      return duration > 5 * 60 * 1000; // 超过5分钟
    });

    const stats = {
      timestamp: new Date().toISOString(),
      syncService: syncStats,
      executions: {
        total: recentExecutions.length,
        byStatus: statusCounts,
        stuck: stuckExecutions.length,
        stuckList: stuckExecutions.map((exec: any) => ({
          id: exec.id,
          status: exec.status,
          duration: Date.now() - new Date(exec.start_time).getTime(),
          jenkins_job: exec.jenkins_job,
          jenkins_build_id: exec.jenkins_build_id
        }))
      },
      health: {
        totalIssues: syncStats.failed + syncStats.timeout + stuckExecutions.length,
        hasIssues: (syncStats.failed + syncStats.timeout + stuckExecutions.length) > 0
      }
    };

    res.json({
      success: true,
      data: stats
    });

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[MONITORING] Failed to get stats:`, message);
    res.status(500).json({
      success: false,
      message: `Failed to get monitoring stats: ${message}`
    });
  }
});

/**
 * POST /api/jenkins/monitoring/fix-stuck
 * 修复卡住的执行
 */
router.post('/monitoring/fix-stuck', async (req: Request, res: Response) => {
  try {
    const { timeoutMinutes = 5, dryRun = false } = req.body;

    console.log(`[MONITORING] ${dryRun ? 'Simulating' : 'Starting'} fix for stuck executions (timeout: ${timeoutMinutes}min)`);

    if (dryRun) {
      // 只查询，不修复
      const timeoutMs = timeoutMinutes * 60 * 1000;
      const timeoutThreshold = new Date(Date.now() - timeoutMs);

      const { query } = await import('../config/database');
      const stuckExecutions = await query(`
        SELECT id, status, jenkins_job, jenkins_build_id, jenkins_url,
               start_time, TIMESTAMPDIFF(MINUTE, start_time, NOW()) as duration_minutes
        FROM Auto_TestRun
        WHERE status IN ('pending', 'running')
          AND start_time < ?
        ORDER BY start_time ASC
        LIMIT 20
      `, [timeoutThreshold]) as any[];

      res.json({
        success: true,
        data: {
          dryRun: true,
          wouldFix: stuckExecutions.length,
          executions: stuckExecutions
        }
      });
    } else {
      // 实际修复
      const timeoutMs = timeoutMinutes * 60 * 1000;
      const result = await executionService.checkAndHandleTimeouts(timeoutMs);

      res.json({
        success: true,
        data: {
          dryRun: false,
          checked: result.checked,
          updated: result.updated,
          timedOut: result.timedOut,
          message: `Fixed ${result.updated} executions, marked ${result.timedOut} as timed out`
        }
      });
    }

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[MONITORING] Failed to fix stuck executions:`, message);
    res.status(500).json({
      success: false,
      message: `Failed to fix stuck executions: ${message}`
    });
  }
});

export default router;