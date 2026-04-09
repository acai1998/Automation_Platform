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

// ============================================================================
// 接口定义
// ============================================================================

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
 * 最近运行记录接口
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
  abort_reason: string | null;
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

// ============================================================================
// completeBatch 内部类型
// ============================================================================

/** completeBatch 方法接收的单条用例结果 */
interface BatchCaseResult {
  /** caseId 可为空（如 pytest 等不携带 ID 的框架），此时通过 caseName fallback 匹配 */
  caseId?: number;
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
  startTime?: string | number;
  endTime?: string | number;
}

/** completeBatch 方法接收的批次结果 */
interface BatchResults {
  status: 'success' | 'failed' | 'cancelled' | 'aborted';
  passedCases: number;
  failedCases: number;
  skippedCases: number;
  durationMs: number;
  results?: BatchCaseResult[];
}

/**
 * 运行记录 Repository
 */
export class ExecutionRepository extends BaseRepository<TaskExecution> {
  // 修复2: 为私有属性添加 readonly 修饰符，防止意外重赋值
  private readonly testRunRepository: Repository<TestRun>;
  private readonly testRunResultRepository: Repository<TestRunResult>;
  private readonly testCaseRepository: Repository<TestCase>;
  private readonly userRepository: Repository<User>;

  // 修复8: 提取魔法数字为类静态常量，方便统一维护
  /** 批量插入的批次大小：经过性能测试，100 条/批在 MySQL 上表现最佳 */
  private static readonly BATCH_INSERT_SIZE = 100;
  /** 时间窗口反查的容差（秒）：允许 TestRun 与 TaskExecution 创建时间差在 ±120s 内 */
  private static readonly TIME_WINDOW_TOLERANCE_SECONDS = 120;
  /** 扩大时间窗口兜底容差（秒）：±300s 的宽松窗口，作为最后兜底 */
  private static readonly TIME_WINDOW_FALLBACK_SECONDS = 300;
  /** getActiveRunningSlots 返回的最大记录数，避免单次查询过多 */
  private static readonly ACTIVE_SLOTS_MAX_LIMIT = 200;

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

    // 修复6: 按批次创建实体并插入，避免一次性将全部数据加载到内存
    for (let i = 0; i < results.length; i += ExecutionRepository.BATCH_INSERT_SIZE) {
      const batch = results.slice(i, i + ExecutionRepository.BATCH_INSERT_SIZE);
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
      runCreatedAt, ExecutionRepository.TIME_WINDOW_FALLBACK_SECONDS,
      runCreatedAt, ExecutionRepository.TIME_WINDOW_FALLBACK_SECONDS,
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
        JSON_UNQUOTE(JSON_EXTRACT(tr.run_config, '$.abortReason')) AS abort_reason,
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
   * @deprecated 使用 {@link findExecutionIdByRunId} 替代，此方法只返回最新的 executionId，不够精确
   * @see findExecutionIdByRunId
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
      testRun.created_at, ExecutionRepository.TIME_WINDOW_TOLERANCE_SECONDS,
      testRun.created_at, ExecutionRepository.TIME_WINDOW_TOLERANCE_SECONDS,
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
        status: TestRunResultStatus.ERROR,
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
          { runId, resultsCount: results.results?.length ?? 0 },
          LOG_CONTEXTS.REPOSITORY
        );

        // 【兜底修复】resolvedExecutionId 无法从 TaskExecution 表获取时，
        // 尝试直接从 Auto_TestRunResults 表通过已有占位记录反查 executionId，
        // 确保 ERROR 占位符依然能被清理，避免用例状态永久卡在 error
        const fallbackExecId = await this.resolveExecutionIdFromRunResults(runId);
        if (fallbackExecId) {
          logger.info(
            `completeBatch: fallback executionId resolved from TestRunResults, will cleanup error placeholders`,
            { runId, fallbackExecId },
            LOG_CONTEXTS.REPOSITORY
          );
          await this.updateSummaryOnlyResults(runId, fallbackExecId, results);
          await this.performFinalErrorCleanup(fallbackExecId, results);
        }
      }

      // 【安全防护】无论采用哪个更新路径，都执行最后的全局清理
      // 防止在特殊场景（既无详细结果也无汇总统计）下 ERROR 占位符残留
      if (resolvedExecutionId) {
        await this.performFinalErrorCleanup(resolvedExecutionId, results);

        // 最终一致性校正：以结果表为准回填批次汇总，避免“汇总 success 但明细仍 error”
        const finalCounts = await this.countResultsByStatus(resolvedExecutionId);
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

          await this.repository.update(resolvedExecutionId, {
            status: reconciledTaskStatus,
            passedCases: finalCounts.passed,
            failedCases: finalCounts.failed,
            skippedCases: finalCounts.skipped,
          });

          logger.info('Reconciled batch summary from result rows', {
            runId,
            executionId: resolvedExecutionId,
            reconciledRunStatus,
            finalCounts,
          }, LOG_CONTEXTS.REPOSITORY);
        }
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
        WHERE execution_id = ? AND status = 'error'
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
        WHERE execution_id = ? AND status = 'error'
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
      select: ['id', 'status', 'jenkinsJob', 'jenkinsBuildId', 'jenkinsUrl', 'startTime'],
    });
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
      [maxAgeHours, ExecutionRepository.ACTIVE_SLOTS_MAX_LIMIT]
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

  // ============================================================================
  // 私有辅助方法
  // ============================================================================

  /**
   * 辅助方法：将状态映射为 TestRun 的枚举值
   * @param status 输入状态
   * @returns TestRun 的状态枚举值
   */
  private mapStatusForTestRun(status: string): 'pending' | 'running' | 'success' | 'failed' | 'aborted' {
    // 将 'cancelled' 映射为 'aborted' 以匹配 TestRun 的枚举
    if (status === 'cancelled') {
      return 'aborted';
    }
    return status as 'pending' | 'running' | 'success' | 'failed' | 'aborted';
  }

  /**
   * 归一化回调中的单用例状态，避免非标准值导致写库失败并残留占位 error。
   */
  private normalizeCaseResultStatus(status: string): TestRunResultStatusType {
    const normalized = String(status ?? '').trim().toLowerCase();

    if (normalized === 'passed' || normalized === 'success' || normalized === 'pass') {
      return TestRunResultStatus.PASSED;
    }

    if (normalized === 'failed' || normalized === 'fail') {
      return TestRunResultStatus.FAILED;
    }

    if (normalized === 'skipped' || normalized === 'skip') {
      return TestRunResultStatus.SKIPPED;
    }

    if (normalized === 'error') {
      return TestRunResultStatus.ERROR;
    }

    // 未知状态统一归为 error，便于前端识别并排查
    return TestRunResultStatus.ERROR;
  }

  /**
   * 修复10: completeBatch 拆分 - 多策略解析 executionId
   *
   * 策略优先级（由高到低）：
   *   1. 从 Auto_TestRun.execution_id 直接查询（最可靠，run 与 execution 的强绑定）
   *   2. 调用方传入的缓存值（仅在 run 尚未绑定 execution_id 时使用）
   *   3. 时间窗口 + 触发者反查（兜底，可能不够精确）
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
  private async resolveExecutionIdFromRunResults(runId: number): Promise<number | undefined> {
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
      WHERE execution_id = ? AND status = 'error'
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

      // 获取该 executionId 下所有预创建的 error 状态记录（按 id 排序保证顺序稳定）
      const preCreatedResults = await this.testRunResultRepository.query(`
        SELECT id FROM Auto_TestRunResults
        WHERE execution_id = ?
        ORDER BY id ASC
      `, [executionId]) as Array<{ id: number }>;

      if (preCreatedResults.length > 0) {
        const passedEnd = results.passedCases;
        const failedEnd = passedEnd + results.failedCases;

        // 修复11: 按状态分组收集 id，再批量 UPDATE，替代原来的逐条循环
        const passedIds  = preCreatedResults.slice(0,        passedEnd).map(r => r.id);
        const failedIds  = preCreatedResults.slice(passedEnd, failedEnd).map(r => r.id);
        const skippedIds = preCreatedResults.slice(failedEnd).map(r => r.id);

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
            WHERE execution_id = ? AND status = 'error'
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