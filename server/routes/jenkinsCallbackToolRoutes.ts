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

export function registerJenkinsCallbackToolRoutes(router: Router): void {
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
    const normalizedInputResults = Array.isArray(results) ? normalizeCallbackResults(results) : [];

    logger.debug(`Received test callback from ${clientIP}`, {
      timestamp,
      isRealDataTest,
      runId,
      status,
      dataMode: isRealDataTest ? 'REAL_DATA' : 'CONNECTION_TEST',
      headers: {
        contentType: req.headers['content-type'],
      },
      clientIP,
    }, LOG_CONTEXTS.JENKINS);

    // 如果提供了真实回调数据，则处理它
    if (isRealDataTest) {
      logger.info(`Processing real callback test data`, {
        runId,
        status,
        passedCases: passedCases || 0,
        failedCases: failedCases || 0,
        skippedCases: skippedCases || 0,
        durationMs: durationMs || 0,
        resultsCount: normalizedInputResults.length
      }, LOG_CONTEXTS.JENKINS);
      try {
        // 真实处理回调
        await executionService.completeBatchExecution(runId, {
          status: status || 'failed',
          passedCases: passedCases || 0,
          failedCases: failedCases || 0,
          skippedCases: skippedCases || 0,
          durationMs: durationMs || 0,
          results: normalizedInputResults,
        });
        const processingTime = Date.now() - startTime;

        logger.info(`Successfully processed real callback test data for runId ${runId}`, {
          runId,
          processingTimeMs: processingTime,
          dataMode: 'REAL_DATA',
        }, LOG_CONTEXTS.JENKINS);

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
              resultsCount: normalizedInputResults.length
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

        logger.error(`Failed to process real callback test data for runId ${runId}`, {
          event: LOG_EVENTS.JENKINS_CALLBACK_TEST_FAILED,
          runId,
          error: errorMessage,
          stack: processError instanceof Error ? processError.stack : undefined,
          processingTimeMs: processingTime
        }, LOG_CONTEXTS.JENKINS);

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
    logger.error(`Test callback failed`, {
      event: LOG_EVENTS.JENKINS_CALLBACK_FAILED,
      error: message,
      stack: error instanceof Error ? error.stack : undefined,
      timestamp: new Date().toISOString()
    }, LOG_CONTEXTS.JENKINS);
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
 * 手动同步执行状态 - 用于修复卡住的运行记录
 * 从数据库查询当前状态并允许手动更新
 * 通过 IP 白名单验证
 */
router.post('/callback/manual-sync/:runId', [
  ipWhitelistMiddleware.verify,
  rateLimitMiddleware.limit
], async (req: Request, res: Response) => {
  try {
    const runId = parseInt(req.params.runId);
    const syncBody = (req.body ?? {}) as Record<string, unknown>;
    const status = syncBody['status'];
    const passedCases = syncBody['passedCases'];
    const failedCases = syncBody['failedCases'];
    const skippedCases = syncBody['skippedCases'];
    const durationMs = syncBody['durationMs'];
    const results = syncBody['results'];
    const force = typeof syncBody['force'] === 'boolean' ? syncBody['force'] : false;
    const normalizedManualResults = Array.isArray(results) ? normalizeCallbackResults(results) : [];

    if (isNaN(runId) || runId <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid runId parameter. Must be a positive integer.'
      });
    }

    logger.info(`Starting manual sync for execution`, {
      runId,
      status,
      passedCases,
      failedCases,
      skippedCases,
      durationMs,
      resultsCount: normalizedManualResults.length,
      force,
      timestamp: new Date().toISOString()
    }, LOG_CONTEXTS.JENKINS);

    // 查询现有运行记录
    const execution = await executionService.getBatchExecution(runId);
    
    if (!execution.execution) {
      return res.status(404).json({
        success: false,
        message: `Execution not found: runId=${runId}`
      });
    }

    const executionData = execution.execution as unknown as Record<string, unknown>;
    const currentStatus = executionData['status'];

    // 检查是否允许更新
    if (!force && ['success', 'failed', 'cancelled'].includes(currentStatus as string)) {
      return res.status(400).json({
        success: false,
        message: `Execution is already completed with status: ${currentStatus}. Use force=true to override.`,
        current: {
          id: runId,
          status: currentStatus,
          totalCases: executionData['total_cases'],
          passedCases: executionData['passed_cases'],
          failedCases: executionData['failed_cases'],
          skippedCases: executionData['skipped_cases'],
          updatedAt: executionData['updated_at'] ?? executionData['created_at']
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
      passedCases: typeof passedCases === 'number' ? passedCases : 0,
      failedCases: typeof failedCases === 'number' ? failedCases : 0,
      skippedCases: typeof skippedCases === 'number' ? skippedCases : 0,
      durationMs: typeof durationMs === 'number' ? durationMs : 0,
      results: normalizedManualResults,
    });

    const processingTime = Date.now() - startTime;

    logger.info(`Successfully completed manual sync for execution`, {
      runId,
      processingTimeMs: processingTime,
      timestamp: new Date().toISOString(),
    }, LOG_CONTEXTS.JENKINS);

    // 查询更新后的数据
    const updated = await executionService.getBatchExecution(runId);

    const updatedData = updated.execution as unknown as Record<string, unknown>;

    res.json({
      success: true,
      message: 'Manual sync completed successfully',
      previous: {
        id: runId,
        status: currentStatus,
        totalCases: executionData['total_cases'],
        passedCases: executionData['passed_cases'],
        failedCases: executionData['failed_cases'],
        skippedCases: executionData['skipped_cases']
      },
      updated: {
        id: runId,
        status: updatedData['status'],
        totalCases: updatedData['total_cases'],
        passedCases: updatedData['passed_cases'],
        failedCases: updatedData['failed_cases'],
        skippedCases: updatedData['skipped_cases'],
        endTime: updatedData['end_time'],
        durationMs: updatedData['duration_ms']
      },
      timing: {
        processingTimeMs: processingTime,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const errorDetails = error instanceof Error ? error.stack : undefined;

    logger.error(`Failed to complete manual sync for execution`, {
      event: LOG_EVENTS.JENKINS_MANUAL_SYNC_FAILED,
      runId: req.params.runId,
      error: message,
      stack: errorDetails,
      timestamp: new Date().toISOString()
    }, LOG_CONTEXTS.JENKINS);

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
 *
 * 安全建议：建议添加管理员权限验证
 * TODO: 添加 requireAuth 和 requireRole('admin') 中间件以增强安全性
 */
router.post('/callback/diagnose',
  generalAuthRateLimiter,
  optionalAuth,  // 添加可选认证，获取用户信息
  rateLimitMiddleware.limit,
  ipWhitelistMiddleware.verify,
  async (req: Request, res: Response) => {
  // 检查用户权限（如果已认证）
  if (req.user && process.env.NODE_ENV === 'production') {
    // 在生产环境中，建议检查用户是否为管理员
    // if (req.user.role !== 'admin') {
    //   return res.status(403).json({
    //     success: false,
    //     message: 'Access denied. Admin privileges required.'
    //   });
    // }
    logger.info('Diagnostic request from authenticated user', {
      userId: req.user.id,
      userEmail: req.user.email,
    }, LOG_CONTEXTS.JENKINS);
  }
  try {
    const clientIP = req.ip || req.socket?.remoteAddress || 'unknown';
    const timestamp = new Date().toISOString();

    logger.debug(`Received callback diagnostic request`, {
      clientIP,
      timestamp,
      headers: Object.keys(req.headers).filter(k => k.toLowerCase().includes('auth') || k.toLowerCase().includes('jenkins'))
    }, LOG_CONTEXTS.JENKINS);

    // 分析回调配置
    const envConfig = {
      jenkins_url: !!process.env.JENKINS_URL,
      jenkins_user: !!process.env.JENKINS_USER,
      jenkins_token: !!process.env.JENKINS_TOKEN,
      jenkins_allowed_ips: !!process.env.JENKINS_ALLOWED_IPS,
    };
    const diagnostics: {
      timestamp: string;
      clientIP: string;
      environmentVariablesConfigured: typeof envConfig;
      requestHeaders: Record<string, unknown>;
      suggestions: string[];
      nextSteps?: string[];
    } = {
      timestamp,
      clientIP,
      environmentVariablesConfigured: envConfig,
      requestHeaders: {
        hasContentType: !!req.headers['content-type'],
      },
      suggestions: [],
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
    logger.error(`Callback diagnostic failed`, {
      event: LOG_EVENTS.JENKINS_DIAGNOSE_FAILED,
      error: message,
    }, LOG_CONTEXTS.JENKINS);
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
}
