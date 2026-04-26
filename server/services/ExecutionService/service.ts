import { AppDataSource } from '../../config/database';
import {
  ExecutionRecord,
  TestResultRecord,
  TestRunRecord,
  MySQLResultMetadata,
  DatabaseQueryResult,
  ExecutionError,
  DbQueryResult
} from '@shared/types/database';
import {
  batchInsert,
  isMySQLMetadata,
  executeInTransactionNoRelease,
  executeWithSavepoint,
} from '../../utils/databaseUtils';
import { EXECUTION_CONFIG, EXECUTION_STATUS, TEST_RESULT_STATUS } from '../../config/constants';
import logger from '../../utils/logger';
import { LOG_CONTEXTS, createTimer } from '../../config/logging';
import { ExecutionRepository } from '../../repositories/ExecutionRepository';
import { dashboardService } from '../DashboardService';
import { webSocketService } from '../WebSocketService';
import {
  ExecutionStatusSyncHelper,
  type ExecutionConsistencyResult,
  type ExecutionStatusSyncResult,
  type ExecutionTimeoutCheckResult,
} from './statusSync';
import {
  getSchedulerTraceLogs as getSchedulerTraceLogsFromTimeline,
  type SchedulerTraceLogEntry,
} from './timeline';

export interface CaseExecutionInput {
  caseIds: number[];
  projectId: number;
  /** null 表示系统调度触发（无操作人），因为调度器系统用户 ID=0 在 Auto_Users 表中不存在 */
  triggeredBy: number | null;
  triggerType: 'manual' | 'jenkins' | 'schedule';
  jenkinsJob?: string;
  runConfig?: Record<string, unknown>;
  taskId?: number;
  taskName?: string;
}

export interface ExecutionProgress {
  executionId: number;
  totalCases: number;
  completedCases: number;
  passedCases: number;
  failedCases: number;
  skippedCases: number;
  status: 'pending' | 'running' | 'success' | 'failed' | 'cancelled';
}

export interface Auto_TestRunResultsInput {
  /** caseId 可为空（如 pytest 等不携带 ID 的框架），此时通过 caseName fallback 匹配 */
  caseId?: number;
  caseName: string;
  status: 'passed' | 'failed' | 'skipped' | 'error';
  duration: number;
  errorMessage?: string;
  // New diagnostic fields for enhanced test result tracking
  stackTrace?: string;          // Error stack trace information
  screenshotPath?: string;      // Path to failure screenshot
  logPath?: string;             // Path to execution log file
  assertionsTotal?: number;     // Total number of assertions in the test
  assertionsPassed?: number;    // Number of assertions that passed
  responseData?: string;        // API response data as JSON string
  startTime?: string | number;  // Test case start time (ISO string or timestamp)
  endTime?: string | number;    // Test case end time (ISO string or timestamp)
}

export interface ExecutionCallbackInput {
  executionId: number;
  status: 'success' | 'failed' | 'cancelled' | 'aborted';
  results: Auto_TestRunResultsInput[];
  duration: number;
  reportUrl?: string;
}

/**
 * 改进的执行触发返回值
 * 包含 runId 和 executionId 的完整关联信息
 */
export interface ExecutionTriggerResult {
  runId: number;                    // Auto_TestRun.id
  executionId: number;              // Auto_TestCaseTaskExecutions.id
  totalCases: number;
  caseIds: number[];                // 便于后续查询
}

// 移除本地 Task 接口，因为远程数据库中没有对应的 tasks 表
// 任务信息将从 Auto_TestRun 表中获取

/**
 * 执行服务
 * 负责创建运行记录、处理外部系统回调、状态更新
 * 注：实际测试执行由 Jenkins 等外部系统完成
 * 
 * 核心职责：
 * 1. 触发测试执行，创建 Auto_TestRun 和 Auto_TestCaseTaskExecutions 记录
 * 2. 处理 Jenkins 回调，更新执行结果和统计数据
 * 3. 实时同步 Jenkins 执行状态，处理超时执行
 * 4. WebSocket 推送执行进度更新给前端
 */
export class ExecutionService {
  private executionRepository: ExecutionRepository;
  private statusSyncHelper: ExecutionStatusSyncHelper;
  
  // 缓存 runId 到 executionId 的映射，用于处理 Jenkins 回调
  // 格式: { runId: executionId }
  // 该缓存会在应用启动时保持，旧的条目会被 LRU 策略清理
  // 最大容量 10000，超过时保留最新的 5000 条
  private runIdToExecutionIdCache: Map<number, number> = new Map();
  
  // 缓存清理定时器
  private cacheCleanupTimer?: NodeJS.Timeout;

  // 错误消息常量
  private static readonly ERROR_MESSAGES = {
    CASE_IDS_EMPTY: 'Case IDs cannot be empty',
    EXECUTION_NOT_FOUND: (id: number | string) => `Execution not found: ${id}`,
    BATCH_NOT_FOUND: (id: number) => `Batch not found: ${id}`,
  } as const;

  // 终态状态集合（幂等判断复用）
  private static readonly FINAL_STATUSES = ['success', 'failed', 'cancelled', 'aborted'] as const;

  constructor() {
    this.executionRepository = new ExecutionRepository(AppDataSource);
    this.statusSyncHelper = new ExecutionStatusSyncHelper(this.executionRepository);
    // 初始化缓存清理任务（每小时清理一次1小时前的条目）
    this.initializeCacheCleanup();
  }

  /**
   * 初始化缓存清理任务
   * 使用 LRU 策略：保持最新的运行记录，删除最旧的
   */
  private initializeCacheCleanup() {
    const MAX_CACHE_SIZE = 10000;
    const KEEP_SIZE = 5000;
    const CHECK_INTERVAL = 10 * 60 * 1000;

    this.cacheCleanupTimer = setInterval(() => {
      if (this.runIdToExecutionIdCache.size <= MAX_CACHE_SIZE) return;

      logger.warn('RunId cache size exceeds 10000, clearing oldest entries using LRU', {
        cacheSize: this.runIdToExecutionIdCache.size,
      }, LOG_CONTEXTS.EXECUTION);

      const allKeys = Array.from(this.runIdToExecutionIdCache.keys());
      allKeys.slice(0, allKeys.length - KEEP_SIZE).forEach(key => this.runIdToExecutionIdCache.delete(key));

      logger.debug('Cache cleanup completed', {
        deleted: allKeys.length - KEEP_SIZE,
        remaining: this.runIdToExecutionIdCache.size,
      }, LOG_CONTEXTS.EXECUTION);
    }, CHECK_INTERVAL);
  }

  /**
   * 解析时间戳为 Date 对象
   * 优先使用 Jenkins 回传的时间，无效时返回 undefined
   */
  private parseTimestamp(value: string | number | undefined): Date | undefined {
    if (!value) return undefined;
    const d = new Date(value);
    return isNaN(d.getTime()) ? undefined : d;
  }

  /**
   * 清理资源，防止内存泄漏
   * 应该在应用关闭时调用
   */
  public destroy(): void {
    if (this.cacheCleanupTimer) {
      clearInterval(this.cacheCleanupTimer);
      this.cacheCleanupTimer = undefined;
      logger.debug('Cache cleanup timer cleared', {}, LOG_CONTEXTS.EXECUTION);
    }
    this.runIdToExecutionIdCache.clear();
    logger.info('ExecutionService destroyed and resources cleaned up', {}, LOG_CONTEXTS.EXECUTION);
  }

  /**
   * 更新执行状态为运行中（使用远程数据库表）
   */
  async markExecutionRunning(executionId: number): Promise<void> {
    await this.executionRepository.markExecutionRunning(executionId);
  }

  /**
   * 处理外部系统（Jenkins）的执行结果回调
   * 
   * 改进：
   * - 使用事务确保数据一致性
   * - 统计结果并原子地更新
   * - 支持详细诊断字段
   * 
   * @param input 回调输入，包含执行ID和结果列表
   * @throws Error 如果运行记录不存在或数据库操作失败
   */
  async handleCallback(input: ExecutionCallbackInput): Promise<void> {
    const timer = createTimer();

    try {
      logger.info('Execution callback received', {
        executionId: input.executionId,
        status: input.status,
        resultsCount: input.results.length,
        duration: input.duration,
      }, LOG_CONTEXTS.EXECUTION);

      // 1. 验证运行记录存在
      const execution = await this.executionRepository.getExecutionDetail(input.executionId);

      if (!execution) {
        throw new Error(`Execution not found: ${input.executionId}`);
      }

      // 2. 使用 TypeORM 事务处理回调
      await this.executionRepository.runInTransaction(async (queryRunner) => {
        // 2.1 统计结果（先做初步统计，后续会根据数据库实际值覆盖）
        let passedCases = input.results.filter(r => r.status === TEST_RESULT_STATUS.PASSED).length;
        let failedCases = input.results.filter(r => r.status === TEST_RESULT_STATUS.FAILED).length;
        let skippedCases = input.results.length - passedCases - failedCases;

        // 2.2 更新或插入用例结果记录（先尝试更新预创建记录，再新增，避免重复）
        if (input.results.length > 0) {
          for (const result of input.results) {
            const startTime = this.parseTimestamp(result.startTime);
            const endTime   = this.parseTimestamp(result.endTime) ?? new Date();

            const updated = await this.executionRepository.updateTestResult(input.executionId, result.caseId, {
              status: result.status,
              duration: result.duration,
              errorMessage: result.errorMessage,
              errorStack: result.stackTrace,
              screenshotPath: result.screenshotPath,
              logPath: result.logPath,
              assertionsTotal: result.assertionsTotal,
              assertionsPassed: result.assertionsPassed,
              responseData: result.responseData,
              startTime,
              endTime,
              caseName: result.caseName,  // 【修复】传递 caseName 用于 Fallback 匹配
            });

            if (!updated) {
              // 没有预创建记录，则新增
              // 若 caseId 缺失（caseName fallback 场景），跳过 createTestResult 避免 DB NOT NULL 错误
              if (result.caseId !== undefined) {
                await this.executionRepository.createTestResult({
                  executionId: input.executionId,
                  caseId: result.caseId,
                  caseName: result.caseName,
                  status: result.status,
                  duration: result.duration,
                  errorMessage: result.errorMessage,
                  errorStack: result.stackTrace,
                  screenshotPath: result.screenshotPath,
                  logPath: result.logPath,
                  assertionsTotal: result.assertionsTotal,
                  assertionsPassed: result.assertionsPassed,
                  responseData: result.responseData,
                  startTime,
                  endTime,
                });
              }
            }
          }
        }
        
        // 【修复】清理残留的 error 占位符
        // 【重要】必须无条件执行，因为可能存在以下场景：
        // 1. 没有详细结果（results.length === 0）
        // 2. 有详细结果但未完全匹配（因为 caseId 或 caseName 不一致）
        // 3. 回调数据部分或全部被过滤掉（无效的 caseId）
        // 4. caseName 格式不一致导致匹配失败
        // 所以我们需要检查是否仍有 error 状态的占位符，如果有就清理
        try {
          const statusSummary = await this.executionRepository.countResultsByStatus(input.executionId);
          // countResultsByStatus 中的 'failed' 包括了 'failed' 和 'error'，所以需要单独查询
          const errorRows = await (this.executionRepository as any).testRunResultRepository.query(
            "SELECT COUNT(*) as errorCount FROM Auto_TestRunResults WHERE execution_id = ? AND (status IS NULL OR status = 'error')",
            [input.executionId]
          ) as Array<{ errorCount: number }>;
          const errorCount = Number(errorRows[0]?.errorCount ?? 0);

          if (errorCount > 0) {
            // 【修复假阳性问题】在标记 ERROR 占位符之前，验证回调结果是否完整
            // 如果 results.length 不等于预期的 totalCases，说明回调数据不完整，
            // 此时不应将 ERROR 标记为 'passed'，而应强制降级为 'failed'
            const expectedTotal = execution.execution.totalCases;
            const actualResults = input.results.length;
            const isResultComplete = actualResults >= expectedTotal;

            // 决策逻辑：
            // 1. 如果回调数据完整 (actualResults >= expectedTotal)，按 Jenkins 状态映射
            // 2. 如果回调数据不完整，强制标记为 'failed'，避免假阳性
            const mappedResultStatus: 'passed' | 'failed' =
              (input.status === 'success' && isResultComplete) ? 'passed' : 'failed';

            const cleaned = await this.executionRepository.bulkUpdateErrorResults(input.executionId, mappedResultStatus);

            // 如果因为结果不完整而强制降级，记录警告
            if (!isResultComplete && input.status === 'success') {
              logger.warn('Forcing ERROR placeholders to failed due to incomplete callback results', {
                executionId: input.executionId,
                expectedTotal,
                actualResults,
                cleanedCount: cleaned,
                jenkinsStatus: input.status,
                mappedStatus: mappedResultStatus,
              }, LOG_CONTEXTS.EXECUTION);
            } else {
              logger.info('Cleaned up orphaned ERROR placeholders', {
                executionId: input.executionId,
                cleanedCount: cleaned,
                mappedStatus: mappedResultStatus,
                resultComplete: isResultComplete,
              }, LOG_CONTEXTS.EXECUTION);
            }
          }
        } catch (err) {
          logger.warn('Failed to clean up orphaned ERROR placeholders', { executionId: input.executionId, error: err });
        }

        // 重新汇总统计数
        const summary = await this.executionRepository.countResultsByStatus(input.executionId);
        passedCases  = summary.passed;
        failedCases  = summary.failed;
        skippedCases = summary.skipped;

        // 2.3 更新 Auto_TestCaseTaskExecutions 记录
        // TaskExecution 状态不支持 'aborted'，需要映射为 'cancelled'
        let executionStatus: 'success' | 'failed' | 'cancelled';
        if (input.status === 'aborted') {
          executionStatus = 'cancelled';
        } else {
          executionStatus = input.status;
        }

        await this.executionRepository.updateExecutionResults(input.executionId, {
          status: executionStatus,
          passedCases,
          failedCases,
          skippedCases,
          duration: input.duration,
        });

        // 2.4 同步更新关联的 Auto_TestRun 统计字段（重要：避免前端看到 0%）
        await this.executionRepository.syncTestRunByExecutionId(input.executionId, {
          status: input.status,
          passedCases,
          failedCases,
          skippedCases,
          durationMs: input.duration * 1000,
        });

        logger.debug('Execution record updated', {
          executionId: input.executionId,
          statistics: {
            passed: passedCases,
            failed: failedCases,
            skipped: skippedCases,
          }
        }, LOG_CONTEXTS.EXECUTION);
      });

      const duration = timer();
      logger.info('Execution callback processed successfully', {
        executionId: input.executionId,
        status: input.status,
        resultsCount: input.results.length,
        durationMs: duration,
      }, LOG_CONTEXTS.EXECUTION);

    } catch (error) {
      const duration = timer();
      logger.errorLog(error, 'Failed to process execution callback', {
        executionId: input.executionId,
        resultsCount: input.results.length,
        durationMs: duration,
      });
      throw error;
    }
  }

  /**
   * 获取执行详情（使用远程数据库表）
   */
  async getExecutionDetail(executionId: number) {
    return this.executionRepository.getExecutionDetail(executionId);
  }

  /**
   * 获取最近运行记录（使用远程数据库表）
   */
  async getRecentExecutions(limit = 10) {
    return this.executionRepository.getRecentExecutions(limit);
  }

  /**
   * 取消执行（使用远程数据库表）
   */
  async cancelExecution(executionId: number) {
    await this.executionRepository.cancelExecution(executionId);
  }

  /**
   * 触发用例执行，向 Auto_TestRun 表写入运行记录
   * 
   * 改进：
   * - 使用事务保证原子性
   * - 使用批量插入提升性能（50倍+）
   * - 返回完整的关联信息（runId 和 executionId）
   * 
   * @param input 执行输入参数
   * @returns 执行触发结果，包含 runId、executionId、用例列表
   * @throws Error 如果验证失败或数据库操作失败
   */
  async triggerTestExecution(input: CaseExecutionInput): Promise<ExecutionTriggerResult> {
    const timer = createTimer();

    try {
      // 1. 验证用例是否存在
      if (input.caseIds.length === 0) {
        throw new Error('Case IDs cannot be empty');
      }

      // 2. 使用 ExecutionRepository 的事务方法触发执行
      const result = await this.executionRepository.triggerExecution({
        caseIds: input.caseIds,
        projectId: input.projectId,
        triggeredBy: input.triggeredBy,
        triggerType: input.triggerType,
        jenkinsJob: input.jenkinsJob,
        runConfig: input.runConfig,
        taskId: input.taskId,
        taskName: input.taskName,
      });

      // 3. 保存 runId 到 executionId 的映射到缓存（用于 Jenkins 回调）
      this.runIdToExecutionIdCache.set(result.runId, result.executionId);
      logger.debug('RunId to executionId mapping cached', {
        runId: result.runId,
        executionId: result.executionId,
      }, LOG_CONTEXTS.EXECUTION);

      const duration = timer();
      logger.info('Test execution triggered successfully', {
        runId: result.runId,
        executionId: result.executionId,
        totalCases: result.totalCases,
        triggeredBy: input.triggeredBy,
        triggerType: input.triggerType,
        durationMs: duration,
      }, LOG_CONTEXTS.EXECUTION);

      return result;

    } catch (error) {
      const duration = timer();
      logger.errorLog(error, 'Failed to trigger test execution', {
        caseIds: input.caseIds,
        triggeredBy: input.triggeredBy,
        durationMs: duration,
      });
      throw error;
    }
  }

  /**
   * 获取批次执行详情
   */
  async getBatchExecution(runId: number) {
    const execution = await this.executionRepository.getTestRunDetail(runId);

    if (!execution) {
      throw new Error(`Execution not found: ${runId}`);
    }

    return { execution };
  }

  /**
   * 获取批次执行详情（snake_case 格式，与 TestRunRecord 接口兼容）
   */
  async getTestRunDetailRow(runId: number) {
    const row = await this.executionRepository.getTestRunDetailRow(runId);
    if (!row) throw new Error(`Execution not found: ${runId}`);
    return row;
  }


  /**
   * 获取批次执行结果列表（支持分页与服务端筛选）
   * @param executionId 执行ID
   * @param options 分页与筛选参数
   */
  async getBatchExecutionResults(executionId: number, options: { page?: number; pageSize?: number; status?: string; keyword?: string } = {}) {
    const timer = createTimer();
    try {
      logger.debug("Fetching batch execution results", { executionId, ...options }, LOG_CONTEXTS.EXECUTION);
      const result = await this.executionRepository.getExecutionResults(executionId, options);
      const duration = timer();
      logger.debug("Batch execution results fetched", { executionId, resultCount: result.data.length, total: result.total, durationMs: duration }, LOG_CONTEXTS.EXECUTION);
      return result;
    } catch (error) {
      const duration = timer();
      logger.errorLog(error, "Failed to fetch batch execution results", { executionId, durationMs: duration });
      throw error;
    }
  }

  /**
   * 根据 Auto_TestRun.id（runId）查询该批次的所有用例执行结果（支持分页与筛选）
   * 供 /executions/test-runs/:runId/results 路由使用
   */
  async getResultsByRunId(runId: number, options: { page?: number; pageSize?: number; status?: string; keyword?: string; } = {}) {
    return this.executionRepository.getResultsByRunId(runId, options);
  }

  /**
   * 更新执行批次的Jenkins信息
   */
  async updateBatchJenkinsInfo(runId: number, jenkinsInfo: {
    buildId: string;
    buildUrl: string;
  }): Promise<void> {
    await this.executionRepository.updateJenkinsInfo(runId, jenkinsInfo);
  }

  /**
   * [dev-11] 将执行批次标记为 aborted
   * 用于 Jenkins 队列取消/超时、或手动中止时主动同步平台状态
   * 幂等：如果已经是终态则跳过
   */
  async markExecutionAborted(runId: number, reason: string = 'aborted'): Promise<void> {
    const execution = await this.executionRepository.getTestRunStatus(runId);
    if (!execution) {
      logger.warn(`markExecutionAborted: execution not found (runId=${runId})`, {}, LOG_CONTEXTS.EXECUTION);
      return;
    }
    if (ExecutionService.FINAL_STATUSES.includes(execution.status as any)) {
      logger.debug(`markExecutionAborted: already in final status (runId=${runId}, status=${execution.status}), skipping`, {}, LOG_CONTEXTS.EXECUTION);
      return;
    }
    const durationMs = execution.startTime ? Date.now() - new Date(execution.startTime).getTime() : 0;
    let passedCases: number | undefined;
    let failedCases: number | undefined;
    let skippedCases: number | undefined;

    if (execution.executionId != null) {
      await this.executionRepository.cleanupErrorPlaceholdersForExecution(
        execution.executionId,
        'aborted'
      );

      const counts = await this.executionRepository.countResultsByStatus(execution.executionId);
      passedCases = counts.passed;
      failedCases = counts.failed;
      skippedCases = counts.skipped;
    }

    await this.executionRepository.updateTestRunStatus(runId, 'aborted', {
      durationMs,
      abortReason: reason,
      passedCases,
      failedCases,
      skippedCases,
    });
    await this.executionRepository.syncTaskExecutionFromTestRunStatus(runId, 'aborted', {
      durationMs,
      passedCases,
      failedCases,
      skippedCases,
    });
    logger.info(`markExecutionAborted: execution marked as aborted (runId=${runId}, reason=${reason})`, {
      runId,
      reason,
    }, LOG_CONTEXTS.EXECUTION);
    webSocketService?.pushExecutionUpdate(runId, {
      status: 'aborted',
      source: 'monitor',
    });
  }

  async recordTriggerFailureDiagnostics(input: {
    runId: number;
    caseIds: number[];
    errorMessage: string;
    errorStack?: string;
    logPath?: string;
  }): Promise<void> {
    const executionId = await this.executionRepository.findExecutionIdByRunId(input.runId);
    if (!executionId || input.caseIds.length === 0) {
      return;
    }

    for (const caseId of input.caseIds) {
      await this.executionRepository.updateTestResult(executionId, caseId, {
        status: 'failed',
        duration: 0,
        errorMessage: input.errorMessage,
        errorStack: input.errorStack,
        logPath: input.logPath,
        startTime: new Date(),
        endTime: new Date(),
      });
    }
  }

  /**
   * 完成执行批次
   * 
   * 改进：
   * - 从缓存中优先查找 executionId（最快、最可靠）
   * - 使用缓存作为第一层 fallback，数据库查询作为第二层 fallback
   * - 使用事务确保数据一致性
   * - 批量更新提升性能
   * - 使用统一日志库输出
   * - 自动将 'cancelled' 状态映射为 'aborted'（以支持数据库枚举）
   * 
   * @param runId 运行批次ID
   * @param results 执行结果，包括状态、统计和详细结果
   * @throws Error 如果找不到运行记录或数据库操作失败
   */
  async completeBatchExecution(runId: number, results: {
    status: 'success' | 'failed' | 'cancelled' | 'aborted';
    passedCases: number;
    failedCases: number;
    skippedCases: number;
    durationMs: number;
    results?: Auto_TestRunResultsInput[];
  }): Promise<void> {
    const timer = createTimer();

    try {
      // 1. 验证运行记录是否存在
      const execution = await this.executionRepository.getTestRunDetail(runId);

      // 计算回调延迟（从执行创建到回调接收的时间）
      const callbackLatency = execution?.startTime
        ? Date.now() - new Date(execution.startTime).getTime()
        : undefined;

      logger.info('Jenkins callback received', {
        runId,
        status: results.status,
        passedCases: results.passedCases,
        failedCases: results.failedCases,
        skippedCases: results.skippedCases,
        durationMs: results.durationMs,
        resultsCount: results.results?.length || 0,
        callbackLatency: callbackLatency ? `${callbackLatency}ms` : 'unknown',
        source: 'callback'
      }, LOG_CONTEXTS.EXECUTION);

      if (!execution) {
        throw new Error(`Execution not found: runId=${runId}`);
      }

      // 2. 幂等性检查：仅跳过“无结果载荷”的空重复回调
      // 场景：Jenkins 轮询/手动同步可能先把 TestRun 标记为终态，随后回调才携带详细 results 到达。
      // 该场景必须继续执行回写，否则会残留预创建的 error 占位记录。
      const hasDetailedResults = Array.isArray(results.results) && results.results.length > 0;
      const hasSummaryCounts = (results.passedCases + results.failedCases + results.skippedCases) > 0;

      if (ExecutionService.FINAL_STATUSES.includes(execution.status as any)) {
        if (!hasDetailedResults && !hasSummaryCounts) {
          logger.warn('Execution already completed, skipping empty duplicate callback', {
            runId,
            currentStatus: execution.status,
            newStatus: results.status,
            source: 'idempotency_check',
            hasDetailedResults,
            hasSummaryCounts,
          }, LOG_CONTEXTS.EXECUTION);
          return;
        }

        logger.warn('Execution already completed, but callback carries result payload; continuing reconciliation', {
          runId,
          currentStatus: execution.status,
          newStatus: results.status,
          source: 'idempotency_reconcile',
          hasDetailedResults,
          hasSummaryCounts,
          resultsCount: results.results?.length || 0,
        }, LOG_CONTEXTS.EXECUTION);
      }

      logger.debug('Found execution record', {
        runId,
        currentStatus: execution.status,
      }, LOG_CONTEXTS.EXECUTION);

      // 2. 尝试从缓存获取 executionId（最快）
      let executionId = this.runIdToExecutionIdCache.get(runId);
      if (executionId) {
        logger.debug('ExecutionId found in cache', {
          runId,
          executionId,
          cacheSize: this.runIdToExecutionIdCache.size,
        }, LOG_CONTEXTS.EXECUTION);
      } else {
        logger.debug('ExecutionId not in cache, repository will resolve by run binding', {
          runId,
          cacheSize: this.runIdToExecutionIdCache.size,
        }, LOG_CONTEXTS.EXECUTION);
      }

      // 3. 完成批次执行，同时传递 executionId（若无缓存则交由仓储层优先走 Auto_TestRun.execution_id 解析）
      // 注：completeBatch 会自动将 'cancelled' 映射为 'aborted'
      await this.executionRepository.completeBatch(runId, results, executionId);

      // 4. 推送 WebSocket 更新（实时通知前端）
      try {
        webSocketService?.pushExecutionUpdate(runId, {
          status: results.status,
          passedCases: results.passedCases,
          failedCases: results.failedCases,
          skippedCases: results.skippedCases,
          durationMs: results.durationMs,
          source: 'callback'
        });
      } catch (wsError) {
        // WebSocket 推送失败不影响主流程，前端会通过轮询获取最新状态
        logger.warn('Failed to push WebSocket update, but execution completed successfully', {
          runId,
          wsError: wsError instanceof Error ? wsError.message : String(wsError),
          fallback: 'Frontend will use polling mechanism'
        }, LOG_CONTEXTS.EXECUTION);
      }

      // 5. 触发每日汇总数据刷新（异步后台任务，不影响主流程）
      // 使用 setImmediate 避免阻塞当前事件循环
        setImmediate(async () => {
        try {
          const executionDate = new Date().toISOString().slice(0, 10);
          await dashboardService.refreshDailySummary(executionDate);
          logger.debug('Daily summary refreshed after execution completion', {
            runId,
            executionDate,
          }, LOG_CONTEXTS.EXECUTION);
        } catch (summaryError) {
          // 记录错误但不影响主流程
          logger.warn('Failed to refresh daily summary after execution completion', {
            runId,
            error: summaryError instanceof Error ? summaryError.message : String(summaryError),
          }, LOG_CONTEXTS.EXECUTION);
        }
      });

      const duration = timer();
      logger.info('Batch execution completed successfully', {
        runId,
        status: results.status,
        durationMs: duration,
        timestamp: new Date().toISOString(),
      }, LOG_CONTEXTS.EXECUTION);

    } catch (error: unknown) {
      const duration = timer();

      logger.errorLog(error, 'Batch execution failed', {
        runId,
        durationMs: duration,
        timestamp: new Date().toISOString(),
      });

      throw error;
    }
  }

  /**
   * 获取执行批次的用例列表
   * 
   * @deprecated 该方法不完整，建议使用 getRunCases() 替代以获取完整的用例列表
   * @param runId 运行批次ID
   * @returns 用例总数
   * 
   * 注意：当前实现仅返回用例总数，不包含具体用例列表。
   * 完整功能需要在 Auto_TestRun 中存储 case_ids 字段。
   * 可以通过 getRunCases(runId) 获取关联的用例列表。
   * 
   * @throws Error 如果找不到执行批次记录
   */
  async getBatchCases(runId: number) {
    const batch = await this.executionRepository.getTestRunBasicInfo(runId);

    if (!batch) {
      throw new Error(ExecutionService.ERROR_MESSAGES.BATCH_NOT_FOUND(runId));
    }

    // 注意：这里需要补充存储关联用例ID的逻辑
    // 如果在 Auto_TestRun 中添加 case_ids 字段，可以解析获取用例
    return { totalCases: batch.totalCases };
  }

  /**
   * 获取所有测试运行记录（Auto_TestRun 表）
   * 支持按触发方式、状态、时间范围筛选
   */
  async getAllTestRuns(
    limit = 50,
    offset = 0,
    filters: {
      triggerType?: string[];
      status?: string[];
      startDate?: string;
      endDate?: string;
    } = {}
  ) {
    return this.executionRepository.getAllTestRuns(limit, offset, filters);
  }

  /**
   * 获取运行记录的调度追踪日志（用于运行记录详情页排障）
   */
  async getSchedulerTraceLogs(runId: number): Promise<SchedulerTraceLogEntry[]> {
    return getSchedulerTraceLogsFromTimeline(
      runId,
      ExecutionService.ERROR_MESSAGES.BATCH_NOT_FOUND,
    );
  }

  async getStaleExecutionSummary(maxAgeHours = 24, stalePendingMinutes = 10) {
    return this.executionRepository.getStaleExecutionSummary(maxAgeHours, stalePendingMinutes);
  }

  /**
   * 一次性清理历史卡住执行（pending/running -> aborted）
   */
  async cleanupStaleExecutions(maxAgeHours = 24, stalePendingMinutes = 10, dryRun = false) {
    const summary = await this.executionRepository.getStaleExecutionSummary(maxAgeHours, stalePendingMinutes);

    if (dryRun) {
      return {
        dryRun: true,
        affectedCount: 0,
        ...summary,
      };
    }

    const affectedCount = await this.executionRepository.markOldStuckExecutionsAsAbandoned(maxAgeHours, stalePendingMinutes);

    return {
      dryRun: false,
      affectedCount,
      ...summary,
    };
  }

  /**
   * 获取测试运行的用例列表（供 Jenkins 使用）
   * 注意：由于没有远程 tasks 表，改为从 Auto_TestRun 获取关联的用例
   */
  async getRunCases(runId: number) {
    return this.executionRepository.getRunCases(runId);
  }

  // ============ 新增：混合状态同步功能 ============

  /**
   * 通过Jenkins API查询并同步执行状态
   * 作为回调机制的备用方案
   */
  async syncExecutionStatusFromJenkins(runId: number): Promise<ExecutionStatusSyncResult> {
    return this.statusSyncHelper.syncExecutionStatusFromJenkins(runId);
  }

  async checkAndHandleTimeouts(timeoutMs: number = 10 * 60 * 1000): Promise<ExecutionTimeoutCheckResult> {
    return this.statusSyncHelper.checkAndHandleTimeouts(timeoutMs);
  }

  async verifyStatusConsistency(options: { limit?: number; runId?: number } = {}): Promise<ExecutionConsistencyResult> {
    return this.statusSyncHelper.verifyStatusConsistency(options);
  }
}

// 导出单例
export const executionService = new ExecutionService();
