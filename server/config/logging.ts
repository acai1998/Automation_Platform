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