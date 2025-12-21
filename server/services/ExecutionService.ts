import { getDatabase } from '../db/index.js';
import { RunnerFactory, TestCaseConfig, ExecutionResult, ApiConfig } from '../runners/index.js';

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

/**
 * 执行服务
 * 负责协调任务执行、结果记录、状态更新
 */
export class ExecutionService {
  /**
   * 执行任务
   */
  async executeTask(input: TaskExecutionInput): Promise<ExecutionProgress> {
    const db = getDatabase();

    // 1. 获取任务信息
    const task = db.prepare(`
      SELECT t.*, e.base_url, e.config_json as env_config
      FROM tasks t
      LEFT JOIN environments e ON t.environment_id = e.id
      WHERE t.id = ?
    `).get(input.taskId) as any;

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

    if (caseIds.length === 0) {
      throw new Error('Task has no test cases');
    }

    // 3. 获取用例详情
    const placeholders = caseIds.map(() => '?').join(',');
    const cases = db.prepare(`
      SELECT * FROM test_cases WHERE id IN (${placeholders}) AND status = 'active'
    `).all(...caseIds) as any[];

    // 4. 创建执行记录
    const insertExecution = db.prepare(`
      INSERT INTO task_executions (
        task_id, task_name, trigger_type, status, total_cases,
        passed_cases, failed_cases, skipped_cases, start_time, executed_by, environment_id
      ) VALUES (?, ?, ?, 'running', ?, 0, 0, 0, datetime('now'), ?, ?)
    `);

    const result = insertExecution.run(
      task.id,
      task.name,
      input.triggerType,
      cases.length,
      input.triggeredBy,
      task.environment_id
    );

    const executionId = result.lastInsertRowid as number;

    // 5. 准备环境配置
    const environment = {
      baseUrl: task.base_url,
      variables: task.env_config ? JSON.parse(task.env_config) : {},
    };

    // 6. 开始执行用例
    let passedCases = 0;
    let failedCases = 0;
    let skippedCases = 0;

    const insertCaseResult = db.prepare(`
      INSERT INTO case_results (
        execution_id, case_id, case_name, status, start_time, end_time,
        duration, error_message, assertions_total, assertions_passed, response_data
      ) VALUES (?, ?, ?, ?, datetime('now'), datetime('now'), ?, ?, ?, ?, ?)
    `);

    for (const testCase of cases) {
      // 构建用例配置
      const caseConfig = this.buildTestCaseConfig(testCase, environment);

      // 执行用例
      const execResult = await RunnerFactory.execute(caseConfig);

      // 记录结果
      const status = execResult.status;
      if (status === 'passed') passedCases++;
      else if (status === 'failed') failedCases++;
      else skippedCases++;

      const assertionsTotal = execResult.assertions?.length || 0;
      const assertionsPassed = execResult.assertions?.filter(a => a.passed).length || 0;

      insertCaseResult.run(
        executionId,
        testCase.id,
        testCase.name,
        status,
        execResult.duration,
        execResult.errorMessage || null,
        assertionsTotal,
        assertionsPassed,
        JSON.stringify(execResult.responseData || null)
      );
    }

    // 7. 更新执行记录
    const finalStatus = failedCases > 0 ? 'failed' : 'success';
    db.prepare(`
      UPDATE task_executions
      SET status = ?, passed_cases = ?, failed_cases = ?, skipped_cases = ?,
          end_time = datetime('now'), duration = CAST((julianday(datetime('now')) - julianday(start_time)) * 86400 AS INTEGER)
      WHERE id = ?
    `).run(finalStatus, passedCases, failedCases, skippedCases, executionId);

    return {
      executionId,
      totalCases: cases.length,
      completedCases: cases.length,
      passedCases,
      failedCases,
      skippedCases,
      status: finalStatus,
    };
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
      WHERE id = ? AND status = 'running'
    `).run(executionId);
  }

  /**
   * 构建用例配置
   */
  private buildTestCaseConfig(testCase: any, environment: any): TestCaseConfig {
    let config: any;

    try {
      config = JSON.parse(testCase.config_json || '{}');
    } catch {
      config = {};
    }

    // 根据类型构建配置
    switch (testCase.type) {
      case 'api':
        return {
          id: testCase.id,
          name: testCase.name,
          type: 'api',
          config: {
            method: config.method || 'GET',
            url: config.url || '',
            headers: config.headers,
            params: config.params,
            body: config.body,
            timeout: config.timeout,
            assertions: config.assertions || [],
          } as ApiConfig,
          environment,
        };

      case 'postman':
        return {
          id: testCase.id,
          name: testCase.name,
          type: 'postman',
          config: {
            collectionJson: config.collectionJson || config,
            environmentJson: config.environmentJson,
            iterationCount: config.iterationCount,
            delayRequest: config.delayRequest,
          },
          environment,
        };

      case 'pytest':
        return {
          id: testCase.id,
          name: testCase.name,
          type: 'pytest',
          config: {
            scriptPath: config.scriptPath || testCase.script_path,
            testFunction: config.testFunction,
            args: config.args,
            pythonPath: config.pythonPath,
            timeout: config.timeout,
          },
          environment,
        };

      default:
        // 默认当作 API 类型处理
        return {
          id: testCase.id,
          name: testCase.name,
          type: 'api',
          config: {
            method: 'GET',
            url: '',
            assertions: [],
          } as ApiConfig,
          environment,
        };
    }
  }
}

// 导出单例
export const executionService = new ExecutionService();
