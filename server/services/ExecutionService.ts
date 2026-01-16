import { query, queryOne, getPool } from '../config/database.js';

// 已废弃：由于没有远程 tasks 表，建议使用 CaseExecutionInput
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

// 移除本地 Task 接口，因为远程数据库中没有对应的 tasks 表
// 任务信息将从 Auto_TestRun 表中获取

/**
 * 执行服务
 * 负责创建执行记录、处理外部系统回调、状态更新
 * 注：实际测试执行由 Jenkins 等外部系统完成
 */
export class ExecutionService {
  /**
   * 创建执行记录（直接在 Auto_TestCaseTaskExecutions 表中创建）
   */
  async createExecution(input: TaskExecutionInput): Promise<ExecutionProgress> {
    // 注意：由于没有远程 tasks 表，这个方法需要重新设计
    // 暂时抛出错误，建议使用 triggerTestExecution 方法
    throw new Error('createExecution method is deprecated. Please use triggerTestExecution method instead.');
  }

  /**
   * 更新执行状态为运行中（使用远程数据库表）
   */
  async markExecutionRunning(executionId: number): Promise<void> {
    const pool = getPool();
    await pool.execute(`
      UPDATE Auto_TestCaseTaskExecutions
      SET status = 'running', start_time = NOW()
      WHERE id = ? AND status = 'pending'
    `, [executionId]);
  }

  /**
   * 处理外部系统（Jenkins）的执行结果回调（使用远程数据库表）
   */
  async handleCallback(input: ExecutionCallbackInput): Promise<void> {
    // 1. 验证执行记录存在
    const execution = await queryOne<{ id: number }>(`
      SELECT id FROM Auto_TestCaseTaskExecutions WHERE id = ?
    `, [input.executionId]);

    if (!execution) {
      throw new Error(`Execution not found: ${input.executionId}`);
    }

    const pool = getPool();

    // 2. 插入用例结果到远程表
    let passedCases = 0;
    let failedCases = 0;
    let skippedCases = 0;

    for (const result of input.results) {
      await pool.execute(`
        INSERT INTO Auto_TestRunResults (
          execution_id, case_id, case_name, status, start_time, end_time,
          duration, error_message, created_at
        ) VALUES (?, ?, ?, ?, NOW(), NOW(), ?, ?, NOW())
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

    // 3. 更新执行记录到远程表
    await pool.execute(`
      UPDATE Auto_TestCaseTaskExecutions
      SET status = ?, passed_cases = ?, failed_cases = ?, skipped_cases = ?,
          end_time = NOW(), duration = ?
      WHERE id = ?
    `, [
      input.status,
      passedCases,
      failedCases,
      skippedCases,
      input.duration,
      input.executionId,
    ]);
  }

  /**
   * 获取执行详情（使用远程数据库表）
   */
  async getExecutionDetail(executionId: number) {
    const execution = await queryOne(`
      SELECT te.*, u.display_name as executed_by_name
      FROM Auto_TestCaseTaskExecutions te
      LEFT JOIN Auto_Users u ON te.executed_by = u.id
      WHERE te.id = ?
    `, [executionId]);

    const results = await query(`
      SELECT * FROM Auto_TestRunResults WHERE execution_id = ? ORDER BY id
    `, [executionId]);

    return { execution, results };
  }

  /**
   * 获取最近执行记录（使用远程数据库表）
   */
  async getRecentExecutions(limit = 10) {
    return query(`
      SELECT te.*, u.display_name as executed_by_name
      FROM Auto_TestCaseTaskExecutions te
      LEFT JOIN Auto_Users u ON te.executed_by = u.id
      ORDER BY te.start_time DESC
      LIMIT ?
    `, [limit]);
  }

  /**
   * 取消执行（使用远程数据库表）
   */
  async cancelExecution(executionId: number) {
    const pool = getPool();
    await pool.execute(`
      UPDATE Auto_TestCaseTaskExecutions
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

    // 2.5. 创建对应的执行记录到 Auto_TestCaseTaskExecutions 表（为了满足外键约束）
    const [executionResult] = await pool.execute(`
      INSERT INTO Auto_TestCaseTaskExecutions (
        task_id, status, total_cases, executed_by, start_time, created_at
      ) VALUES (?, 'pending', ?, ?, NOW(), NOW())
    `, [
      null, // 设置为 NULL 以避免外键约束
      cases.length,
      input.triggeredBy,
    ]);

    const executionInsertResult = executionResult as { insertId: number };
    const executionId = executionInsertResult.insertId;

    // 3. 批量插入 Auto_TestRunResults 记录（状态为 pending）
    for (const testCase of cases) {
      await pool.execute(`
        INSERT INTO Auto_TestRunResults (
          execution_id, case_id, case_name, status, created_at
        ) VALUES (?, ?, ?, ?, NOW())
      `, [
        executionId,
        testCase.id,
        testCase.name,
        'error'
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
   * 获取批次执行结果列表（使用远程数据库表）
   */
  async getBatchExecutionResults(runId: number) {
    const results = await query(`
      SELECT atrr.*, atc.module, atc.priority, atc.type
      FROM Auto_TestRunResults atrr
      LEFT JOIN Auto_TestCase atc ON atrr.case_id = atc.id
      WHERE atrr.execution_id = ?
      ORDER BY atrr.id
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

    // 2. 如果有详细结果，更新 Auto_TestRunResults
    if (results.results && results.results.length > 0) {
      for (const result of results.results) {
        // 尝试更新
        const [updateResult] = await pool.execute(`
          UPDATE Auto_TestRunResults
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
            INSERT INTO Auto_TestRunResults (
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
   * 获取测试运行的用例列表（供 Jenkins 使用）
   * 注意：由于没有远程 tasks 表，改为从 Auto_TestRun 获取关联的用例
   */
  async getRunCases(runId: number) {
    // 从 Auto_TestRunResults 表获取该运行的所有用例
    const results = await query<{ case_id: number }[]>(`
      SELECT DISTINCT atrr.case_id
      FROM Auto_TestRunResults atrr
      WHERE atrr.execution_id = ?
    `, [runId]);

    if (!results || results.length === 0) {
      return [];
    }

    const caseIds = results.map((r: { case_id: number }) => r.case_id);
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