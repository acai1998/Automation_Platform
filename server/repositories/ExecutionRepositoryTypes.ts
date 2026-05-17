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
 * 历史卡住执行汇总
 */
export interface StaleExecutionSummary {
  stalePendingNoStartCount: number;
  staleStartedCount: number;
  totalStaleCount: number;
  latestStalePendingCreatedAt: Date | null;
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
  executionId: number | null;
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
export interface BatchCaseResult {
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
export interface BatchResults {
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
