import { getDatabase } from '../db/index.js';

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

/**
 * 执行服务
 * 负责创建执行记录、处理外部系统回调、状态更新
 * 注：实际测试执行由 Jenkins 等外部系统完成
 */
export class ExecutionService {
  /**
   * 创建执行记录（供 Jenkins 触发时调用）
   */
  createExecution(input: TaskExecutionInput): ExecutionProgress {
    const db = getDatabase();

    // 1. 获取任务信息
    const task = db.prepare(`
      SELECT t.*, e.base_url, e.config_json as env_config
      FROM tasks t
      LEFT JOIN environments e ON t.environment_id = e.id
      WHERE t.id = ?
    `).get(input.taskId) as Record<string, unknown> | undefined;

    if (!task) {
      throw new Error(`Task not found: ${input.taskId}`);
    }

    // 2. 解析用例ID列表
    let caseIds: number[] = [];
    try {
      caseIds = JSON.parse((task.case_ids as string) || '[]');
    } catch {
      caseIds = [];
    }

    // 3. 获取用例数量
    let totalCases = caseIds.length;
    if (totalCases > 0) {
      const placeholders = caseIds.map(() => '?').join(',');
      const cases = db.prepare(`
        SELECT COUNT(*) as count FROM test_cases WHERE id IN (${placeholders}) AND status = 'active'
      `).get(...caseIds) as { count: number };
      totalCases = cases.count;
    }

    // 4. 创建执行记录（状态为 pending，等待 Jenkins 回调）
    const insertExecution = db.prepare(`
      INSERT INTO task_executions (
        task_id, task_name, trigger_type, status, total_cases,
        passed_cases, failed_cases, skipped_cases, start_time, executed_by, environment_id
      ) VALUES (?, ?, ?, 'pending', ?, 0, 0, 0, datetime('now'), ?, ?)
    `);

    const result = insertExecution.run(
      task.id,
      task.name,
      input.triggerType,
      totalCases,
      input.triggeredBy,
      task.environment_id
    );

    const executionId = result.lastInsertRowid as number;

    return {
      executionId,
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
  markExecutionRunning(executionId: number): void {
    const db = getDatabase();
    db.prepare(`
      UPDATE task_executions
      SET status = 'running', start_time = datetime('now')
      WHERE id = ? AND status = 'pending'
    `).run(executionId);
  }

  /**
   * 处理外部系统（Jenkins）的执行结果回调
   */
  handleCallback(input: ExecutionCallbackInput): void {
    const db = getDatabase();

    // 1. 验证执行记录存在
    const execution = db.prepare(`
      SELECT * FROM task_executions WHERE id = ?
    `).get(input.executionId);

    if (!execution) {
      throw new Error(`Execution not found: ${input.executionId}`);
    }

    // 2. 插入用例结果
    const insertCaseResult = db.prepare(`
      INSERT INTO case_results (
        execution_id, case_id, case_name, status, start_time, end_time,
        duration, error_message, assertions_total, assertions_passed, response_data
      ) VALUES (?, ?, ?, ?, datetime('now'), datetime('now'), ?, ?, 0, 0, NULL)
    `);

    let passedCases = 0;
    let failedCases = 0;
    let skippedCases = 0;

    for (const result of input.results) {
      insertCaseResult.run(
        input.executionId,
        result.caseId,
        result.caseName,
        result.status,
        result.duration,
        result.errorMessage || null
      );

      if (result.status === 'passed') passedCases++;
      else if (result.status === 'failed') failedCases++;
      else skippedCases++;
    }

    // 3. 更新执行记录
    db.prepare(`
      UPDATE task_executions
      SET status = ?, passed_cases = ?, failed_cases = ?, skipped_cases = ?,
          end_time = datetime('now'), duration = ?, error_message = ?
      WHERE id = ?
    `).run(
      input.status,
      passedCases,
      failedCases,
      skippedCases,
      input.duration,
      input.reportUrl || null,
      input.executionId
    );
  }

  /**
   * 获取执行详情
   */
  getExecutionDetail(executionId: number) {
    const db = getDatabase();

    const execution = db.prepare(`
      SELECT te.*, u.display_name as executed_by_name
      FROM task_executions te
      LEFT JOIN users u ON te.executed_by = u.id
      WHERE te.id = ?
    `).get(executionId);

    const caseResults = db.prepare(`
      SELECT * FROM case_results WHERE execution_id = ? ORDER BY id
    `).all(executionId);

    return { execution, caseResults };
  }

  /**
   * 获取最近执行记录
   */
  getRecentExecutions(limit = 10) {
    const db = getDatabase();

    return db.prepare(`
      SELECT te.*, u.display_name as executed_by_name
      FROM task_executions te
      LEFT JOIN users u ON te.executed_by = u.id
      ORDER BY te.start_time DESC
      LIMIT ?
    `).all(limit);
  }

  /**
   * 取消执行
   */
  cancelExecution(executionId: number) {
    const db = getDatabase();

    db.prepare(`
      UPDATE task_executions
      SET status = 'cancelled', end_time = datetime('now')
      WHERE id = ? AND status IN ('pending', 'running')
    `).run(executionId);
  }

  /**
   * 获取任务的用例列表（供 Jenkins 使用）
   */
  getTaskCases(taskId: number) {
    const db = getDatabase();

    const task = db.prepare(`SELECT case_ids FROM tasks WHERE id = ?`).get(taskId) as { case_ids: string } | undefined;

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
    return db.prepare(`
      SELECT id, name, type, module, priority, script_path, config_json
      FROM test_cases
      WHERE id IN (${placeholders}) AND status = 'active'
    `).all(...caseIds);
  }
}

// 导出单例
export const executionService = new ExecutionService();
