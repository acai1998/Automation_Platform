import { query, queryOne, getPool } from '../config/database.js';
import { jenkinsStatusService, TestResults } from './JenkinsStatusService.js';

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

  // ============ 新增：混合状态同步功能 ============

  /**
   * 通过Jenkins API查询并同步执行状态
   * 作为回调机制的备用方案
   */
  async syncExecutionStatusFromJenkins(runId: number): Promise<{
    success: boolean;
    updated: boolean;
    message: string;
    currentStatus?: string;
    jenkinsStatus?: string;
  }> {
    try {
      // 1. 获取执行记录
      const execution = await queryOne<{
        id: number;
        status: string;
        jenkins_job: string;
        jenkins_build_id: string;
        jenkins_url: string;
        start_time: Date;
      }>(`
        SELECT id, status, jenkins_job, jenkins_build_id, jenkins_url, start_time
        FROM Auto_TestRun
        WHERE id = ?
      `, [runId]);

      if (!execution) {
        return {
          success: false,
          updated: false,
          message: `Execution not found: ${runId}`
        };
      }

      // 2. 检查是否有Jenkins信息
      if (!execution.jenkins_job || !execution.jenkins_build_id) {
        return {
          success: false,
          updated: false,
          message: 'No Jenkins job information available for this execution'
        };
      }

      // 3. 查询Jenkins构建状态
      const buildStatus = await jenkinsStatusService.getBuildStatus(
        execution.jenkins_job,
        execution.jenkins_build_id
      );

      if (!buildStatus) {
        return {
          success: false,
          updated: false,
          message: `Failed to get Jenkins build status for ${execution.jenkins_job}/${execution.jenkins_build_id}`
        };
      }

      // 4. 映射Jenkins状态到内部状态
      const jenkinsStatusMapped = this.mapJenkinsStatusToInternal(buildStatus.result, buildStatus.building);

      console.log(`Jenkins status sync for runId ${runId}:`, {
        currentStatus: execution.status,
        jenkinsBuilding: buildStatus.building,
        jenkinsResult: buildStatus.result,
        jenkinsStatusMapped,
        buildNumber: buildStatus.number
      });

      // 5. 检查状态是否需要更新
      if (execution.status === jenkinsStatusMapped) {
        return {
          success: true,
          updated: false,
          message: 'Status already up to date',
          currentStatus: execution.status,
          jenkinsStatus: jenkinsStatusMapped
        };
      }

      // 6. 如果状态不一致，尝试获取详细测试结果
      let testResults: TestResults | null = null;
      if (!buildStatus.building && buildStatus.result) {
        testResults = await jenkinsStatusService.parseBuildResults(
          execution.jenkins_job,
          execution.jenkins_build_id
        );
      }

      // 7. 更新状态
      const updated = await this.updateExecutionStatusFromJenkins(runId, {
        status: jenkinsStatusMapped,
        building: buildStatus.building,
        duration: buildStatus.duration,
        testResults
      });

      return {
        success: true,
        updated,
        message: updated ? 'Status updated successfully' : 'No update needed',
        currentStatus: execution.status,
        jenkinsStatus: jenkinsStatusMapped
      };

    } catch (error) {
      console.error(`Failed to sync status for runId ${runId}:`, error);
      return {
        success: false,
        updated: false,
        message: `Sync failed: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * 映射Jenkins状态到内部状态
   */
  private mapJenkinsStatusToInternal(result: string | null, building: boolean): string {
    if (building) {
      return 'running';
    }

    switch (result) {
      case 'SUCCESS':
        return 'success';
      case 'FAILURE':
      case 'UNSTABLE':
        return 'failed';
      case 'ABORTED':
        return 'aborted';
      default:
        return 'pending';
    }
  }

  /**
   * 根据Jenkins状态更新执行记录
   */
  private async updateExecutionStatusFromJenkins(runId: number, jenkinsData: {
    status: string;
    building: boolean;
    duration: number;
    testResults?: TestResults | null;
  }): Promise<boolean> {
    const pool = getPool();

    try {
      // 1. 更新Auto_TestRun状态
      if (jenkinsData.building) {
        // 如果还在构建中，只更新为running状态
        await pool.execute(`
          UPDATE Auto_TestRun
          SET status = 'running'
          WHERE id = ? AND status IN ('pending', 'running')
        `, [runId]);
      } else {
        // 构建完成，更新最终状态
        const updateFields = [
          'status = ?',
          'end_time = NOW()',
          'duration_ms = ?'
        ];

        const updateValues = [jenkinsData.status, jenkinsData.duration, runId];

        // 如果有测试结果，更新用例统计
        if (jenkinsData.testResults) {
          updateFields.push('passed_cases = ?', 'failed_cases = ?', 'skipped_cases = ?');
          updateValues.splice(-1, 0,
            jenkinsData.testResults.passedCases,
            jenkinsData.testResults.failedCases,
            jenkinsData.testResults.skippedCases
          );
        }

        await pool.execute(`
          UPDATE Auto_TestRun
          SET ${updateFields.join(', ')}
          WHERE id = ?
        `, updateValues);

        // 2. 如果有详细测试结果，更新Auto_TestRunResults
        if (jenkinsData.testResults && jenkinsData.testResults.results.length > 0) {
          await this.updateTestResultsFromJenkins(runId, jenkinsData.testResults);
        }
      }

      return true;
    } catch (error) {
      console.error(`Failed to update execution status for runId ${runId}:`, error);
      return false;
    }
  }

  /**
   * 更新测试用例结果
   */
  private async updateTestResultsFromJenkins(runId: number, testResults: TestResults): Promise<void> {
    const pool = getPool();

    for (const result of testResults.results) {
      try {
        // 尝试更新现有记录
        const [updateResult] = await pool.execute(`
          UPDATE Auto_TestRunResults
          SET status = ?, duration = ?, error_message = ?,
              start_time = FROM_UNIXTIME(?), end_time = FROM_UNIXTIME(?)
          WHERE execution_id = ? AND case_id = ?
        `, [
          result.status,
          result.duration,
          result.errorMessage || null,
          result.startTime ? Math.floor(result.startTime / 1000) : Math.floor(Date.now() / 1000),
          result.endTime ? Math.floor(result.endTime / 1000) : Math.floor(Date.now() / 1000),
          runId,
          result.caseId
        ]);

        const affectedRows = (updateResult as any).affectedRows;

        // 如果没有找到记录，插入新记录
        if (affectedRows === 0 && result.caseId > 0) {
          await pool.execute(`
            INSERT INTO Auto_TestRunResults (
              execution_id, case_id, case_name, status, duration, error_message,
              start_time, end_time, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, FROM_UNIXTIME(?), FROM_UNIXTIME(?), NOW())
          `, [
            runId,
            result.caseId,
            result.caseName,
            result.status,
            result.duration,
            result.errorMessage || null,
            result.startTime ? Math.floor(result.startTime / 1000) : Math.floor(Date.now() / 1000),
            result.endTime ? Math.floor(result.endTime / 1000) : Math.floor(Date.now() / 1000)
          ]);
        }
      } catch (error) {
        console.error(`Failed to update test result for case ${result.caseId}:`, error);
      }
    }
  }

  /**
   * 检查并处理超时的执行
   * 超过指定时间仍在运行状态的执行将被标记为超时
   */
  async checkAndHandleTimeouts(timeoutMs: number = 10 * 60 * 1000): Promise<{
    checked: number;
    timedOut: number;
    updated: number;
  }> {
    try {
      // 查找可能超时的执行
      const timeoutThreshold = new Date(Date.now() - timeoutMs);
      const runningExecutions = await query<{
        id: number;
        jenkins_job: string;
        jenkins_build_id: string;
        start_time: Date;
      }[]>(`
        SELECT id, jenkins_job, jenkins_build_id, start_time
        FROM Auto_TestRun
        WHERE status IN ('pending', 'running') AND start_time < ?
      `, [timeoutThreshold]);

      console.log(`Checking ${runningExecutions.length} potentially timed out executions`);

      let timedOutCount = 0;
      let updatedCount = 0;

      for (const execution of runningExecutions) {
        try {
          // 先尝试从Jenkins同步状态
          const syncResult = await this.syncExecutionStatusFromJenkins(execution.id);

          if (syncResult.success && syncResult.updated) {
            updatedCount++;
            console.log(`Updated execution ${execution.id} from Jenkins: ${syncResult.message}`);
            continue;
          }

          // 如果同步失败或没有更新，且确实超时，标记为超时
          if (!syncResult.success) {
            await this.markExecutionAsTimedOut(execution.id);
            timedOutCount++;
            console.log(`Marked execution ${execution.id} as timed out: ${syncResult.message}`);
          }
        } catch (error) {
          console.error(`Failed to handle timeout for execution ${execution.id}:`, error);
        }
      }

      return {
        checked: runningExecutions.length,
        timedOut: timedOutCount,
        updated: updatedCount
      };
    } catch (error) {
      console.error('Failed to check timeouts:', error);
      return { checked: 0, timedOut: 0, updated: 0 };
    }
  }

  /**
   * 标记执行为超时状态
   */
  private async markExecutionAsTimedOut(runId: number): Promise<void> {
    const pool = getPool();

    await pool.execute(`
      UPDATE Auto_TestRun
      SET status = 'aborted', end_time = NOW(),
          duration_ms = TIMESTAMPDIFF(MICROSECOND, start_time, NOW()) / 1000
      WHERE id = ? AND status IN ('pending', 'running')
    `, [runId]);

    console.log(`Execution ${runId} marked as timed out`);
  }

  /**
   * 验证执行状态一致性
   * 比较平台状态与Jenkins状态，返回不一致的执行列表
   */
  async verifyStatusConsistency(limit: number = 50): Promise<{
    total: number;
    inconsistent: Array<{
      runId: number;
      platformStatus: string;
      jenkinsStatus: string;
      buildId: string;
      jobName: string;
    }>;
  }> {
    try {
      // 获取最近的有Jenkins信息的执行记录
      const executions = await query<{
        id: number;
        status: string;
        jenkins_job: string;
        jenkins_build_id: string;
      }[]>(`
        SELECT id, status, jenkins_job, jenkins_build_id
        FROM Auto_TestRun
        WHERE jenkins_job IS NOT NULL AND jenkins_build_id IS NOT NULL
        ORDER BY created_at DESC
        LIMIT ?
      `, [limit]);

      const inconsistent: Array<{
        runId: number;
        platformStatus: string;
        jenkinsStatus: string;
        buildId: string;
        jobName: string;
      }> = [];

      for (const execution of executions) {
        try {
          const buildStatus = await jenkinsStatusService.getBuildStatus(
            execution.jenkins_job,
            execution.jenkins_build_id
          );

          if (buildStatus) {
            const jenkinsStatus = this.mapJenkinsStatusToInternal(buildStatus.result, buildStatus.building);

            if (execution.status !== jenkinsStatus) {
              inconsistent.push({
                runId: execution.id,
                platformStatus: execution.status,
                jenkinsStatus,
                buildId: execution.jenkins_build_id,
                jobName: execution.jenkins_job
              });
            }
          }
        } catch (error) {
          console.error(`Failed to verify consistency for execution ${execution.id}:`, error);
        }
      }

      return {
        total: executions.length,
        inconsistent
      };
    } catch (error) {
      console.error('Failed to verify status consistency:', error);
      return { total: 0, inconsistent: [] };
    }
  }
}

// 导出单例
export const executionService = new ExecutionService();