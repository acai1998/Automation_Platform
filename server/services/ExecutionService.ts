import { query, queryOne, getPool } from '../config/database.js';

export interface TaskExecutionInput {
  taskId: number;
  triggeredBy: number;
  triggerType: 'manual' | 'scheduled' | 'ci_triggered';
}

export interface CaseExecutionInput {
  caseIds: number[];
  projectId: number;
  triggeredBy: number;
  triggerType: 'manual' | 'jenkins' | 'schedule';
  jenkinsJob?: string;
  runConfig?: Record<string, unknown>;
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
  caseId: number;
  caseName: string;
  status: 'passed' | 'failed' | 'skipped' | 'error';
  duration: number;
  errorMessage?: string;
}

export interface ExecutionCallbackInput {
  executionId: number;
  status: 'success' | 'failed' | 'cancelled';
  results: Auto_TestRunResultsInput[];
  duration: number;
  reportUrl?: string;
}

interface Task {
  id: number;
  name: string;
  case_ids: string;
  environment_id: number | null;
  base_url: string | null;
  env_config: string | null;
}

/**
 * 执行服务
 * 负责创建执行记录、处理外部系统回调、状态更新
 * 注：实际测试执行由 Jenkins 等外部系统完成
 */
export class ExecutionService {
  /**
   * 创建执行记录（供 Jenkins 触发时调用）
   */
  async createExecution(input: TaskExecutionInput): Promise<ExecutionProgress> {
    // 1. 获取任务信息
    const task = await queryOne<Task>(`
      SELECT t.*, e.base_url, e.config_json as env_config
      FROM tasks t
      LEFT JOIN environments e ON t.environment_id = e.id
      WHERE t.id = ?
    `, [input.taskId]);

    if (!task) {
      throw new Error(`Task not found: ${input.taskId}`);
    }

    // 2. 解析用例ID列表
    let caseIds: number[] = [];
    try {
      caseIds = JSON.parse(task.case_ids || '[]');
    } catch {
      caseIds = [];
    }

    // 3. 获取用例数量
    let totalCases = caseIds.length;
    if (totalCases > 0) {
      const placeholders = caseIds.map(() => '?').join(',');
      const cases = await queryOne<{ count: number }>(
        `SELECT COUNT(*) as count FROM Auto_TestCase WHERE id IN (${placeholders}) AND enabled = 1`,
        caseIds
      );
      totalCases = cases?.count ?? 0;
    }

    // 4. 创建执行记录（状态为 pending，等待 Jenkins 回调）
    const pool = getPool();
    const [result] = await pool.execute(`
      INSERT INTO task_executions (
        task_id, task_name, trigger_type, status, total_cases,
        passed_cases, failed_cases, skipped_cases, start_time, executed_by, environment_id
      ) VALUES (?, ?, ?, 'pending', ?, 0, 0, 0, NOW(), ?, ?)
    `, [
      task.id,
      task.name,
      input.triggerType,
      totalCases,
      input.triggeredBy,
      task.environment_id,
    ]);

    const insertResult = result as { insertId: number };

    return {
      executionId: insertResult.insertId,
      totalCases,
      completedCases: 0,
      passedCases: 0,
      failedCases: 0,
      skippedCases: 0,
      status: 'pending',
    };
  }

  /**
   * 更新执行状态为运行中
   */
  async markExecutionRunning(executionId: number): Promise<void> {
    const pool = getPool();
    await pool.execute(`
      UPDATE task_executions
      SET status = 'running', start_time = NOW()
      WHERE id = ? AND status = 'pending'
    `, [executionId]);
  }

  /**
   * 处理外部系统（Jenkins）的执行结果回调
   */
  async handleCallback(input: ExecutionCallbackInput): Promise<void> {
    // 1. 验证执行记录存在
    const execution = await queryOne<{ id: number }>(`
      SELECT id FROM task_executions WHERE id = ?
    `, [input.executionId]);

    if (!execution) {
      throw new Error(`Execution not found: ${input.executionId}`);
    }

    const pool = getPool();

    // 2. 插入用例结果
    let passedCases = 0;
    let failedCases = 0;
    let skippedCases = 0;

    for (const result of input.results) {
      await pool.execute(`
        INSERT INTO case_results (
          execution_id, case_id, case_name, status, start_time, end_time,
          duration, error_message, assertions_total, assertions_passed, response_data
        ) VALUES (?, ?, ?, ?, NOW(), NOW(), ?, ?, 0, 0, NULL)
      `, [
        input.executionId,
        result.caseId,
        result.caseName,
        result.status,
        result.duration,
        result.errorMessage || null,
      ]);

      if (result.status === 'passed') passedCases++;
      else if (result.status === 'failed') failedCases++;
      else skippedCases++;
    }

    // 3. 更新执行记录
    await pool.execute(`
      UPDATE task_executions
      SET status = ?, passed_cases = ?, failed_cases = ?, skipped_cases = ?,
          end_time = NOW(), duration = ?, error_message = ?
      WHERE id = ?
    `, [
      input.status,
      passedCases,
      failedCases,
      skippedCases,
      input.duration,
      input.reportUrl || null,
      input.executionId,
    ]);
  }

  /**
   * 获取执行详情
   */
  async getExecutionDetail(executionId: number) {
    const execution = await queryOne(`
      SELECT te.*, u.display_name as executed_by_name
      FROM task_executions te
      LEFT JOIN Auto_Users u ON te.executed_by = u.id
      WHERE te.id = ?
    `, [executionId]);

    const Auto_TestRunResultss = await query(`
      SELECT * FROM case_results WHERE execution_id = ? ORDER BY id
    `, [executionId]);

    return { execution, Auto_TestRunResultss };
  }

  /**
   * 获取最近执行记录
   */
  async getRecentExecutions(limit = 10) {
    return query(`
      SELECT te.*, u.display_name as executed_by_name
      FROM task_executions te
      LEFT JOIN Auto_Users u ON te.executed_by = u.id
      ORDER BY te.start_time DESC
      LIMIT ?
    `, [limit]);
  }

  /**
   * 取消执行
   */
  async cancelExecution(executionId: number) {
    const pool = getPool();
    await pool.execute(`
      UPDATE task_executions
      SET status = 'cancelled', end_time = NOW()
      WHERE id = ? AND status IN ('pending', 'running')
    `, [executionId]);
  }

  /**
   * 触发用例执行，向 Auto_TestRun 表写入运行记录
   */
  async triggerTestExecution(input: CaseExecutionInput): Promise<{ runId: number; totalCases: number }> {
    const pool = getPool();

    // 1. 验证用例是否存在并获取用例信息
    if (input.caseIds.length === 0) {
      throw new Error('Case IDs cannot be empty');
    }

    const placeholders = input.caseIds.map(() => '?').join(',');
    const cases = await query<{ id: number; name: string; type: string; script_path: string | null }[]>(
      `SELECT id, name, type, script_path FROM Auto_TestCase WHERE id IN (${placeholders}) AND enabled = 1`,
      input.caseIds
    );

    if (!cases || cases.length === 0) {
      throw new Error(`No active test cases found with IDs: ${input.caseIds.join(',')}`);
    }

    // 2. 创建运行记录到 Auto_TestRun 表
    const runConfig = input.runConfig ? JSON.stringify(input.runConfig) : null;
    const [result] = await pool.execute(`
      INSERT INTO Auto_TestRun (
        project_id, trigger_type, trigger_by, jenkins_job, status,
        run_config, total_cases, created_at
      ) VALUES (?, ?, ?, ?, 'pending', ?, ?, NOW())
    `, [
      input.projectId,
      input.triggerType,
      input.triggeredBy,
      input.jenkinsJob || null,
      runConfig,
      cases.length,
    ]);

    const insertResult = result as { insertId: number };
    const runId = insertResult.insertId;

    // 3. 批量插入 Auto_TestRunResults 记录（状态为 pending）
    for (const testCase of cases) {
      await pool.execute(`
        INSERT INTO case_results (
          execution_id, case_id, case_name, status, created_at
        ) VALUES (?, ?, ?, 'pending', NOW())
      `, [
        runId,
        testCase.id,
        testCase.name
      ]);
    }

    return {
      runId,
      totalCases: cases.length,
    };
  }

  /**
   * 获取批次执行详情
   */
  async getBatchExecution(runId: number) {
    const execution = await queryOne(`
      SELECT atr.*, u.display_name as trigger_by_name
      FROM Auto_TestRun atr
      LEFT JOIN Auto_Users u ON atr.trigger_by = u.id
      WHERE atr.id = ?
    `, [runId]);

    if (!execution) {
      throw new Error(`Execution not found: ${runId}`);
    }

    return { execution };
  }

  /**
   * 获取批次执行结果列表
   */
  async getBatchExecutionResults(runId: number) {
    const results = await query(`
      SELECT cr.*, atc.module, atc.priority, atc.type
      FROM case_results cr
      LEFT JOIN Auto_TestCase atc ON cr.case_id = atc.id
      WHERE cr.execution_id = ?
      ORDER BY cr.id
    `, [runId]);

    return results;
  }

  /**
   * 更新执行批次的Jenkins信息
   */
  async updateBatchJenkinsInfo(runId: number, jenkinsInfo: {
    buildId: string;
    buildUrl: string;
  }): Promise<void> {
    const pool = getPool();
    await pool.execute(`
      UPDATE Auto_TestRun
      SET jenkins_build_id = ?, jenkins_url = ?, status = 'running', start_time = NOW()
      WHERE id = ?
    `, [jenkinsInfo.buildId, jenkinsInfo.buildUrl, runId]);
  }

  /**
   * 完成执行批次
   */
  async completeBatchExecution(runId: number, results: {
    status: 'success' | 'failed' | 'aborted';
    passedCases: number;
    failedCases: number;
    skippedCases: number;
    durationMs: number;
    results?: Auto_TestRunResultsInput[];
  }): Promise<void> {
    const pool = getPool();
    
    // 1. 更新 Auto_TestRun
    await pool.execute(`
      UPDATE Auto_TestRun
      SET status = ?, passed_cases = ?, failed_cases = ?, skipped_cases = ?,
          duration_ms = ?, end_time = NOW()
      WHERE id = ?
    `, [
      results.status,
      results.passedCases,
      results.failedCases,
      results.skippedCases,
      results.durationMs,
      runId,
    ]);

    // 2. 如果有详细结果，更新 case_results
    if (results.results && results.results.length > 0) {
      for (const result of results.results) {
        // 尝试更新
        const [updateResult] = await pool.execute(`
          UPDATE case_results
          SET status = ?, duration = ?, error_message = ?, 
              start_time = NOW(), end_time = NOW()
          WHERE execution_id = ? AND case_id = ?
        `, [
          result.status,
          result.duration,
          result.errorMessage || null,
          runId,
          result.caseId
        ]);

        const affectedRows = (updateResult as any).affectedRows;

        // 如果没有更新到记录（可能是新用例，或者之前没有插入），则插入
        if (affectedRows === 0) {
          await pool.execute(`
            INSERT INTO case_results (
              execution_id, case_id, case_name, status, duration, error_message,
              start_time, end_time, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW(), NOW())
          `, [
            runId,
            result.caseId,
            result.caseName,
            result.status,
            result.duration,
            result.errorMessage || null
          ]);
        }
      }
    }
  }

  /**
   * 获取执行批次的用例列表
   */
  async getBatchCases(runId: number) {
    const batch = await queryOne<{ total_cases: number }>(`
      SELECT total_cases FROM Auto_TestRun WHERE id = ?
    `, [runId]);

    if (!batch) {
      throw new Error(`Batch not found: ${runId}`);
    }

    // 注意：这里需要补充存储关联用例ID的逻辑
    // 如果在 Auto_TestRun 中添加 case_ids 字段，可以解析获取用例
    return { totalCases: batch.total_cases };
  }

  /**
   * 获取所有测试运行记录（Auto_TestRun 表）
   */
  async getAllTestRuns(limit = 50, offset = 0) {
    const sql = `
      SELECT atr.*, u.display_name as trigger_by_name
      FROM Auto_TestRun atr
      LEFT JOIN Auto_Users u ON atr.trigger_by = u.id
      ORDER BY atr.created_at DESC
      LIMIT ? OFFSET ?
    `;
    const data = await query(sql, [limit, offset]);
    
    const countSql = 'SELECT COUNT(*) as total FROM Auto_TestRun';
    const countResult = await queryOne<{ total: number }>(countSql);
    
    return {
      data,
      total: countResult?.total ?? 0
    };
  }

  /**
   * 获取任务的用例列表（供 Jenkins 使用）
   */
  async getTaskCases(taskId: number) {
    const task = await queryOne<{ case_ids: string }>(`
      SELECT case_ids FROM tasks WHERE id = ?
    `, [taskId]);

    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    let caseIds: number[] = [];
    try {
      caseIds = JSON.parse(task.case_ids || '[]');
    } catch {
      caseIds = [];
    }

    if (caseIds.length === 0) {
      return [];
    }

    const placeholders = caseIds.map(() => '?').join(',');
    return query(`
      SELECT id, name, type, module, priority, script_path, config_json
      FROM Auto_TestCase
      WHERE id IN (${placeholders}) AND enabled = 1
    `, caseIds);
  }
}

// 导出单例
export const executionService = new ExecutionService();