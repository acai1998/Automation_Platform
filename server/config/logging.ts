import logger, { LogLevel } from '../utils/logger';

// 日志配置常量
export const LOG_CONTEXTS = {
  HTTP: 'HTTP',
  DATABASE: 'DATABASE',
  JENKINS: 'JENKINS',
  AUTH: 'AUTH',
  EXECUTION: 'EXECUTION',
  BATCH_EXECUTION: 'BATCH-EXECUTION',
  MANUAL_SYNC: 'MANUAL-SYNC',
  BULK_SYNC: 'BULK-SYNC',
  STUCK_QUERY: 'STUCK-QUERY',
  SCHEDULER: 'SCHEDULER',
  MONITOR: 'MONITOR',
  REPOSITORY: 'REPOSITORY',
  DASHBOARD: 'DASHBOARD',
  CASES: 'CASES',
  TASKS: 'TASKS',
  EMAIL: 'EMAIL',
  SCRIPT_PARSER: 'SCRIPT-PARSER',
  HYBRID_SYNC: 'HYBRID-SYNC',
  WEBSOCKET: 'WEBSOCKET',
  PERFORMANCE: 'PERFORMANCE',
  AUDIT: 'AUDIT',
  ERROR: 'ERROR',
  SECURITY: 'SECURITY',
} as const;

/**
 * 结构化日志事件枚举 (LOG_EVENTS)
 *
 * 命名规范：<MODULE>_<VERB>_<SUBJECT>
 *   - MODULE  : 与 LOG_CONTEXTS key 保持一致（大写下划线）
 *   - VERB    : STARTED / COMPLETED / FAILED / SKIPPED / DETECTED / RECEIVED 等
 *   - SUBJECT : 可选的名词短语，用于进一步区分同模块同动作的不同目标
 *
 * 用法：
 *   logger.info('msg', { event: LOG_EVENTS.SCHEDULER_TASK_DISPATCHED, ... }, LOG_CONTEXTS.SCHEDULER);
 */
export const LOG_EVENTS = {
  // ── SERVER ──────────────────────────────────────────────────────────────
  SERVER_STARTING: 'SERVER_STARTING',
  SERVER_STARTED: 'SERVER_STARTED',
  SERVER_DB_INIT_STARTED: 'SERVER_DB_INIT_STARTED',
  SERVER_DB_INIT_COMPLETED: 'SERVER_DB_INIT_COMPLETED',
  SERVER_DB_INIT_FAILED: 'SERVER_DB_INIT_FAILED',
  SERVER_BACKFILL_STARTED: 'SERVER_BACKFILL_STARTED',
  SERVER_BACKFILL_COMPLETED: 'SERVER_BACKFILL_COMPLETED',
  SERVER_BACKFILL_FAILED: 'SERVER_BACKFILL_FAILED',
  SERVER_BACKFILL_PARTIAL_FAILURE: 'SERVER_BACKFILL_PARTIAL_FAILURE',
  SERVER_BACKFILL_DISABLED: 'SERVER_BACKFILL_DISABLED',
  SERVER_SHUTTING_DOWN: 'SERVER_SHUTTING_DOWN',
  SERVER_PORT_RETRY: 'SERVER_PORT_RETRY',
  SERVER_PORT_EXHAUSTED: 'SERVER_PORT_EXHAUSTED',
  SERVER_STARTUP_ERROR: 'SERVER_STARTUP_ERROR',

  // ── AUTH ─────────────────────────────────────────────────────────────────
  AUTH_LOGIN_SUCCESS: 'AUTH_LOGIN_SUCCESS',
  AUTH_LOGIN_FAILED: 'AUTH_LOGIN_FAILED',
  AUTH_LOGOUT: 'AUTH_LOGOUT',
  AUTH_REGISTER_SUCCESS: 'AUTH_REGISTER_SUCCESS',
  AUTH_REGISTER_FAILED: 'AUTH_REGISTER_FAILED',
  AUTH_PASSWORD_RESET_REQUESTED: 'AUTH_PASSWORD_RESET_REQUESTED',
  AUTH_PASSWORD_RESET_COMPLETED: 'AUTH_PASSWORD_RESET_COMPLETED',
  AUTH_TOKEN_REFRESHED: 'AUTH_TOKEN_REFRESHED',
  AUTH_TOKEN_INVALID: 'AUTH_TOKEN_INVALID',
  AUTH_ROUTE_ERROR: 'AUTH_ROUTE_ERROR',

  // ── SCHEDULER ─────────────────────────────────────────────────────────────
  SCHEDULER_STARTED: 'SCHEDULER_STARTED',
  SCHEDULER_STOPPED: 'SCHEDULER_STOPPED',
  SCHEDULER_TASK_REGISTERED: 'SCHEDULER_TASK_REGISTERED',
  SCHEDULER_TASK_UNREGISTERED: 'SCHEDULER_TASK_UNREGISTERED',
  SCHEDULER_TASK_DISPATCHED: 'SCHEDULER_TASK_DISPATCHED',
  SCHEDULER_TASK_QUEUED: 'SCHEDULER_TASK_QUEUED',
  SCHEDULER_TASK_QUEUE_FULL: 'SCHEDULER_TASK_QUEUE_FULL',
  SCHEDULER_TASK_QUEUE_TIMEOUT: 'SCHEDULER_TASK_QUEUE_TIMEOUT',
  SCHEDULER_TASK_EXECUTION_CREATED: 'SCHEDULER_TASK_EXECUTION_CREATED',
  SCHEDULER_TASK_EXECUTION_FAILED: 'SCHEDULER_TASK_EXECUTION_FAILED',
  SCHEDULER_TASK_SKIPPED: 'SCHEDULER_TASK_SKIPPED',
  SCHEDULER_TASK_DUPLICATE_SKIPPED: 'SCHEDULER_TASK_DUPLICATE_SKIPPED',
  SCHEDULER_TASK_MISSED_FIRE: 'SCHEDULER_TASK_MISSED_FIRE',
  SCHEDULER_TASK_COMPENSATION_DISPATCHED: 'SCHEDULER_TASK_COMPENSATION_DISPATCHED',
  SCHEDULER_TASK_COMPENSATION_FAILED: 'SCHEDULER_TASK_COMPENSATION_FAILED',
  SCHEDULER_TASK_RETRY: 'SCHEDULER_TASK_RETRY',
  SCHEDULER_TASK_RETRY_EXHAUSTED: 'SCHEDULER_TASK_RETRY_EXHAUSTED',
  SCHEDULER_SLOT_REGISTERED: 'SCHEDULER_SLOT_REGISTERED',
  SCHEDULER_SLOT_RELEASED: 'SCHEDULER_SLOT_RELEASED',
  SCHEDULER_SLOT_TIMEOUT: 'SCHEDULER_SLOT_TIMEOUT',
  SCHEDULER_SLOT_RECOVERED: 'SCHEDULER_SLOT_RECOVERED',
  SCHEDULER_SLOT_RECONCILED: 'SCHEDULER_SLOT_RECONCILED',
  SCHEDULER_JENKINS_TRIGGER_FAILED: 'SCHEDULER_JENKINS_TRIGGER_FAILED',
  SCHEDULER_JENKINS_BUILD_RESOLVED: 'SCHEDULER_JENKINS_BUILD_RESOLVED',
  SCHEDULER_JENKINS_QUEUE_ABORTED: 'SCHEDULER_JENKINS_QUEUE_ABORTED',
  SCHEDULER_DAILY_SUMMARY_STARTED: 'SCHEDULER_DAILY_SUMMARY_STARTED',
  SCHEDULER_DAILY_SUMMARY_COMPLETED: 'SCHEDULER_DAILY_SUMMARY_COMPLETED',
  SCHEDULER_DAILY_SUMMARY_FAILED: 'SCHEDULER_DAILY_SUMMARY_FAILED',
  SCHEDULER_DAILY_BACKFILL_STARTED: 'SCHEDULER_DAILY_BACKFILL_STARTED',
  SCHEDULER_DAILY_BACKFILL_COMPLETED: 'SCHEDULER_DAILY_BACKFILL_COMPLETED',
  SCHEDULER_DAILY_BACKFILL_FAILED: 'SCHEDULER_DAILY_BACKFILL_FAILED',

  // ── MONITOR ───────────────────────────────────────────────────────────────
  MONITOR_STARTED: 'MONITOR_STARTED',
  MONITOR_STOPPED: 'MONITOR_STOPPED',
  MONITOR_CYCLE_STARTED: 'MONITOR_CYCLE_STARTED',
  MONITOR_CYCLE_COMPLETED: 'MONITOR_CYCLE_COMPLETED',
  MONITOR_CYCLE_SKIPPED: 'MONITOR_CYCLE_SKIPPED',
  MONITOR_EXECUTION_STUCK_DETECTED: 'MONITOR_EXECUTION_STUCK_DETECTED',
  MONITOR_EXECUTION_FIXED: 'MONITOR_EXECUTION_FIXED',
  MONITOR_EXECUTION_FIX_FAILED: 'MONITOR_EXECUTION_FIX_FAILED',
  MONITOR_COMPILATION_FAILURE_DETECTED: 'MONITOR_COMPILATION_FAILURE_DETECTED',
  MONITOR_QUICK_FAIL_DETECTED: 'MONITOR_QUICK_FAIL_DETECTED',
  MONITOR_CLEANUP_STARTED: 'MONITOR_CLEANUP_STARTED',
  MONITOR_CLEANUP_COMPLETED: 'MONITOR_CLEANUP_COMPLETED',

  // ── WEBSOCKET ─────────────────────────────────────────────────────────────
  WS_INITIALIZED: 'WS_INITIALIZED',
  WS_DISABLED: 'WS_DISABLED',
  WS_CLIENT_CONNECTED: 'WS_CLIENT_CONNECTED',
  WS_CLIENT_DISCONNECTED: 'WS_CLIENT_DISCONNECTED',
  WS_CLIENT_SUBSCRIBED: 'WS_CLIENT_SUBSCRIBED',
  WS_CLIENT_UNSUBSCRIBED: 'WS_CLIENT_UNSUBSCRIBED',
  WS_TRANSPORT_UPGRADED: 'WS_TRANSPORT_UPGRADED',
  WS_STATUS_PUSHED: 'WS_STATUS_PUSHED',
  WS_PUSH_FAILED: 'WS_PUSH_FAILED',

  // ── EXECUTION (route/direct-trigger) ─────────────────────────────────────
  EXECUTION_MANUAL_SYNC_STARTED: 'EXECUTION_MANUAL_SYNC_STARTED',
  EXECUTION_MANUAL_SYNC_COMPLETED: 'EXECUTION_MANUAL_SYNC_COMPLETED',
  EXECUTION_MANUAL_SYNC_FAILED: 'EXECUTION_MANUAL_SYNC_FAILED',
  EXECUTION_BULK_SYNC_STARTED: 'EXECUTION_BULK_SYNC_STARTED',
  EXECUTION_BULK_SYNC_COMPLETED: 'EXECUTION_BULK_SYNC_COMPLETED',
  EXECUTION_BULK_SYNC_FAILED: 'EXECUTION_BULK_SYNC_FAILED',
  EXECUTION_STUCK_QUERY: 'EXECUTION_STUCK_QUERY',
  EXECUTION_ABORT_REQUESTED: 'EXECUTION_ABORT_REQUESTED',

  // ── JENKINS ───────────────────────────────────────────────────────────────
  JENKINS_CALLBACK_RECEIVED: 'JENKINS_CALLBACK_RECEIVED',
  JENKINS_CALLBACK_PROCESSED: 'JENKINS_CALLBACK_PROCESSED',
  JENKINS_CALLBACK_FAILED: 'JENKINS_CALLBACK_FAILED',
  JENKINS_CALLBACK_QUEUE_FULL: 'JENKINS_CALLBACK_QUEUE_FULL',
  JENKINS_CALLBACK_PARSE_FAILED: 'JENKINS_CALLBACK_PARSE_FAILED',
  JENKINS_CALLBACK_TEST_PROCESSED: 'JENKINS_CALLBACK_TEST_PROCESSED',
  JENKINS_CALLBACK_TEST_FAILED: 'JENKINS_CALLBACK_TEST_FAILED',
  JENKINS_TRIGGER_STARTED: 'JENKINS_TRIGGER_STARTED',
  JENKINS_TRIGGER_COMPLETED: 'JENKINS_TRIGGER_COMPLETED',
  JENKINS_TRIGGER_FAILED: 'JENKINS_TRIGGER_FAILED',
  JENKINS_MANUAL_SYNC_STARTED: 'JENKINS_MANUAL_SYNC_STARTED',
  JENKINS_MANUAL_SYNC_COMPLETED: 'JENKINS_MANUAL_SYNC_COMPLETED',
  JENKINS_MANUAL_SYNC_FAILED: 'JENKINS_MANUAL_SYNC_FAILED',
  JENKINS_HEALTH_CHECK_FAILED: 'JENKINS_HEALTH_CHECK_FAILED',
  JENKINS_DIAGNOSE_STARTED: 'JENKINS_DIAGNOSE_STARTED',
  JENKINS_DIAGNOSE_FAILED: 'JENKINS_DIAGNOSE_FAILED',
  JENKINS_MONITORING_STATS_FAILED: 'JENKINS_MONITORING_STATS_FAILED',
  JENKINS_FIX_STUCK_FAILED: 'JENKINS_FIX_STUCK_FAILED',
  JENKINS_MONITOR_STATUS_FAILED: 'JENKINS_MONITOR_STATUS_FAILED',

  // ── TASKS (route) ─────────────────────────────────────────────────────────
  TASKS_ROUTE_ERROR: 'TASKS_ROUTE_ERROR',
  TASKS_MANUAL_RUN_STARTED: 'TASKS_MANUAL_RUN_STARTED',
  TASKS_MANUAL_RUN_FAILED: 'TASKS_MANUAL_RUN_FAILED',

  // ── DASHBOARD ─────────────────────────────────────────────────────────────
  DASHBOARD_DATA_INVALID: 'DASHBOARD_DATA_INVALID',
  DASHBOARD_ROUTE_ERROR: 'DASHBOARD_ROUTE_ERROR',

  // ── CASES ─────────────────────────────────────────────────────────────────
  CASES_CALLBACK_RECEIVED: 'CASES_CALLBACK_RECEIVED',
  CASES_CALLBACK_ERROR: 'CASES_CALLBACK_ERROR',
  CASES_ROUTE_DB_ERROR: 'CASES_ROUTE_DB_ERROR',

  // ── SECURITY ──────────────────────────────────────────────────────────────
  SECURITY_RATE_LIMIT_EXCEEDED: 'SECURITY_RATE_LIMIT_EXCEEDED',
  SECURITY_IP_BLOCKED: 'SECURITY_IP_BLOCKED',
  SECURITY_AUTH_FAILED: 'SECURITY_AUTH_FAILED',

  // ── DATABASE ──────────────────────────────────────────────────────────────
  DB_TRANSACTION_COMPLETED: 'DB_TRANSACTION_COMPLETED',
  DB_TRANSACTION_FAILED: 'DB_TRANSACTION_FAILED',
  DB_BATCH_INSERT_COMPLETED: 'DB_BATCH_INSERT_COMPLETED',
  DB_BATCH_INSERT_FAILED: 'DB_BATCH_INSERT_FAILED',

  // ── EMAIL ─────────────────────────────────────────────────────────────────
  EMAIL_SENT: 'EMAIL_SENT',
  EMAIL_FAILED: 'EMAIL_FAILED',
  EMAIL_SKIPPED: 'EMAIL_SKIPPED',

  // ── HYBRID_SYNC ───────────────────────────────────────────────────────────
  HYBRID_SYNC_MANUAL_FAILED: 'HYBRID_SYNC_MANUAL_FAILED',
  HYBRID_SYNC_CONSISTENCY_STARTED: 'HYBRID_SYNC_CONSISTENCY_STARTED',
  HYBRID_SYNC_INCONSISTENCY_FOUND: 'HYBRID_SYNC_INCONSISTENCY_FOUND',
  HYBRID_SYNC_INCONSISTENCY_FIXED: 'HYBRID_SYNC_INCONSISTENCY_FIXED',
  HYBRID_SYNC_FIX_FAILED: 'HYBRID_SYNC_FIX_FAILED',
  HYBRID_SYNC_TIMEOUT_CHECK_COMPLETED: 'HYBRID_SYNC_TIMEOUT_CHECK_COMPLETED',
} as const;

export type LogEventType = typeof LOG_EVENTS[keyof typeof LOG_EVENTS];

// 敏感字段列表 (用于数据脱敏)
export const SENSITIVE_FIELDS = [
  'password',
  'token',
  'secret',
  'key',
  'authorization',
  'auth',
  'credential',
  'api_key',
  'apikey',
  'jwt',
  'session',
  'cookie',
  'csrf',
  'private_key',
  'public_key',
  'signature',
] as const;

// 慢查询阈值配置 (毫秒)
export const PERFORMANCE_THRESHOLDS = {
  SLOW_QUERY: parseInt(process.env.LOG_SLOW_QUERY_THRESHOLD || '1000', 10), // 1秒
  SLOW_REQUEST: parseInt(process.env.LOG_SLOW_REQUEST_THRESHOLD || '5000', 10), // 5秒
  SLOW_OPERATION: parseInt(process.env.LOG_SLOW_OPERATION_THRESHOLD || '2000', 10), // 2秒
} as const;

// HTTP状态码分类
export const HTTP_STATUS_CATEGORIES = {
  SUCCESS: { min: 200, max: 299, level: LogLevel.INFO },
  REDIRECT: { min: 300, max: 399, level: LogLevel.INFO },
  CLIENT_ERROR: { min: 400, max: 499, level: LogLevel.WARN },
  SERVER_ERROR: { min: 500, max: 599, level: LogLevel.ERROR },
} as const;

// 需要特别监控的端点
export const CRITICAL_ENDPOINTS = [
  '/api/executions/callback',
  '/api/jenkins/trigger',
  '/api/jenkins/run-batch',
  '/api/jenkins/run-case',
  '/api/auth/login',
  '/api/auth/register',
  '/api/health',
] as const;

// 日志格式模板
export const LOG_FORMATS = {
  REQUEST_START: 'Request started',
  REQUEST_END: 'Request completed',
  QUERY_START: 'Database query started',
  QUERY_END: 'Database query completed',
  OPERATION_START: 'Operation started',
  OPERATION_END: 'Operation completed',
  ERROR_OCCURRED: 'Error occurred',
  AUTH_SUCCESS: 'Authentication successful',
  AUTH_FAILURE: 'Authentication failed',
  VALIDATION_ERROR: 'Validation error',
  BUSINESS_ERROR: 'Business logic error',
  SYSTEM_ERROR: 'System error',
} as const;

// 环境配置
export const ENVIRONMENT_CONFIG = {
  development: {
    level: LogLevel.DEBUG,
    enableColors: true,
    enableSensitiveData: false,
    enableStackTrace: true,
    enableRequestDetails: true,
    enableDatabaseQueries: true,
  },
  test: {
    level: LogLevel.WARN,
    enableColors: false,
    enableSensitiveData: false,
    enableStackTrace: false,
    enableRequestDetails: false,
    enableDatabaseQueries: false,
  },
  production: {
    level: LogLevel.INFO,
    enableColors: false,
    enableSensitiveData: false,
    enableStackTrace: false,
    enableRequestDetails: true,
    enableDatabaseQueries: true,
  },
} as const;

// 初始化日志配置
export function initializeLogging(): void {
  const env = (process.env.NODE_ENV || 'development') as keyof typeof ENVIRONMENT_CONFIG;
  const envConfig = ENVIRONMENT_CONFIG[env] || ENVIRONMENT_CONFIG.development;

  // 更新logger配置
  logger.updateConfig({
    level: envConfig.level,
    enableRequestDetails: envConfig.enableRequestDetails,
    enableDatabaseQueries: envConfig.enableDatabaseQueries,
    enableSensitiveData: envConfig.enableSensitiveData,
    enableColors: envConfig.enableColors,
    slowQueryThreshold: PERFORMANCE_THRESHOLDS.SLOW_QUERY,
  });

  logger.info('Logging system initialized', {
    environment: env,
    level: LogLevel[envConfig.level],
    config: logger.getConfig(),
  }, LOG_CONTEXTS.HTTP);
}

// 检查端点是否为关键端点
export function isCriticalEndpoint(path: string): boolean {
  return CRITICAL_ENDPOINTS.some(endpoint => path.startsWith(endpoint));
}

// 根据HTTP状态码获取日志级别
export function getLogLevelForStatus(statusCode: number): LogLevel {
  for (const category of Object.values(HTTP_STATUS_CATEGORIES)) {
    if (statusCode >= category.min && statusCode <= category.max) {
      return category.level;
    }
  }
  return LogLevel.INFO;
}

// 生成请求ID
export function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// 脱敏工具函数
export function sanitizeObject(obj: unknown): unknown {
  if (typeof obj !== 'object' || obj === null) {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObject(item));
  }

  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    const lowerKey = key.toLowerCase();
    const isSensitive = SENSITIVE_FIELDS.some(field => lowerKey.includes(field));

    if (isSensitive) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof value === 'object') {
      sanitized[key] = sanitizeObject(value);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

// 格式化错误信息
export function formatError(error: Error | unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: process.env.NODE_ENV !== 'production' ? error.stack : undefined,
    };
  }

  return {
    message: String(error),
    type: typeof error,
  };
}

// 计算操作耗时
export function createTimer(): () => number {
  const start = process.hrtime.bigint();
  return () => Number(process.hrtime.bigint() - start) / 1000000; // 转换为毫秒
}

// 日志级别字符串转换
export function parseLogLevel(level: string): LogLevel {
  const upperLevel = level.toUpperCase();
  return LogLevel[upperLevel as keyof typeof LogLevel] ?? LogLevel.INFO;
}

// 导出默认配置
export { logger };
export default {
  LOG_CONTEXTS,
  SENSITIVE_FIELDS,
  PERFORMANCE_THRESHOLDS,
  HTTP_STATUS_CATEGORIES,
  CRITICAL_ENDPOINTS,
  LOG_FORMATS,
  ENVIRONMENT_CONFIG,
  initializeLogging,
  isCriticalEndpoint,
  getLogLevelForStatus,
  generateRequestId,
  sanitizeObject,
  formatError,
  createTimer,
  parseLogLevel,
};