import { AppDataSource } from '../config/database';
import { jenkinsStatusService, TestResults } from './JenkinsStatusService';
import {
  ExecutionRecord,
  TestResultRecord,
  TestRunRecord,
  MySQLResultMetadata,
  DatabaseQueryResult,
  ExecutionError,
  DbQueryResult
} from '../../shared/types/database';
import {
  batchInsert,
  isMySQLMetadata,
  executeInTransactionNoRelease,
  executeWithSavepoint,
} from '../utils/databaseUtils';
import { EXECUTION_CONFIG, EXECUTION_STATUS, TEST_RESULT_STATUS } from '../config/constants';
import logger from '../utils/logger';
import { LOG_CONTEXTS, createTimer } from '../config/logging';
import { ExecutionRepository } from '../repositories/ExecutionRepository';
import { dashboardService } from './DashboardService';

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
  private executionRepository: ExecutionRepository;

  constructor() {
    this.executionRepository = new ExecutionRepository(AppDataSource);
  }

  /**
   * 更新执行状态为运行中（使用远程数据库表）
   */
  async markExecutionRunning(executionId: number): Promise<void> {
    await this.executionRepository.markExecutionRunning(executionId);
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
      const execution = await this.executionRepository.getExecutionDetail(input.executionId);

      if (!execution) {
        throw new Error(`Execution not found: ${input.executionId}`);
      }

      // 2. 使用 TypeORM 事务处理回调
      await this.executionRepository.runInTransaction(async (queryRunner) => {
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
        if (input.results.length > 0) {
          await this.executionRepository.createTestResults(input.results.map(result => ({
            executionId: input.executionId,
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
          })));
        }

        // 2.3 更新执行记录
        await this.executionRepository.updateExecutionResults(input.executionId, {
          status: input.status,
          passedCases,
          failedCases,
          skippedCases,
          duration: input.duration,
        });

        logger.debug('Execution record updated', {
          executionId: input.executionId,
          statistics: {
            passed: passedCases,
            failed: failedCases,
            skipped: skippedCases,
          }
        }, LOG_CONTEXTS.EXECUTION);
      });

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
    return this.executionRepository.getExecutionDetail(executionId);
  }

  /**
   * 获取最近执行记录（使用远程数据库表）
   */
  async getRecentExecutions(limit = 10) {
    return this.executionRepository.getRecentExecutions(limit);
  }

  /**
   * 取消执行（使用远程数据库表）
   */
  async cancelExecution(executionId: number) {
    await this.executionRepository.cancelExecution(executionId);
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
      // 1. 验证用例是否存在
      if (input.caseIds.length === 0) {
        throw new Error('Case IDs cannot be empty');
      }

      // 2. 使用 ExecutionRepository 的事务方法触发执行
      const result = await this.executionRepository.triggerExecution({
        caseIds: input.caseIds,
        projectId: input.projectId,
        triggeredBy: input.triggeredBy,
        triggerType: input.triggerType,
        jenkinsJob: input.jenkinsJob,
        runConfig: input.runConfig,
      });

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
  async getBatchExecution(runId: number) {
    const execution = await this.executionRepository.getTestRunDetail(runId);

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

      const results = await this.executionRepository.getExecutionResults(executionId);

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
    await this.executionRepository.updateJenkinsInfo(runId, jenkinsInfo);
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
    status: 'success' | 'failed' | 'cancelled';
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
      const execution = await this.executionRepository.getTestRunDetail(runId);

      if (!execution) {
        throw new Error(`Execution not found: runId=${runId}`);
      }

      logger.debug('Found execution record', {
        runId,
        currentStatus: execution.status,
      }, LOG_CONTEXTS.EXECUTION);

      // 2. 使用 ExecutionRepository 完成批次执行
      await this.executionRepository.completeBatch(runId, results);

      // 3. 触发每日汇总数据刷新（异步，不影响主流程）
      try {
        const executionDate = new Date().toISOString().split('T')[0]; // YYYY-MM-DD 格式
        await dashboardService.refreshDailySummary(executionDate);
        logger.debug('Daily summary refreshed after execution completion', {
          runId,
          executionDate,
        }, LOG_CONTEXTS.EXECUTION);
      } catch (summaryError) {
        // 记录错误但不影响主流程
        logger.warn('Failed to refresh daily summary after execution completion', {
          runId,
          error: summaryError instanceof Error ? summaryError.message : String(summaryError),
        }, LOG_CONTEXTS.EXECUTION);
      }

      const duration = timer();
      logger.info('Batch execution completed successfully', {
        runId,
        status: results.status,
        durationMs: duration,
        timestamp: new Date().toISOString(),
      }, LOG_CONTEXTS.EXECUTION);

    } catch (error: unknown) {
      const duration = timer();

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
    const batch = await this.executionRepository.getTestRunBasicInfo(runId);

    if (!batch) {
      throw new Error(`Batch not found: ${runId}`);
    }

    // 注意：这里需要补充存储关联用例ID的逻辑
    // 如果在 Auto_TestRun 中添加 case_ids 字段，可以解析获取用例
    return { totalCases: batch.totalCases };
  }

  /**
   * 获取所有测试运行记录（Auto_TestRun 表）
   */
  async getAllTestRuns(limit = 50, offset = 0) {
    return this.executionRepository.getAllTestRuns(limit, offset);
  }

  /**
   * 获取测试运行的用例列表（供 Jenkins 使用）
   * 注意：由于没有远程 tasks 表，改为从 Auto_TestRun 获取关联的用例
   */
  async getRunCases(runId: number) {
    return this.executionRepository.getRunCases(runId);
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
      const execution = await this.executionRepository.getTestRunStatus(runId);

      if (!execution) {
        return {
          success: false,
          updated: false,
          message: `Execution not found: ${runId}`
        };
      }

      // 2. 检查是否有 Jenkins 信息
      if (!execution.jenkinsJob || !execution.jenkinsBuildId) {
        return {
          success: false,
          updated: false,
          message: 'No Jenkins job information available for this execution'
        };
      }

      // 3. 查询 Jenkins 构建状态
      const buildStatus = await jenkinsStatusService.getBuildStatus(
        execution.jenkinsJob,
        execution.jenkinsBuildId
      );

      if (!buildStatus) {
        return {
          success: false,
          updated: false,
          message: `Failed to get Jenkins build status for ${execution.jenkinsJob}/${execution.jenkinsBuildId}`
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
          execution.jenkinsJob,
          execution.jenkinsBuildId
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
        return 'cancelled';
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
    try {
      // 1. 更新 Auto_TestRun 状态
      if (jenkinsData.building) {
        // 如果还在构建中，只更新为 running 状态
        await this.executionRepository.updateTestRunStatus(runId, 'running');
      } else {
        // 构建完成，更新最终状态
        await this.executionRepository.updateTestRunStatus(runId, jenkinsData.status, {
          durationMs: jenkinsData.duration,
          passedCases: jenkinsData.testResults?.passedCases,
          failedCases: jenkinsData.testResults?.failedCases,
          skippedCases: jenkinsData.testResults?.skippedCases,
        });

        // 2. 如果有详细测试结果，更新 Auto_TestRunResults
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
    // 首先找到关联的 executionId
    const executionId = await this.executionRepository.findExecutionId();
    
    if (!executionId) {
      throw new Error(`Could not find executionId for runId ${runId}`);
    }

    for (const result of testResults.results) {
      try {
        const startTime = result.startTime ? new Date(result.startTime) : new Date();
        const endTime = result.endTime ? new Date(result.endTime) : new Date();

        // 尝试更新现有记录
        const updated = await this.executionRepository.updateTestResult(executionId, result.caseId, {
          status: result.status,
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

        // 如果没有找到记录，插入新记录
        if (!updated && result.caseId > 0) {
          await this.executionRepository.createTestResult({
            executionId,
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
            startTime,
            endTime,
          });
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
      const runningExecutions = await this.executionRepository.getPotentiallyTimedOutExecutions(timeoutThreshold);

      console.log(`Checking ${runningExecutions.length} potentially timed out executions`);

      let timedOutCount = 0;
      let updatedCount = 0;

      for (const execution of runningExecutions) {
        try {
          // 先尝试从 Jenkins 同步状态
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
    await this.executionRepository.markExecutionAsTimedOut(runId);
    console.log(`Execution ${runId} marked as timed out`);
  }

  /**
   * 验证执行状态一致性
   * 比较平台状态与 Jenkins 状态，返回不一致的执行列表
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
      // 获取最近的有 Jenkins 信息的执行记录
      const executions = await this.executionRepository.getExecutionsWithJenkinsInfo(limit);

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
            execution.jenkinsJob,
            execution.jenkinsBuildId
          );

          if (buildStatus) {
            const jenkinsStatus = this.mapJenkinsStatusToInternal(buildStatus.result, buildStatus.building);

            if (execution.status !== jenkinsStatus) {
              inconsistent.push({
                runId: execution.id,
                platformStatus: execution.status,
                jenkinsStatus,
                buildId: execution.jenkinsBuildId,
                jobName: execution.jenkinsJob
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