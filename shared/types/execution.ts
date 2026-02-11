/**
 * 执行相关的共享类型定义
 * 
 * 此文件定义了跨前后端的执行、测试运行等相关的枚举和类型
 */

// ============================================================================
// 枚举类型定义
// ============================================================================

/**
 * TestRun 状态枚举
 */
export enum TestRunStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  SUCCESS = 'success',
  FAILED = 'failed',
  ABORTED = 'aborted',
}

/**
 * TaskExecution 状态枚举
 */
export enum TaskExecutionStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  SUCCESS = 'success',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

/**
 * TestRunResult 状态枚举
 */
export enum TestRunResultStatus {
  PASSED = 'passed',
  FAILED = 'failed',
  SKIPPED = 'skipped',
  ERROR = 'error',
}

/**
 * 触发类型枚举（TestRun）
 */
export enum TestRunTriggerType {
  MANUAL = 'manual',
  JENKINS = 'jenkins',
  SCHEDULE = 'schedule',
}

/**
 * 触发类型枚举（TaskExecution）
 */
export enum TaskExecutionTriggerType {
  MANUAL = 'manual',
  SCHEDULED = 'scheduled',
  CI_TRIGGERED = 'ci_triggered',
}

// ============================================================================
// 类型别名（用于保持向后兼容性）
// ============================================================================

export type TestRunStatusType = `${TestRunStatus}`;
export type TaskExecutionStatusType = `${TaskExecutionStatus}`;
export type TestRunResultStatusType = `${TestRunResultStatus}`;
export type TestRunTriggerTypeType = `${TestRunTriggerType}`;
export type TaskExecutionTriggerTypeType = `${TaskExecutionTriggerType}`;

// ============================================================================
// 状态转换映射
// ============================================================================

/**
 * 将 TaskExecution 状态映射到 TestRun 状态
 * 主要用于处理 'cancelled' -> 'aborted' 的映射
 */
export function mapTaskExecutionStatusToTestRunStatus(
  status: TaskExecutionStatusType | TestRunStatusType
): TestRunStatusType {
  if (status === TaskExecutionStatus.CANCELLED || status === 'cancelled') {
    return TestRunStatus.ABORTED;
  }
  return status as TestRunStatusType;
}

/**
 * 将 TestRun 状态映射到 TaskExecution 状态
 */
export function mapTestRunStatusToTaskExecutionStatus(
  status: TestRunStatusType | TaskExecutionStatusType
): TaskExecutionStatusType {
  if (status === TestRunStatus.ABORTED || status === 'aborted') {
    return TaskExecutionStatus.CANCELLED;
  }
  return status as TaskExecutionStatusType;
}

// ============================================================================
// 状态校验函数
// ============================================================================

/**
 * 检查是否是有效的 TestRun 状态
 */
export function isValidTestRunStatus(status: string): status is TestRunStatusType {
  return Object.values(TestRunStatus).includes(status as TestRunStatus);
}

/**
 * 检查是否是有效的 TaskExecution 状态
 */
export function isValidTaskExecutionStatus(status: string): status is TaskExecutionStatusType {
  return Object.values(TaskExecutionStatus).includes(status as TaskExecutionStatus);
}

/**
 * 检查是否是有效的 TestRunResult 状态
 */
export function isValidTestRunResultStatus(status: string): status is TestRunResultStatusType {
  return Object.values(TestRunResultStatus).includes(status as TestRunResultStatus);
}

/**
 * 检查执行是否处于活跃状态（pending 或 running）
 */
export function isActiveStatus(status: TestRunStatusType | TaskExecutionStatusType): boolean {
  return status === 'pending' || status === 'running';
}

/**
 * 检查执行是否已完成（非 pending/running）
 */
export function isCompletedStatus(status: TestRunStatusType | TaskExecutionStatusType): boolean {
  return !isActiveStatus(status);
}
