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
import { ExecutionRepositoryBatch } from './ExecutionRepositoryBatch';
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
export class ExecutionRepositoryMaintenance extends ExecutionRepositoryBatch {
  async fixOrphanedTestRuns(): Promise<{ fixed: number; checked: number }> {
    let fixed = 0;
    let checked = 0;

    try {
      // 查找所有 execution_id 为 NULL 的 TestRun
      const orphanedRuns = await this.testRunRepository.query(`
        SELECT tr.id, tr.trigger_by, tr.created_at
        FROM Auto_TestRun tr
        WHERE tr.execution_id IS NULL
        ORDER BY tr.id DESC
        LIMIT 100
      `) as Array<{ id: number; trigger_by: number; created_at: Date }>;

      checked = orphanedRuns.length;

      if (orphanedRuns.length === 0) {
        logger.info('No orphaned TestRuns found', {}, LOG_CONTEXTS.REPOSITORY);
        return { fixed: 0, checked: 0 };
      }

      logger.info(`Found ${orphanedRuns.length} orphaned TestRuns, attempting to fix...`, {}, LOG_CONTEXTS.REPOSITORY);

      for (const run of orphanedRuns) {
        // 通过时间窗口 + 触发者查找最近的 TaskExecution
        const matchingExecutions = await this.repository.query(`
          SELECT e.id as execution_id
          FROM Auto_TestCaseTaskExecutions e
          WHERE e.executed_by = ?
            AND e.created_at BETWEEN DATE_SUB(?, INTERVAL 120 SECOND) AND DATE_ADD(?, INTERVAL 120 SECOND)
          ORDER BY ABS(TIMESTAMPDIFF(SECOND, e.created_at, ?)) ASC
          LIMIT 1
        `, [
          run.trigger_by,
          run.created_at, run.created_at, run.created_at
        ]) as Array<{ execution_id: number }>;

        if (matchingExecutions && matchingExecutions.length > 0) {
          const executionId = matchingExecutions[0].execution_id;
          await this.testRunRepository.update(run.id, { executionId });
          fixed++;
          logger.info(`Fixed TestRun #${run.id} → executionId ${executionId}`, {}, LOG_CONTEXTS.REPOSITORY);
        }
      }

      logger.info(`Orphaned TestRuns fix completed: ${fixed}/${checked} fixed`, { fixed, checked }, LOG_CONTEXTS.REPOSITORY);
    } catch (error) {
      logger.warn(
        'Failed to fix orphaned TestRuns',
        { error: error instanceof Error ? error.message : String(error) },
        LOG_CONTEXTS.REPOSITORY
      );
    }

    return { fixed, checked };
  }

  /**
   * 更新测试运行的状态和 Jenkins 信息（用于 Jenkins 同步）
   */
  async updateTestRunStatus(
    runId: number,
    status: string,
    options?: {
      durationMs?: number;
      passedCases?: number;
      failedCases?: number;
      skippedCases?: number;
      abortReason?: string;
    }
  ): Promise<void> {
    const normalizedStatus = status === 'cancelled' ? 'aborted' : status;
    const updateData: QueryDeepPartialEntity<TestRun> = {
      status: normalizedStatus as 'pending' | 'running' | 'success' | 'failed' | 'aborted',
    };

    // 终态时设置 endTime
    if (['success', 'failed', 'aborted'].includes(normalizedStatus)) {
      updateData.endTime = new Date();
    } else if (['running', 'pending'].includes(normalizedStatus)) {
      // 非终态（running/pending）时清除 endTime，防止从终态回退时出现数据不一致
      // 场景：Jenkins 轮询误判（building=true）或网络延迟导致状态错乱
      // 确保数据一致性：running/pending 状态不应有结束时间
      updateData.endTime = null as unknown as Date;
    }

    if (options?.durationMs !== undefined) updateData.durationMs = options.durationMs;
    if (options?.passedCases !== undefined) updateData.passedCases = options.passedCases;
    if (options?.failedCases !== undefined) updateData.failedCases = options.failedCases;
    if (options?.skippedCases !== undefined) updateData.skippedCases = options.skippedCases;

    if (normalizedStatus === 'aborted' && options?.abortReason) {
      const current = await this.testRunRepository.findOne({
        where: { id: runId },
        select: ['id', 'runConfig'],
      });
      const currentConfig = current?.runConfig;
      let parsedConfig: Record<string, unknown> = {};

      if (currentConfig && typeof currentConfig === 'object' && !Array.isArray(currentConfig)) {
        parsedConfig = currentConfig as Record<string, unknown>;
      } else if (typeof currentConfig === 'string') {
        try {
          const parsed = JSON.parse(currentConfig) as unknown;
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            parsedConfig = parsed as Record<string, unknown>;
          }
        } catch {
          parsedConfig = {};
        }
      }

      updateData.runConfig = {
        ...parsedConfig,
        abortReason: options.abortReason,
        abortAt: new Date().toISOString(),
      };
    }

    await this.testRunRepository.update(runId, updateData);
  }

  /**
   * 获取测试运行状态信息
   */
  async getTestRunStatus(runId: number): Promise<TestRunStatusInfo | null> {
    return this.testRunRepository.findOne({
      where: { id: runId },
      select: ['id', 'executionId', 'status', 'jenkinsJob', 'jenkinsBuildId', 'jenkinsUrl', 'startTime'],
    });
  }

  async syncTaskExecutionFromTestRunStatus(
    runId: number,
    status: string,
    options?: {
      durationMs?: number;
      passedCases?: number;
      failedCases?: number;
      skippedCases?: number;
    }
  ): Promise<void> {
    const testRun = await this.testRunRepository.findOne({
      where: { id: runId },
      select: ['id', 'executionId', 'passedCases', 'failedCases', 'skippedCases', 'durationMs'],
    });

    if (!testRun?.executionId) {
      logger.warn('syncTaskExecutionFromTestRunStatus: no executionId bound to run', {
        runId,
      }, LOG_CONTEXTS.REPOSITORY);
      return;
    }

    const currentTaskExecution = await this.repository.findOne({
      where: { id: testRun.executionId },
      select: ['id', 'startTime', 'endTime'],
    });

    const normalizedStatus: 'pending' | 'running' | 'success' | 'failed' | 'cancelled' =
      status === 'aborted' || status === 'cancelled' ? 'cancelled'
        : status === 'success' ? 'success'
        : status === 'running' ? 'running'
        : status === 'pending' ? 'pending'
        : 'failed';

    const updateData: QueryDeepPartialEntity<TaskExecution> = {
      status: normalizedStatus,
      passedCases: options?.passedCases ?? testRun.passedCases ?? 0,
      failedCases: options?.failedCases ?? testRun.failedCases ?? 0,
      skippedCases: options?.skippedCases ?? testRun.skippedCases ?? 0,
      duration: Math.round((options?.durationMs ?? testRun.durationMs ?? 0) / 1000),
    };

    if (normalizedStatus === 'running') {
      updateData.startTime = currentTaskExecution?.startTime ?? new Date();
      updateData.endTime = null as unknown as Date;
    } else if (['success', 'failed', 'cancelled'].includes(normalizedStatus)) {
      updateData.startTime = currentTaskExecution?.startTime ?? new Date();
      updateData.endTime = currentTaskExecution?.endTime ?? new Date();
    }

    await this.repository.update(testRun.executionId, updateData);
  }

  /**
   * [dev-11] 获取当前所有 running 状态的执行记录（用于服务启动时恢复调度器槽位）
   * 只查最近 maxAgeHours 小时内启动的执行，避免捞出陈年旧账
   * 使用原生 SQL 避免 TypeORM 实体元数据依赖（防止启动顺序竞态问题）
   * 修复12: 添加 ACTIVE_SLOTS_MAX_LIMIT 上限，防止异常场景下返回过多记录
   */
  async getActiveRunningSlots(maxAgeHours: number = 24): Promise<Array<{
    id: number;
    taskId: number | null;
    startTime: Date | null;
  }>> {
    const rows = await this.testRunRepository.query(
      `SELECT r.id, e.task_id AS taskId, r.start_time AS startTime
       FROM Auto_TestRun r
       LEFT JOIN Auto_TestCaseTaskExecutions e ON r.execution_id = e.id
       WHERE r.status = 'running'
         AND r.start_time > DATE_SUB(NOW(), INTERVAL ? HOUR)
       ORDER BY r.start_time ASC
       LIMIT ?`,
      [maxAgeHours, ExecutionRepositoryBase.ACTIVE_SLOTS_MAX_LIMIT]
    ) as Array<{ id: number; taskId: number | null; startTime: Date | null }>;
    return rows;
  }

  /**
   * 将指定 executionId 下所有 status=error 的预创建记录批量更新为目标状态
   * 同时填充 start_time（若为 NULL 则用 NOW()）和 duration（若为 NULL 则用 0）
   */
  async bulkUpdateErrorResults(executionId: number, targetStatus: 'passed' | 'failed' | 'skipped'): Promise<number> {
    // 只更新 status 和 end_time，不填充 start_time 和 duration：
    // 这些占位符记录没有真实的执行时间和耗时数据，保留 NULL 让前端显示 "-"，
    // 避免用当前时间或 0 误导用户。
    const result = await this.testRunResultRepository.query(`
      UPDATE Auto_TestRunResults
      SET status = ?,
          end_time = COALESCE(end_time, NOW())
      WHERE execution_id = ? AND (status IS NULL OR status = 'error')
    `, [targetStatus, executionId]) as { affectedRows?: number; changedRows?: number };
    return result?.affectedRows ?? 0;
  }

  /**
   * 统计指定 executionId 下各状态的结果数量
   */

  async syncTestRunByExecutionId(executionId: number, data: {
    status: 'success' | 'failed' | 'cancelled' | 'aborted';
    passedCases: number;
    failedCases: number;
    skippedCases: number;
    durationMs: number;
  }): Promise<boolean> {
    // Auto_TestRun.execution_id 字段直接关联了 executionId
    const testRun = await this.testRunRepository.findOne({
      where: { executionId },
      select: ['id', 'status'],
    });

    if (!testRun) {
      logger.warn('syncTestRunByExecutionId: no TestRun found for executionId', { executionId }, LOG_CONTEXTS.REPOSITORY);
      return false;
    }

    const mappedStatus = this.mapStatusForTestRun(data.status);
    await this.testRunRepository.update(testRun.id, {
      status:       mappedStatus,
      passedCases:  data.passedCases,
      failedCases:  data.failedCases,
      skippedCases: data.skippedCases,
      durationMs:   data.durationMs,
      endTime:      new Date(),
    });

    logger.debug('syncTestRunByExecutionId: synced TestRun stats', {
      executionId,
      runId: testRun.id,
      passedCases: data.passedCases,
      failedCases: data.failedCases,
      skippedCases: data.skippedCases,
    }, LOG_CONTEXTS.REPOSITORY);

    return true;
  }

  // ============================================================================
  // 私有辅助方法
  // ============================================================================

  /**
   * 辅助方法：将状态映射为 TestRun 的枚举值
   * @param status 输入状态
   * @returns TestRun 的状态枚举值
   */
}
