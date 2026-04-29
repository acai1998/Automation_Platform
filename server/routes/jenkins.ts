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

const router = Router();

// ────────────────────────────────────────────────────────────────────────────
// 常量定义
// ────────────────────────────────────────────────────────────────────────────

/** 回调兜底同步默认延迟（毫秒） */
const DEFAULT_CALLBACK_FALLBACK_SYNC_DELAY_MS = 45_000;
/** 回调兜底同步最小延迟（毫秒） */
const MIN_CALLBACK_FALLBACK_SYNC_DELAY_MS = 10_000;
/** Jenkins 健康检查超时（毫秒） */
const HEALTH_CHECK_TIMEOUT_MS = 5_000;
/** Jenkins 健康检查默认 URL */
const DEFAULT_JENKINS_URL = 'http://jenkins.wiac.xyz';
/** Jenkins 健康检查默认用户 */
const DEFAULT_JENKINS_USER = 'root';
/** 触发前 Jenkins 预检查默认超时（毫秒） */
const DEFAULT_TRIGGER_PRECHECK_TIMEOUT_MS = 8_000;
/** 触发前 Jenkins 预检查超时（毫秒） */
const TRIGGER_PRECHECK_TIMEOUT_MS = Math.max(
  1_000,
  Number.parseInt(
    process.env.JENKINS_TRIGGER_PRECHECK_TIMEOUT_MS ?? String(DEFAULT_TRIGGER_PRECHECK_TIMEOUT_MS),
    10
  ) || DEFAULT_TRIGGER_PRECHECK_TIMEOUT_MS
);
/** 触发前 Jenkins 预检查重试次数（总尝试次数 = 1 + retries） */
const TRIGGER_PRECHECK_RETRIES = Math.max(
  0,
  Math.min(3, Number.parseInt(process.env.JENKINS_TRIGGER_PRECHECK_RETRIES ?? '1', 10) || 1)
);
/** 触发前 Jenkins 预检查重试间隔（毫秒） */
const TRIGGER_PRECHECK_RETRY_DELAY_MS = Math.max(
  200,
  Number.parseInt(process.env.JENKINS_TRIGGER_PRECHECK_RETRY_DELAY_MS ?? '600', 10) || 600
);
/** 是否启用触发前 Jenkins 预检查 */
// 注：Jenkins 预检查默认禁用（当 Jenkins 网络不稳定时）
// 设置 JENKINS_TRIGGER_PRECHECK_ENABLED=true 以启用
// 启用后，当 Jenkins 无法连接时，任务触发请求会被拒绝 (503 Service Unavailable)
const TRIGGER_PRECHECK_ENABLED = (process.env.JENKINS_TRIGGER_PRECHECK_ENABLED ?? 'false') !== 'false';

/**
 * [P2-B] 注册 CallbackQueue 消费者
 * 将 completeBatchExecution + releaseSlot 的整个处理流程注入队列 worker
 * 在路由模块初始化时立即注册，确保消费者在第一个请求到来之前已就绪
 * 
 * 支持两种模式：
 * 1. 全量回调：Jenkins 解析结果后发送完整数据（兼容旧模式）
 * 2. 轻量化回调：Jenkins 仅发送 buildNumber，服务端主动解析结果
 */
callbackQueue.register(async (payload: CallbackPayload) => {
  let shouldReleaseSlot = false;
  try {
    let finalPayload = payload;

    // ─── 轻量化回调：服务端主动解析结果 ─────────────────────────────
    if (payload.needsServerParsing) {
      logger.info('[CallbackQueue] Lightweight callback detected, parsing results from Jenkins', {
        runId: payload.runId,
        buildNumber: payload.buildNumber,
      }, LOG_CONTEXTS.JENKINS);

      try {
        // 从数据库获取执行记录，提取 jenkinsJob 名称
        const batch = await executionService.getBatchExecution(payload.runId);
        const execution = batch?.execution;
        const buildNumber = payload.buildNumber ?? execution?.jenkinsBuildId;

        if (execution?.jenkinsJob && buildNumber) {
          const testResults = await jenkinsStatusService.parseBuildResults(
            execution.jenkinsJob as string,
            String(buildNumber)
          );

          if (testResults) {
            const reportedStatus = normalizeCallbackTerminalStatus(payload.status);
            // 使用解析结果覆盖 payload
            finalPayload = {
              runId: payload.runId,
              status: deriveCallbackTerminalStatus({
                reportedStatus,
                passedCases: testResults.passedCases,
                failedCases: testResults.failedCases,
                skippedCases: testResults.skippedCases,
              }),
              passedCases: testResults.passedCases,
              failedCases: testResults.failedCases,
              skippedCases: testResults.skippedCases,
              durationMs: testResults.duration || payload.durationMs,
              results: testResults.results.map(r => ({
                caseId: r.caseId,
                caseName: r.caseName,
                status: r.status,
                duration: r.duration,
                errorMessage: r.errorMessage,
                stackTrace: r.stackTrace,
              })),
            };

            logger.info('[CallbackQueue] Successfully parsed results from Jenkins', {
              runId: payload.runId,
              buildNumber,
              status: finalPayload.status,
              passedCases: finalPayload.passedCases,
              failedCases: finalPayload.failedCases,
              skippedCases: finalPayload.skippedCases,
            }, LOG_CONTEXTS.JENKINS);
          } else {
            // 解析失败，降级为使用构建状态
            logger.warn('[CallbackQueue] Failed to parse results from Jenkins, falling back to build status', {
              runId: payload.runId,
              buildNumber,
              fallbackStatus: payload.status,
            }, LOG_CONTEXTS.JENKINS);
          }
        } else {
          logger.warn('[CallbackQueue] No jenkins job/build number found for execution, cannot parse results', {
            runId: payload.runId,
            buildNumber,
            jenkinsJob: execution?.jenkinsJob,
            jenkinsBuildId: execution?.jenkinsBuildId,
          }, LOG_CONTEXTS.JENKINS);
        }
      } catch (parseError) {
        logger.error('Failed to parse build results in lightweight callback', {
          event: LOG_EVENTS.JENKINS_CALLBACK_PARSE_FAILED,
          runId: payload.runId,
          buildNumber: payload.buildNumber,
          error: parseError instanceof Error ? parseError.message : String(parseError),
        }, LOG_CONTEXTS.JENKINS);
        // 解析异常，继续使用原始 payload（降级处理）
      }
    }

    const normalizedReportedStatus = normalizeCallbackTerminalStatus(finalPayload.status);
    const hasCallbackSummary = (finalPayload.passedCases + finalPayload.failedCases + finalPayload.skippedCases) > 0;
    finalPayload = {
      ...finalPayload,
      status: hasCallbackSummary
        ? deriveCallbackTerminalStatus({
            reportedStatus: normalizedReportedStatus,
            passedCases: finalPayload.passedCases,
            failedCases: finalPayload.failedCases,
            skippedCases: finalPayload.skippedCases,
          })
        : normalizedReportedStatus,
    };

    await executionService.completeBatchExecution(finalPayload.runId, {
      status: finalPayload.status,
      passedCases: finalPayload.passedCases,
      failedCases: finalPayload.failedCases,
      skippedCases: finalPayload.skippedCases,
      durationMs: finalPayload.durationMs,
      results: finalPayload.results as Parameters<typeof executionService.completeBatchExecution>[1]['results'],
    });
    // 只在成功完成后标记需要释放槽位
    shouldReleaseSlot = true;
  } catch (error) {
    // 如果 completeBatchExecution 失败，让 CallbackQueue 的重试机制处理
    // 不释放槽位，避免重复释放
    logger.warn('[CallbackQueue] completeBatchExecution failed, will retry', {
      runId: payload.runId,
      error: error instanceof Error ? error.message : String(error),
    }, LOG_CONTEXTS.EXECUTION);
    throw error; // 重新抛出错误以触发重试
  } finally {
    // 只在成功完成后释放并发槽位
    if (shouldReleaseSlot) {
      taskSchedulerService.releaseSlotByRunId(payload.runId);
      logger.debug('[CallbackQueue] Slot released after successful completion', {
        runId: payload.runId,
      }, LOG_CONTEXTS.EXECUTION);
    }
  }
});

const CALLBACK_FALLBACK_SYNC_DELAY_MS = Math.max(
  MIN_CALLBACK_FALLBACK_SYNC_DELAY_MS,
  Number.parseInt(
    process.env.CALLBACK_FALLBACK_SYNC_DELAY_MS ?? String(DEFAULT_CALLBACK_FALLBACK_SYNC_DELAY_MS),
    10
  ) || DEFAULT_CALLBACK_FALLBACK_SYNC_DELAY_MS
);

/**
 * 当 Jenkins 回调丢失时，延迟触发一次兜底同步，避免状态长时间停留在 running/pending。
 */
function scheduleCallbackFallbackSync(runId: number, source: 'run-case' | 'run-batch'): void {
  const timer = setTimeout(async () => {
    try {
      const detail = await executionService.getTestRunDetailRow(runId);
      const currentStatus = String(detail.status ?? '');

      if (!['pending', 'running'].includes(currentStatus)) {
        logger.debug('[callback-fallback] execution already finalized, skipping sync', {
          runId,
          source,
          currentStatus,
        }, LOG_CONTEXTS.JENKINS);
        return;
      }

      const syncResult = await executionService.syncExecutionStatusFromJenkins(runId);
      logger.info('[callback-fallback] fallback sync executed', {
        runId,
        source,
        currentStatus,
        delayMs: CALLBACK_FALLBACK_SYNC_DELAY_MS,
        syncSuccess: syncResult.success,
        syncUpdated: syncResult.updated,
        jenkinsStatus: syncResult.jenkinsStatus,
        message: syncResult.message,
      }, LOG_CONTEXTS.JENKINS);
    } catch (error) {
      logger.warn('[callback-fallback] fallback sync failed', {
        runId,
        source,
        delayMs: CALLBACK_FALLBACK_SYNC_DELAY_MS,
        error: error instanceof Error ? error.message : String(error),
      }, LOG_CONTEXTS.JENKINS);
    }
  }, CALLBACK_FALLBACK_SYNC_DELAY_MS);

  timer.unref?.();
}

/**
 * 构造 Jenkins 回调 URL：兼容配置基础地址或完整 callback 路径。
 */
function buildCallbackUrl(): string {
  const configuredBase = (process.env.API_CALLBACK_URL ?? 'http://localhost:3000').trim();

  // 兼容老配置：如果配置已包含 callback 路径，优先直接使用。
  const trimmed = configuredBase.replace(/\/+$/, '');
  if (trimmed.endsWith('/api/jenkins/callback')) {
    warnIfCallbackUrlIsLocal(trimmed);
    return trimmed;
  }

  const callbackUrl = `${trimmed}/api/jenkins/callback`;
  warnIfCallbackUrlIsLocal(callbackUrl);
  return callbackUrl;
}

function warnIfCallbackUrlIsLocal(callbackUrl: string): void {
  try {
    const callbackHost = new URL(callbackUrl).hostname.toLowerCase();
    const jenkinsHost = new URL(process.env.JENKINS_URL || DEFAULT_JENKINS_URL).hostname.toLowerCase();
    const localHosts = new Set(['localhost', '127.0.0.1', '::1']);

    if (localHosts.has(callbackHost) && !localHosts.has(jenkinsHost)) {
      logger.warn('Jenkins callback URL points to localhost while Jenkins is remote', {
        event: 'JENKINS_CALLBACK_URL_LOCALHOST_FOR_REMOTE',
        callbackUrl,
        jenkinsHost,
        suggestion: 'Set API_CALLBACK_URL to a URL that Jenkins can reach, otherwise callback may fail with 403 or never reach this service.',
      }, LOG_CONTEXTS.JENKINS);
    }
  } catch (error) {
    logger.warn('Failed to validate Jenkins callback URL', {
      event: 'JENKINS_CALLBACK_URL_VALIDATE_FAILED',
      callbackUrl,
      error: error instanceof Error ? error.message : String(error),
    }, LOG_CONTEXTS.JENKINS);
  }
}

async function recordTriggerFailure(
  runId: number,
  caseIds: number[],
  scriptPaths: string[],
  callbackUrl: string,
  source: 'run-case' | 'run-batch',
  triggerResult: { message: string; errorCategory: 'none' | 'network' | 'auth_failed' | 'not_found' | 'bad_request' | 'rate_limited' | 'server_error' }
): Promise<void> {
  const config = jenkinsService.getConfigInfo();
  const persisted = await persistJenkinsTriggerFailureDiagnostic(triggerResult, {
    runId,
    source,
    baseUrl: config?.baseUrl,
    jobName: config?.jobs.api,
    callbackUrl,
    caseIds,
    scriptPaths,
  }).catch(async (error: unknown) => {
    logger.warn('Failed to persist Jenkins trigger diagnostic artifact', {
      runId,
      error: error instanceof Error ? error.message : String(error),
    }, LOG_CONTEXTS.JENKINS);

    return {
      publicPath: undefined,
      diagnostic: buildJenkinsTriggerFailureDiagnostic(triggerResult, {
        baseUrl: config?.baseUrl,
        jobName: config?.jobs.api,
        callbackUrl,
        caseIds,
        scriptPaths,
      }),
    };
  });

  await executionService.recordTriggerFailureDiagnostics({
    runId,
    caseIds,
    errorMessage: persisted.diagnostic.errorMessage,
    errorStack: persisted.diagnostic.errorStack,
    logPath: persisted.publicPath,
  });
  await executionService.markExecutionAborted(runId, persisted.diagnostic.abortReason);
}

/**
 * 执行触发前的 Jenkins 连通性预检查。
 * 目标：在 Jenkins 不可用时快速失败，避免创建后立刻变成 aborted 的运行记录。
 */
async function runJenkinsTriggerPrecheck(source: 'run-case' | 'run-batch'): Promise<{ ok: true } | { ok: false; reason: string }> {
  const configError = jenkinsService.getTriggerConfigurationError();
  if (configError) {
    logger.warn('[trigger-precheck] Jenkins trigger configuration invalid', {
      source,
      reason: configError,
    }, LOG_CONTEXTS.JENKINS);
    return { ok: false, reason: configError };
  }

  if (!TRIGGER_PRECHECK_ENABLED) {
    return { ok: true };
  }

  const maxAttempts = 1 + TRIGGER_PRECHECK_RETRIES;
  const reasons: string[] = [];

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let timeoutId: NodeJS.Timeout | undefined;

    try {
      const timeoutPromise = new Promise<{ connected: false; message: string }>((resolve) => {
        timeoutId = setTimeout(() => {
          resolve({
            connected: false,
            message: `Jenkins precheck timeout after ${TRIGGER_PRECHECK_TIMEOUT_MS}ms`,
          });
        }, TRIGGER_PRECHECK_TIMEOUT_MS);
        timeoutId.unref?.();
      });

      const checkResult = await Promise.race([
        jenkinsService.testConnection(),
        timeoutPromise,
      ]);

      if (checkResult.connected) {
        if (attempt > 1) {
          logger.info('[trigger-precheck] Jenkins precheck recovered after retry', {
            source,
            attempt,
            maxAttempts,
          }, LOG_CONTEXTS.JENKINS);
        }
        return { ok: true };
      }

      const reason = checkResult.message || 'Jenkins unavailable';
      reasons.push(reason);

      // 配置缺失属于确定性失败，无需重试
      if (reason.includes('not configured')) {
        break;
      }

      logger.warn('[trigger-precheck] Jenkins unavailable in attempt', {
        source,
        attempt,
        maxAttempts,
        reason,
        timeoutMs: TRIGGER_PRECHECK_TIMEOUT_MS,
      }, LOG_CONTEXTS.JENKINS);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      reasons.push(reason);
      logger.warn('[trigger-precheck] Jenkins precheck attempt failed with exception', {
        source,
        attempt,
        maxAttempts,
        reason,
        timeoutMs: TRIGGER_PRECHECK_TIMEOUT_MS,
      }, LOG_CONTEXTS.JENKINS);
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }

    if (attempt < maxAttempts) {
      await new Promise<void>((resolve) => {
        const timer = setTimeout(() => resolve(), TRIGGER_PRECHECK_RETRY_DELAY_MS);
        timer.unref?.();
      });
    }
  }

  const reason = reasons[reasons.length - 1] || 'Jenkins unavailable';
  logger.warn('[trigger-precheck] Jenkins unavailable, rejecting trigger request after retries', {
    source,
    maxAttempts,
    reason,
    reasons,
    timeoutMs: TRIGGER_PRECHECK_TIMEOUT_MS,
    retryDelayMs: TRIGGER_PRECHECK_RETRY_DELAY_MS,
  }, LOG_CONTEXTS.JENKINS);

  return { ok: false, reason };
}

/**
 * 解析并去重脚本路径
 */
async function resolveScriptPaths(caseIds: number[]): Promise<{ scriptPaths: string[]; missingCaseIds: number[] }> {
  if (!Array.isArray(caseIds) || caseIds.length === 0) {
    return { scriptPaths: [], missingCaseIds: [] };
  }

  const cases = await AppDataSource.getRepository(TestCase).find({
    where: {
      id: In(caseIds),
      enabled: true,
    },
    select: ['id', 'scriptPath'],
  });

  const scriptPathCaseIds = new Set<number>();
  const normalizedPaths = new Set<string>();

  for (const item of cases) {
    const path = item.scriptPath?.trim();
    if (path) {
      scriptPathCaseIds.add(item.id);
      normalizedPaths.add(path);
    }
  }

  const missingCaseIds = caseIds.filter(id => !scriptPathCaseIds.has(id));

  return {
    scriptPaths: Array.from(normalizedPaths),
    missingCaseIds,
  };
}

async function preflightExecutableScriptPaths(caseIds: number[]): Promise<
  | { ok: true; scriptPaths: string[] }
  | {
      ok: false;
      statusCode: number;
      message: string;
      details: {
        reason: 'missing_script_path' | 'script_path_not_found_in_repo';
        caseIds?: number[];
        missingPaths?: string[];
      };
    }
> {
  const { scriptPaths, missingCaseIds } = await resolveScriptPaths(caseIds);

  if (missingCaseIds.length > 0) {
    return {
      ok: false,
      statusCode: 400,
      message: missingCaseIds.length === 1
        ? `测试用例 ${missingCaseIds[0]} 未配置 script_path，请先同步或修正后再执行`
        : `存在未配置 script_path 的测试用例，请先同步或修正后再执行：${missingCaseIds.join(', ')}`,
      details: {
        reason: 'missing_script_path',
        caseIds: missingCaseIds,
      },
    };
  }

  const testRepoConfig = jenkinsService.getTestRepoConfig();
  const missingPaths = testRepoConfig
    ? (await validateScriptPathsInTestRepo({
        repoUrl: testRepoConfig.repoUrl,
        branch: testRepoConfig.branch,
        scriptPaths,
      })).missingPaths
    : [];

  if (missingPaths.length > 0) {
    return {
      ok: false,
      statusCode: 400,
      message: missingPaths.length === 1
        ? `测试仓库中不存在脚本路径：${missingPaths[0]}`
        : `测试仓库中存在无效脚本路径，请先同步或修正后再执行：${missingPaths.join(', ')}`,
      details: {
        reason: 'script_path_not_found_in_repo',
        missingPaths,
      },
    };
  }

  return { ok: true, scriptPaths };
}

/**
 * 净化错误消息，移除敏感信息以防止信息泄露
 * @param error 原始错误对象
 * @param context 错误上下文，用于日志记录
 * @returns 净化后的错误消息
 */
function sanitizeErrorMessage(error: unknown, context: string): string {
  const originalMessage = error instanceof Error ? error.message : 'Unknown error';

  // 记录详细错误信息到服务器日志
  logger.error(`${context} - Detailed error info`, {
    event: LOG_EVENTS.JENKINS_TRIGGER_FAILED,
    message: originalMessage,
    stack: error instanceof Error ? error.stack : undefined,
    timestamp: new Date().toISOString(),
    context,
  }, LOG_CONTEXTS.JENKINS);

  // 检查是否包含敏感信息关键词
  const sensitiveKeywords = [
    'password', 'token', 'secret', 'key', 'credential',
  ];

  const lowerMessage = originalMessage.toLowerCase();
  const containsSensitiveInfo = sensitiveKeywords.some(keyword =>
    lowerMessage.includes(keyword.toLowerCase())
  );

  if (containsSensitiveInfo) {
    // 包含敏感信息时返回通用错误消息
    return 'An internal error occurred. Please contact support if the issue persists.';
  }

  // 生产环境返回简化但有意义的错误消息（移除路径、IP 等敏感信息）
  if (process.env.NODE_ENV === 'production') {
    return originalMessage
      .replace(/\/[^\s]+/g, '[path]')  // 替换文件路径
      .replace(/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/g, '[ip]')  // 替换 IP 地址
      .replace(/:\d+/g, ':[port]')  // 替换端口号
      .replace(/localhost/gi, '[host]')  // 替换 localhost
      .replace(/127\.0\.0\.1/g, '[host]');  // 替换本地 IP
  }

  // 开发环境返回原始消息
  return originalMessage;
}

function resolveExecutionBusinessError(error: unknown): {
  statusCode: number;
  message: string;
  details: { reason: 'inactive_case' | 'inactive_cases'; caseIds: number[] };
} | null {
  const originalMessage = error instanceof Error ? error.message : String(error ?? '');
  const noActiveCasesMatch = originalMessage.match(/No active test cases found with IDs:\s*(.+)$/i);
  if (!noActiveCasesMatch) return null;

  const caseIds = noActiveCasesMatch[1]
    .split(',')
    .map(part => Number.parseInt(part.trim(), 10))
    .filter(Number.isFinite);

  if (caseIds.length === 0) return null;

  if (caseIds.length === 1) {
    return {
      statusCode: 400,
      message: `测试用例 ${caseIds[0]} 未启用，请先启用后再执行`,
      details: {
        reason: 'inactive_case',
        caseIds,
      },
    };
  }

  return {
    statusCode: 400,
    message: `存在未启用的测试用例，请先启用后再执行：${caseIds.join(', ')}`,
    details: {
      reason: 'inactive_cases',
      caseIds,
    },
  };
}

/**
 * 规范化 Jenkins 回调中的 results 载荷，兼容 camelCase/snake_case 字段。
 * 目标：确保后续 completeBatchExecution 能稳定回写用例明细，避免残留占位 error。
 */
function normalizeCallbackResults(results: unknown[]): Auto_TestRunResultsInput[] {
  const toNumber = (value: unknown): number | undefined => {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim() !== '') {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
    return undefined;
  };

  const toOptionalString = (value: unknown): string | undefined => {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed : undefined;
    }
    return undefined;
  };

  const normalizeStatus = (value: unknown): Auto_TestRunResultsInput['status'] => {
    const rawStatus = String(value ?? '').trim().toLowerCase();
    if (rawStatus === 'passed' || rawStatus === 'success' || rawStatus === 'pass') return 'passed';
    if (rawStatus === 'failed' || rawStatus === 'fail') return 'failed';
    if (rawStatus === 'skipped' || rawStatus === 'skip') return 'skipped';

    // 记录未知状态
    logger.warn('Unknown test result status, treating as error', {
      rawStatus,
      originalValue: value,
    }, LOG_CONTEXTS.JENKINS);
    return 'error';
  };

  return results.flatMap((item): Auto_TestRunResultsInput[] => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
    const row = item as Record<string, unknown>;

    const caseIdRaw = toNumber(row['caseId'] ?? row['case_id']);
    const caseName = toOptionalString(row['caseName'] ?? row['case_name']);

    // 允许 caseId=0 的结果通过（如 pytest 等框架不携带 caseId 的场景），
    // 由 updateTestResult 的 caseName fallback 机制完成匹配。
    // 但若 caseId 和 caseName 同时缺失，则过滤掉（无法匹配任何占位符记录）。
    const hasValidCaseId = caseIdRaw && caseIdRaw > 0;
    if (!hasValidCaseId && !caseName) {
      logger.warn('Filtered out test result: missing both caseId and caseName', {
        row,
        caseId: caseIdRaw,
        caseName,
      }, LOG_CONTEXTS.JENKINS);
      return [];
    }

    if (!hasValidCaseId) {
      logger.debug('Test result has no valid caseId, will use caseName fallback matching', {
        caseId: caseIdRaw,
        caseName,
      }, LOG_CONTEXTS.JENKINS);
    }

    const durationRaw = toNumber(row['duration'] ?? row['durationMs'] ?? row['duration_ms']);
    const assertionsTotal = toNumber(row['assertionsTotal'] ?? row['assertions_total']);
    const assertionsPassed = toNumber(row['assertionsPassed'] ?? row['assertions_passed']);
    const startTime = row['startTime'] ?? row['start_time'];
    const endTime = row['endTime'] ?? row['end_time'];
    const responseDataRaw = row['responseData'] ?? row['response_data'];

    return [{
      caseId: caseIdRaw,
      caseName: caseName || `case_${caseIdRaw}`,
      status: normalizeStatus(row['status']),
      duration: durationRaw !== undefined ? Math.max(0, durationRaw) : 0,
      errorMessage: toOptionalString(row['errorMessage'] ?? row['error_message']),
      stackTrace: toOptionalString(row['stackTrace'] ?? row['errorStack'] ?? row['error_stack']),
      screenshotPath: toOptionalString(row['screenshotPath'] ?? row['screenshot_path']),
      logPath: toOptionalString(row['logPath'] ?? row['log_path']),
      assertionsTotal,
      assertionsPassed,
      responseData: typeof responseDataRaw === 'string'
        ? responseDataRaw
        : (responseDataRaw !== undefined ? JSON.stringify(responseDataRaw) : undefined),
      startTime: typeof startTime === 'string' || typeof startTime === 'number' ? startTime : undefined,
      endTime: typeof endTime === 'string' || typeof endTime === 'number' ? endTime : undefined,
    }];
  });
}

/**
 * POST /api/jenkins/trigger
 * 触发 Jenkins Job 执行
 *
 * 此接口创建运行记录并返回 executionId，供 Jenkins 后续回调使用
 * 支持两种模式：
 * 1. 直接传入 caseIds 数组
 * 2. 传入 taskId，自动从数据库查找任务的 caseIds 和任务名称
 */
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

export default router;
