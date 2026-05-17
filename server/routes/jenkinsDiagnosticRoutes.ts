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
  DEFAULT_JENKINS_URL,
  DEFAULT_JENKINS_USER,
  HEALTH_CHECK_TIMEOUT_MS,
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

export function registerJenkinsDiagnosticRoutes(router: Router): void {
router.get('/health', generalAuthRateLimiter, rateLimitMiddleware.limit, async (req: Request, res: Response) => {
  const startTime = Date.now();

  try {
    logger.info(`Starting Jenkins health check...`, {}, LOG_CONTEXTS.JENKINS);

    // 测试 Jenkins 连接
    // 生产环境强制要求配置 Jenkins 环境变量
    if (process.env.NODE_ENV === 'production') {
      if (!process.env.JENKINS_URL || !process.env.JENKINS_USER || !process.env.JENKINS_TOKEN) {
        return res.status(500).json({
          success: false,
          message: 'Jenkins configuration is missing in production environment',
          data: {
            connected: false,
            details: {
              issues: [
                '❌ 生产环境缺少必需的 Jenkins 配置',
                !process.env.JENKINS_URL ? '❌ JENKINS_URL 未配置' : '',
                !process.env.JENKINS_USER ? '❌ JENKINS_USER 未配置' : '',
                !process.env.JENKINS_TOKEN ? '❌ JENKINS_TOKEN 未配置' : '',
              ].filter(Boolean),
              recommendations: [
                '请在环境变量中配置 JENKINS_URL',
                '请在环境变量中配置 JENKINS_USER',
                '请在环境变量中配置 JENKINS_TOKEN',
              ],
            },
          },
        });
      }
    }

    const jenkinsUrl = process.env.JENKINS_URL || DEFAULT_JENKINS_URL;
    const jenkinsUser = process.env.JENKINS_USER || DEFAULT_JENKINS_USER;
    const jenkinsToken = process.env.JENKINS_TOKEN || '';

    // 健康检查数据
    const healthCheckData: {
      timestamp: string;
      duration: number;
      checks: Record<string, { success: boolean; duration: number }>;
      diagnostics: Record<string, unknown>;
      issues: string[];
      recommendations: string[];
    } = {
      timestamp: new Date().toISOString(),
      duration: 0,
      checks: {
        connectionTest: { success: false, duration: 0 },
        authenticationTest: { success: false, duration: 0 },
        apiResponseTest: { success: false, duration: 0 },
        targetJobInspection: { success: false, duration: 0 },
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
    logger.debug(`Testing connection to Jenkins`, {
      jenkinsUrl,
    }, LOG_CONTEXTS.JENKINS);
    const connStartTime = Date.now();
    
    // 构建 API URL（处理 URL 尾部斜杠）
    let apiUrl = jenkinsUrl;
    if (!apiUrl.endsWith('/')) {
      apiUrl += '/';
    }
    apiUrl += 'api/json';
    
    logger.debug(`Final API URL for health check`, {
      apiUrl,
    }, LOG_CONTEXTS.JENKINS);
    
    const credentials = Buffer.from(`${jenkinsUser}:${jenkinsToken}`).toString('base64');
    
    // 设置超时
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), HEALTH_CHECK_TIMEOUT_MS);
    
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

      logger.debug(`Jenkins health check response received`, {
        status: response.status,
        statusText: response.statusText,
        duration: healthCheckData.checks.connectionTest.duration,
      }, LOG_CONTEXTS.JENKINS);

      if (response.ok) {
        const data = await response.json() as Record<string, unknown>;
        healthCheckData.checks.authenticationTest.success = true;
        healthCheckData.checks.apiResponseTest.success = true;
        let triggerReady = false;

        const targetJobStart = Date.now();
        try {
          const targetJobInspection = await jenkinsService.inspectConfiguredApiJob();
          healthCheckData.checks.targetJobInspection.duration = Date.now() - targetJobStart;
          healthCheckData.checks.targetJobInspection.success = Boolean(targetJobInspection?.triggerReady);
          healthCheckData.diagnostics.targetJobInspection = targetJobInspection;
          triggerReady = Boolean(targetJobInspection?.triggerReady);

          if (targetJobInspection) {
            healthCheckData.issues.push(...targetJobInspection.issues);
            healthCheckData.recommendations.push(...targetJobInspection.recommendations);
          }
        } catch (inspectionError) {
          healthCheckData.checks.targetJobInspection.duration = Date.now() - targetJobStart;
          healthCheckData.diagnostics.targetJobInspectionError =
            inspectionError instanceof Error ? inspectionError.message : String(inspectionError);
          healthCheckData.issues.push('❌ 无法读取目标 Jenkins Job 的实时配置');
          healthCheckData.recommendations.push('检查 Jenkins Job 权限，确保当前账号具备读取任务配置的权限。');
        }

        healthCheckData.duration = Date.now() - startTime;
        
        res.json({
          success: true,
          data: {
            connected: true,
            triggerReady,
            jenkinsUrl,
            version: typeof data['version'] === 'string' ? data['version'] : 'unknown',
            timestamp: new Date().toISOString(),
            details: healthCheckData,
          },
          message: triggerReady
            ? 'Jenkins is healthy'
            : 'Jenkins is reachable, but the target job needs configuration fixes before the platform can trigger it'
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
  generalAuthRateLimiter,
  rateLimitMiddleware.limit,
  ipWhitelistMiddleware.verify,
  async (req: Request, res: Response) => {
  try {
    const runId = parseInt(req.query.runId as string);

    if (isNaN(runId) || runId <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid runId parameter. Must be a positive integer.'
      });
    }

    logger.info(`Starting execution diagnosis`, {
      runId,
    }, LOG_CONTEXTS.JENKINS);

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
    logger.error(`Execution diagnosis failed`, {
      event: LOG_EVENTS.JENKINS_DIAGNOSE_FAILED,
      error: message,
    }, LOG_CONTEXTS.JENKINS);
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
router.get('/monitoring/stats', generalAuthRateLimiter, rateLimitMiddleware.limit, async (_req, res) => {
  try {
    logger.info(`Getting monitoring statistics...`, {}, LOG_CONTEXTS.JENKINS);

    // 获取混合同步服务的统计信息
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
    logger.error(`Failed to get monitoring statistics`, {
      event: LOG_EVENTS.JENKINS_MONITORING_STATS_FAILED,
      error: message,
    }, LOG_CONTEXTS.JENKINS);
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
router.post('/monitoring/fix-stuck', generalAuthRateLimiter, rateLimitMiddleware.limit, async (req: Request, res: Response) => {
  try {
    const fixBody = (req.body ?? {}) as Record<string, unknown>;
    const timeoutMinutes = typeof fixBody['timeoutMinutes'] === 'number' ? fixBody['timeoutMinutes'] : 5;
    const dryRun = typeof fixBody['dryRun'] === 'boolean' ? fixBody['dryRun'] : false;

    logger.info(`${dryRun ? 'Simulating' : 'Starting'} fix for stuck executions`, {
      timeoutMinutes,
      dryRun,
    }, LOG_CONTEXTS.JENKINS);

    if (dryRun) {
      // 只查询，不修复
      const timeoutMs = timeoutMinutes * 60 * 1000;
      const timeoutThreshold = new Date(Date.now() - timeoutMs);

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
    logger.error(`Failed to fix stuck executions`, {
      event: LOG_EVENTS.JENKINS_FIX_STUCK_FAILED,
      error: message,
    }, LOG_CONTEXTS.JENKINS);
    res.status(500).json({
      success: false,
      message: `Failed to fix stuck executions: ${message}`
    });
  }
});

/**
 * GET /api/jenkins/monitor/status
 * Get execution monitor service status and statistics
 */
router.get('/monitor/status', generalAuthRateLimiter, rateLimitMiddleware.limit, async (_req: Request, res: Response) => {
  try {
    const status = executionMonitorService.getStatus();
    const stats = executionMonitorService.getStats();

    logger.debug('Monitor status requested', {
      isRunning: status.isRunning,
      cyclesRun: stats.cyclesRun,
    }, LOG_CONTEXTS.MONITOR);

    res.json({
      success: true,
      data: {
        status: status.isRunning ? 'running' : 'stopped',
        isRunning: status.isRunning,
        config: status.config,
        stats: {
          cyclesRun: stats.cyclesRun,
          totalExecutionsChecked: stats.totalExecutionsChecked,
          totalExecutionsUpdated: stats.totalExecutionsUpdated,
          totalCompilationFailures: stats.totalCompilationFailures,
          totalErrors: stats.totalErrors,
          lastCycleTime: stats.lastCycleTime,
          lastCycleDuration: stats.lastCycleDuration,
          isProcessing: stats.isProcessing,
        },
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to get monitor status', {
      event: LOG_EVENTS.JENKINS_MONITOR_STATUS_FAILED,
      error: message,
    }, LOG_CONTEXTS.MONITOR);
    res.status(500).json({
      success: false,
      message: `Failed to get monitor status: ${message}`,
    });
  }
});

/**
 * GET /api/jenkins/metrics
 * 获取 Jenkins 集成相关的所有监控指标（P2-C）
 *
 * 聚合指标：
 * - rateLimit: 429 次数、每分钟 429 速率、活跃 IP 数
 * - callbackQueue: 队列深度、总入队/处理/失败数、平均排队时长、重试分布
 * - jenkinsQueue: queueId 轮询总次数、成功解析数、超时/取消数、平均/最大等待时长
 * - process: 内存使用、进程运行时长
 *
 * 访问控制：需要认证（通过 optionalAuth 获取用户信息，如未认证则仅返回部分指标）
 */
router.get('/metrics', [generalAuthRateLimiter, optionalAuth], (_req: Request, res: Response) => {
  try {
    const rateLimitMetrics = rateLimitMiddleware.getMetrics();
    const queueMetrics = callbackQueue.getMetrics();
    const jenkinsQueueMetrics = jenkinsService.getQueueMetrics();
    const memUsage = process.memoryUsage();

    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      data: {
        /**
         * 速率限制指标
         */
        rateLimit: {
          total429Count: rateLimitMetrics.total429Count,
          rate429PerMinute: rateLimitMetrics.rate429PerMinute,
          activeIPs: rateLimitMetrics.activeIPs,
        },

        /**
         * 回调队列指标（P2-B）
         */
        callbackQueue: {
          queueDepth: queueMetrics.queueDepth,
          workerBusy: queueMetrics.workerBusy,
          totalEnqueued: queueMetrics.totalEnqueued,
          totalProcessed: queueMetrics.totalProcessed,
          totalFailed: queueMetrics.totalFailed,
          avgWaitMs: queueMetrics.avgWaitMs,
          maxWaitMs: queueMetrics.maxWaitMs,
          retryDistribution: queueMetrics.retryDistribution,
          // 最近 20 条排队时长样本（用于画趋势图）
          recentWaitSamples: queueMetrics.waitTimeSamples.slice(-20),
        },

        /**
         * Jenkins 构建队列指标（P2-A）
         */
        jenkinsQueue: {
          totalPolls: jenkinsQueueMetrics.totalPolls,
          resolvedCount: jenkinsQueueMetrics.resolvedCount,
          timeoutCount: jenkinsQueueMetrics.timeoutCount,
          avgWaitMs: jenkinsQueueMetrics.avgWaitMs,
          maxWaitMs: jenkinsQueueMetrics.maxWaitMs,
          resolutionRate: jenkinsQueueMetrics.totalPolls > 0
            ? Math.round((jenkinsQueueMetrics.resolvedCount / jenkinsQueueMetrics.totalPolls) * 100)
            : 0,
          // 最近 20 条 Jenkins 队列等待时长样本
          recentWaitSamples: jenkinsQueueMetrics.waitTimeSamples.slice(-20),
        },

        /**
         * 进程级指标
         */
        process: {
          uptimeSeconds: Math.floor(process.uptime()),
          memoryMB: {
            rss: Math.round(memUsage.rss / 1024 / 1024),
            heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
            heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
          },
        },
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ success: false, message });
  }
});
}
