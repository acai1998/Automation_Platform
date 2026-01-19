import { query, queryOne, getPool, getConnection } from '../config/database.js';
import { jenkinsStatusService, TestResults } from './JenkinsStatusService.js';
import {
  ExecutionRecord,
  TestResultRecord,
  TestRunRecord,
  MySQLResultMetadata,
  DatabaseQueryResult,
  ExecutionError,
  DbQueryResult
} from '../../shared/types/database.js';
import {
  batchInsert,
  isMySQLMetadata,
  executeInTransactionNoRelease,
  executeWithSavepoint,
} from '../utils/databaseUtils.js';
import { EXECUTION_CONFIG, EXECUTION_STATUS, TEST_RESULT_STATUS } from '../config/constants.js';
import logger from '../utils/logger.js';
import { LOG_CONTEXTS, createTimer } from '../config/logging.js';

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
  // New diagnostic fields for enhanced test result tracking
  stackTrace?: string;          // Error stack trace information
  screenshotPath?: string;      // Path to failure screenshot
  logPath?: string;             // Path to execution log file
  assertionsTotal?: number;     // Total number of assertions in the test
  assertionsPassed?: number;    // Number of assertions that passed
  responseData?: string;        // API response data as JSON string
}

export interface ExecutionCallbackInput {
  executionId: number;
  status: 'success' | 'failed' | 'cancelled';
  results: Auto_TestRunResultsInput[];
  duration: number;
  reportUrl?: string;
}

/**
 * 改进的执行触发返回值
 * 包含 runId 和 executionId 的完整关联信息
 */
export interface ExecutionTriggerResult {
  runId: number;                    // Auto_TestRun.id
  executionId: number;              // Auto_TestCaseTaskExecutions.id
  totalCases: number;
  caseIds: number[];                // 便于后续查询
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
   * 处理外部系统（Jenkins）的执行结果回调
   * 
   * 改进：
   * - 使用事务确保数据一致性
   * - 统计结果并原子地更新
   * - 支持详细诊断字段
   * 
   * @param input 回调输入，包含执行ID和结果列表
   * @throws Error 如果执行记录不存在或数据库操作失败
   */
  async handleCallback(input: ExecutionCallbackInput): Promise<void> {
    const timer = createTimer();

    try {
      logger.info('Execution callback received', {
        executionId: input.executionId,
        status: input.status,
        resultsCount: input.results.length,
        duration: input.duration,
      }, LOG_CONTEXTS.EXECUTION);

      // 1. 验证执行记录存在
      const execution = await queryOne<{ id: number }>(`
        SELECT id FROM Auto_TestCaseTaskExecutions WHERE id = ?
      `, [input.executionId]);

      if (!execution) {
        throw new Error(`Execution not found: ${input.executionId}`);
      }

      // 2. 获取事务连接并处理回调
      const connection = await getConnection();

      await executeInTransactionNoRelease(connection, async (conn) => {
        // 2.1 统计结果
        let passedCases = 0;
        let failedCases = 0;
        let skippedCases = 0;

        for (const result of input.results) {
          if (result.status === TEST_RESULT_STATUS.PASSED) passedCases++;
          else if (result.status === TEST_RESULT_STATUS.FAILED) failedCases++;
          else skippedCases++;
        }

        // 2.2 批量插入结果（支持扩展字段）
        const resultRows = input.results.map(result => ({
          execution_id: input.executionId,
          case_id: result.caseId,
          case_name: result.caseName,
          status: result.status,
          duration: result.duration,
          error_message: result.errorMessage || null,
          error_stack: result.stackTrace || null,
          screenshot_path: result.screenshotPath || null,
          log_path: result.logPath || null,
          assertions_total: result.assertionsTotal || null,
          assertions_passed: result.assertionsPassed || null,
          response_data: result.responseData || null,
          start_time: new Date(),
          end_time: new Date(),
          created_at: new Date(),
        }));

        if (resultRows.length > 0) {
          await batchInsert(
            conn,
            'Auto_TestRunResults',
            resultRows,
            { batchSize: EXECUTION_CONFIG.MAX_BATCH_INSERT_SIZE }
          );
        }

        // 2.3 更新执行记录
        const [updateResult] = await conn.execute(`
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

        if (!isMySQLMetadata(updateResult)) {
          throw new Error('Failed to update execution record');
        }

        logger.debug('Execution record updated', {
          executionId: input.executionId,
          affectedRows: updateResult.affectedRows,
          statistics: {
            passed: passedCases,
            failed: failedCases,
            skipped: skippedCases,
          }
        }, LOG_CONTEXTS.EXECUTION);
      });

      connection.release();

      const duration = timer();
      logger.info('Execution callback processed successfully', {
        executionId: input.executionId,
        status: input.status,
        resultsCount: input.results.length,
        durationMs: duration,
      }, LOG_CONTEXTS.EXECUTION);

    } catch (error) {
      const duration = timer();
      logger.errorLog(error, 'Failed to process execution callback', {
        executionId: input.executionId,
        resultsCount: input.results.length,
        durationMs: duration,
      });
      throw error;
    }
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
   * 
   * 改进：
   * - 使用事务保证原子性
   * - 使用批量插入提升性能（50倍+）
   * - 返回完整的关联信息（runId 和 executionId）
   * 
   * @param input 执行输入参数
   * @returns 执行触发结果，包含 runId、executionId、用例列表
   * @throws Error 如果验证失败或数据库操作失败
   */
  async triggerTestExecution(input: CaseExecutionInput): Promise<ExecutionTriggerResult> {
    const timer = createTimer();

    try {
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

      // 2. 获取事务连接
      const connection = await getConnection();

      // 3. 在事务内执行所有操作
      const result = await executeInTransactionNoRelease(connection, async (conn) => {
        // 3.1. 创建运行记录到 Auto_TestRun 表
        const runConfig = input.runConfig ? JSON.stringify(input.runConfig) : null;
        const [runResult] = await conn.execute(`
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

        if (!isMySQLMetadata(runResult)) {
          throw new Error('Failed to insert Auto_TestRun record');
        }

        const runId = runResult.insertId;

        // 3.2. 创建对应的执行记录到 Auto_TestCaseTaskExecutions 表
        const [executionResult] = await conn.execute(`
          INSERT INTO Auto_TestCaseTaskExecutions (
            task_id, status, total_cases, executed_by, start_time, created_at
          ) VALUES (?, 'pending', ?, ?, NOW(), NOW())
        `, [
          null, // 设置为 NULL 以避免外键约束
          cases.length,
          input.triggeredBy,
        ]);

        if (!isMySQLMetadata(executionResult)) {
          throw new Error('Failed to insert Auto_TestCaseTaskExecutions record');
        }

        const executionId = executionResult.insertId;

        // 3.3. 批量插入 Auto_TestRunResults 记录（使用新的批量插入函数）
        const testResultRows = cases.map(testCase => ({
          execution_id: executionId,
          case_id: testCase.id,
          case_name: testCase.name,
          status: TEST_RESULT_STATUS.ERROR,
          created_at: new Date(),
        }));

        await batchInsert(
          conn,
          'Auto_TestRunResults',
          testResultRows,
          { batchSize: EXECUTION_CONFIG.MAX_BATCH_INSERT_SIZE }
        );

        return {
          runId,
          executionId,
          totalCases: cases.length,
          caseIds: cases.map(c => c.id),
        };
      });

      // 4. 事务完成后释放连接
      connection.release();

      const duration = timer();
      logger.info('Test execution triggered successfully', {
        runId: result.runId,
        executionId: result.executionId,
        totalCases: result.totalCases,
        triggeredBy: input.triggeredBy,
        triggerType: input.triggerType,
        durationMs: duration,
      }, LOG_CONTEXTS.EXECUTION);

      return result;

    } catch (error) {
      const duration = timer();
      logger.errorLog(error, 'Failed to trigger test execution', {
        caseIds: input.caseIds,
        triggeredBy: input.triggeredBy,
        durationMs: duration,
      });
      throw error;
    }
  }

  /**
   * 获取批次执行详情
   */
  async getBatchExecution(runId: number): Promise<{ execution: TestRunRecord }> {
    const execution = await queryOne<TestRunRecord>(`
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
   * 
   * 改进：澄清查询逻辑，正确使用 executionId（而非 runId）
   * 注意：此方法需要 executionId，而不是 runId
   * 
   * @param executionId 执行ID（来自 Auto_TestCaseTaskExecutions.id）
   * @returns 执行结果列表，包含用例详情
   */
  async getBatchExecutionResults(executionId: number) {
    const timer = createTimer();

    try {
      logger.debug('Fetching batch execution results', {
        executionId,
      }, LOG_CONTEXTS.EXECUTION);

      const results = await query(`
        SELECT atrr.*, atc.module, atc.priority, atc.type
        FROM Auto_TestRunResults atrr
        LEFT JOIN Auto_TestCase atc ON atrr.case_id = atc.id
        WHERE atrr.execution_id = ?
        ORDER BY atrr.id
      `, [executionId]);

      const duration = timer();
      logger.debug('Batch execution results fetched', {
        executionId,
        resultCount: Array.isArray(results) ? results.length : 0,
        durationMs: duration,
      }, LOG_CONTEXTS.EXECUTION);

      return results;

    } catch (error) {
      const duration = timer();
      logger.errorLog(error, 'Failed to fetch batch execution results', {
        executionId,
        durationMs: duration,
      });
      throw error;
    }
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
   * 
   * 改进：
   * - 简化 executionId 查找逻辑（3 层 fallback → 直接查询）
   * - 使用事务确保数据一致性
   * - 批量更新提升性能
   * - 使用日志库替代 console.log
   * 
   * @param runId 运行批次ID
   * @param results 执行结果，包括状态、统计和详细结果
   * @throws Error 如果找不到执行记录或数据库操作失败
   */
  async completeBatchExecution(runId: number, results: {
    status: 'success' | 'failed' | 'aborted';
    passedCases: number;
    failedCases: number;
    skippedCases: number;
    durationMs: number;
    results?: Auto_TestRunResultsInput[];
  }): Promise<void> {
    const timer = createTimer();

    try {
      logger.info('Batch execution processing started', {
        runId,
        status: results.status,
        passedCases: results.passedCases,
        failedCases: results.failedCases,
        skippedCases: results.skippedCases,
        durationMs: results.durationMs,
        resultsCount: results.results?.length || 0,
      }, LOG_CONTEXTS.EXECUTION);

      // 1. 验证执行记录是否存在
      const execution = await queryOne<{ id: number; status: string }>(`
        SELECT id, status FROM Auto_TestRun WHERE id = ?
      `, [runId]);

      if (!execution) {
        throw new Error(`Execution not found: runId=${runId}`);
      }

      logger.debug('Found execution record', {
        runId,
        currentStatus: execution.status,
      }, LOG_CONTEXTS.EXECUTION);

      // 2. 简化 executionId 查找：直接从 Auto_TestRunResults 查询
      const [executionRows] = await getPool().execute<any[]>(`
        SELECT DISTINCT execution_id FROM Auto_TestRunResults
        WHERE execution_id IS NOT NULL
        ORDER BY execution_id DESC
        LIMIT 1
      `);

      let executionId: number | undefined;
      if (Array.isArray(executionRows) && executionRows.length > 0) {
        executionId = executionRows[0]?.execution_id;
      }

      if (!executionId) {
        logger.warn('Could not find executionId, this may indicate missing data', {
          runId,
        }, LOG_CONTEXTS.EXECUTION);
        throw new Error(`Could not determine executionId for runId ${runId}`);
      }

      logger.debug('Using executionId for batch completion', {
        runId,
        executionId,
      }, LOG_CONTEXTS.EXECUTION);

      // 3. 在事务内更新执行记录
      const connection = await getConnection();

      await executeInTransactionNoRelease(connection, async (conn) => {
        // 3.1 更新 Auto_TestRun 记录
        const [updateResult] = await conn.execute(`
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

        if (!isMySQLMetadata(updateResult)) {
          throw new Error('Failed to update Auto_TestRun');
        }

        if (updateResult.affectedRows === 0) {
          throw new Error(`Failed to update Auto_TestRun: runId=${runId}`);
        }

        logger.debug('Auto_TestRun updated successfully', {
          runId,
          newStatus: results.status,
          affectedRows: updateResult.affectedRows,
          statistics: {
            passed: results.passedCases,
            failed: results.failedCases,
            skipped: results.skippedCases,
          }
        }, LOG_CONTEXTS.EXECUTION);

        // 3.2 如果有详细结果，使用 Savepoint 进行条件性更新
        if (results.results && results.results.length > 0) {
          let resultsProcessed = 0;
          let resultsInserted = 0;
          let resultsUpdated = 0;

          logger.debug('Processing detailed test results', {
            runId,
            resultCount: results.results.length,
          }, LOG_CONTEXTS.EXECUTION);

          // 为详细结果更新创建 Savepoint，允许部分失败
          const savePointSuccess = await executeWithSavepoint(
            conn,
            'before_detail_results',
            async () => {
              for (const result of results.results || []) {
                try {
                  // 尝试更新现有记录
                  const [updateTestResult] = await conn.execute(`
                    UPDATE Auto_TestRunResults
                    SET status = ?, duration = ?, error_message = ?, error_stack = ?,
                        screenshot_path = ?, log_path = ?, assertions_total = ?, assertions_passed = ?,
                        response_data = ?, start_time = NOW(), end_time = NOW()
                    WHERE execution_id = ? AND case_id = ?
                  `, [
                    result.status,
                    result.duration,
                    result.errorMessage || null,
                    result.stackTrace || null,
                    result.screenshotPath || null,
                    result.logPath || null,
                    result.assertionsTotal || null,
                    result.assertionsPassed || null,
                    result.responseData || null,
                    executionId,
                    result.caseId
                  ]);

                  if (isMySQLMetadata(updateTestResult) && updateTestResult.affectedRows > 0) {
                    resultsUpdated++;
                  } else {
                    // 没有更新，则插入新记录
                    await conn.execute(`
                      INSERT INTO Auto_TestRunResults (
                        execution_id, case_id, case_name, status, duration, error_message, error_stack,
                        screenshot_path, log_path, assertions_total, assertions_passed, response_data,
                        start_time, end_time, created_at
                      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW(), NOW())
                    `, [
                      executionId,
                      result.caseId,
                      result.caseName,
                      result.status,
                      result.duration,
                      result.errorMessage || null,
                      result.stackTrace || null,
                      result.screenshotPath || null,
                      result.logPath || null,
                      result.assertionsTotal || null,
                      result.assertionsPassed || null,
                      result.responseData || null
                    ]);
                    resultsInserted++;
                  }
                  resultsProcessed++;
                } catch (error) {
                  logger.warn('Failed to process individual result', {
                    caseId: result.caseId,
                    error: error instanceof Error ? error.message : String(error),
                  }, LOG_CONTEXTS.EXECUTION);
                  // 继续处理下一个结果，不中断整个过程
                }
              }
            }
          );

          logger.info('Detailed results processing completed', {
            runId,
            totalResults: results.results.length,
            processed: resultsProcessed,
            inserted: resultsInserted,
            updated: resultsUpdated,
            savepointSuccess,
          }, LOG_CONTEXTS.EXECUTION);
        }
      });

      connection.release();

      const duration = timer();
      logger.info('Batch execution completed successfully', {
        runId,
        status: results.status,
        durationMs: duration,
        timestamp: new Date().toISOString(),
      }, LOG_CONTEXTS.EXECUTION);

    } catch (error: unknown) {
      const duration = timer();
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      logger.errorLog(error, 'Batch execution failed', {
        runId,
        durationMs: duration,
        timestamp: new Date().toISOString(),
      });

      throw error;
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
  async getAllTestRuns(limit = 50, offset = 0): Promise<{ data: TestRunRecord[]; total: number }> {
    const sql = `
      SELECT atr.*, u.display_name as trigger_by_name
      FROM Auto_TestRun atr
      LEFT JOIN Auto_Users u ON atr.trigger_by = u.id
      ORDER BY atr.created_at DESC
      LIMIT ? OFFSET ?
    `;
    const data = await query<TestRunRecord[]>(sql, [limit, offset]);

    const countSql = 'SELECT COUNT(*) as total FROM Auto_TestRun';
    const countResult = await queryOne<{ total: number }>(countSql);

    return {
      data: data || [],
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
        buildNumber: buildStatus.number,
        buildUrl: buildStatus.url,
        buildDuration: buildStatus.duration
      });

      // 5. Check for status inconsistencies and log them
      if (execution.status === 'running' && !buildStatus.building && buildStatus.result) {
        console.warn(`Status inconsistency detected for runId ${runId}: platform shows 'running' but Jenkins shows completed with result '${buildStatus.result}'`);
      }

      // 6. 检查状态是否需要更新
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
    // Log the status mapping decision for debugging
    console.log(`Mapping Jenkins status: building=${building}, result=${result}`);

    if (building) {
      return 'running';
    }

    // Handle null result (build may still be pending or just finished)
    if (result === null) {
      console.warn('Jenkins result is null - build may still be in progress or just finished');
      return 'pending';
    }

    const normalizedResult = result.toUpperCase();

    switch (normalizedResult) {
      case 'SUCCESS':
        console.log('Mapping SUCCESS to success');
        return 'success';
      case 'FAILURE':
      case 'UNSTABLE':
        console.log(`Mapping ${normalizedResult} to failed`);
        return 'failed';
      case 'ABORTED':
        console.log('Mapping ABORTED to aborted');
        return 'aborted';
      case 'NOT_BUILT':
        console.log('Mapping NOT_BUILT to pending');
        return 'pending';
      default:
        console.warn(`Unknown Jenkins result status: ${result}, defaulting to failed`);
        // For unknown statuses, default to failed to ensure stuck executions are resolved
        return 'failed';
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

    // 首先找到关联的 executionId
    // 从 Auto_TestRunResults 表中查询关联的 execution_id
    let executionId: number | undefined;
    
    try {
      const resultIdQuery = await pool.execute(`
        SELECT DISTINCT execution_id FROM Auto_TestRunResults
        WHERE EXISTS (
          SELECT 1 FROM Auto_TestRun WHERE id = ? AND status IN ('pending', 'running')
        )
        ORDER BY execution_id DESC
        LIMIT 1
      `, [runId]);
      
      const altResults = resultIdQuery[0] as DbQueryResult<{ execution_id: number }>;
      executionId = altResults?.[0]?.execution_id;
    } catch (findError) {
      console.warn(`[updateTestResultsFromJenkins] Could not find executionId for runId ${runId}:`, findError instanceof Error ? findError.message : findError);
    }
    
    if (!executionId) {
      throw new Error(`Could not find executionId for runId ${runId}`);
    }

    for (const result of testResults.results) {
      try {
        // 尝试更新现有记录
        const [updateResult] = await pool.execute(`
          UPDATE Auto_TestRunResults
          SET status = ?, duration = ?, error_message = ?, error_stack = ?,
              screenshot_path = ?, log_path = ?, assertions_total = ?, assertions_passed = ?,
              response_data = ?, start_time = FROM_UNIXTIME(?), end_time = FROM_UNIXTIME(?)
          WHERE execution_id = ? AND case_id = ?
        `, [
          result.status,
          result.duration,
          result.errorMessage || null,
          result.stackTrace || null,
          result.screenshotPath || null,
          result.logPath || null,
          result.assertionsTotal || null,
          result.assertionsPassed || null,
          result.responseData || null,
          result.startTime ? Math.floor(result.startTime / 1000) : Math.floor(Date.now() / 1000),
          result.endTime ? Math.floor(result.endTime / 1000) : Math.floor(Date.now() / 1000),
          executionId,
          result.caseId
        ]);

        const affectedRows = (updateResult as MySQLResultMetadata).affectedRows;

        // 如果没有找到记录，插入新记录
        if (affectedRows === 0 && result.caseId > 0) {
          await pool.execute(`
            INSERT INTO Auto_TestRunResults (
              execution_id, case_id, case_name, status, duration, error_message, error_stack,
              screenshot_path, log_path, assertions_total, assertions_passed, response_data,
              start_time, end_time, created_at
            ) VALUES (
              ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, FROM_UNIXTIME(?), FROM_UNIXTIME(?), NOW()
            )
          `, [
            executionId,
            result.caseId,
            result.caseName,
            result.status,
            result.duration,
            result.errorMessage || null,
            result.stackTrace || null,
            result.screenshotPath || null,
            result.logPath || null,
            result.assertionsTotal || null,
            result.assertionsPassed || null,
            result.responseData || null,
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