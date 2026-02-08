import { DataSource, QueryRunner, In, Repository, QueryDeepPartialEntity } from 'typeorm';
import { TaskExecution, TestRun, TestRunResult, TestCase } from '../entities/index';
import { BaseRepository } from './BaseRepository';
import { User } from '../entities/User';

export interface ExecutionDetail {
  execution: TaskExecution & { executedByName?: string };
  results: TestRunResult[];
}

export interface RecentExecution {
  id: number;
  taskId?: number;
  taskName?: string;
  status: string;
  totalCases: number;
  passedCases: number;
  failedCases: number;
  skippedCases: number;
  duration: number;
  executedBy: number;
  executedByName?: string;
  startTime?: Date;
  endTime?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

/**
 * 执行记录 Repository
 */
export class ExecutionRepository extends BaseRepository<TaskExecution> {
  private testRunRepository: Repository<TestRun>;
  private testRunResultRepository: Repository<TestRunResult>;
  private testCaseRepository: Repository<TestCase>;
  private userRepository: Repository<User>;

  constructor(dataSource: DataSource) {
    super(dataSource, TaskExecution);
    this.testRunRepository = dataSource.getRepository(TestRun);
    this.testRunResultRepository = dataSource.getRepository(TestRunResult);
    this.testCaseRepository = dataSource.getRepository(TestCase);
    this.userRepository = dataSource.getRepository(User);
  }

  /**
   * 创建测试运行记录
   */
  async createTestRun(runData: {
    projectId: number;
    triggerType: 'manual' | 'jenkins' | 'schedule';
    triggerBy: number;
    jenkinsJob?: string;
    runConfig?: Record<string, unknown>;
    totalCases: number;
  }): Promise<TestRun> {
    const testRun = this.testRunRepository.create({
      ...runData,
      status: 'pending',
    });
    return this.testRunRepository.save(testRun);
  }

  /**
   * 创建任务执行记录
   */
  async createTaskExecution(executionData: {
    taskId?: number;
    taskName?: string;
    totalCases: number;
    executedBy: number;
  }): Promise<TaskExecution> {
    const execution = this.repository.create({
      ...executionData,
      status: 'pending',
    });
    return this.repository.save(execution);
  }

  /**
   * 批量创建测试结果记录
   */
  async createTestResults(
    results: Array<{
      executionId: number;
      caseId: number;
      caseName: string;
      status: 'passed' | 'failed' | 'skipped' | 'error';
      duration?: number;
      errorMessage?: string;
      errorStack?: string;
      screenshotPath?: string;
      logPath?: string;
      assertionsTotal?: number;
      assertionsPassed?: number;
      responseData?: string;
    }>
  ): Promise<void> {
    const entities = results.map(result => 
      this.testRunResultRepository.create(result)
    );
    await this.testRunResultRepository.insert(entities);
  }

  /**
   * 更新执行状态为运行中
   */
  async markExecutionRunning(executionId: number): Promise<void> {
    await this.repository.update(executionId, {
      status: 'running',
      startTime: new Date(),
    });
  }

  /**
   * 获取执行详情
   */
  async getExecutionDetail(executionId: number): Promise<ExecutionDetail | null> {
    const execution = await this.repository.createQueryBuilder('execution')
      .leftJoinAndSelect('execution.executedByUser', 'user')
      .where('execution.id = :executionId', { executionId })
      .getOne();

    if (!execution) {
      return null;
    }

    const results = await this.testRunResultRepository.find({
      where: { executionId },
      order: { id: 'ASC' },
    });

    return {
      execution: {
        ...execution,
        executedByName: (execution as any).user?.displayName || (execution as any).user?.username,
      } as any,
      results,
    };
  }

  /**
   * 执行事务 - 公开方法供Service层使用
   */
  async runInTransaction<R>(callback: (queryRunner: QueryRunner) => Promise<R>): Promise<R> {
    return this.executeInTransaction(callback);
  }

  /**
   * 获取最近执行记录
   */
  async getRecentExecutions(limit: number = 10): Promise<RecentExecution[]> {
    return this.repository.createQueryBuilder('execution')
      .leftJoin('execution.executedByUser', 'user')
      .select([
        'execution.id',
        'execution.taskId',
        'execution.taskName',
        'execution.status',
        'execution.totalCases',
        'execution.passedCases',
        'execution.failedCases',
        'execution.skippedCases',
        'execution.duration',
        'execution.executedBy',
        'execution.startTime',
        'execution.endTime',
        'execution.createdAt',
        'execution.updatedAt',
        'user.displayName',
        'user.username',
      ])
      .orderBy('execution.startTime', 'DESC')
      .limit(limit)
      .getRawMany();
  }

  /**
   * 取消执行
   */
  async cancelExecution(executionId: number): Promise<void> {
    await this.repository.update(
      { id: executionId, status: In(['pending', 'running']) },
      {
        status: 'cancelled',
        endTime: new Date(),
      }
    );
  }

  /**
   * 更新执行结果统计
   */
  async updateExecutionResults(
    executionId: number,
    results: {
      status: 'success' | 'failed' | 'cancelled';
      passedCases: number;
      failedCases: number;
      skippedCases: number;
      duration: number;
    }
  ): Promise<void> {
    await this.repository.update(executionId, {
      ...results,
      endTime: new Date(),
    });
  }

  /**
   * 更新测试运行结果
   */
  async updateTestRunResults(
    runId: number,
    results: {
      status: 'success' | 'failed' | 'cancelled';
      passedCases: number;
      failedCases: number;
      skippedCases: number;
      durationMs: number;
    }
  ): Promise<void> {
    await this.testRunRepository.update(runId, {
      status: results.status === 'cancelled' ? 'aborted' : results.status,
      passedCases: results.passedCases,
      failedCases: results.failedCases,
      skippedCases: results.skippedCases,
      durationMs: results.durationMs,
      endTime: new Date(),
    });
  }

  /**
   * 获取活跃用例信息
   */
  async getActiveCases(caseIds: number[]): Promise<TestCase[]> {
    return this.testCaseRepository.find({
      where: {
        id: In(caseIds),
        enabled: true,
      },
      select: ['id', 'name', 'type', 'scriptPath'],
    });
  }

  /**
   * 更新 Jenkins 构建信息
   */
  async updateJenkinsInfo(
    runId: number,
    jenkinsInfo: {
      buildId: string;
      buildUrl: string;
    }
  ): Promise<void> {
    const jobMatch = jenkinsInfo.buildUrl.match(/\/job\/([^/]+)\//);
    const updateData: QueryDeepPartialEntity<TestRun> = {
      jenkinsBuildId: jenkinsInfo.buildId,
      jenkinsUrl: jenkinsInfo.buildUrl,
      status: 'running',
      startTime: new Date(),
    };

    if (jobMatch) {
      updateData.jenkinsJob = jobMatch[1];
    }

    await this.testRunRepository.update(runId, updateData);
  }

  /**
   * 获取测试运行详情
   */
  async getTestRunDetail(runId: number): Promise<(TestRun & { triggerByName?: string }) | null> {
    const testRun = await this.testRunRepository.createQueryBuilder('testRun')
      .leftJoinAndSelect('testRun.triggerByUser', 'user')
      .where('testRun.id = :runId', { runId })
      .getOne();

    if (!testRun) {
      return null;
    }

    return {
      ...testRun,
      triggerByName: (testRun as any).user?.displayName || (testRun as any).user?.username,
    };
  }

  /**
   * 获取执行结果列表
   * 修复：使用原生SQL确保字段名正确映射
   */
  async getExecutionResults(executionId: number): Promise<any[]> {
    return this.testRunResultRepository.query(`
      SELECT 
        r.id,
        r.execution_id,
        r.case_id,
        r.case_name,
        COALESCE(tc.module, '-') as module,
        COALESCE(tc.priority, 'P2') as priority,
        COALESCE(tc.type, 'api') as type,
        r.status,
        r.start_time,
        r.end_time,
        r.duration,
        r.error_message,
        r.error_stack,
        r.screenshot_path,
        r.log_path,
        r.assertions_total,
        r.assertions_passed,
        r.response_data,
        r.created_at
      FROM Auto_TestRunResults r
      LEFT JOIN Auto_TestCase tc ON r.case_id = tc.id
      WHERE r.execution_id = ?
      ORDER BY r.id ASC
    `, [executionId]);
  }

  /**
   * 获取所有测试运行记录（分页）
   * 修复：使用原生SQL确保字段名正确映射，解决前端无法读取数据的问题
   */
  async getAllTestRuns(limit: number = 50, offset: number = 0): Promise<{ data: any[]; total: number }> {
    // 使用原生SQL查询，确保字段名与前端期望一致
    const data = await this.testRunRepository.query(`
      SELECT 
        tr.id,
        tr.project_id,
        CASE 
          WHEN tr.project_id IS NOT NULL THEN CONCAT('项目 #', tr.project_id)
          ELSE '未分类'
        END as project_name,
        tr.status,
        tr.trigger_type,
        tr.trigger_by,
        COALESCE(u.display_name, u.username, '系统') as trigger_by_name,
        tr.jenkins_job,
        tr.jenkins_build_id,
        tr.jenkins_url,
        tr.total_cases,
        tr.passed_cases,
        tr.failed_cases,
        tr.skipped_cases,
        tr.duration_ms,
        tr.start_time,
        tr.end_time,
        tr.created_at
      FROM Auto_TestRun tr
      LEFT JOIN Auto_Users u ON tr.trigger_by = u.id
      ORDER BY tr.created_at DESC
      LIMIT ? OFFSET ?
    `, [limit, offset]);

    // 获取总数
    const countResult = await this.testRunRepository.query(`
      SELECT COUNT(*) as total FROM Auto_TestRun
    `);
    const total = countResult[0]?.total || 0;

    return { data, total };
  }

  /**
   * 获取运行的用例列表
   */
  async getRunCases(runId: number): Promise<any[]> {
    // 从执行结果中获取用例ID
    const results = await this.testRunResultRepository.find({
      where: { executionId: runId },
      select: ['caseId'],
    });

    if (!results || results.length === 0) {
      return [];
    }

    const caseIds = results.map(r => r.caseId);
    return this.testCaseRepository.find({
      where: {
        id: In(caseIds),
        enabled: true,
      },
      select: ['id', 'name', 'type', 'module', 'priority', 'scriptPath', 'config'],
    });
  }

  /**
   * 查找执行ID
   * @deprecated 使用 findExecutionIdByRunId 替代，此方法只返回最新的 executionId，不够精确
   */
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
   * - 通过 Auto_TestRunResults 表，用该批次的结果记录反查 executionId
   * 
   * 查询策略：
   * 1. 从 Auto_TestRunResults 查询该 runId 对应的 executionId（通过时间窗口关联）
   * 2. 如果没有找到结果，通过时间窗口从最近的 TaskExecution 获取（降级方案）
   * 
   * @param runId 执行批次ID
   * @returns 关联的执行记录ID，如果找不到则返回 null
   */
  async findExecutionIdByRunId(runId: number): Promise<number | null> {
    // 方法1：从 Auto_TestRunResults 反查（最可靠）
    // 获取该批次的创建时间，然后通过时间窗口找到关联的 executionId
    const testRun = await this.testRunRepository.findOne({
      where: { id: runId },
      select: ['createdAt'],
    });

    if (!testRun) {
      return null;
    }

    // 在该批次创建后的结果中查找 executionId
    const result = await this.testRunResultRepository.query(`
      SELECT DISTINCT execution_id
      FROM Auto_TestRunResults
      WHERE execution_id IS NOT NULL
        AND created_at >= ?
      ORDER BY id DESC
      LIMIT 1
    `, [testRun.createdAt]);

    if (result && result.length > 0 && result[0].execution_id) {
      return result[0].execution_id;
    }

    // 方法2：如果结果表中没有记录，尝试查询最新的 TaskExecution（降级方案）
    // 这种情况通常发生在还没有添加任何结果记录时
    const execution = await this.repository.createQueryBuilder('exec')
      .select('exec.id')
      .orderBy('exec.createdAt', 'DESC')  // 按创建时间排序以获取最新
      .limit(1)
      .getRawOne();

    return execution?.id || null;
  }

  /**
   * 更新测试结果
   */
  async updateTestResult(
    executionId: number,
    caseId: number,
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
    }
  ): Promise<boolean> {
    const updateResult = await this.testRunResultRepository.update(
      { executionId, caseId },
      result as any
    );

    return (updateResult.affected ?? 0) > 0;
  }

  /**
   * 创建测试结果记录
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
    const entity = this.testRunResultRepository.create(result as any);
    await this.testRunResultRepository.save(entity);
  }

  /**
   * 标记执行为超时
   */
  async markExecutionAsTimedOut(runId: number): Promise<void> {
    await this.testRunRepository.update(runId, {
      status: 'cancelled' as any,
      endTime: new Date(),
    });
  }

  /**
   * 获取可能超时的执行记录
   */
  async getPotentiallyTimedOutExecutions(timeoutThreshold: Date): Promise<any[]> {
    return this.testRunRepository.createQueryBuilder('testRun')
      .select([
        'testRun.id',
        'testRun.jenkinsJob',
        'testRun.jenkinsBuildId',
        'testRun.startTime',
      ])
      .where('testRun.status IN (:...statuses)', { statuses: ['pending', 'running'] })
      .andWhere('testRun.startTime < :timeoutThreshold', { timeoutThreshold })
      .getRawMany();
  }

  /**
   * 获取有 Jenkins 信息的执行记录
   */
  async getExecutionsWithJenkinsInfo(limit: number = 50): Promise<any[]> {
    return this.testRunRepository.createQueryBuilder('testRun')
      .select([
        'testRun.id',
        'testRun.status',
        'testRun.jenkinsJob',
        'testRun.jenkinsBuildId',
      ])
      .where('testRun.jenkinsJob IS NOT NULL')
      .andWhere('testRun.jenkinsBuildId IS NOT NULL')
      .orderBy('testRun.createdAt', 'DESC')
      .limit(limit)
      .getRawMany();
  }

  /**
   * 获取可能卡住的执行记录（用于 ExecutionMonitorService）
   * 查询状态为 pending/running 且超过指定时间阈值的执行记录
   */
  async getPotentiallyStuckExecutions(thresholdSeconds: number, limit: number = 20): Promise<any[]> {
    return this.testRunRepository.createQueryBuilder('testRun')
      .select([
        'testRun.id as id',
        'testRun.status as status',
        'testRun.jenkinsJob as jenkinsJob',
        'testRun.jenkinsBuildId as jenkinsBuildId',
        'testRun.startTime as startTime',
        'TIMESTAMPDIFF(SECOND, testRun.startTime, NOW()) as durationSeconds',
      ])
      .where('testRun.status IN (:...statuses)', { statuses: ['pending', 'running'] })
      .andWhere('testRun.startTime IS NOT NULL')
      .andWhere('TIMESTAMPDIFF(SECOND, testRun.startTime, NOW()) > :thresholdSeconds', { thresholdSeconds })
      .orderBy('testRun.startTime', 'ASC')
      .limit(limit)
      .getRawMany();
  }

  /**
   * 获取测试运行的基本信息
   */
  async getTestRunBasicInfo(runId: number): Promise<any> {
    return this.testRunRepository.findOne({
      where: { id: runId },
      select: ['totalCases'],
    });
  }

  /**
   * 完整的触发测试执行流程（包含事务）
   */
  async triggerExecution(input: {
    caseIds: number[];
    projectId: number;
    triggeredBy: number;
    triggerType: 'manual' | 'jenkins' | 'schedule';
    jenkinsJob?: string;
    runConfig?: Record<string, unknown>;
  }): Promise<{ runId: number; executionId: number; totalCases: number; caseIds: number[] }> {
    return this.executeInTransaction(async (queryRunner) => {
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

      // 3. 创建任务执行记录
      const taskExecution = await this.createTaskExecution({
        taskId: undefined,
        taskName: undefined,
        totalCases: cases.length,
        executedBy: input.triggeredBy,
      });

      // 4. 批量创建测试结果记录
      const testResults = cases.map(testCase => ({
        executionId: taskExecution.id,
        caseId: testCase.id,
        caseName: testCase.name,
        status: 'error' as 'passed' | 'failed' | 'skipped' | 'error',
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
   * 改进：
   * - 支持可选的 executionId 参数（来自缓存或已知值）
   * - 如果未提供 executionId，则从数据库查询
   * - 增强错误日志，提供更多调试信息
   * - 自动将 'cancelled' 状态映射为 'aborted'（以支持数据库枚举）
   * 
   * @param runId 执行批次ID
   * @param results 执行结果
   * @param executionId 可选的执行ID（来自缓存，用于优化）
   */
  async completeBatch(
    runId: number,
    results: {
      status: 'success' | 'failed' | 'cancelled' | 'aborted';
      passedCases: number;
      failedCases: number;
      skippedCases: number;
      durationMs: number;
      results?: Array<{
        caseId: number;
        caseName: string;
        status: string;
        duration: number;
        errorMessage?: string;
        stackTrace?: string;
        screenshotPath?: string;
        logPath?: string;
        assertionsTotal?: number;
        assertionsPassed?: number;
        responseData?: string;
      }>;
    },
    executionId?: number
  ): Promise<void> {
    return this.executeInTransaction(async (queryRunner) => {
      // 1. 更新 TestRun 记录 - 将 cancelled 映射为 aborted（兼容数据库枚举）
      const mappedStatus = results.status === 'cancelled' ? 'aborted' : results.status;
      await this.testRunRepository.update(runId, {
        status: mappedStatus as any,
        passedCases: results.passedCases,
        failedCases: results.failedCases,
        skippedCases: results.skippedCases,
        durationMs: results.durationMs,
        endTime: new Date(),
      });

      // 2. 如果有详细结果，更新每个测试结果
      if (results.results && results.results.length > 0) {
        // 如果未传入 executionId，则尝试从数据库查询
        let actualExecutionId = executionId;
        if (!actualExecutionId) {
          actualExecutionId = await this.findExecutionIdByRunId(runId) || undefined;
        }
        
        // 只有当找到 executionId 时才更新详细结果
        // 如果找不到，说明还没有创建结果记录，这种情况下可以稍后通过其他方式更新
        if (actualExecutionId) {
          // 批量处理结果（允许部分失败）
          for (const result of results.results) {
            try {
              // 尝试更新
              const updated = await this.updateTestResult(actualExecutionId, result.caseId, {
                status: result.status,
                duration: result.duration,
                errorMessage: result.errorMessage,
                errorStack: result.stackTrace,
                screenshotPath: result.screenshotPath,
                logPath: result.logPath,
                assertionsTotal: result.assertionsTotal,
                assertionsPassed: result.assertionsPassed,
                responseData: result.responseData,
                startTime: new Date(),
                endTime: new Date(),
              });

              // 如果更新失败，插入新记录
              if (!updated) {
                await this.createTestResult({
                  executionId: actualExecutionId,
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
                  startTime: new Date(),
                  endTime: new Date(),
                });
              }
            } catch (error) {
              // 记录但不中断整个流程
              const errorMsg = error instanceof Error ? error.message : String(error);
              console.warn(`Failed to process result for case ${result.caseId} (executionId: ${actualExecutionId}):`, errorMsg);
            }
          }
        } else {
          // 无法找到 executionId，仅更新批次统计，结果详情可在后续补充
          console.warn(`Could not determine executionId for runId ${runId}, skipping detailed result updates. Summary statistics have been updated.`);
        }
      }
    });
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
    }
  ): Promise<void> {
    const updateData: any = { status, endTime: new Date() };
    if (options?.durationMs !== undefined) updateData.durationMs = options.durationMs;
    if (options?.passedCases !== undefined) updateData.passedCases = options.passedCases;
    if (options?.failedCases !== undefined) updateData.failedCases = options.failedCases;
    if (options?.skippedCases !== undefined) updateData.skippedCases = options.skippedCases;

    await this.testRunRepository.update(runId, updateData);
  }

  /**
   * 获取测试运行状态信息
   */
  async getTestRunStatus(runId: number): Promise<any> {
    return this.testRunRepository.findOne({
      where: { id: runId },
      select: ['id', 'status', 'jenkinsJob', 'jenkinsBuildId', 'jenkinsUrl', 'startTime'],
    });
  }
}