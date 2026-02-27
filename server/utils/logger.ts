import { AsyncLocalStorage } from 'async_hooks';

// 日志级别枚举
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

// 日志级别字符串映射
const LOG_LEVEL_NAMES: Record<LogLevel, string> = {
  [LogLevel.DEBUG]: 'DEBUG',
  [LogLevel.INFO]: 'INFO',
  [LogLevel.WARN]: 'WARN',
  [LogLevel.ERROR]: 'ERROR',
};

// 日志上下文接口
interface LogContext {
  requestId?: string;
  userId?: string;
  ip?: string;
  userAgent?: string;
  [key: string]: unknown;
}

// 异步本地存储，用于在请求生命周期中传递上下文
const asyncLocalStorage = new AsyncLocalStorage<LogContext>();

// 日志配置接口
interface LoggerConfig {
  level: LogLevel;
  enableRequestDetails: boolean;
  enableDatabaseQueries: boolean;
  slowQueryThreshold: number;
  enableSensitiveData: boolean;
  enableTimestamp: boolean;
  enableColors: boolean;
}

// 默认配置
const DEFAULT_CONFIG: LoggerConfig = {
  level: LogLevel.INFO,
  enableRequestDetails: true,
  enableDatabaseQueries: true,
  slowQueryThreshold: 1000, // 1秒
  enableSensitiveData: false,
  enableTimestamp: true,
  enableColors: true,
};

// 颜色代码 (仅在开发环境使用)
const COLORS = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m',
};

// 级别颜色映射
const LEVEL_COLORS: Record<LogLevel, string> = {
  [LogLevel.DEBUG]: COLORS.gray,
  [LogLevel.INFO]: COLORS.blue,
  [LogLevel.WARN]: COLORS.yellow,
  [LogLevel.ERROR]: COLORS.red,
};

class Logger {
  private config: LoggerConfig;

  constructor() {
    this.config = this.loadConfig();
  }

  // 从环境变量加载配置
  private loadConfig(): LoggerConfig {
    const levelStr = process.env.LOG_LEVEL?.toUpperCase() || 'INFO';
    const level = LogLevel[levelStr as keyof typeof LogLevel] ?? LogLevel.INFO;

    return {
      level,
      enableRequestDetails: process.env.LOG_REQUEST_DETAILS !== 'false',
      enableDatabaseQueries: process.env.LOG_DATABASE_QUERIES !== 'false',
      slowQueryThreshold: parseInt(process.env.LOG_SLOW_QUERY_THRESHOLD || '1000', 10),
      enableSensitiveData: process.env.LOG_SENSITIVE_DATA === 'true',
      enableTimestamp: process.env.LOG_TIMESTAMP !== 'false',
      enableColors: process.env.NODE_ENV !== 'production' && process.env.LOG_COLORS !== 'false',
    };
  }

  // 设置当前请求上下文
  static setContext(context: LogContext): void {
    const currentContext = asyncLocalStorage.getStore() || {};
    asyncLocalStorage.enterWith({ ...currentContext, ...context });
  }

  // 获取当前请求上下文
  static getContext(): LogContext {
    return asyncLocalStorage.getStore() || {};
  }

  // 运行带上下文的函数
  static runWithContext<T>(context: LogContext, fn: () => T): T {
    return asyncLocalStorage.run(context, fn);
  }

  // 检查是否应该记录指定级别的日志
  private shouldLog(level: LogLevel): boolean {
    return level >= this.config.level;
  }

  // 格式化时间戳
  private formatTimestamp(): string {
    return new Date().toISOString();
  }

  // 格式化日志级别
  private formatLevel(level: LogLevel): string {
    const levelName = LOG_LEVEL_NAMES[level];
    if (this.config.enableColors) {
      const color = LEVEL_COLORS[level];
      return `${color}${levelName.padEnd(5)}${COLORS.reset}`;
    }
    return levelName.padEnd(5);
  }

  // 格式化请求上下文
  private formatContext(): string {
    const context = Logger.getContext();
    const parts: string[] = [];

    if (context.requestId) {
      parts.push(`reqId=${context.requestId}`);
    }
    if (context.userId) {
      parts.push(`userId=${context.userId}`);
    }
    if (context.ip) {
      parts.push(`ip=${context.ip}`);
    }

    return parts.length > 0 ? `[${parts.join(' ')}]` : '';
  }

  // 过滤敏感数据
  private sanitizeData(data: unknown): unknown {
    if (!this.config.enableSensitiveData && typeof data === 'object' && data !== null) {
      const sanitized = { ...data } as Record<string, unknown>;
      const sensitiveKeys = ['password', 'token', 'secret', 'key', 'authorization', 'auth'];

      for (const key of Object.keys(sanitized)) {
        if (sensitiveKeys.some(sk => key.toLowerCase().includes(sk))) {
          sanitized[key] = '[REDACTED]';
        }
      }
      return sanitized;
    }
    return data;
  }

  // 核心日志记录方法
  private log(level: LogLevel, message: string, data?: unknown, context?: string): void {
    if (!this.shouldLog(level)) {
      return;
    }

    const parts: string[] = [];

    // 时间戳
    if (this.config.enableTimestamp) {
      parts.push(this.formatTimestamp());
    }

    // 日志级别
    parts.push(this.formatLevel(level));

    // 请求上下文
    const contextStr = this.formatContext();
    if (contextStr) {
      parts.push(contextStr);
    }

    // 自定义上下文前缀
    if (context) {
      parts.push(`[${context}]`);
    }

    // 消息
    parts.push(message);

    const logMessage = parts.join(' ');

    // 根据级别选择输出方法
    // 注意：使用固定字面量 '%s' 作为格式字符串，将 logMessage 作为数据参数传入，
    // 防止外部输入（如用户提供的 message）中包含 %s/%d/%o 等格式说明符被解析（format string injection）
    const sanitizedData = data ? this.sanitizeData(data) : undefined;
    switch (level) {
      case LogLevel.DEBUG:
        if (sanitizedData !== undefined) {
          console.debug('%s', logMessage, sanitizedData);
        } else {
          console.debug('%s', logMessage);
        }
        break;
      case LogLevel.INFO:
        if (sanitizedData !== undefined) {
          console.info('%s', logMessage, sanitizedData);
        } else {
          console.info('%s', logMessage);
        }
        break;
      case LogLevel.WARN:
        if (sanitizedData !== undefined) {
          console.warn('%s', logMessage, sanitizedData);
        } else {
          console.warn('%s', logMessage);
        }
        break;
      case LogLevel.ERROR:
        if (sanitizedData !== undefined) {
          console.error('%s', logMessage, sanitizedData);
        } else {
          console.error('%s', logMessage);
        }
        break;
    }
  }

  // 公共日志方法
  debug(message: string, data?: unknown, context?: string): void {
    this.log(LogLevel.DEBUG, message, data, context);
  }

  info(message: string, data?: unknown, context?: string): void {
    this.log(LogLevel.INFO, message, data, context);
  }

  warn(message: string, data?: unknown, context?: string): void {
    this.log(LogLevel.WARN, message, data, context);
  }

  error(message: string, data?: unknown, context?: string): void {
    this.log(LogLevel.ERROR, message, data, context);
  }

  // 专用方法：数据库查询日志
  queryLog(sql: string, params: unknown[], duration: number, rowCount?: number): void {
    if (!this.config.enableDatabaseQueries) {
      return;
    }

    const isSlowQuery = duration >= this.config.slowQueryThreshold;
    const level = isSlowQuery ? LogLevel.WARN : LogLevel.DEBUG;

    const queryInfo = {
      sql: this.config.enableSensitiveData ? sql : this.sanitizeSql(sql),
      params: this.config.enableSensitiveData ? params : '[REDACTED]',
      duration: `${duration}ms`,
      rowCount,
      slow: isSlowQuery,
    };

    this.log(
      level,
      `Database query ${isSlowQuery ? '(SLOW)' : ''}`,
      queryInfo,
      'DATABASE'
    );
  }

  // 专用方法：HTTP请求日志
  requestLog(method: string, url: string, statusCode: number, duration: number, ip?: string): void {
    if (!this.config.enableRequestDetails) {
      return;
    }

    const isSlowRequest = duration >= 5000; // 5秒
    const level = statusCode >= 500 ? LogLevel.ERROR :
                  statusCode >= 400 ? LogLevel.WARN :
                  isSlowRequest ? LogLevel.WARN : LogLevel.INFO;

    const requestInfo = {
      method,
      url,
      statusCode,
      duration: `${duration}ms`,
      ip,
      slow: isSlowRequest,
    };

    this.log(level, `HTTP ${method} ${url} ${statusCode}`, requestInfo, 'HTTP');
  }

  // 专用方法：性能监控日志
  performanceLog(operation: string, duration: number, metadata?: Record<string, unknown>): void {
    const isSlowOperation = duration >= 2000; // 2秒
    const level = isSlowOperation ? LogLevel.WARN : LogLevel.INFO;

    const perfInfo = {
      operation,
      duration: `${duration}ms`,
      slow: isSlowOperation,
      ...metadata,
    };

    this.log(level, `Performance: ${operation}`, perfInfo, 'PERF');
  }

  // 专用方法：错误日志
  errorLog(error: Error | unknown, context: string, metadata?: Record<string, unknown>): void {
    const errorInfo = {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      context,
      ...metadata,
    };

    this.log(LogLevel.ERROR, `Error in ${context}`, errorInfo, 'ERROR');
  }

  // 专用方法：审计日志
  auditLog(action: string, userId?: string, metadata?: Record<string, unknown>): void {
    const auditInfo = {
      action,
      userId,
      timestamp: this.formatTimestamp(),
      ...metadata,
    };

    this.log(LogLevel.INFO, `Audit: ${action}`, auditInfo, 'AUDIT');
  }

  // 辅助方法：SQL脱敏
  private sanitizeSql(sql: string): string {
    // 简单的SQL脱敏，移除可能的敏感值
    return sql.replace(/(['"])[^'"]*\1/g, '\'[REDACTED]\'')
              .replace(/\b\d+\b/g, '[NUMBER]');
  }

  // 获取配置
  getConfig(): LoggerConfig {
    return { ...this.config };
  }

  // 更新配置
  updateConfig(updates: Partial<LoggerConfig>): void {
    this.config = { ...this.config, ...updates };
  }
}

// 创建全局logger实例
const logger = new Logger();

// 导出logger实例和相关类型
export { logger, Logger, LogContext, LoggerConfig };
export default logger;