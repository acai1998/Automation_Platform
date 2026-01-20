/**
 * 应用程序常量定义
 * 用于集中管理所有硬编码的配置值
 */

/**
 * 执行相关的配置常量
 */
export const EXECUTION_CONFIG = {
  // 执行超时设置
  TIMEOUT_MS: 10 * 60 * 1000,              // 10 分钟：执行超过此时间被标记为超时
  TIME_TOLERANCE_MS: 60 * 1000,             // 60 秒：executionId 查找时的时间容差
  
  // 批量操作配置
  MAX_BATCH_INSERT_SIZE: 1000,              // 单次批量插入的最大行数
  MAX_BATCH_UPDATE_SIZE: 100,               // 单次批量更新的最大行数
  
  // 轮询配置
  POLLING_INTERVAL_MS: 3000,                // 前端轮询间隔：3 秒
  MAX_POLLING_ATTEMPTS: 1200,               // 最大轮询次数（3s × 1200 = 1小时）
};

/**
 * 执行状态定义
 */
export const EXECUTION_STATUS = {
  PENDING: 'pending',
  RUNNING: 'running',
  SUCCESS: 'success',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
  ABORTED: 'aborted',
  TIMEOUT: 'timeout',
  ERROR: 'error',
} as const;

/**
 * 测试结果状态
 */
export const TEST_RESULT_STATUS = {
  PASSED: 'passed',
  FAILED: 'failed',
  SKIPPED: 'skipped',
  ERROR: 'error',
} as const;

/**
 * 触发类型
 */
export const TRIGGER_TYPE = {
  MANUAL: 'manual',
  JENKINS: 'jenkins',
  SCHEDULE: 'schedule',
  CI_TRIGGERED: 'ci_triggered',
} as const;

/**
 * 测试用例类型
 */
export const CASE_TYPE = {
  API: 'api',
  UI: 'ui',
  PERFORMANCE: 'performance',
} as const;

/**
 * Jenkins 相关配置
 */
export const JENKINS_CONFIG = {
  // 构建结果映射
  RESULT_MAPPING: {
    SUCCESS: 'success',
    FAILURE: 'failed',
    UNSTABLE: 'failed',
    ABORTED: 'aborted',
    NOT_BUILT: 'pending',
  } as const,
};

/**
 * 数据库相关常量
 */
export const DATABASE_CONFIG = {
  // 表名
  TABLES: {
    TEST_RUN: 'Auto_TestRun',
    TEST_CASE: 'Auto_TestCase',
    TEST_RUN_RESULTS: 'Auto_TestRunResults',
    TEST_CASE_TASK_EXECUTIONS: 'Auto_TestCaseTaskExecutions',
    DAILY_SUMMARIES: 'Auto_TestCaseDailySummaries',
    USERS: 'Auto_Users',
  },
  
  // 查询超时时间
  QUERY_TIMEOUT_MS: 30000,
  CONNECTION_TIMEOUT_MS: 10000,
  IDLE_TIMEOUT_MS: 60000,
};

/**
 * 日志相关常量
 */
export const LOG_CONFIG = {
  // 日志级别
  LEVEL: {
    DEBUG: 'debug',
    INFO: 'info',
    WARN: 'warn',
    ERROR: 'error',
  },
  
  // 敏感字段（在日志中应该被掩盖）
  SENSITIVE_FIELDS: [
    'password',
    'token',
    'secret',
    'apiKey',
    'jenkins_token',
  ],
};

/**
 * API 响应码
 */
export const API_RESPONSE_CODE = {
  SUCCESS: 200,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  INTERNAL_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
};

/**
 * 错误消息模板
 */
export const ERROR_MESSAGES = {
  EXECUTION_NOT_FOUND: 'Execution not found: {id}',
  INVALID_CASE_IDS: 'Case IDs cannot be empty',
  NO_ACTIVE_CASES: 'No active test cases found with IDs: {ids}',
  TRANSACTION_FAILED: 'Transaction failed: {error}',
  BATCH_OPERATION_FAILED: 'Batch {operation} operation failed: {error}',
  JENKINS_CONNECTION_FAILED: 'Failed to connect to Jenkins: {error}',
};

export default {
  EXECUTION_CONFIG,
  EXECUTION_STATUS,
  TEST_RESULT_STATUS,
  TRIGGER_TYPE,
  CASE_TYPE,
  JENKINS_CONFIG,
  DATABASE_CONFIG,
  LOG_CONFIG,
  API_RESPONSE_CODE,
  ERROR_MESSAGES,
};
