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

// ────────────────────────────────────────────────────────────────────────────
// 常量定义
// ────────────────────────────────────────────────────────────────────────────

/** 回调兜底同步默认延迟（毫秒） */
const DEFAULT_CALLBACK_FALLBACK_SYNC_DELAY_MS = 45_000;
/** 回调兜底同步最小延迟（毫秒） */
const MIN_CALLBACK_FALLBACK_SYNC_DELAY_MS = 10_000;
/** Jenkins 健康检查超时（毫秒） */
export const HEALTH_CHECK_TIMEOUT_MS = 5_000;
/** Jenkins 健康检查默认 URL */
export const DEFAULT_JENKINS_URL = 'http://jenkins.wiac.xyz';
/** Jenkins 健康检查默认用户 */
export const DEFAULT_JENKINS_USER = 'root';
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
export function scheduleCallbackFallbackSync(runId: number, source: 'run-case' | 'run-batch'): void {
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
export function buildCallbackUrl(): string {
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

export function warnIfCallbackUrlIsLocal(callbackUrl: string): void {
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

export async function recordTriggerFailure(
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
export async function runJenkinsTriggerPrecheck(source: 'run-case' | 'run-batch'): Promise<{ ok: true } | { ok: false; reason: string }> {
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
export async function resolveScriptPaths(caseIds: number[]): Promise<{ scriptPaths: string[]; missingCaseIds: number[] }> {
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

export async function preflightExecutableScriptPaths(caseIds: number[]): Promise<
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
export function sanitizeErrorMessage(error: unknown, context: string): string {
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

export function resolveExecutionBusinessError(error: unknown): {
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
export function normalizeCallbackResults(results: unknown[]): Auto_TestRunResultsInput[] {
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
