import { query, queryOne, getPool } from '../config/database.js';

export interface TaskExecutionInput {
  taskId: number;
  triggeredBy: number;
  triggerType: 'manual' | 'scheduled' | 'ci_triggered';
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

export interface CaseResultInput {
  caseId: number;
  caseName: string;
  status: 'passed' | 'failed' | 'skipped' | 'error';
  duration: number;
  errorMessage?: string;
}

export interface ExecutionCallbackInput {
  executionId: number;
  status: 'success' | 'failed' | 'cancelled';
  results: CaseResultInput[];
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
        `SELECT COUNT(*) as count FROM Auto_TestCase WHERE id IN (${placeholders}) AND status = 'active'`,
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

    const caseResults = await query(`
      SELECT * FROM case_results WHERE execution_id = ? ORDER BY id
    `, [executionId]);

    return { execution, caseResults };
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
      WHERE id IN (${placeholders}) AND status = 'active'
    `, caseIds);
  }
}

// 导出单例
export const executionService = new ExecutionService();
