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
import type {
  BatchResults,
  ExecutionDetail,
  ExecutionResultRow,
  ExecutionWithJenkinsInfo,
  PotentiallyTimedOutExecution,
  RecentExecution,
  StaleExecutionSummary,
  StuckExecution,
  TaskExecutionWithUser,
  TestRunBasicInfo,
  TestRunRow,
  TestRunStatusInfo,
  TestRunWithUser,
} from './ExecutionRepositoryTypes';

export abstract class ExecutionRepositoryBase extends BaseRepository<TaskExecution> {

  // 修复2: 为私有属性添加 readonly 修饰符，防止意外重赋值
  protected readonly testRunRepository: Repository<TestRun>;
  protected readonly testRunResultRepository: Repository<TestRunResult>;
  protected readonly testCaseRepository: Repository<TestCase>;
  protected readonly userRepository: Repository<User>;

  // 修复8: 提取魔法数字为类静态常量，方便统一维护
  /** 批量插入的批次大小：经过性能测试，100 条/批在 MySQL 上表现最佳 */
  protected static readonly BATCH_INSERT_SIZE = 100;
  /** 时间窗口反查的容差（秒）：允许 TestRun 与 TaskExecution 创建时间差在 ±120s 内 */
  protected static readonly TIME_WINDOW_TOLERANCE_SECONDS = 120;
  /** 扩大时间窗口兜底容差（秒）：±300s 的宽松窗口，作为最后兜底 */
  protected static readonly TIME_WINDOW_FALLBACK_SECONDS = 300;
  /** getActiveRunningSlots 返回的最大记录数，避免单次查询过多 */
  protected static readonly ACTIVE_SLOTS_MAX_LIMIT = 200;

  abstract findExecutionIdByRunId(runId: number): Promise<number | null>;

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
    /** null 表示系统调度触发（无操作人） */
    triggerBy: number | null;
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
   * 创建任务运行记录
   */
  async createTaskExecution(executionData: {
    taskId?: number;
    taskName?: string;
    totalCases: number;
    /** null 表示系统调度触发（无操作人） */
    executedBy: number | null;
  }): Promise<TaskExecution> {
    const execution = this.repository.create({
      ...executionData,
      status: TaskExecutionStatus.PENDING,
    });
    return this.repository.save(execution);
  }

  /**
   * 批量创建测试结果记录
   * 性能优化：
   * - 使用 insert 而非逐个 save，减少数据库往返
   * - 修复6: 按批次创建实体对象，避免一次性占用大量内存
   */
  async createTestResults(
    results: Array<{
      executionId: number;
      caseId: number;
      caseName: string;
      status: TestRunResultStatusType | null;
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

    // 修复6: 按批次创建实体并插入，避免一次性将全部数据加载到内存
    for (let i = 0; i < results.length; i += ExecutionRepositoryBase.BATCH_INSERT_SIZE) {
      const batch = results.slice(i, i + ExecutionRepositoryBase.BATCH_INSERT_SIZE);
      const entities = batch.map(result =>
        this.testRunResultRepository.create(result)
      );
      await this.testRunResultRepository.insert(entities);
    }
  }

  /**
   * 更新执行状态为运行中
   * 同时清除 endTime，防止从终态回退时出现数据不一致
   */
  async markExecutionRunning(executionId: number): Promise<void> {
    await this.repository.update(executionId, {
      status: TaskExecutionStatus.RUNNING,
      startTime: new Date(),
      endTime: null as unknown as Date, // 清除可能存在的旧 endTime，确保数据一致性
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
   * 获取最近运行记录
   * 修复5: 修正 getRawMany() 返回原始字段名（execution_xxx 格式），显式映射为 RecentExecution 接口字段
   */
  async getRecentExecutions(limit: number = 10): Promise<RecentExecution[]> {
    const rawRows = await this.repository.createQueryBuilder('execution')
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

    // getRawMany() 返回的字段名带有 alias 前缀（如 execution_id），需要显式映射
    return rawRows.map(raw => ({
      id:           raw.execution_id,
      taskId:       raw.execution_taskId ?? raw.execution_task_id,
      taskName:     raw.execution_taskName ?? raw.execution_task_name,
      status:       raw.execution_status,
      totalCases:   raw.execution_totalCases ?? raw.execution_total_cases,
      passedCases:  raw.execution_passedCases ?? raw.execution_passed_cases,
      failedCases:  raw.execution_failedCases ?? raw.execution_failed_cases,
      skippedCases: raw.execution_skippedCases ?? raw.execution_skipped_cases,
      duration:     raw.execution_duration,
      executedBy:   raw.execution_executedBy ?? raw.execution_executed_by,
      executedByName: raw.user_displayName ?? raw.user_display_name ?? raw.user_username ?? undefined,
      startTime:    raw.execution_startTime ?? raw.execution_start_time,
      endTime:      raw.execution_endTime ?? raw.execution_end_time,
    }));
  }

  /**
   * 取消执行
   * 修复3: 使用枚举常量替代硬编码字符串，保持与类型系统的一致性
   */
  async cancelExecution(executionId: number): Promise<void> {
    await this.repository.update(
      { id: executionId, status: In([TaskExecutionStatus.PENDING, TaskExecutionStatus.RUNNING]) },
      {
        status: TaskExecutionStatus.CANCELLED,
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
        JSON_UNQUOTE(JSON_EXTRACT(tr.run_config, '$.abortReason')) AS abort_reason,
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
      // "failed" 筛选同时包含 error 状态（Jenkins 执行异常写入 error，前端统一视为失败）
      if (options.status === "failed") {
        conditions.push("r.status IN ('failed', 'error')");
      } else if (options.status === "pending") {
        conditions.push("r.status IS NULL");
      } else {
        conditions.push("r.status = ?");
        params.push(options.status);
      }
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
        COALESCE(r.status, 'pending') AS status,
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
      const testRun = await this.testRunRepository.findOne({ where: { id: runId }, select: ["executionId"] });
      executionId = testRun?.executionId ?? null;
    } catch (error) {
      // 修复9: 添加 debug 日志，方便排查字段不存在等问题
      logger.debug('Failed to query execution_id column from Auto_TestRun, falling back to time-window search', {
        runId,
        error: error instanceof Error ? error.message : String(error),
      }, LOG_CONTEXTS.REPOSITORY);
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

    // 在 ±TIME_WINDOW_FALLBACK_SECONDS 窗口内，找同一触发者最近的 TaskExecution
    const fallbackRows = await this.testRunResultRepository.query(`
      SELECT e.id as execution_id
      FROM Auto_TestCaseTaskExecutions e
      WHERE e.executed_by = ?
        AND e.created_at BETWEEN DATE_SUB(?, INTERVAL ? SECOND) AND DATE_ADD(?, INTERVAL ? SECOND)
      ORDER BY ABS(TIMESTAMPDIFF(SECOND, e.created_at, ?)) ASC
      LIMIT 1
    `, [
      triggerBy,
      runCreatedAt, ExecutionRepositoryBase.TIME_WINDOW_FALLBACK_SECONDS,
      runCreatedAt, ExecutionRepositoryBase.TIME_WINDOW_FALLBACK_SECONDS,
      runCreatedAt,
    ]) as Array<{ execution_id: number }>;

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
      // 报表页展示的是触发时间，因此筛选也按 created_at 对齐
      conditions.push('tr.created_at >= ?');
      params.push(`${filters.startDate} 00:00:00`);
    }

    if (filters.endDate) {
      // 结束日期：当天 23:59:59（北京时间）
      conditions.push('tr.created_at <= ?');
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
        JSON_UNQUOTE(JSON_EXTRACT(tr.run_config, '$.abortReason')) AS abort_reason,
        tr.total_cases,
        tr.passed_cases,
        tr.failed_cases,
        tr.skipped_cases,
        tr.duration_ms,
        tr.created_at,
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
   * @deprecated 使用 {@link findExecutionIdByRunId} 替代，此方法只返回最新的 executionId，不够精确
   * @see findExecutionIdByRunId
   */
}
