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
import { ExecutionRepositoryLookup } from './ExecutionRepositoryLookup';
import { ExecutionRepositoryBase } from './ExecutionRepositoryBase';
import type {
  BatchResults,
  ExecutionDetail,
  ExecutionResultRow,
  ExecutionWithJenkinsInfo,
  PotentiallyTimedOutExecution,
  RecentExecution,
  StaleExecutionSummary,
  StuckExecution,
  TestRunBasicInfo,
  TestRunRow,
  TestRunStatusInfo,
  TestRunWithUser,
} from './ExecutionRepositoryTypes';
export abstract class ExecutionRepositoryStatusUtilities extends ExecutionRepositoryLookup {
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

  protected mapStatusForTestRun(status: string): 'pending' | 'running' | 'success' | 'failed' | 'aborted' {
    // 将 'cancelled' 映射为 'aborted' 以匹配 TestRun 的枚举
    if (status === 'cancelled') {
      return 'aborted';
    }
    return status as 'pending' | 'running' | 'success' | 'failed' | 'aborted';
  }

  /**
   * 归一化回调中的单用例状态，避免非标准值导致写库失败并残留占位 error。
   */
  protected normalizeCaseResultStatus(status: string): TestRunResultStatusType {
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
}
