import { Router, Request, Response } from 'express';
import { In } from 'typeorm';
import { executionService, type Auto_TestRunResultsInput } from '../services/ExecutionService';
import { jenkinsService } from '../services/JenkinsService';
import { jenkinsStatusService } from '../services/JenkinsStatusService';
import { taskSchedulerService } from '../services/TaskSchedulerService';
import { callbackQueue, type CallbackPayload } from '../services/CallbackQueue';
import { ipWhitelistMiddleware, rateLimitMiddleware } from '../middleware/JenkinsAuthMiddleware';
import { requestValidator } from '../middleware/RequestValidator';
import { generalAuthRateLimiter } from '../middleware/authRateLimiter';
import { optionalAuth } from '../middleware/auth';
import logger from '../utils/logger';
import { buildJenkinsTriggerFailureDiagnostic } from '../utils/jenkinsTriggerDiagnostics';
import { persistJenkinsTriggerFailureDiagnostic } from '../utils/jenkinsTriggerDiagnosticArtifact';
import { validateScriptPathsInTestRepo } from '../utils/testRepoScriptPathValidator';
import { LOG_CONTEXTS, LOG_EVENTS, createTimer } from '../config/logging';
import { AppDataSource, query, queryOne } from '../config/database';
import { TestCase } from '../entities/TestCase';
import { hybridSyncService } from '../services/HybridSyncService';
import { executionMonitorService } from '../services/ExecutionMonitorService';
import {
  CALLBACK_TERMINAL_STATUSES,
  deriveCallbackTerminalStatus,
  normalizeCallbackTerminalStatus,
} from '../services/ExecutionService/callbackStatus';
import {
  buildCallbackUrl,
  normalizeCallbackResults,
  preflightExecutableScriptPaths,
  recordTriggerFailure,
  resolveExecutionBusinessError,
  resolveScriptPaths,
  runJenkinsTriggerPrecheck,
  sanitizeErrorMessage,
  scheduleCallbackFallbackSync,
  warnIfCallbackUrlIsLocal,
} from './jenkinsRouteSupport';

export function registerJenkinsExecutionRoutes(router: Router): void {
router.post('/trigger', generalAuthRateLimiter, optionalAuth, rateLimitMiddleware.limit, async (req: Request, res: Response) => {
  try {
    const triggerBody = (req.body ?? {}) as Record<string, unknown>;
    let caseIds = triggerBody['caseIds'];
    const projectId = typeof triggerBody['projectId'] === 'number' ? triggerBody['projectId'] : 1;
    // 优先使用认证用户 ID，回退到请求体中的 triggeredBy，最后才用默认值 1（系统管理员）
    const triggeredBy = req.user?.id ?? (typeof triggerBody['triggeredBy'] === 'number' ? triggerBody['triggeredBy'] : 1);
    const jenkinsJobName = typeof triggerBody['jenkinsJobName'] === 'string' ? triggerBody['jenkinsJobName'] : undefined;
    const taskId = typeof triggerBody['taskId'] === 'number' ? triggerBody['taskId'] : undefined;
    let taskName: string | undefined;

    // 如果传入了 taskId，从数据库查找任务信息
    if (taskId !== undefined) {
      const task = await queryOne<{ id: number; name: string; case_ids: string; project_id: number }>(
        'SELECT id, name, case_ids, project_id FROM Auto_TestCaseTasks WHERE id = ?',
        [taskId]
      );

      if (!task) {
        return res.status(404).json({
          success: false,
          message: `Task with id ${taskId} not found`
        });
      }

      taskName = task.name;

      // 如果没有直接传入 caseIds，从任务中解析
      if (!caseIds || !Array.isArray(caseIds) || caseIds.length === 0) {
        try {
          const parsedCaseIds = JSON.parse(task.case_ids);
          if (!Array.isArray(parsedCaseIds) || parsedCaseIds.length === 0) {
            logger.warn('Task has empty or invalid case_ids', {
              taskId,
              case_ids: task.case_ids,
            }, LOG_CONTEXTS.JENKINS);
            return res.status(400).json({
              success: false,
              message: `Task ${taskId} has no valid case_ids configured`
            });
          }
          caseIds = parsedCaseIds as number[];
        } catch (err) {
          logger.error('Failed to parse task case_ids', {
            event: LOG_EVENTS.JENKINS_TRIGGER_FAILED,
            taskId,
            case_ids: task.case_ids,
            error: err instanceof Error ? err.message : String(err),
          }, LOG_CONTEXTS.JENKINS);
          return res.status(500).json({
            success: false,
            message: 'Failed to parse task configuration. Invalid JSON format in case_ids field.'
          });
        }
      }
    }

    if (!caseIds || !Array.isArray(caseIds) || caseIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'caseIds is required and must be a non-empty array (or provide a valid taskId with case_ids)'
      });
    }

    // 创建运行记录
    const execution = await executionService.triggerTestExecution({
      caseIds: caseIds as number[],
      projectId,
      triggeredBy,
      triggerType: 'jenkins',
      jenkinsJob: jenkinsJobName,
      taskId,
      taskName,
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
    const businessError = resolveExecutionBusinessError(error);
    if (businessError) {
      return res.status(businessError.statusCode).json({
        success: false,
        message: businessError.message,
        details: businessError.details,
      });
    }

    const sanitizedMessage = sanitizeErrorMessage(error, 'JENKINS_TRIGGER');
    res.status(500).json({ success: false, message: sanitizedMessage });
  }
});

/**
 * POST /api/jenkins/run-case
 * 触发单个用例执行
 *
 * 异步队列模式：
 * 1. 立即创建执行记录（status=pending）
 * 2. 立即返回 runId 给前端（不阻塞）
 * 3. 后台通过 enqueueDirectJob 等待并发槽位，槽位可用后再触发 Jenkins
 */
router.post('/run-case', [
  generalAuthRateLimiter,
  optionalAuth,
  rateLimitMiddleware.limit,
  requestValidator.validateSingleExecution
], async (req: Request, res: Response) => {
  const timer = createTimer();
  const { caseId, projectId } = req.body;
  const triggeredBy: number = req.user?.id ?? (typeof req.body.triggeredBy === 'number' ? req.body.triggeredBy : 1);
  const slotLabel = `case:${caseId}`;

  try {
    logger.info('Starting single case execution (async queue mode)', {
      caseId,
      projectId,
      triggeredBy,
    }, LOG_CONTEXTS.JENKINS);

    const precheck = await runJenkinsTriggerPrecheck('run-case');
    if (!precheck.ok) {
      return res.status(503).json({
        success: false,
        message: `Jenkins 当前不可用，请稍后重试（${precheck.reason}）`,
        details: {
          reason: precheck.reason,
          source: 'run-case-precheck',
          retryable: true,
        },
      });
    }

    // ── Step 1: 立即创建执行记录（状态 pending）──────────────
    const scriptPathPreflight = await preflightExecutableScriptPaths([caseId]);
    if (!scriptPathPreflight.ok) {
      return res.status(scriptPathPreflight.statusCode).json({
        success: false,
        message: scriptPathPreflight.message,
        details: scriptPathPreflight.details,
      });
    }

    const preflightScriptPaths = scriptPathPreflight.scriptPaths;

    const execution = await executionService.triggerTestExecution({
      caseIds: [caseId],
      projectId,
      triggeredBy,
      triggerType: 'manual',
    });

    logger.info('Execution record created, returning runId immediately', {
      runId: execution.runId,
      executionId: execution.executionId,
    }, LOG_CONTEXTS.JENKINS);

    // ── Step 2: 立即返回 runId，不等待 Jenkins ───────────────
    const duration = timer();
    res.json({
      success: true,
      data: {
        runId: execution.runId,
        status: 'queued',
      },
      message: '任务已加入执行队列',
      _concurrency: {
        slotsUsed: taskSchedulerService.getStatus().running.length,
        slotsLimit: taskSchedulerService.getStatus().concurrencyLimit,
        directQueued: taskSchedulerService.getStatus().directQueueDepth,
      },
    });

    // ── Step 3: 后台异步等待槽位 + 触发 Jenkins ──────────────
    const capturedRunId = execution.runId;

    try {
      taskSchedulerService.enqueueDirectJob(slotLabel, async (placeholderRunId: number) => {
        // 槽位获取后，用真实 runId 替换占位槽位
        taskSchedulerService.registerDirectSlot(capturedRunId, slotLabel, placeholderRunId);

        try {
          // 解析脚本路径
          const callbackUrl = buildCallbackUrl();

          // 触发 Jenkins
          const triggerResult = await jenkinsService.triggerBatchJob(
            capturedRunId,
            [caseId],
            preflightScriptPaths,
            callbackUrl,
            async (buildNumber: number, buildUrl: string, queueWaitMs: number) => {
              const buildId = String(buildNumber);
              logger.debug('[dev-10] Build resolved via queueId poll, updating Jenkins info', {
                runId: capturedRunId,
                buildId,
                buildUrl,
                queueWaitMs,
              }, LOG_CONTEXTS.JENKINS);
              await executionService.updateBatchJenkinsInfo(capturedRunId, { buildId, buildUrl });
              scheduleCallbackFallbackSync(capturedRunId, 'run-case');
            },
            async (reason: 'cancelled' | 'timeout') => {
              logger.warn('[dev-11] Jenkins queue cancelled/timeout, marking execution as aborted', {
                runId: capturedRunId,
                reason,
              }, LOG_CONTEXTS.JENKINS);
              try {
                await executionService.markExecutionAborted(capturedRunId, `Jenkins build ${reason}`);
              } catch (err) {
                logger.warn('[dev-11] Failed to mark execution as aborted', {
                  runId: capturedRunId,
                  error: err instanceof Error ? err.message : String(err),
                }, LOG_CONTEXTS.JENKINS);
              }
              taskSchedulerService.releaseSlotByRunId(capturedRunId);
            }
          );

          if (!triggerResult.success) {
            // Jenkins 触发失败，立即释放槽位
            taskSchedulerService.releaseSlotByRunId(capturedRunId);
            // 将执行状态标记为失败
            try {
              await recordTriggerFailure(capturedRunId, [caseId], preflightScriptPaths, callbackUrl, 'run-case', triggerResult);
            } catch { /* ignore */ }
            logger.warn('[run-case] Jenkins trigger failed (async), slot released', {
              runId: capturedRunId,
              message: triggerResult.message,
            }, LOG_CONTEXTS.JENKINS);
          } else {
            logger.info('[run-case] Jenkins trigger success (async)', {
              runId: capturedRunId,
              queueId: triggerResult.queueId,
            }, LOG_CONTEXTS.JENKINS);
          }
        } catch (jenkinsErr) {
          // Jenkins 执行异常，释放槽位并标记失败
          taskSchedulerService.releaseSlotByRunId(capturedRunId);
          try {
            await executionService.markExecutionAborted(capturedRunId, `Jenkins error: ${jenkinsErr instanceof Error ? jenkinsErr.message : String(jenkinsErr)}`);
          } catch { /* ignore */ }
          logger.errorLog(jenkinsErr, '[run-case] Async Jenkins trigger error', { runId: capturedRunId, caseId });
        }
      });
    } catch (queueErr) {
      // 仅当队列已满才会到这里（enqueueDirectJob 同步抛出）
      // runId 已返回给前端，将执行状态标记为失败
      const queueErrMsg = queueErr instanceof Error ? queueErr.message : '并发队列已满';
      logger.warn('[run-case] Queue full, marking execution as aborted', {
        runId: capturedRunId,
        message: queueErrMsg,
      }, LOG_CONTEXTS.JENKINS);
      try {
        await executionService.markExecutionAborted(capturedRunId, queueErrMsg);
      } catch { /* ignore */ }
    }

  } catch (error: unknown) {
    const duration = timer();
    logger.errorLog(error, 'Single case execution failed (creating record)', {
      caseId,
      projectId,
      durationMs: duration,
    });

    const businessError = resolveExecutionBusinessError(error);
    if (businessError) {
      return res.status(businessError.statusCode).json({
        success: false,
        message: businessError.message,
        details: businessError.details,
      });
    }

    const sanitizedMessage = sanitizeErrorMessage(error, 'JENKINS_RUN_CASE');
    res.status(500).json({ success: false, message: sanitizedMessage });
  }
});

/**
 * POST /api/jenkins/run-batch
 * 触发批量用例执行
 *
 * 异步队列模式：
 * 1. 立即创建执行记录（status=pending）
 * 2. 立即返回 runId 给前端（不阻塞）
 * 3. 后台通过 enqueueDirectJob 等待并发槽位，槽位可用后再触发 Jenkins
 */
router.post('/run-batch', [
  generalAuthRateLimiter,
  optionalAuth,
  rateLimitMiddleware.limit,
  requestValidator.validateBatchExecution
], async (req: Request, res: Response) => {
  const timer = createTimer();
  const { caseIds, projectId } = req.body;
  const triggeredBy: number = req.user?.id ?? (typeof req.body.triggeredBy === 'number' ? req.body.triggeredBy : 1);
  // label 展示前几个 caseId，避免过长
  const labelIds = (caseIds as number[]).slice(0, 3).join(',') + (caseIds.length > 3 ? `…(${caseIds.length})` : '');
  const slotLabel = `batch:${labelIds}`;

  try {
    logger.info('Starting batch case execution (async queue mode)', {
      caseCount: caseIds.length,
      caseIds,
      projectId,
      triggeredBy,
    }, LOG_CONTEXTS.JENKINS);

    const precheck = await runJenkinsTriggerPrecheck('run-batch');
    if (!precheck.ok) {
      return res.status(503).json({
        success: false,
        message: `Jenkins 当前不可用，请稍后重试（${precheck.reason}）`,
        details: {
          reason: precheck.reason,
          source: 'run-batch-precheck',
          retryable: true,
        },
      });
    }

    // ── Step 1: 立即创建执行记录（状态 pending）──────────────
    const scriptPathPreflight = await preflightExecutableScriptPaths(caseIds);
    if (!scriptPathPreflight.ok) {
      return res.status(scriptPathPreflight.statusCode).json({
        success: false,
        message: scriptPathPreflight.message,
        details: scriptPathPreflight.details,
      });
    }

    const preflightScriptPaths = scriptPathPreflight.scriptPaths;

    const execution = await executionService.triggerTestExecution({
      caseIds,
      projectId,
      triggeredBy,
      triggerType: 'manual',
    });

    logger.info('Batch execution record created, returning runId immediately', {
      runId: execution.runId,
      executionId: execution.executionId,
      totalCases: execution.totalCases,
    }, LOG_CONTEXTS.JENKINS);

    // ── Step 2: 立即返回 runId，不等待 Jenkins ───────────────
    const duration = timer();
    res.json({
      success: true,
      data: {
        runId: execution.runId,
        totalCases: execution.totalCases,
        status: 'queued',
      },
      message: '任务已加入执行队列',
      _concurrency: {
        slotsUsed: taskSchedulerService.getStatus().running.length,
        slotsLimit: taskSchedulerService.getStatus().concurrencyLimit,
        directQueued: taskSchedulerService.getStatus().directQueueDepth,
      },
    });

    // ── Step 3: 后台异步等待槽位 + 触发 Jenkins ──────────────
    const capturedRunId = execution.runId;

    try {
      taskSchedulerService.enqueueDirectJob(slotLabel, async (placeholderRunId: number) => {
        // 槽位获取后，用真实 runId 替换占位槽位
        taskSchedulerService.registerDirectSlot(capturedRunId, slotLabel, placeholderRunId);

        try {
          // 解析脚本路径
          const callbackUrl = buildCallbackUrl();

          // 触发 Jenkins
          const triggerResult = await jenkinsService.triggerBatchJob(
            capturedRunId,
            caseIds,
            preflightScriptPaths,
            callbackUrl,
            async (buildNumber: number, buildUrl: string, queueWaitMs: number) => {
              const buildId = String(buildNumber);
              logger.debug('[dev-10] Build resolved via queueId poll, updating batch Jenkins info', {
                runId: capturedRunId,
                buildId,
                buildUrl,
                queueWaitMs,
              }, LOG_CONTEXTS.JENKINS);
              await executionService.updateBatchJenkinsInfo(capturedRunId, { buildId, buildUrl });
              scheduleCallbackFallbackSync(capturedRunId, 'run-batch');
            },
            async (reason: 'cancelled' | 'timeout') => {
              logger.warn('[dev-11] Batch Jenkins queue cancelled/timeout, marking execution as aborted', {
                runId: capturedRunId,
                reason,
              }, LOG_CONTEXTS.JENKINS);
              try {
                await executionService.markExecutionAborted(capturedRunId, `Jenkins build ${reason}`);
              } catch (err) {
                logger.warn('[dev-11] Failed to mark batch execution as aborted', {
                  runId: capturedRunId,
                  error: err instanceof Error ? err.message : String(err),
                }, LOG_CONTEXTS.JENKINS);
              }
              taskSchedulerService.releaseSlotByRunId(capturedRunId);
            }
          );

          if (!triggerResult.success) {
            taskSchedulerService.releaseSlotByRunId(capturedRunId);
            try {
              await recordTriggerFailure(capturedRunId, caseIds, preflightScriptPaths, callbackUrl, 'run-batch', triggerResult);
            } catch { /* ignore */ }
            logger.warn('[run-batch] Jenkins trigger failed (async), slot released', {
              runId: capturedRunId,
              message: triggerResult.message,
            }, LOG_CONTEXTS.JENKINS);
          } else {
            logger.info('[run-batch] Jenkins trigger success (async)', {
              runId: capturedRunId,
              queueId: triggerResult.queueId,
            }, LOG_CONTEXTS.JENKINS);
          }
        } catch (jenkinsErr) {
          taskSchedulerService.releaseSlotByRunId(capturedRunId);
          try {
            await executionService.markExecutionAborted(capturedRunId, `Jenkins error: ${jenkinsErr instanceof Error ? jenkinsErr.message : String(jenkinsErr)}`);
          } catch { /* ignore */ }
          logger.errorLog(jenkinsErr, '[run-batch] Async Jenkins trigger error', { runId: capturedRunId, caseIds });
        }
      });
    } catch (queueErr) {
      const queueErrMsg = queueErr instanceof Error ? queueErr.message : '并发队列已满';
      logger.warn('[run-batch] Queue full, marking execution as aborted', {
        runId: capturedRunId,
        message: queueErrMsg,
      }, LOG_CONTEXTS.JENKINS);
      try {
        await executionService.markExecutionAborted(capturedRunId, queueErrMsg);
      } catch { /* ignore */ }
    }

  } catch (error: unknown) {
    const duration = timer();
    logger.errorLog(error, 'Batch case execution failed (creating record)', {
      caseIds,
      projectId,
      durationMs: duration,
    });

    const businessError = resolveExecutionBusinessError(error);
    if (businessError) {
      return res.status(businessError.statusCode).json({
        success: false,
        message: businessError.message,
        details: businessError.details,
      });
    }

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
router.get('/tasks/:taskId/cases', generalAuthRateLimiter, optionalAuth, rateLimitMiddleware.limit, async (req: Request, res: Response) => {
  try {
    const taskId = parseInt(req.params.taskId);
    if (isNaN(taskId) || taskId <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid taskId parameter. Must be a positive integer.'
      });
    }
    const cases = await executionService.getRunCases(taskId);

    res.json({
      success: true,
      data: cases
    });
  } catch (error: unknown) {
    logger.errorLog(error, 'Failed to get task cases', {
      event: LOG_EVENTS.JENKINS_TRIGGER_FAILED,
      taskId: req.params.taskId,
    });
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
router.get('/status/:executionId', generalAuthRateLimiter, optionalAuth, rateLimitMiddleware.limit, async (req: Request, res: Response) => {
  try {
    const executionId = parseInt(req.params.executionId);
    if (isNaN(executionId) || executionId <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid executionId parameter. Must be a positive integer.'
      });
    }
    const detail = await executionService.getExecutionDetail(executionId);

    if (!detail || !detail.execution) {
      return res.status(404).json({ success: false, message: 'Execution not found' });
    }

    const execution = detail.execution as unknown as Record<string, unknown>;

    res.json({
      success: true,
      data: {
        executionId,
        status: execution['status'],
        totalCases: execution['total_cases'],
        passedCases: execution['passed_cases'],
        failedCases: execution['failed_cases'],
        skippedCases: execution['skipped_cases'],
        startTime: execution['start_time'],
        endTime: execution['end_time'],
        duration: execution['duration'],
        // Jenkins 相关字段（预留）
        jenkinsStatus: null,
        buildNumber: null,
        consoleUrl: null
      }
    });
  } catch (error: unknown) {
    logger.errorLog(error, 'Failed to get execution status', {
      event: LOG_EVENTS.JENKINS_TRIGGER_FAILED,
      executionId: req.params.executionId,
    });
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ success: false, message });
  }
});

/**
 * POST /api/jenkins/callback
 * Jenkins 执行结果回调接口
 * 通过 IP 白名单验证，无需额外认证
 * 注意：此接口不使用 generalAuthRateLimiter，避免高并发回调时触发 429
 * 安全由 ipWhitelistMiddleware 白名单保护，并使用专用的 rateLimitMiddleware
 */
router.post('/callback', [
  ipWhitelistMiddleware.verify,
  rateLimitMiddleware.limit,
  requestValidator.validateCallback
], (req: Request, res: Response) => {
  /**
   * [P2-B] 快速 ACK 模式
   * 1. 仅做轻量校验和数据规范化（同步、无 I/O）
   * 2. 将任务入队到 callbackQueue
   * 3. 立即返回 202 Accepted，Jenkins 不会超时重试
   * 4. 后台 worker 异步消费队列，执行 completeBatchExecution + releaseSlot
   */
  const receiveTimeMs = Date.now();
  const clientIP = req.ip || req.socket?.remoteAddress || 'unknown';

  const {
    runId,
    status,
    passedCases: reportedPassedCases = 0,
    failedCases: reportedFailedCases = 0,
    skippedCases: reportedSkippedCases = 0,
    durationMs = 0,
    results = [],
    // 轻量化回调模式：仅发送 buildNumber
    buildNumber,
  } = req.body;

  // 判断是否为轻量化回调（有 buildNumber 但无 results）
  const isLightweightCallback = !Array.isArray(results) || results.length === 0;

  const rawResults = Array.isArray(results) ? results : [];
  const normalizedResults = normalizeCallbackResults(rawResults);
  let passedCases = typeof reportedPassedCases === 'number' ? reportedPassedCases : 0;
  let failedCases = typeof reportedFailedCases === 'number' ? reportedFailedCases : 0;
  let skippedCases = typeof reportedSkippedCases === 'number' ? reportedSkippedCases : 0;

  // 从详细结果推导计数（与旧逻辑一致）
  if (normalizedResults.length > 0) {
    let derivedPassed = 0;
    let derivedFailed = 0;
    let derivedSkipped = 0;

    for (const result of normalizedResults) {
      const caseStatus = String(result['status'] || '').toLowerCase();
      if (caseStatus === 'passed') derivedPassed++;
      else if (caseStatus === 'failed' || caseStatus === 'error') derivedFailed++;
      else derivedSkipped++;
    }

    const totalReported = passedCases + failedCases + skippedCases;
    const totalDerived  = derivedPassed + derivedFailed + derivedSkipped;
    const shouldUseDerived = totalReported === 0
      || totalReported !== normalizedResults.length
      || totalReported !== totalDerived;

    if (shouldUseDerived) {
      logger.warn('Callback summary mismatch, using derived counts', {
        runId,
        reported: { passedCases, failedCases, skippedCases, total: totalReported },
        derived:  { passedCases: derivedPassed, failedCases: derivedFailed, skippedCases: derivedSkipped, total: totalDerived },
        resultsCount: normalizedResults.length,
      }, LOG_CONTEXTS.JENKINS);
      passedCases = derivedPassed;
      failedCases = derivedFailed;
      skippedCases = derivedSkipped;
    }
  }

  // 规范化状态值
  const normalizedReportedStatus = normalizeCallbackTerminalStatus(status);

  if (normalizedReportedStatus !== status) {
    logger.warn('Invalid callback status, treating as failed', {
      runId,
      providedStatus: status,
      validStatuses: CALLBACK_TERMINAL_STATUSES,
    }, LOG_CONTEXTS.JENKINS);
  }

  const hasCallbackSummary = (passedCases + failedCases + skippedCases) > 0;
  const normalizedStatus = hasCallbackSummary
    ? deriveCallbackTerminalStatus({
        reportedStatus: normalizedReportedStatus,
        passedCases,
        failedCases,
        skippedCases,
      })
    : normalizedReportedStatus;

  logger.info('Jenkins callback received, enqueuing for async processing', {
    runId,
    status: normalizedStatus,
    passedCases,
    failedCases,
    skippedCases,
    durationMs,
    resultsCount: normalizedResults.length,
    clientIP,
    userAgent: req.get('User-Agent'),
    receiveTimeMs,
    isLightweightCallback,
    buildNumber,
  }, LOG_CONTEXTS.JENKINS);

  // 入队（非阻塞）
  const enqueued = callbackQueue.enqueue({
    runId,
    status: normalizedStatus,
    passedCases,
    failedCases,
    skippedCases,
    durationMs,
    results: normalizedResults,
    // 轻量化回调参数
    buildNumber: isLightweightCallback ? buildNumber : undefined,
    needsServerParsing: isLightweightCallback,
  });

  if (!enqueued) {
    // 队列已满：返回 429 让 Jenkins 稍后重试
    rateLimitMiddleware.increment429Count();
    logger.error('Callback queue full, returning 429', {
      event: LOG_EVENTS.JENKINS_CALLBACK_QUEUE_FULL,
      runId,
      queueMetrics: callbackQueue.getMetrics(),
    }, LOG_CONTEXTS.JENKINS);
    return res.status(429).json({
      success: false,
      message: 'Callback queue is full. Please retry later.',
      retryAfter: 5,
    });
  }

  // 快速 ACK（202 Accepted：已接受，正在异步处理）
  const ackTimeMs = Date.now() - receiveTimeMs;
  return res.status(202).json({
    success: true,
    message: 'Callback accepted for async processing',
    ackTimeMs,
  });
});

/**
 * GET /api/jenkins/batch/:runId
 * 获取执行批次详情
 */
router.get('/batch/:runId', generalAuthRateLimiter, optionalAuth, rateLimitMiddleware.limit, async (req: Request, res: Response) => {
  try {
    const runId = parseInt(req.params.runId);
    if (isNaN(runId) || runId <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid runId parameter. Must be a positive integer.'
      });
    }
    const batch = await executionService.getBatchExecution(runId);

    const e = batch.execution;

    // 将 TypeORM entity 的 camelCase 字段映射为 snake_case，与前端 TestRunRecord 接口对齐
    res.json({
      success: true,
      data: {
        id: e.id,
        project_id: e.projectId ?? null,
        project_name: null,
        status: e.status,
        trigger_type: e.triggerType,
        trigger_by: e.triggerBy,
        trigger_by_name: e.triggerByName ?? null,
        jenkins_job: e.jenkinsJob ?? null,
        jenkins_build_id: e.jenkinsBuildId ?? null,
        jenkins_url: e.jenkinsUrl ?? null,
        total_cases: e.totalCases,
        passed_cases: e.passedCases,
        failed_cases: e.failedCases,
        skipped_cases: e.skippedCases,
        duration_ms: e.durationMs,
        start_time: e.startTime ?? null,
        end_time: e.endTime ?? null,
        created_at: e.createdAt,
      }
    });
  } catch (error: unknown) {
    logger.errorLog(error, 'Failed to get batch execution', {
      event: LOG_EVENTS.JENKINS_CALLBACK_FAILED,
      runId: req.params.runId,
    });
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
}
