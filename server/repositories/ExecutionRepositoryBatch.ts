import { DataSource, QueryRunner, In, Repository, QueryDeepPartialEntity } from 'typeorm';
import { TaskExecution, TestRun, TestRunResult, TestCase } from '../entities/index';
import { BaseRepository } from './BaseRepository';
import { User } from '../entities/User';
import logger from '../utils/logger';
import { LOG_CONTEXTS } from '../config/logging';
import {
  TestRunStatus,
  TaskExecutionStatus,
  TestRunResultStatus,
  TestRunResultStatusType,
  TestRunTriggerTypeType,
} from '../../shared/types/execution';
import { ExecutionRepositoryBase } from './ExecutionRepositoryBase';
import { ExecutionRepositoryStatusUtilities } from './ExecutionRepositoryStatusUtilities';
import type {
  BatchResults,
  ExecutionDetail,
  ExecutionResultRow,
  ExecutionWithJenkinsInfo,
  PotentiallyTimedOutExecution,
  RecentExecution,
  StaleExecutionSummary,
  StuckExecution,
  TestRunBasicInfo,
  TestRunRow,
  TestRunStatusInfo,
  TestRunWithUser,
} from './ExecutionRepositoryTypes';
export abstract class ExecutionRepositoryBatch extends ExecutionRepositoryStatusUtilities {
  abstract bulkUpdateErrorResults(executionId: number, targetStatus: 'passed' | 'failed' | 'skipped'): Promise<number>;

  async completeBatch(
    runId: number,
    results: BatchResults,
    executionId?: number
  ): Promise<void> {
      // 0. 二次校验：防止并发回调导致正确结果被错误数据覆盖
      // 注意：这里不能使用 FOR UPDATE + 事务外 Repository 混用，
      // 否则会出现“当前事务持锁、另一个连接更新同一行”导致 lock wait timeout。
      // 改为轻量读取 + 幂等防回退，避免锁竞争。
      const lockResult = await this.testRunRepository.query(`
        SELECT id, status, passed_cases, failed_cases, skipped_cases
        FROM Auto_TestRun
        WHERE id = ?
        LIMIT 1
      `, [runId]) as Array<{
        id: number;
        status: string;
        passed_cases: number | null;
        failed_cases: number | null;
        skipped_cases: number | null;
      }>;

      const currentTestRun = lockResult.length > 0 ? {
        id: lockResult[0].id,
        status: lockResult[0].status,
        passedCases: lockResult[0].passed_cases,
        failedCases: lockResult[0].failed_cases,
        skippedCases: lockResult[0].skipped_cases,
      } : null;

      const finalStatuses = ['success', 'failed', 'cancelled', 'aborted'];
      const hasDetailedResults = Array.isArray(results.results) && results.results.length > 0;
      const hasSummaryCounts = (results.passedCases + results.failedCases + results.skippedCases) > 0;

      if (currentTestRun && finalStatuses.includes(currentTestRun.status)) {
        // 数据版本检查：判断新数据是否比现有数据"更好"
        const currentHasRealData = (currentTestRun.passedCases ?? 0) > 0 ||
                                    (currentTestRun.failedCases ?? 0) > 0 ||
                                    (currentTestRun.skippedCases ?? 0) > 0;

        // 终态已存在真实数据时，检查新数据是否会导致数据"倒退"
        // 修复：无论新回调是否有详细结果，都要检查数据质量
        if (currentHasRealData) {
          const currentTotal = (currentTestRun.passedCases ?? 0) +
                              (currentTestRun.failedCases ?? 0) +
                              (currentTestRun.skippedCases ?? 0);
          const newTotal = results.passedCases + results.failedCases + results.skippedCases;
          const currentPassed = currentTestRun.passedCases ?? 0;
          const newPassed = results.passedCases;

          // 判断数据是否变差：
          // 1. 总量减少（测试结果不完整）
          // 2. 总量相同但 passed 减少（正确结果被错误结果覆盖）
          // 3. 无详细结果且回调数据总量相同或更少（可能是空回调或部分数据）
          const isDataRegression = newTotal < currentTotal ||
                                   (newTotal === currentTotal && newPassed < currentPassed) ||
                                   (!hasDetailedResults && newTotal <= currentTotal);

          if (isDataRegression) {
            logger.warn(
              'completeBatch: rejected regression update - existing data is better than new callback',
              {
                runId,
                currentStatus: currentTestRun.status,
                currentPassed: currentTestRun.passedCases,
                currentFailed: currentTestRun.failedCases,
                currentSkipped: currentTestRun.skippedCases,
                newPassed: results.passedCases,
                newFailed: results.failedCases,
                newSkipped: results.skippedCases,
                hasDetailedResults,
                newTotal,
                currentTotal,
                source: 'concurrent_callback_protection'
              },
              LOG_CONTEXTS.REPOSITORY
            );
            return; // 拒绝更新，保留现有的正确数据
          }
        }

        logger.info(
          'completeBatch: allowing update to completed run with new payload',
          {
            runId,
            currentStatus: currentTestRun.status,
            hasDetailedResults,
            hasSummaryCounts,
            source: 'concurrent_callback_protection'
          },
          LOG_CONTEXTS.REPOSITORY
        );
      }

      // 1. 更新 TestRun 记录（将 cancelled 映射为 aborted 以兼容数据库枚举）
      const mappedStatus = this.mapStatusForTestRun(results.status);
      await this.testRunRepository.update(runId, {
        status: mappedStatus,
        passedCases: results.passedCases,
        failedCases: results.failedCases,
        skippedCases: results.skippedCases,
        durationMs: results.durationMs,
        endTime: new Date(),
      });

      // 2. 多策略解析 executionId
      const resolvedExecutionId = await this.resolveExecutionIdForBatch(runId, executionId);

      // 【诊断日志】记录 executionId 解析结果，便于追踪「汇总 passed 但明细 FAILED」问题
      logger.info(
        'completeBatch: executionId resolution result',
        {
          runId,
          cachedExecutionId: executionId,
          resolvedExecutionId,
          hasResults: !!(results.results && results.results.length > 0),
          resultsCount: results.results?.length ?? 0,
          summaryPassed: results.passedCases,
          summaryFailed: results.failedCases,
          summarySkipped: results.skippedCases,
        },
        LOG_CONTEXTS.REPOSITORY
      );

      // 3. 同步 TaskExecution 状态（与 TestRun 保持一致）
      if (resolvedExecutionId) {
        await this.syncTaskExecutionStatus(resolvedExecutionId, results);
      }

      // 4. 更新详细用例结果
      if (resolvedExecutionId) {
        if (results.results && results.results.length > 0) {
          await this.updateDetailedCaseResults(runId, resolvedExecutionId, results.results);

          // 修复12: 清理残留的 ERROR 占位符
          // 当 Jenkins 回调只返回部分测试结果时（如10个用例只返回3个），
          // updateDetailedCaseResults 只会更新这3个用例，剩余的 ERROR 占位符不会被清理。
          // 需要根据整体执行状态批量更新这些残留占位符。
          await this.cleanupResidualErrorPlaceholders(
            runId,
            resolvedExecutionId,
            results.results.length,
            results
          );
        } else {
          await this.updateSummaryOnlyResults(runId, resolvedExecutionId, results);
        }
      } else {
        logger.warn(
          `Could not determine executionId for runId, skipping detailed result updates`,
          { runId, resultsCount: results.results?.length ?? 0, cachedExecutionId: executionId },
          LOG_CONTEXTS.REPOSITORY
        );

        // 【兜底修复】resolvedExecutionId 无法从 TaskExecution 表获取时，
        // 尝试直接从 Auto_TestRunResults 表通过已有占位记录反查 executionId，
        // 确保 ERROR 占位符依然能被清理，避免用例状态永久卡在 error
        const fallbackExecId = await this.resolveExecutionIdFromRunResults(runId);
        logger.info(
          `completeBatch: fallback executionId lookup result`,
          { runId, fallbackExecId: fallbackExecId ?? null, found: !!fallbackExecId },
          LOG_CONTEXTS.REPOSITORY
        );
        if (fallbackExecId) {
          await this.updateSummaryOnlyResults(runId, fallbackExecId, results);
          await this.performFinalErrorCleanup(fallbackExecId, results);
          // 【修复3】兜底路径也要做最终一致性校正，确保 Auto_TestRun 统计与明细一致
          await this.reconcileBatchSummary(runId, fallbackExecId, mappedStatus);
        }
      }

      // 【安全防护】无论采用哪个更新路径，都执行最后的全局清理
      // 防止在特殊场景（既无详细结果也无汇总统计）下 ERROR 占位符残留
      if (resolvedExecutionId) {
        await this.performFinalErrorCleanup(resolvedExecutionId, results);
        // 最终一致性校正：以结果表为准回填批次汇总，避免"汇总 success 但明细仍 error"
        await this.reconcileBatchSummary(runId, resolvedExecutionId, mappedStatus);
      }
  }

  /**
   * 最终一致性校正：以 Auto_TestRunResults 结果表为准，回填 Auto_TestRun 和 Auto_TestCaseTaskExecutions 的汇总统计
   * 确保两张表数据一致，避免"汇总通过但明细失败"或相反的情况
   */
  private async reconcileBatchSummary(
    runId: number,
    executionId: number,
    mappedStatus: 'pending' | 'running' | 'success' | 'failed' | 'aborted'
  ): Promise<void> {
    const finalCounts = await this.countResultsByStatus(executionId);
    if (finalCounts.total > 0) {
      let reconciledRunStatus = mappedStatus;
      if (finalCounts.failed > 0) {
        reconciledRunStatus = 'failed';
      } else if (finalCounts.passed > 0) {
        reconciledRunStatus = 'success';
      }

      await this.testRunRepository.update(runId, {
        status: reconciledRunStatus,
        passedCases: finalCounts.passed,
        failedCases: finalCounts.failed,
        skippedCases: finalCounts.skipped,
      });

      const reconciledTaskStatus: 'success' | 'failed' | 'cancelled' =
        reconciledRunStatus === 'aborted' ? 'cancelled'
          : reconciledRunStatus === 'success' ? 'success'
          : 'failed';

      await this.repository.update(executionId, {
        status: reconciledTaskStatus,
        passedCases: finalCounts.passed,
        failedCases: finalCounts.failed,
        skippedCases: finalCounts.skipped,
      });

      logger.info('Reconciled batch summary from result rows', {
        runId,
        executionId,
        reconciledRunStatus,
        finalCounts,
      }, LOG_CONTEXTS.REPOSITORY);
    }
  }

  /**
   * 【安全防护】最终的全局 ERROR 清理
   * 在所有其他更新完成后执行，确保不会有遗漏的 ERROR 占位符
   * 这是一个防御性的清理，不依赖任何前置条件
   */
  private async performFinalErrorCleanup(executionId: number, results: BatchResults): Promise<void> {
    try {
      const errorRows = await this.testRunResultRepository.query(`
        SELECT COUNT(*) AS errorCount
        FROM Auto_TestRunResults
        WHERE execution_id = ? AND (status IS NULL OR status = 'error')
      `, [executionId]) as Array<{ errorCount: string }>;

      const residualErrorCount = Number(errorRows[0]?.errorCount ?? 0);

      if (residualErrorCount === 0) {
        logger.debug(
          'Final error cleanup: no orphaned errors found',
          { executionId },
          LOG_CONTEXTS.REPOSITORY
        );
        return;
      }

      // 根据运行状态决定清理目标
      let targetStatus: 'passed' | 'failed' | 'skipped';
      const mappedStatus = this.mapStatusForTestRun(results.status);

      if (mappedStatus === 'success') {
        targetStatus = 'passed';
      } else if (mappedStatus === 'failed') {
        targetStatus = 'failed';
      } else {
        targetStatus = 'skipped';
      }

      const cleaned = await this.bulkUpdateErrorResults(executionId, targetStatus);

      logger.info(
        'Final error cleanup completed',
        {
          executionId,
          residualErrorCount,
          cleaned,
          targetStatus,
          reason: 'safety-cleanup-after-all-updates',
        },
        LOG_CONTEXTS.REPOSITORY
      );
    } catch (error) {
      logger.warn(
        'Final error cleanup failed, but execution will continue',
        {
          executionId,
          error: error instanceof Error ? error.message : String(error),
        },
        LOG_CONTEXTS.REPOSITORY
      );
    }
  }

  /**
   * 【轮询路径清理】清理指定 execution 中的 ERROR 占位符
   * 用于轮询同步路径中，当 Jenkins 状态已完成但结果为虚拟/部分时，清理预创建的 ERROR 占位符
   */
  async cleanupErrorPlaceholdersForExecution(executionId: number, runStatus: string): Promise<number> {
    try {
      // 查询是否存在 ERROR 占位符
      const errorRows = await this.testRunResultRepository.query(`
        SELECT COUNT(*) AS errorCount
        FROM Auto_TestRunResults
        WHERE execution_id = ? AND (status IS NULL OR status = 'error')
      `, [executionId]) as Array<{ errorCount: string }>;

      const residualErrorCount = Number(errorRows[0]?.errorCount ?? 0);

      if (residualErrorCount === 0) {
        logger.debug(
          'cleanupErrorPlaceholdersForExecution: no errors found',
          { executionId },
          LOG_CONTEXTS.REPOSITORY
        );
        return 0;
      }

      // 根据运行状态映射清理目标
      let targetStatus: 'passed' | 'failed' | 'skipped';
      if (runStatus === 'success') {
        targetStatus = 'passed';
      } else if (runStatus === 'failed') {
        targetStatus = 'failed';
      } else {
        targetStatus = 'skipped';
      }

      const cleaned = await this.bulkUpdateErrorResults(executionId, targetStatus);

      logger.info(
        'Cleaned error placeholders in polling sync path',
        {
          executionId,
          runStatus,
          residualErrorCount,
          cleaned,
          targetStatus,
          reason: 'polling-sync-cleanup',
        },
        LOG_CONTEXTS.REPOSITORY
      );

      return cleaned;
    } catch (error) {
      logger.warn(
        'Failed to cleanup error placeholders',
        {
          executionId,
          error: error instanceof Error ? error.message : String(error),
        },
        LOG_CONTEXTS.REPOSITORY
      );
      return 0;
    }
  }

  /**
   * 【紧急修复】修复孤立的 TestRun（没有绑定 execution_id）
   * 
   * 问题：旧的 TestRun 没有设置 execution_id 字段，导致查询结果时通过时间窗口反查
   * 可能得到错误的 executionId，进而获取错误的用例结果
   * 
   * 解决方案：
   * 1. 查找所有 execution_id 为 NULL 的 TestRun
   * 2. 通过触发者 + 时间窗口匹配最近的 TaskExecution
   * 3. 回填 execution_id 字段
   */

  private async resolveExecutionIdForBatch(runId: number, cachedExecutionId?: number): Promise<number | undefined> {
    let runBoundExecutionId: number | undefined;

    // 优先读取 Auto_TestRun.execution_id，避免时间窗口误关联到其他执行
    try {
      const trRows = await this.testRunRepository.query(
        `SELECT execution_id FROM Auto_TestRun WHERE id = ? LIMIT 1`,
        [runId]
      ) as Array<{ execution_id: number | null }>;
      if (trRows.length > 0 && trRows[0].execution_id) {
        runBoundExecutionId = trRows[0].execution_id;
      }
    } catch (error) {
      // 兼容旧库可能不存在 execution_id 列的场景
      logger.debug('Failed to read execution_id column, falling back to cache/time-window search', {
        runId,
        error: error instanceof Error ? error.message : String(error),
      }, LOG_CONTEXTS.REPOSITORY);
    }

    if (runBoundExecutionId) {
      if (cachedExecutionId && cachedExecutionId !== runBoundExecutionId) {
        logger.warn('Cached executionId mismatch, using run-bound execution_id', {
          runId,
          cachedExecutionId,
          runBoundExecutionId,
        }, LOG_CONTEXTS.REPOSITORY);
      }
      logger.debug('Resolved executionId from Auto_TestRun.execution_id', {
        runId,
        resolvedId: runBoundExecutionId,
      }, LOG_CONTEXTS.REPOSITORY);
      return runBoundExecutionId;
    }

    if (cachedExecutionId) {
      logger.debug('Using cached executionId because run has no bound execution_id', {
        runId,
        cachedExecutionId,
      }, LOG_CONTEXTS.REPOSITORY);
      return cachedExecutionId;
    }

    // 降级到时间窗口反查
    const fallbackId = await this.findExecutionIdByRunId(runId);
    return fallbackId || undefined;
  }

  /**
   * 兜底策略：通过 Auto_TestRunResults 表中已有的占位记录反查 executionId
   *
   * 背景：triggerExecution 事务中会将 executionId 回填到 Auto_TestRun.execution_id，
   * 同时也将 executionId 写入 Auto_TestRunResults 的每条预创建记录。
   * 若 Auto_TestRun.execution_id 字段 null（旧数据），时间窗口反查也失败时，
   * 可以从 Auto_TestRunResults 里找到该 runId 对应的 executionId。
   *
   * 实现：通过 Auto_TestRun.id 的创建时间找到在同时间段内插入的 TestRunResults，
   * 从中读取 execution_id 作为 fallback。
   */
  protected async resolveExecutionIdFromRunResults(runId: number): Promise<number | undefined> {
    try {
      // 先查该 runId 对应的 TestRun 创建时间
      const runRows = await this.testRunRepository.query(
        `SELECT id, created_at FROM Auto_TestRun WHERE id = ? LIMIT 1`,
        [runId]
      ) as Array<{ id: number; created_at: Date }>;

      if (!runRows || runRows.length === 0) return undefined;

      const createdAt = runRows[0].created_at;

      // 在 TestRun 创建时间 ±120 秒内，查找 Auto_TestRunResults 中存在的 execution_id
      // triggerExecution 事务中同一批次的 TestRunResults 会在 TestRun 创建后立即插入
      const resultRows = await this.testRunResultRepository.query(
        `SELECT DISTINCT execution_id
         FROM Auto_TestRunResults
         WHERE created_at BETWEEN DATE_SUB(?, INTERVAL 120 SECOND)
                               AND DATE_ADD(?, INTERVAL 120 SECOND)
           AND execution_id IS NOT NULL
         ORDER BY id ASC
         LIMIT 1`,
        [createdAt, createdAt]
      ) as Array<{ execution_id: number }>;

      if (resultRows && resultRows.length > 0 && resultRows[0].execution_id) {
        logger.debug('resolveExecutionIdFromRunResults: found executionId via TestRunResults time-window', {
          runId,
          executionId: resultRows[0].execution_id,
        }, LOG_CONTEXTS.REPOSITORY);
        return resultRows[0].execution_id;
      }

      return undefined;
    } catch (error) {
      logger.debug('resolveExecutionIdFromRunResults: query failed', {
        runId,
        error: error instanceof Error ? error.message : String(error),
      }, LOG_CONTEXTS.REPOSITORY);
      return undefined;
    }
  }

  /**
   * 修复10: completeBatch 拆分 - 同步 TaskExecution（Auto_TestCaseTaskExecutions）状态
   *
   * completeBatch 主要更新 Auto_TestRun，此方法负责将状态同步到 Auto_TestCaseTaskExecutions，
   * 保证 getRecentExecutions 查询 TaskExecution 时也能读到最新状态。
   */
  private async syncTaskExecutionStatus(resolvedExecutionId: number, results: BatchResults): Promise<void> {
    // TaskExecution 不支持 'aborted'，统一映射为 'cancelled'
    const taskExecStatus: 'success' | 'failed' | 'cancelled' =
      results.status === 'aborted' || results.status === 'cancelled' ? 'cancelled'
      : results.status === 'success' ? 'success'
      : 'failed';

    await this.repository.update(resolvedExecutionId, {
      status: taskExecStatus,
      passedCases: results.passedCases,
      failedCases: results.failedCases,
      skippedCases: results.skippedCases,
      duration: Math.round(results.durationMs / 1000),
      endTime: new Date(),
    });
  }

  /**
   * 修复10: completeBatch 拆分 - 处理带详细用例结果的更新路径
   *
   * 遍历 caseResults，逐条尝试更新已有记录；若记录不存在则新建。
   * 失败的条目会被收集并记录警告日志，但不会中断其余条目的处理。
   */
  private async updateDetailedCaseResults(
    runId: number,
    executionId: number,
    caseResults: NonNullable<BatchResults['results']>
  ): Promise<void> {
    const failedResults: Array<{ caseId?: number; error: string }> = [];

    for (const result of caseResults) {
      try {
        const resolveTime = (v: string | number | undefined): Date | undefined => {
          if (!v) return undefined;
          const d = new Date(v);
          return isNaN(d.getTime()) ? undefined : d;
        };
        const startTime = resolveTime(result.startTime) ?? new Date();
        const endTime   = resolveTime(result.endTime)   ?? new Date();

        const normalizedStatus = this.normalizeCaseResultStatus(result.status);

        const updated = await this.updateTestResult(executionId, result.caseId, {
          status: normalizedStatus,
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
          caseName: result.caseName,  // 无 caseId 时按 caseName fallback 匹配
        });

        // 【诊断日志】记录每条用例的匹配结果，便于追踪明细写入失败的原因
        logger.debug(
          `updateDetailedCaseResults: case update result`,
          {
            executionId,
            runId,
            caseId: result.caseId,
            caseName: result.caseName,
            status: normalizedStatus,
            matched: updated,
            action: updated ? 'updated' : (result.caseId !== undefined ? 'will_create' : 'skipped_no_caseId'),
          },
          LOG_CONTEXTS.REPOSITORY
        );

        if (!updated) {
          // 若 caseId 缺失（caseName fallback 场景），跳过 createTestResult 避免 DB NOT NULL 错误
          if (result.caseId !== undefined) {
            await this.createTestResult({
              executionId,
              caseId: result.caseId,
              caseName: result.caseName,
              status: normalizedStatus,
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
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        failedResults.push({ caseId: result.caseId, error: errorMsg });
        logger.error(
          `Failed to process result for case`,
          { caseId: result.caseId, executionId, error: errorMsg },
          LOG_CONTEXTS.REPOSITORY
        );
      }
    }

    if (failedResults.length > 0) {
      logger.warn(
        `Some results failed to process in batch`,
        {
          runId,
          failedCount: failedResults.length,
          totalCount: caseResults.length,
          failedCaseIds: failedResults.map(f => f.caseId),
        },
        LOG_CONTEXTS.REPOSITORY
      );
    }
  }

  /**
   * 修复12: 清理残留的 ERROR 占位符
   *
   * 场景：Jenkins 回调只返回部分测试结果（如网络故障、超时、脚本异常）
   * 例如：10个用例只返回3个结果，剩余7个 ERROR 占位符不会被 updateDetailedCaseResults 清理
   *
   * 解决方案：
   * 1. 统计已更新的结果数量 vs 回调中的统计数 (passedCases + failedCases + skippedCases)
   * 2. 计算预期的总用例数（数据库记录总数）
   * 3. 检查是否有残留的 ERROR 占位符
   * 4. 根据整体执行状态批量更新残留占位符
   *
   * @param runId TestRun ID
   * @param executionId TaskExecution ID
   * @param detailedResultsCount 回调中详细结果的数量
   * @param results 回调中的完整结果数据
   */
  private async cleanupResidualErrorPlaceholders(
    runId: number,
    executionId: number,
    detailedResultsCount: number,
    results: BatchResults
  ): Promise<void> {
    // 1. 获取该 executionId 下的所有结果状态分布
    const statusCounts = await this.countResultsByStatus(executionId);
    const totalFromCallback = results.passedCases + results.failedCases + results.skippedCases;

    // 2. 检查是否有残留的 ERROR 占位符
    const errorCountQuery = await this.testRunResultRepository.query(`
      SELECT COUNT(*) AS errorCount
      FROM Auto_TestRunResults
      WHERE execution_id = ? AND (status IS NULL OR status = 'error')
    `, [executionId]) as Array<{ errorCount: string }>;
    const residualErrorCount = Number(errorCountQuery[0]?.errorCount ?? 0);

    // 如果没有残留 ERROR 占位符，无需处理
    if (residualErrorCount === 0) {
      logger.debug(
        `No residual ERROR placeholders found, skip cleanup`,
        { runId, executionId, detailedResultsCount, totalFromCallback },
        LOG_CONTEXTS.REPOSITORY
      );
      return;
    }

    // 3. 判断是否有部分结果缺失的情况
    // 如果回调中的统计数与详细结果数不一致，说明确实存在部分结果缺失
    const hasPartialResults = detailedResultsCount < totalFromCallback || statusCounts.total > detailedResultsCount;

    logger.info(
      `Detected residual ERROR placeholders, will clean up based on overall status`,
      {
        runId,
        executionId,
        detailedResultsCount,
        totalFromCallback,
        dbTotal: statusCounts.total,
        residualErrorCount,
        hasPartialResults,
        overallStatus: results.status,
      },
      LOG_CONTEXTS.REPOSITORY
    );

    // 4. 根据整体执行状态批量更新残留的 ERROR 占位符
    // 安全策略：当存在部分结果缺失时，不应用"假定性"状态，避免假阳性
    // - 如果整体状态是 success 且没有部分结果缺失，将残留 ERROR 更新为 passed
    // - 如果整体状态是 success 但有部分结果缺失，将残留 ERROR 更新为 skipped（安全处理）
    // - 如果整体状态是 failed，将残留 ERROR 更新为 failed（保守处理）
    // - 如果整体状态是 aborted/cancelled，将残留 ERROR 更新为 skipped
    let targetStatus: 'passed' | 'failed' | 'skipped';
    let reason: string;

    if (results.status === 'success') {
      if (hasPartialResults) {
        // 安全处理：部分结果缺失时，残留 ERROR 可能是未执行的用例，标记为 skipped 避免假阳性
        targetStatus = 'skipped';
        reason = 'overall execution succeeded but partial results missing - marking as skipped to avoid false positives';
      } else {
        // 完整结果场景：残留 ERROR 可能是 Jenkins 未返回的结果，假设它们通过了
        targetStatus = 'passed';
        reason = 'overall execution succeeded with complete results';
      }
    } else if (results.status === 'failed') {
      // 失败场景：保守处理，将残留 ERROR 标记为 failed
      targetStatus = 'failed';
      reason = 'overall execution failed';
    } else {
      // 取消/中断场景：将残留 ERROR 标记为 skipped
      targetStatus = 'skipped';
      reason = 'execution was cancelled or aborted';
    }

    const updatedCount = await this.bulkUpdateErrorResults(executionId, targetStatus);

    logger.info(
      `Cleaned up residual ERROR placeholders`,
      {
        runId,
        executionId,
        residualErrorCount,
        updatedCount,
        targetStatus,
        reason,
        hasPartialResults,
        overallStatus: results.status,
      },
      LOG_CONTEXTS.REPOSITORY
    );

    // 5. 同步更新统计数（确保数据库统计与实际状态一致）
    const newCounts = await this.countResultsByStatus(executionId);
    await this.testRunRepository.update(runId, {
      passedCases: newCounts.passed,
      failedCases: newCounts.failed,
      skippedCases: newCounts.skipped,
    });
  }

  /**
   * 修复10 + 修复11: completeBatch 拆分 - 处理只有汇总统计、没有详细用例结果的兜底路径
   *
   * 策略一（totalSummary > 0）：Jenkins 只传了统计数（passedCases/failedCases/skippedCases > 0），
   *   按顺序将预创建的 error 记录批量更新为对应状态。
   *   修复11: 改为按状态分组使用 IN 批量 UPDATE，替代原来的逐条循环，减少 SQL 往返次数。
   *
   * 策略二（totalSummary = 0）：Jenkins 统计数全为0，
   *   先查数据库现有结果，若已有真实结果则回填统计；若全是 error 记录则按整体状态批量更新。
   */
  private async updateSummaryOnlyResults(
    runId: number,
    executionId: number,
    results: BatchResults
  ): Promise<void> {
    const totalSummary = results.passedCases + results.failedCases + results.skippedCases;

    if (totalSummary > 0) {
      logger.info(
        `No detailed results provided, updating pre-created records using summary counts`,
        { runId, executionId, passedCases: results.passedCases, failedCases: results.failedCases, skippedCases: results.skippedCases },
        LOG_CONTEXTS.REPOSITORY
      );

      // 【修复】只获取仍处于 error 状态的占位记录，避免覆盖已被 updateDetailedCaseResults 写入的真实结果
      // 原查询无 status 过滤，在并发/重试场景下会把已正确更新的记录重置为错误状态
      const preCreatedResults = await this.testRunResultRepository.query(`
        SELECT id FROM Auto_TestRunResults
        WHERE execution_id = ? AND (status IS NULL OR status = 'error')
        ORDER BY id ASC
      `, [executionId]) as Array<{ id: number }>;

      const now = new Date();
      const batchUpdate = async (ids: number[], status: 'passed' | 'failed' | 'skipped') => {
        if (ids.length === 0) return;
        // 只更新 status 和 end_time，不填充 start_time 和 duration：
        // 没有真实执行数据时，保留 NULL 让前端显示 "-"
        const placeholders = ids.map(() => '?').join(', ');
        await this.testRunResultRepository.query(
          `UPDATE Auto_TestRunResults
           SET status = ?,
               end_time = COALESCE(end_time, ?)
           WHERE id IN (${placeholders})`,
          [status, now, ...ids]
        );
      };

      if (preCreatedResults.length > 0) {
        const passedEnd = results.passedCases;
        const failedEnd = passedEnd + results.failedCases;

        // 修复11: 按状态分组收集 id，再批量 UPDATE，替代原来的逐条循环
        const passedIds  = preCreatedResults.slice(0,        passedEnd).map(r => r.id);
        const failedIds  = preCreatedResults.slice(passedEnd, failedEnd).map(r => r.id);
        const skippedIds = preCreatedResults.slice(failedEnd).map(r => r.id);

        logger.info(
          `updateSummaryOnlyResults: distributing status to error placeholders`,
          {
            runId,
            executionId,
            totalErrorPlaceholders: preCreatedResults.length,
            passedIds: passedIds.length,
            failedIds: failedIds.length,
            skippedIds: skippedIds.length,
            summaryPassed: results.passedCases,
            summaryFailed: results.failedCases,
            summarySkipped: results.skippedCases,
          },
          LOG_CONTEXTS.REPOSITORY
        );

        await Promise.all([
          batchUpdate(passedIds,  'passed'),
          batchUpdate(failedIds,  'failed'),
          batchUpdate(skippedIds, 'skipped'),
        ]);

        logger.info(
          `Updated pre-created result records using summary counts`,
          { runId, executionId, updatedCount: preCreatedResults.length },
          LOG_CONTEXTS.REPOSITORY
        );
      } else {
        // 【修复】当 error 占位符已被轮询路径提前清理（改为 failed/passed）时，
        // 若此次回调汇总数据与数据库明细记录不一致，需要重新修正以保持数据同步。
        // 场景：轮询路径在无 JUnit 结果时将占位符改为 failed，随后回调到达告知 passedCases>0。
        // 此时需要将 failed 记录中多余的（按顺序）重新分配为 passed。
        const currentCounts = await this.testRunResultRepository.query(`
          SELECT
            SUM(CASE WHEN status = 'passed' THEN 1 ELSE 0 END) AS passed,
            SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed,
            SUM(CASE WHEN status = 'skipped' THEN 1 ELSE 0 END) AS skipped,
            COUNT(*) AS total
          FROM Auto_TestRunResults
          WHERE execution_id = ?
        `, [executionId]) as Array<{ passed: string; failed: string; skipped: string; total: string }>;

        if (currentCounts.length > 0) {
          const dbPassed  = Number(currentCounts[0].passed  ?? 0);
          const dbFailed  = Number(currentCounts[0].failed  ?? 0);
          const dbTotal   = Number(currentCounts[0].total   ?? 0);

          const expectedPassed  = results.passedCases;
          const expectedFailed  = results.failedCases;

          // 只在汇总数据与数据库明细不一致时进行修正（避免覆盖正确数据）
          const needsReconcile = dbTotal > 0 && (dbPassed !== expectedPassed || dbFailed !== expectedFailed);

          if (needsReconcile) {
            logger.info(
              `updateSummaryOnlyResults: no error placeholders but counts mismatch, reconciling`,
              {
                runId,
                executionId,
                dbPassed,
                dbFailed,
                dbTotal,
                expectedPassed,
                expectedFailed,
                summaryPassed: results.passedCases,
                summaryFailed: results.failedCases,
              },
              LOG_CONTEXTS.REPOSITORY
            );

            // 若回调说全部通过（passedCases == total），但 DB 里全是 failed，
            // 则将所有非 passed 记录按序重新分配为 passed
            if (expectedPassed > 0 && dbPassed < expectedPassed) {
              // 查出多余的 failed 记录，按顺序将前 (expectedPassed - dbPassed) 条改为 passed
              const needMorePassed = expectedPassed - dbPassed;
              const failedRecords = await this.testRunResultRepository.query(`
                SELECT id FROM Auto_TestRunResults
                WHERE execution_id = ? AND status = 'failed'
                ORDER BY id ASC
                LIMIT ?
              `, [executionId, needMorePassed]) as Array<{ id: number }>;

              if (failedRecords.length > 0) {
                const ids = failedRecords.map(r => r.id);
                await batchUpdate(ids, 'passed');
                logger.info(
                  `updateSummaryOnlyResults: reconciled failed→passed records`,
                  { runId, executionId, reconciled: ids.length, expectedPassed, dbPassed },
                  LOG_CONTEXTS.REPOSITORY
                );
              }
            } else if (expectedFailed > 0 && dbFailed < expectedFailed) {
              // 反向场景：DB 里 passed 多，但 Jenkins 说有 failed
              const needMoreFailed = expectedFailed - dbFailed;
              const passedRecords = await this.testRunResultRepository.query(`
                SELECT id FROM Auto_TestRunResults
                WHERE execution_id = ? AND status = 'passed'
                ORDER BY id DESC
                LIMIT ?
              `, [executionId, needMoreFailed]) as Array<{ id: number }>;

              if (passedRecords.length > 0) {
                const ids = passedRecords.map(r => r.id);
                await batchUpdate(ids, 'failed');
                logger.info(
                  `updateSummaryOnlyResults: reconciled passed→failed records`,
                  { runId, executionId, reconciled: ids.length, expectedFailed, dbFailed },
                  LOG_CONTEXTS.REPOSITORY
                );
              }
            }
          }
        }
      }
    } else {
      // 统计数全为0，且没有详细 results 数组
      // 先查数据库里该 executionId 下的现有记录状态
      const countRows = await this.testRunResultRepository.query(`
        SELECT
          SUM(CASE WHEN status = 'passed' THEN 1 ELSE 0 END) AS passed,
          SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed,
          SUM(CASE WHEN status IS NULL OR status = 'error' THEN 1 ELSE 0 END) AS error_count,
          SUM(CASE WHEN status = 'skipped' THEN 1 ELSE 0 END) AS skipped,
          COUNT(*) AS total
        FROM Auto_TestRunResults
        WHERE execution_id = ?
      `, [executionId]) as Array<{ passed: string; failed: string; error_count: string; skipped: string; total: string }>;

      if (countRows.length > 0) {
        const dbPassed   = Number(countRows[0].passed      ?? 0);
        const dbFailed   = Number(countRows[0].failed      ?? 0);
        const dbError    = Number(countRows[0].error_count ?? 0);
        const dbSkipped  = Number(countRows[0].skipped     ?? 0);
        const dbTotal    = Number(countRows[0].total       ?? 0);
        const dbFinished = dbPassed + dbFailed + dbSkipped;

        if (dbTotal > 0 && dbFinished > 0) {
          // 已有非 error 的真实结果，直接用统计值回填 Auto_TestRun，不覆盖为0
          await this.testRunRepository.update(runId, {
            passedCases:  dbPassed,
            failedCases:  dbFailed,
            skippedCases: dbSkipped,
          });
          logger.info(
            `Recalculated stats from existing results and back-filled Auto_TestRun`,
            { runId, executionId, dbPassed, dbFailed, dbSkipped },
            LOG_CONTEXTS.REPOSITORY
          );
        } else if (dbTotal > 0 && dbError > 0) {
          // 全是预创建的 error 记录，根据执行整体状态将它们批量更新
          // success → passed；failed/aborted/cancelled → failed
          const mappedStatus: 'passed' | 'failed' =
            (results.status === 'success') ? 'passed' : 'failed';

          // 只更新 status 和 end_time，不填充 start_time 和 duration，保留 NULL 让前端正确显示 "-"
          await this.testRunResultRepository.query(`
            UPDATE Auto_TestRunResults
            SET status = ?,
                end_time = COALESCE(end_time, NOW())
            WHERE execution_id = ? AND (status IS NULL OR status = 'error')
          `, [mappedStatus, executionId]);

          // 根据映射结果更新 Auto_TestRun 统计
          const newPassed = mappedStatus === 'passed' ? dbError : 0;
          const newFailed = mappedStatus === 'failed' ? dbError : 0;
          await this.testRunRepository.update(runId, {
            passedCases:  newPassed,
            failedCases:  newFailed,
            skippedCases: 0,
          });

          logger.info(
            `Bulk-updated pre-created error records based on overall execution status`,
            { runId, executionId, mappedStatus, updatedCount: dbError, newPassed, newFailed },
            LOG_CONTEXTS.REPOSITORY
          );
        }
      }
    }
  }
}
