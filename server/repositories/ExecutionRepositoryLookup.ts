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
export abstract class ExecutionRepositoryLookup extends ExecutionRepositoryBase {
  protected abstract resolveExecutionIdFromRunResults(runId: number): Promise<number | undefined>;

  async findExecutionId(): Promise<number | null> {
    const result = await this.testRunResultRepository.createQueryBuilder('result')
      .select('DISTINCT result.executionId')
      .where('result.executionId IS NOT NULL')
      .orderBy('result.executionId', 'DESC')
      .limit(1)
      .getRawOne();

    return result?.executionId || null;
  }

  /**
   * 根据 runId 查找关联的 executionId
   * 
   * 设计说明：
   * - Auto_TestRun 和 Auto_TestCaseTaskExecutions 同时创建（时间相近）
   * - Auto_TestRunResults 的 execution_id 指向 Auto_TestCaseTaskExecutions.id
   * - 通过 Auto_TestCaseTaskExecutions 表，用触发者 + 时间窗口反查 executionId
   * 
   * 查询策略：
   * 1. 获取 TestRun 的创建时间和触发者信息
   * 2. 通过时间窗口（±TIME_WINDOW_TOLERANCE_SECONDS）+ 触发者匹配查找最近的 TaskExecution
   * 3. 如果没有找到结果，记录警告并返回 null
   * 
   * @param runId 执行批次ID
   * @returns 关联的运行记录ID，如果找不到则返回 null
   */
  async findExecutionIdByRunId(runId: number): Promise<number | null> {
    // 1. 获取 TestRun 的详细信息（含创建时间）
    const testRunRows = await this.testRunRepository.query(`
      SELECT id, trigger_by, created_at FROM Auto_TestRun WHERE id = ? LIMIT 1
    `, [runId]) as Array<{ id: number; trigger_by: number; created_at: Date }>;

    if (!testRunRows || testRunRows.length === 0) {
      logger.warn(
        `TestRun not found`,
        { runId },
        LOG_CONTEXTS.REPOSITORY
      );
      return null;
    }

    const testRun = testRunRows[0];

    // 2. 通过时间窗口（±TIME_WINDOW_TOLERANCE_SECONDS）和触发者信息，在 Auto_TestCaseTaskExecutions 中查找最近的关联记录
    // 使用时间窗口而非 id 差值，避免因两表 id 自增不同步导致查找失败
    // 查询逻辑：
    //   - 匹配同一触发者（executed_by）
    //   - 创建时间在 TestRun 前后 TIME_WINDOW_TOLERANCE_SECONDS 秒内
    //   - 按时间差绝对值升序排列，取最近的记录
    const result = await this.testRunResultRepository.query(`
      SELECT e.id as execution_id
      FROM Auto_TestCaseTaskExecutions e
      WHERE e.executed_by = ?
        AND e.created_at BETWEEN DATE_SUB(?, INTERVAL ? SECOND) AND DATE_ADD(?, INTERVAL ? SECOND)
      ORDER BY ABS(TIMESTAMPDIFF(SECOND, e.created_at, ?)) ASC
      LIMIT 1
    `, [
      testRun.trigger_by,
      testRun.created_at, ExecutionRepositoryBase.TIME_WINDOW_TOLERANCE_SECONDS,
      testRun.created_at, ExecutionRepositoryBase.TIME_WINDOW_TOLERANCE_SECONDS,
      testRun.created_at,
    ]);

    if (result && result.length > 0 && result[0].execution_id) {
      logger.debug(
        `Found executionId for runId via time-window`,
        { runId, executionId: result[0].execution_id },
        LOG_CONTEXTS.REPOSITORY
      );
      return result[0].execution_id;
    }

    // 3. 尝试通过 TestRunResults 表反查 executionId
    const fallbackExecutionId = await this.resolveExecutionIdFromRunResults(runId);
    if (fallbackExecutionId) {
      logger.info(
        `Found executionId for runId via TestRunResults fallback`,
        { runId, executionId: fallbackExecutionId },
        LOG_CONTEXTS.REPOSITORY
      );
      return fallbackExecutionId;
    }

    // 4. 如果没有找到，记录警告
    logger.warn(
      `Could not find executionId for runId`,
      {
        runId,
        triggerBy: testRun.trigger_by,
        suggestion: 'Consider adding execution_id column to Auto_TestRun table'
      },
      LOG_CONTEXTS.REPOSITORY
    );

    return null;
  }

  /**
   * 更新测试结果
   * 修复4: 使用 TestRunResultStatus 枚举校验状态，替代不安全的强制类型断言
   */
  async updateTestResult(
    executionId: number,
    caseId: number | undefined | null,
    result: {
      status: string;
      duration: number;
      errorMessage?: string;
      errorStack?: string;
      screenshotPath?: string;
      logPath?: string;
      assertionsTotal?: number;
      assertionsPassed?: number;
      responseData?: string;
      startTime?: Date;
      endTime?: Date;
      caseName?: string;
    }
  ): Promise<boolean> {
    // 将外部传入的 status 字符串映射为合法的枚举值，不合法时降级为 'error'
    const validStatuses: ReadonlyArray<string> = Object.values(TestRunResultStatus);
    const safeStatus = validStatuses.includes(result.status)
      ? (result.status as 'passed' | 'failed' | 'skipped' | 'error')
      : 'error';

    const updateData: Partial<TestRunResult> = {
      status: safeStatus,
      duration: result.duration,
      errorMessage: result.errorMessage || null,
      errorStack: result.errorStack || null,
      screenshotPath: result.screenshotPath || null,
      logPath: result.logPath || null,
      assertionsTotal: result.assertionsTotal || null,
      assertionsPassed: result.assertionsPassed || null,
      responseData: result.responseData || null,
      startTime: result.startTime || null,
      endTime: result.endTime || null,
    };

    // 【修复】优先用 caseId 匹配；无 caseId 或为 0 时降级用 caseName 匹配（Jenkins 只传 caseName 的场景）
    if (caseId && caseId > 0) {
      const updateResult = await this.testRunResultRepository.update(
        { executionId, caseId },
        updateData
      );
      if ((updateResult.affected ?? 0) > 0) return true;
    }

    // 【修复】当 caseId 缺失或为 0 时，尝试用 caseName 匹配
    // 优先精确匹配，其次模糊匹配（以防格式略有差异）
    if (result.caseName) {
      // 【第 2 层】精确匹配（完全相同）
      const updateResult = await this.testRunResultRepository
        .createQueryBuilder()
        .update(TestRunResult)
        .set(updateData)
        .where('execution_id = :executionId AND case_name = :caseName', {
          executionId,
          caseName: result.caseName,
        })
        .execute();
      if ((updateResult.affected ?? 0) > 0) return true;

      // 【第 3 层】大小写不敏感的精确匹配
      const caseInsensitiveResult = await this.testRunResultRepository
        .createQueryBuilder()
        .update(TestRunResult)
        .set(updateData)
        .where('execution_id = :executionId AND LOWER(case_name) = LOWER(:caseName)', {
          executionId,
          caseName: result.caseName,
        })
        .execute();
      if ((caseInsensitiveResult.affected ?? 0) > 0) return true;

      // 【第 4 层】包含式模糊匹配（占位符 caseName 包含回调的 caseName）
      // 例：期望 'TestGeolocation::test_geolocation' 但收到 'test_geolocation'
      const fuzzyUpdateResult = await this.testRunResultRepository
        .createQueryBuilder()
        .update(TestRunResult)
        .set(updateData)
        .where('execution_id = :executionId AND (LOWER(case_name) LIKE LOWER(:fuzzyPattern1) OR LOWER(case_name) LIKE LOWER(:fuzzyPattern2))', {
          executionId,
          fuzzyPattern1: `%${result.caseName}%`,
          fuzzyPattern2: `%${result.caseName.replace(/.*::/g, '')}%`, // 去掉命名空间
        })
        .execute();
      if ((fuzzyUpdateResult.affected ?? 0) > 0) return true;
    }

    return false;
  }

  /**
   * 创建测试结果记录
   * 修复4: 使用 TestRunResultStatus 枚举校验状态，替代不安全的强制类型断言
   */
  async createTestResult(result: {
    executionId: number;
    caseId: number;
    caseName: string;
    status: string;
    duration: number;
    errorMessage?: string;
    errorStack?: string;
    screenshotPath?: string;
    logPath?: string;
    assertionsTotal?: number;
    assertionsPassed?: number;
    responseData?: string;
    startTime?: Date;
    endTime?: Date;
  }): Promise<void> {
    // 将外部传入的 status 字符串映射为合法的枚举值，不合法时降级为 'error'
    const validStatuses: ReadonlyArray<string> = Object.values(TestRunResultStatus);
    const safeStatus = validStatuses.includes(result.status)
      ? (result.status as 'passed' | 'failed' | 'skipped' | 'error')
      : 'error';

    const entity = this.testRunResultRepository.create({
      executionId: result.executionId,
      caseId: result.caseId,
      caseName: result.caseName,
      status: safeStatus,
      duration: result.duration,
      errorMessage: result.errorMessage || null,
      errorStack: result.errorStack || null,
      screenshotPath: result.screenshotPath || null,
      logPath: result.logPath || null,
      assertionsTotal: result.assertionsTotal || null,
      assertionsPassed: result.assertionsPassed || null,
      responseData: result.responseData || null,
      startTime: result.startTime || null,
      endTime: result.endTime || null,
    });
    await this.testRunResultRepository.save(entity);
  }

  /**
   * 标记执行为超时
   */
  async markExecutionAsTimedOut(runId: number): Promise<void> {
    await this.testRunRepository.update(runId, {
      status: TestRunStatus.ABORTED,
      endTime: new Date(),
    });
  }

  /**
   * 获取可能超时的运行记录
   */
  async getPotentiallyTimedOutExecutions(timeoutThreshold: Date): Promise<PotentiallyTimedOutExecution[]> {
    return this.testRunRepository.createQueryBuilder('testRun')
      .select([
        'testRun.id',
        'testRun.jenkinsJob',
        'testRun.jenkinsBuildId',
        'testRun.startTime',
      ])
      .where('testRun.status IN (:...statuses)', { statuses: [TestRunStatus.PENDING, TestRunStatus.RUNNING] })
      .andWhere('testRun.startTime < :timeoutThreshold', { timeoutThreshold })
      .getRawMany();
  }

  /**
   * 获取有 Jenkins 信息的运行记录
   */
  async getExecutionsWithJenkinsInfo(limit: number = 50): Promise<ExecutionWithJenkinsInfo[]> {
    return this.testRunRepository.createQueryBuilder('testRun')
      .select([
        'testRun.id',
        'testRun.status',
        'testRun.jenkinsJob',
        'testRun.jenkinsBuildId',
      ])
      .where('testRun.jenkinsJob IS NOT NULL')
      .andWhere('testRun.jenkinsBuildId IS NOT NULL')
      .orderBy('testRun.id', 'DESC')
      .limit(limit)
      .getRawMany();
  }

  /**
   * 获取可能卡住的运行记录（用于 ExecutionMonitorService）
   * 查询状态为 pending/running 且超过指定时间阈值的运行记录
   */
  async getPotentiallyStuckExecutions(thresholdSeconds: number, limit: number = 20): Promise<StuckExecution[]> {
    // 只检查最近 N 小时内的执行（优化：避免查询过期的旧执行）
    // 从环境变量读取配置，默认 24 小时
    const maxAgeHours = parseInt(process.env.EXECUTION_MONITOR_MAX_AGE_HOURS || '24', 10);

    return this.testRunRepository.createQueryBuilder('testRun')
      .select([
        'testRun.id as id',
        'testRun.status as status',
        'testRun.jenkinsJob as jenkinsJob',
        'testRun.jenkinsBuildId as jenkinsBuildId',
        'testRun.startTime as startTime',
        'TIMESTAMPDIFF(SECOND, testRun.startTime, NOW()) as durationSeconds',
      ])
      .where('testRun.status IN (:...statuses)', { statuses: [TestRunStatus.PENDING, TestRunStatus.RUNNING] })
      .andWhere('testRun.startTime IS NOT NULL')
      .andWhere('TIMESTAMPDIFF(SECOND, testRun.startTime, NOW()) > :thresholdSeconds', { thresholdSeconds })
      // 只检查最近 N 小时内启动的执行（避免查询过期执行，用 start_time 代替 created_at）
      .andWhere('testRun.startTime > DATE_SUB(NOW(), INTERVAL :maxAgeHours HOUR)', { maxAgeHours })
      .orderBy('testRun.startTime', 'ASC')
      .limit(limit)
      .getRawMany();
  }

  /**
   * 获取测试运行的基本信息
   */
  async getTestRunBasicInfo(runId: number): Promise<TestRunBasicInfo | null> {
    return this.testRunRepository.findOne({
      where: { id: runId },
      select: ['totalCases'],
    });
  }

  /**
   * 标记超时的旧执行为 aborted（清理过期卡住的执行）
   * 覆盖两类僵尸记录：
   *   1. start_time 不为 null 且超过 maxAgeHours（正常超时的 running/pending）
   *   2. start_time IS NULL 且 created_at 超过 stuckPendingMinutes（Jenkins 从未触发的 pending，服务重启时队列丢失）
   * @param maxAgeHours        最大运行时长（小时），超过时清理 start_time 不为 null 的记录
   * @param stuckPendingMinutes Jenkins 未触发的 pending 最长保留时间（分钟），默认 10 分钟
   * @returns 更新的执行数量
   */
  async markOldStuckExecutionsAsAbandoned(maxAgeHours: number = 24, stuckPendingMinutes: number = 10): Promise<number> {
    // 使用原生 SQL 支持 OR 条件，避免 TypeORM QueryBuilder 的 OR 限制
    const result = await this.testRunRepository.query(
      `UPDATE Auto_TestRun
       SET status = 'aborted', end_time = NOW()
       WHERE status IN ('pending', 'running')
         AND (
           -- 类型1：已开始但运行超时（start_time 不为 null）
           (start_time IS NOT NULL AND start_time < DATE_SUB(NOW(), INTERVAL ? HOUR))
           OR
           -- 类型2：Jenkins 从未触发（start_time 为 null），创建超过 N 分钟的 pending 记录
           (start_time IS NULL AND created_at < DATE_SUB(NOW(), INTERVAL ? MINUTE))
         )`,
      [maxAgeHours, stuckPendingMinutes]
    ) as { affectedRows?: number; changedRows?: number };

    return result?.affectedRows ?? 0;
  }

  /**
   * 汇总历史卡住记录（用于运行记录页提示条）
   */
  async getStaleExecutionSummary(maxAgeHours: number = 24, stuckPendingMinutes: number = 10): Promise<StaleExecutionSummary> {
    const rows = await this.testRunRepository.query(
      `SELECT
         SUM(
           CASE
             WHEN status = 'pending'
              AND start_time IS NULL
              AND created_at < DATE_SUB(NOW(), INTERVAL ? MINUTE)
             THEN 1 ELSE 0
           END
         ) AS stale_pending_no_start_count,
         SUM(
           CASE
             WHEN status IN ('pending', 'running')
              AND start_time IS NOT NULL
              AND start_time < DATE_SUB(NOW(), INTERVAL ? HOUR)
             THEN 1 ELSE 0
           END
         ) AS stale_started_count,
         MAX(
           CASE
             WHEN status = 'pending'
              AND start_time IS NULL
              AND created_at < DATE_SUB(NOW(), INTERVAL ? MINUTE)
             THEN created_at ELSE NULL
           END
         ) AS latest_stale_pending_created_at
       FROM Auto_TestRun
       WHERE status IN ('pending', 'running')`,
      [stuckPendingMinutes, maxAgeHours, stuckPendingMinutes]
    ) as Array<{
      stale_pending_no_start_count: number | string | null;
      stale_started_count: number | string | null;
      latest_stale_pending_created_at: Date | string | null;
    }>;

    const row = rows[0] ?? {
      stale_pending_no_start_count: 0,
      stale_started_count: 0,
      latest_stale_pending_created_at: null,
    };

    const stalePendingNoStartCount = Number(row.stale_pending_no_start_count ?? 0);
    const staleStartedCount = Number(row.stale_started_count ?? 0);

    return {
      stalePendingNoStartCount,
      staleStartedCount,
      totalStaleCount: stalePendingNoStartCount + staleStartedCount,
      latestStalePendingCreatedAt: row.latest_stale_pending_created_at ? new Date(row.latest_stale_pending_created_at) : null,
    };
  }

  /**
   * 完整的触发测试执行流程（包含事务）
   */
  async triggerExecution(input: {
    caseIds: number[];
    projectId: number;
    /** null 表示系统调度触发（无操作人） */
    triggeredBy: number | null;
    triggerType: 'manual' | 'jenkins' | 'schedule';
    jenkinsJob?: string;
    runConfig?: Record<string, unknown>;
    taskId?: number;
    taskName?: string;
  }): Promise<{ runId: number; executionId: number; totalCases: number; caseIds: number[] }> {
    return this.executeInTransaction(async (_queryRunner) => {
      // 1. 获取活跃用例
      const cases = await this.testCaseRepository.find({
        where: {
          id: In(input.caseIds),
          enabled: true,
        },
        select: ['id', 'name', 'type', 'scriptPath'],
      });

      if (!cases || cases.length === 0) {
        throw new Error(`No active test cases found with IDs: ${input.caseIds.join(',')}`);
      }

      // 2. 创建测试运行记录
      const testRun = await this.createTestRun({
        projectId: input.projectId,
        triggerType: input.triggerType,
        triggerBy: input.triggeredBy,
        jenkinsJob: input.jenkinsJob,
        runConfig: input.runConfig,
        totalCases: cases.length,
      });

      // 3. 创建任务运行记录
      const taskExecution = await this.createTaskExecution({
        taskId: input.taskId,
        taskName: input.taskName,
        totalCases: cases.length,
        executedBy: input.triggeredBy,
      });

      // 4. 回填 executionId 到 TestRun（直接关联，消除时间窗口反查依赖）
      await this.testRunRepository.update(testRun.id, { executionId: taskExecution.id });

      // 5. 批量创建测试结果记录（初始状态为 error，等待 Jenkins 回调更新）
      const testResults = cases.map(testCase => ({
        executionId: taskExecution.id,
        caseId: testCase.id,
        caseName: testCase.name,
        status: null,
      }));

      await this.createTestResults(testResults);

      return {
        runId: testRun.id,
        executionId: taskExecution.id,
        totalCases: cases.length,
        caseIds: cases.map(c => c.id),
      };
    });
  }

  /**
   * 完成批次执行
   *
   * 修复10: 将原来 281 行的大方法拆分为若干职责明确的私有方法：
   * - resolveExecutionIdForBatch: 多策略解析 executionId
   * - syncTaskExecutionStatus: 同步 TaskExecution 状态
   * - updateDetailedCaseResults: 处理带详细结果的更新路径
   * - updateSummaryOnlyResults: 处理只有汇总统计的兜底路径
   *
   * @param runId 执行批次ID
   * @param results 执行结果
   * @param executionId 可选的执行ID（来自缓存，用于优化）
   */
}
