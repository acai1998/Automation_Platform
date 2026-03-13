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
  TestRunTriggerType,
  TaskExecutionTriggerType,
  TestRunStatusType,
  TaskExecutionStatusType,
  TestRunResultStatusType,
  TestRunTriggerTypeType,
  TaskExecutionTriggerTypeType,
  mapTaskExecutionStatusToTestRunStatus,
  isValidTestRunStatus,
  isValidTaskExecutionStatus,
} from '../../shared/types/execution';

/**
 * 带用户信息的 TaskExecution 接口
 */
export interface TaskExecutionWithUser extends Omit<TaskExecution, 'executedByUser'> {
  executedByUser?: User;
  executedByName?: string;
}

/**
 * 带用户信息的 TestRun 接口
 */
export interface TestRunWithUser extends Omit<TestRun, 'triggerByUser'> {
  triggerByUser?: User;
  triggerByName?: string;
}

/**
 * 执行详情接口
 */
export interface ExecutionDetail {
  execution: TaskExecutionWithUser;
  results: TestRunResult[];
}

/**
 * 最近执行记录接口
 */
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
 * 执行结果行接口（原生 SQL 查询结果）
 */
export interface ExecutionResultRow {
  id: number;
  execution_id: number;
  case_id: number;
  case_name: string;
  module: string;
  priority: string;
  type: string;
  status: string;
  start_time: Date | null;
  end_time: Date | null;
  duration: number | null;
  error_message: string | null;
  error_stack: string | null;
  screenshot_path: string | null;
  log_path: string | null;
  assertions_total: number | null;
  assertions_passed: number | null;
  response_data: string | null;
  created_at: Date;
}

/**
 * 测试运行行接口（原生 SQL 查询结果）
 */
export interface TestRunRow {
  id: number;
  project_id: number | null;
  project_name: string;
  status: string;
  trigger_type: string;
  trigger_by: number;
  trigger_by_name: string;
  jenkins_job: string | null;
  jenkins_build_id: string | null;
  jenkins_url: string | null;
  total_cases: number;
  passed_cases: number;
  failed_cases: number;
  skipped_cases: number;
  duration_ms: number;
  start_time: Date | null;
  end_time: Date | null;
  created_at: Date | null;
}

/**
 * 潜在超时执行接口
 */
export interface PotentiallyTimedOutExecution {
  id: number;
  jenkinsJob: string | null;
  jenkinsBuildId: string | null;
  startTime: Date | null;
}

/**
 * Jenkins 执行信息接口
 */
export interface ExecutionWithJenkinsInfo {
  id: number;
  status: string;
  jenkinsJob: string | null;
  jenkinsBuildId: string | null;
}

/**
 * 卡住的执行接口
 */
export interface StuckExecution {
  id: number;
  status: string;
  jenkinsJob: string | null;
  jenkinsBuildId: string | null;
  startTime: Date | null;
  durationSeconds: number;
}

/**
 * 测试运行基本信息接口
 */
export interface TestRunBasicInfo {
  totalCases: number;
}

/**
 * 测试运行状态信息接口
 */
export interface TestRunStatusInfo {
  id: number;
  status: string;
  jenkinsJob: string | null;
  jenkinsBuildId: string | null;
  jenkinsUrl: string | null;
  startTime: Date | null;
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
    triggerType: TestRunTriggerTypeType;
    triggerBy: number;
    jenkinsJob?: string;
    runConfig?: Record<string, unknown>;
    totalCases: number;
  }): Promise<TestRun> {
    const testRun = this.testRunRepository.create({
      ...runData,
      status: TestRunStatus.PENDING,
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
      status: TaskExecutionStatus.PENDING,
    });
    return this.repository.save(execution);
  }

  /**
   * 批量创建测试结果记录
   * 性能优化：使用 insert 而非逐个 save，减少数据库往返
   */
  async createTestResults(
    results: Array<{
      executionId: number;
      caseId: number;
      caseName: string;
      status: TestRunResultStatusType;
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
    if (results.length === 0) {
      return;
    }

    // 使用批量插入提高性能
    const entities = results.map(result => 
      this.testRunResultRepository.create(result)
    );
    
    // 分批插入,避免单次插入过多数据
    const batchSize = 100;
    for (let i = 0; i < entities.length; i += batchSize) {
      const batch = entities.slice(i, i + batchSize);
      await this.testRunResultRepository.insert(batch);
    }
  }

  /**
   * 更新执行状态为运行中
   */
  async markExecutionRunning(executionId: number): Promise<void> {
    await this.repository.update(executionId, {
      status: TaskExecutionStatus.RUNNING,
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

    // 安全地获取用户名
    const executionWithUser = execution as TaskExecutionWithUser;
    const executedByName = executionWithUser.executedByUser?.displayName 
      || executionWithUser.executedByUser?.username 
      || undefined;

    return {
      execution: {
        ...execution,
        executedByName,
      },
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
      status: TestRunStatus.RUNNING,
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
  async getTestRunDetail(runId: number): Promise<TestRunWithUser | null> {
    const testRun = await this.testRunRepository.createQueryBuilder('testRun')
      .leftJoinAndSelect('testRun.triggerByUser', 'user')
      .where('testRun.id = :runId', { runId })
      .getOne();

    if (!testRun) {
      return null;
    }

    // 安全地获取用户名
    const testRunWithUser = testRun as TestRunWithUser;
    const triggerByName = testRunWithUser.triggerByUser?.displayName 
      || testRunWithUser.triggerByUser?.username 
      || undefined;

    return {
      ...testRun,
      triggerByName,
    };
  }

  /**
   * 获取测试运行详情（返回 snake_case 格式，与 TestRunRecord 接口兼容）
   */
  async getTestRunDetailRow(runId: number): Promise<TestRunRow | null> {
    const rows: TestRunRow[] = await this.testRunRepository.query(`
      SELECT tr.id, tr.project_id,
        CASE WHEN tr.project_id IS NOT NULL THEN CONCAT("项目 #", tr.project_id) ELSE "未分类" END as project_name,
        tr.status, tr.trigger_type, tr.trigger_by,
        COALESCE(u.display_name, u.username, "系统") as trigger_by_name,
        tr.jenkins_job, tr.jenkins_build_id, tr.jenkins_url,
        tr.total_cases, tr.passed_cases, tr.failed_cases, tr.skipped_cases,
        tr.duration_ms, tr.start_time, tr.end_time, tr.created_at
      FROM Auto_TestRun tr
      LEFT JOIN Auto_Users u ON tr.trigger_by = u.id
      WHERE tr.id = ?
    `, [runId]);
    return rows[0] ?? null;
  }


  /**
   * 获取执行结果列表（支持分页与服务端筛选）
   * @param executionId 执行ID
   * @param options 分页与筛选参数
   */
  async getExecutionResults(
    executionId: number,
    options: {
      page?: number;
      pageSize?: number;
      status?: string;
      keyword?: string;
    } = {}
  ): Promise<{ data: ExecutionResultRow[]; total: number }> {
    const page = Math.max(1, options.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, options.pageSize ?? 20));
    const offset = (page - 1) * pageSize;

    const conditions: string[] = ["r.execution_id = ?"];
    const params: (string | number)[] = [executionId];

    if (options.status && options.status !== "all") {
      conditions.push("r.status = ?");
      params.push(options.status);
    }

    if (options.keyword && options.keyword.trim()) {
      conditions.push("(r.case_name LIKE ? OR COALESCE(tc.module, '') LIKE ?)");
      const like = `%${options.keyword.trim()}%`;
      params.push(like, like);
    }

    const whereClause = `WHERE ${conditions.join(" AND ")}`;

    const data: ExecutionResultRow[] = await this.testRunResultRepository.query(`
      SELECT
        r.id,
        r.execution_id,
        r.case_id,
        r.case_name,
        COALESCE(tc.module, "-") as module,
        COALESCE(tc.priority, "P2") as priority,
        COALESCE(tc.type, "api") as type,
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
      ${whereClause}
      ORDER BY r.id ASC
      LIMIT ? OFFSET ?
    `, [...params, pageSize, offset]);

    const countResult = await this.testRunResultRepository.query(`
      SELECT COUNT(*) as total
      FROM Auto_TestRunResults r
      LEFT JOIN Auto_TestCase tc ON r.case_id = tc.id
      ${whereClause}
    `, params);
    const total = Number(countResult[0]?.total ?? 0);

    return { data, total };
  }

  /**
   * 根据 runId 查询该批次的用例执行结果（支持分页与筛选）
   * 查询策略：
   *   1. 优先读 Auto_TestRun.execution_id（新数据，直接关联）
   *   2. 降级到时间窗口（±120秒）+ 触发者反查 TaskExecution.id
   *   3. 兜底：在 ±300秒 窗口内，取同一触发者最近的 TaskExecution，不经过中间表
   */
  async getResultsByRunId(
    runId: number,
    options: { page?: number; pageSize?: number; status?: string; keyword?: string; } = {}
  ): Promise<{ data: ExecutionResultRow[]; total: number }> {
    // 策略1：从 Auto_TestRun.execution_id 直接读（需要该字段存在且非 NULL）
    let executionId: number | null = null;
    try {
      const tr = await this.testRunRepository.findOne({ where: { id: runId }, select: ["executionId"] });
      executionId = tr?.executionId ?? null;
    } catch {
      // 若数据库中不存在 execution_id 列，忽略错误
    }

    // 策略2：降级到时间窗口（±120秒）+ 触发者反查
    if (!executionId) {
      executionId = await this.findExecutionIdByRunId(runId);
    }

    // 找到 executionId，走正常路径
    if (executionId) {
      return this.getExecutionResults(executionId, options);
    }

    // 策略3：扩大时间窗口兜底（±300秒），不要求精确匹配，取最近的 TaskExecution
    logger.warn("Fallback: trying extended time-window search for runId results", { runId }, LOG_CONTEXTS.REPOSITORY);

    const runRows = await this.testRunRepository.query(`
      SELECT id, trigger_by, created_at FROM Auto_TestRun WHERE id = ? LIMIT 1
    `, [runId]) as Array<{ id: number; trigger_by: number; created_at: Date }>;

    if (!runRows || runRows.length === 0) {
      logger.warn("Cannot find runId, returning empty results", { runId }, LOG_CONTEXTS.REPOSITORY);
      return { data: [], total: 0 };
    }

    const runCreatedAt = runRows[0].created_at;
    const triggerBy = runRows[0].trigger_by;

    // 在 ±300 秒窗口内，找同一触发者最近的 TaskExecution（即使 Auto_TestRunResults 为空也能找到）
    const fallbackRows = await this.testRunResultRepository.query(`
      SELECT e.id as execution_id
      FROM Auto_TestCaseTaskExecutions e
      WHERE e.executed_by = ?
        AND e.created_at BETWEEN DATE_SUB(?, INTERVAL 300 SECOND) AND DATE_ADD(?, INTERVAL 300 SECOND)
      ORDER BY ABS(TIMESTAMPDIFF(SECOND, e.created_at, ?)) ASC
      LIMIT 1
    `, [triggerBy, runCreatedAt, runCreatedAt, runCreatedAt]) as Array<{ execution_id: number }>;

    if (fallbackRows && fallbackRows.length > 0 && fallbackRows[0].execution_id) {
      const fallbackExecutionId = fallbackRows[0].execution_id;
      logger.info("Extended fallback found executionId", { runId, fallbackExecutionId }, LOG_CONTEXTS.REPOSITORY);
      return this.getExecutionResults(fallbackExecutionId, options);
    }

    logger.warn("All strategies failed to find executionId for runId, returning empty results", { runId }, LOG_CONTEXTS.REPOSITORY);
    return { data: [], total: 0 };
  }

  /**
   * 获取所有测试运行记录（分页 + 筛选）
   * 支持按触发方式、状态、时间范围筛选
   */
  async getAllTestRuns(
    limit: number = 50,
    offset: number = 0,
    filters: {
      triggerType?: string[];
      status?: string[];
      startDate?: string;
      endDate?: string;
    } = {}
  ): Promise<{ data: TestRunRow[]; total: number }> {
    // 动态拼接 WHERE 条件
    const conditions: string[] = [];
    const params: (string | number)[] = [];

    if (filters.triggerType?.length) {
      const placeholders = filters.triggerType.map(() => '?').join(', ');
      conditions.push('tr.trigger_type IN (' + placeholders + ')');
      params.push(...filters.triggerType);
    }

    if (filters.status?.length) {
      const placeholders = filters.status.map(() => '?').join(', ');
      conditions.push('tr.status IN (' + placeholders + ')');
      params.push(...filters.status);
    }

    if (filters.startDate) {
      // 数据库 start_time 字段存储的是北京时间（CST），直接与日期字符串比较即可
      conditions.push('tr.start_time >= ?');
      params.push(`${filters.startDate} 00:00:00`);
    }

    if (filters.endDate) {
      // 结束日期：当天 23:59:59（北京时间）
      conditions.push('tr.start_time <= ?');
      params.push(`${filters.endDate} 23:59:59`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // 数据查询
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
        tr.end_time
      FROM Auto_TestRun tr
      LEFT JOIN Auto_Users u ON tr.trigger_by = u.id
      ${whereClause}
      ORDER BY tr.id DESC
      LIMIT ? OFFSET ?
    `, [...params, limit, offset]);

    // 总数查询（同样带上筛选条件）
    const countResult = await this.testRunRepository.query(`
      SELECT COUNT(*) as total
      FROM Auto_TestRun tr
      ${whereClause}
    `, params);
    const total = countResult[0]?.total || 0;

    return { data, total };
  }

  /**
   * 获取运行的用例列表
   * 性能优化：使用 JOIN 查询而非分步查询,消除 N+1 问题
   */
  async getRunCases(runId: number): Promise<TestCase[]> {
    // 优化：使用一次 JOIN 查询获取所有数据,避免 N+1 问题
    const cases = await this.testCaseRepository
      .createQueryBuilder('testCase')
      .innerJoin(
        'Auto_TestRunResults',
        'result',
        'result.case_id = testCase.id AND result.execution_id = :runId',
        { runId }
      )
      .where('testCase.enabled = :enabled', { enabled: true })
      .select([
        'testCase.id',
        'testCase.name',
        'testCase.type',
        'testCase.module',
        'testCase.priority',
        'testCase.scriptPath',
        'testCase.config',
      ])
      .distinct(true)
      .getMany();

    return cases;
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
   * - 通过 Auto_TestCaseTaskExecutions 表，用触发者 + 时间窗口反查 executionId
   * 
   * 查询策略：
   * 1. 获取 TestRun 的创建时间和触发者信息
   * 2. 通过时间窗口（±120秒）+ 触发者匹配查找最近的 TaskExecution
   * 3. 如果没有找到结果，记录警告并返回 null
   * 
   * @param runId 执行批次ID
   * @returns 关联的执行记录ID，如果找不到则返回 null
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

    // 2. 通过时间窗口（±120秒）和触发者信息，在 Auto_TestCaseTaskExecutions 中查找最近的关联记录
    // 使用时间窗口而非 id 差值，避免因两表 id 自增不同步导致查找失败
    const result = await this.testRunResultRepository.query(`
      SELECT e.id as execution_id
      FROM Auto_TestCaseTaskExecutions e
      WHERE e.executed_by = ?
        AND e.created_at BETWEEN DATE_SUB(?, INTERVAL 120 SECOND) AND DATE_ADD(?, INTERVAL 120 SECOND)
      ORDER BY ABS(TIMESTAMPDIFF(SECOND, e.created_at, ?)) ASC
      LIMIT 1
    `, [testRun.trigger_by, testRun.created_at, testRun.created_at, testRun.created_at]);

    if (result && result.length > 0 && result[0].execution_id) {
      logger.debug(
        `Found executionId for runId via time-window`,
        { runId, executionId: result[0].execution_id },
        LOG_CONTEXTS.REPOSITORY
      );
      return result[0].execution_id;
    }

    // 3. 如果没有找到，记录警告
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
    const updateData: Partial<TestRunResult> = {
      status: result.status as 'passed' | 'failed' | 'skipped' | 'error',
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

    const updateResult = await this.testRunResultRepository.update(
      { executionId, caseId },
      updateData
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
    const entity = this.testRunResultRepository.create({
      executionId: result.executionId,
      caseId: result.caseId,
      caseName: result.caseName,
      status: result.status as 'passed' | 'failed' | 'skipped' | 'error',
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
      status: 'aborted', // TestRun 使用 'aborted' 而非 'cancelled'
      endTime: new Date(),
    });
  }

  /**
   * 获取可能超时的执行记录
   */
  async getPotentiallyTimedOutExecutions(timeoutThreshold: Date): Promise<PotentiallyTimedOutExecution[]> {
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
   * 获取可能卡住的执行记录（用于 ExecutionMonitorService）
   * 查询状态为 pending/running 且超过指定时间阈值的执行记录
   */
  async getPotentiallyStuckExecutions(thresholdSeconds: number, limit: number = 20): Promise<StuckExecution[]> {
    // 只检查最近 24 小时内的执行（优化：避免查询过期的旧执行）
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
      .where('testRun.status IN (:...statuses)', { statuses: ['pending', 'running'] })
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
   * 标记超时的旧执行为 abandoned（清理过期卡住的执行）
   * @param maxAgeHours 最大年龄（小时），超过此时间的 pending/running 执行将被标记为 abandoned
   * @returns 更新的执行数量
   */
  async markOldStuckExecutionsAsAbandoned(maxAgeHours: number = 24): Promise<number> {
    const result = await this.testRunRepository.createQueryBuilder()
      .update()
      .set({
        status: 'aborted',
        endTime: () => 'NOW()',
      })
      .where('status IN (:...statuses)', { statuses: ['pending', 'running'] })
      .andWhere('startTime < DATE_SUB(NOW(), INTERVAL :maxAgeHours HOUR)', { maxAgeHours })
      .execute();

    return result.affected || 0;
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
    taskId?: number;
    taskName?: string;
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
        taskId: input.taskId,
        taskName: input.taskName,
        totalCases: cases.length,
        executedBy: input.triggeredBy,
      });

      // 4. 回填 executionId 到 TestRun（直接关联，消除时间窗口反查依赖）
      await this.testRunRepository.update(testRun.id, { executionId: taskExecution.id });

      // 5. 批量创建测试结果记录
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
    const failedResults: Array<{ caseId: number; error: string }> = [];

    return this.executeInTransaction(async (queryRunner) => {
      // 1. 更新 TestRun 记录 - 将 cancelled 映射为 aborted（兼容数据库枚举）
      const mappedStatus = this.mapStatusForTestRun(results.status);
      await this.testRunRepository.update(runId, {
        status: mappedStatus,
        passedCases: results.passedCases,
        failedCases: results.failedCases,
        skippedCases: results.skippedCases,
        durationMs: results.durationMs,
        endTime: new Date(),
      });

      // 1a. 优先从 Auto_TestRun.execution_id 字段直接读取（最可靠，避免时间窗口反查错误）
      // 若缓存传入值不存在，则直接查数据库 execution_id 列
      let resolvedExecutionId: number | undefined = executionId;
      if (!resolvedExecutionId) {
        try {
          const trRows = await this.testRunRepository.query(
            `SELECT execution_id FROM Auto_TestRun WHERE id = ? LIMIT 1`,
            [runId]
          ) as Array<{ execution_id: number | null }>;
          if (trRows.length > 0 && trRows[0].execution_id) {
            resolvedExecutionId = trRows[0].execution_id;
            logger.debug('Resolved executionId from Auto_TestRun.execution_id', { runId, resolvedExecutionId }, LOG_CONTEXTS.REPOSITORY);
          }
        } catch {
          // 忽略，降级到时间窗口反查
        }
      }
      // 若直接读仍未找到，降级到时间窗口反查
      if (!resolvedExecutionId) {
        resolvedExecutionId = await this.findExecutionIdByRunId(runId) || undefined;
      }

      // 1b. 同步更新对应的 Auto_TestCaseTaskExecutions 记录状态
      // completeBatch 回调只更新了 Auto_TestRun，需要同步到 Auto_TestCaseTaskExecutions
      // 这样 getRecentRuns 查 Auto_TestCaseTaskExecutions 时才能拿到最新状态
      if (resolvedExecutionId) {
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

      // 2. 使用已解析的 executionId
      const actualExecutionId = resolvedExecutionId;

      // 3. 更新详细用例结果
      if (actualExecutionId) {
        if (results.results && results.results.length > 0) {
          // 有详细结果列表：逐条更新
          for (const result of results.results) {
            try {
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
              const errorMsg = error instanceof Error ? error.message : String(error);
              failedResults.push({ caseId: result.caseId, error: errorMsg });
              logger.error(
                `Failed to process result for case`,
                { caseId: result.caseId, executionId: actualExecutionId, error: errorMsg },
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
                totalCount: results.results.length,
                failedCaseIds: failedResults.map(f => f.caseId)
              },
              LOG_CONTEXTS.REPOSITORY
            );
          }
        } else {
          // 没有详细结果列表
          // 策略一：Jenkins 传了统计汇总数 (passedCases/failedCases/skippedCases > 0)，按顺序批量更新预创建的 error 记录
          // 策略二：Jenkins 传的统计数为0，但已有真实结果记录（非 error 状态），则从数据库重新汇总统计数并回填 Auto_TestRun
          const totalSummary = results.passedCases + results.failedCases + results.skippedCases;
          if (totalSummary > 0) {
            logger.info(
              `No detailed results provided, updating pre-created records using summary counts`,
              { runId, executionId: actualExecutionId, passedCases: results.passedCases, failedCases: results.failedCases, skippedCases: results.skippedCases },
              LOG_CONTEXTS.REPOSITORY
            );

            // 获取该 executionId 下所有预创建的 error 状态记录（按 id 排序保证顺序稳定）
            const preCreatedResults = await this.testRunResultRepository.query(`
              SELECT id FROM Auto_TestRunResults
              WHERE execution_id = ?
              ORDER BY id ASC
            `, [actualExecutionId]) as Array<{ id: number }>;

            if (preCreatedResults.length > 0) {
              const passedEnd = results.passedCases;
              const failedEnd = passedEnd + results.failedCases;

              for (let i = 0; i < preCreatedResults.length; i++) {
                const recordId = preCreatedResults[i].id;
                let newStatus: 'passed' | 'failed' | 'skipped' | 'error';
                if (i < passedEnd) {
                  newStatus = 'passed';
                } else if (i < failedEnd) {
                  newStatus = 'failed';
                } else {
                  newStatus = 'skipped';
                }

                try {
                  await this.testRunResultRepository.update(recordId, {
                    status: newStatus,
                    endTime: new Date(),
                  });
                } catch (updateErr) {
                  logger.error(
                    `Failed to update pre-created result record`,
                    { recordId, newStatus, error: updateErr instanceof Error ? updateErr.message : String(updateErr) },
                    LOG_CONTEXTS.REPOSITORY
                  );
                }
              }

              logger.info(
                `Updated pre-created result records using summary counts`,
                { runId, executionId: actualExecutionId, updatedCount: preCreatedResults.length },
                LOG_CONTEXTS.REPOSITORY
              );
            }
          } else {
            // 统计数全为0，且没有详细 results 数组
            // 先查数据库里该 executionId 下的现有记录状态
            const countRows = await this.testRunResultRepository.query(`
              SELECT
                SUM(CASE WHEN status = 'passed' THEN 1 ELSE 0 END) AS passed,
                SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed,
                SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) AS error_count,
                SUM(CASE WHEN status = 'skipped' THEN 1 ELSE 0 END) AS skipped,
                COUNT(*) AS total
              FROM Auto_TestRunResults
              WHERE execution_id = ?
            `, [actualExecutionId]) as Array<{ passed: string; failed: string; error_count: string; skipped: string; total: string }>;

            if (countRows.length > 0) {
              const dbPassed  = Number(countRows[0].passed      ?? 0);
              const dbFailed  = Number(countRows[0].failed      ?? 0);
              const dbError   = Number(countRows[0].error_count ?? 0);
              const dbSkipped = Number(countRows[0].skipped     ?? 0);
              const dbTotal   = Number(countRows[0].total       ?? 0);
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
                  { runId, executionId: actualExecutionId, dbPassed, dbFailed, dbSkipped },
                  LOG_CONTEXTS.REPOSITORY
                );
              } else if (dbTotal > 0 && dbError > 0) {
                // 全是预创建的 error 记录，根据执行整体状态将它们批量更新
                // success → passed；failed/aborted/cancelled → failed
                const mappedStatus: 'passed' | 'failed' =
                  (results.status === 'success') ? 'passed' : 'failed';

                await this.testRunResultRepository.query(`
                  UPDATE Auto_TestRunResults
                  SET status = ?, end_time = NOW()
                  WHERE execution_id = ? AND status = 'error'
                `, [mappedStatus, actualExecutionId]);

                // 根据映射结果更新 Auto_TestRun 统计
                const newPassed  = mappedStatus === 'passed'  ? dbError : 0;
                const newFailed  = mappedStatus === 'failed'  ? dbError : 0;
                await this.testRunRepository.update(runId, {
                  passedCases:  newPassed,
                  failedCases:  newFailed,
                  skippedCases: 0,
                });

                logger.info(
                  `Bulk-updated pre-created error records based on overall execution status`,
                  { runId, executionId: actualExecutionId, mappedStatus, updatedCount: dbError, newPassed, newFailed },
                  LOG_CONTEXTS.REPOSITORY
                );
              }
            }
          }
        }
      } else {
        // 无法找到 executionId，仅更新批次统计
        logger.warn(
          `Could not determine executionId for runId, skipping detailed result updates`,
          { runId, resultsCount: results.results?.length ?? 0 },
          LOG_CONTEXTS.REPOSITORY
        );
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
    const updateData: QueryDeepPartialEntity<TestRun> = { 
      status: status as 'pending' | 'running' | 'success' | 'failed' | 'aborted',
      endTime: new Date() 
    };
    if (options?.durationMs !== undefined) updateData.durationMs = options.durationMs;
    if (options?.passedCases !== undefined) updateData.passedCases = options.passedCases;
    if (options?.failedCases !== undefined) updateData.failedCases = options.failedCases;
    if (options?.skippedCases !== undefined) updateData.skippedCases = options.skippedCases;

    await this.testRunRepository.update(runId, updateData);
  }

  /**
   * 获取测试运行状态信息
   */
  async getTestRunStatus(runId: number): Promise<TestRunStatusInfo | null> {
    return this.testRunRepository.findOne({
      where: { id: runId },
      select: ['id', 'status', 'jenkinsJob', 'jenkinsBuildId', 'jenkinsUrl', 'startTime'],
    });
  }

  /**
   * 将指定 executionId 下所有 status=error 的预创建记录批量更新为目标状态
   */
  async bulkUpdateErrorResults(executionId: number, targetStatus: 'passed' | 'failed'): Promise<number> {
    const result = await this.testRunResultRepository.query(`
      UPDATE Auto_TestRunResults
      SET status = ?, end_time = NOW()
      WHERE execution_id = ? AND status = 'error'
    `, [targetStatus, executionId]) as { affectedRows?: number; changedRows?: number };
    return result?.affectedRows ?? 0;
  }

  /**
   * 统计指定 executionId 下各状态的结果数量
   */
  async countResultsByStatus(executionId: number): Promise<{ passed: number; failed: number; skipped: number; total: number }> {
    const rows = await this.testRunResultRepository.query(`
      SELECT
        SUM(CASE WHEN status = 'passed'  THEN 1 ELSE 0 END) AS passed,
        SUM(CASE WHEN status IN ('failed', 'error') THEN 1 ELSE 0 END) AS failed,
        SUM(CASE WHEN status = 'skipped' THEN 1 ELSE 0 END) AS skipped,
        COUNT(*) AS total
      FROM Auto_TestRunResults
      WHERE execution_id = ?
    `, [executionId]) as Array<{ passed: string; failed: string; skipped: string; total: string }>;

    if (!rows || rows.length === 0) {
      return { passed: 0, failed: 0, skipped: 0, total: 0 };
    }
    return {
      passed:  Number(rows[0].passed  ?? 0),
      failed:  Number(rows[0].failed  ?? 0),
      skipped: Number(rows[0].skipped ?? 0),
      total:   Number(rows[0].total   ?? 0),
    };
  }

  /**
   * 通过 executionId（Auto_TestCaseTaskExecutions.id）找到关联的 Auto_TestRun，
   * 并同步更新其 status/passedCases/failedCases/skippedCases/durationMs 等统计字段。
   * 用于修复 handleCallback 路径（/api/executions/callback）只更新了 TaskExecution 而未更新 TestRun 的问题。
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

  /**
   * 辅助方法：将状态映射为 TestRun 的枚举值
   * @param status 输入状态
   * @returns TestRun 的状态枚举值
   */
  private mapStatusForTestRun(status: string): 'pending' | 'running' | 'success' | 'failed' | 'aborted' {
    // 将 'cancelled' 映射为 'aborted' 以匹配TestRun 的枚举
    if (status === 'cancelled') {
      return 'aborted';
    }
    return status as 'pending' | 'running' | 'success' | 'failed' | 'aborted';
  }
}
