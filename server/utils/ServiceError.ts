/**
 * 服务层错误类
 * 用于统一业务逻辑错误处理
 *
 * 使用方式：
 * - ServiceError.notFound('Workspace', '123')  → 404
 * - ServiceError.validation('名称不能为空', ...)  → 422
 * - ServiceError.conflict('版本冲突', ...)           → 409
 * - ServiceError.business('业务异常', ...)           → 400
 * - ServiceError.dataAccess('数据库错误', err)     → 500
 */
export class ServiceError extends Error {
  public readonly statusCode: number;
  /** 机器可读错误码，如 NOT_FOUND / VALIDATION_ERROR 等 */
  public readonly code: string;
  public readonly details?: unknown;
  public readonly context?: Record<string, unknown>;

  constructor(
    message: string,
    originalError?: Error | string,
    statusCode: number = 500,
    code: string = 'INTERNAL_ERROR',
    details?: unknown,
    context?: Record<string, unknown>
  ) {
    super(message);
    
    this.name = 'ServiceError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.context = context;

    // 保持正确的原型链
    Object.setPrototypeOf(this, ServiceError.prototype);

    // 如果有原始错误，保留其堆栈信息
    if (originalError instanceof Error) {
      this.stack = originalError.stack;
    }
  }

  /**
   * 创建业务逻辑错误（400）
   */
  static business(message: string, details?: unknown, context?: Record<string, unknown>): ServiceError {
    return new ServiceError(message, undefined, 400, 'BUSINESS_ERROR', details, context);
  }

  /**
   * 创建数据访问错误（500）
   */
  static dataAccess(message: string, originalError?: Error, context?: Record<string, unknown>): ServiceError {
    return new ServiceError(message, originalError, 500, 'DATA_ACCESS_ERROR', undefined, context);
  }

  /**
   * 创建验证错误（422）
   */
  static validation(message: string, details?: unknown, context?: Record<string, unknown>): ServiceError {
    return new ServiceError(message, undefined, 422, 'VALIDATION_ERROR', details, context);
  }

  /**
   * 创建未找到资源错误（404）
   */
  static notFound(resource: string, identifier?: string, context?: Record<string, unknown>): ServiceError {
    const message = identifier 
      ? `${resource} 不存在（ID: ${identifier}）`
      : `${resource} 不存在`;
    return new ServiceError(message, undefined, 404, 'NOT_FOUND', undefined, context);
  }

  /**
   * 创建版本冲突错误（409）
   */
  static conflict(message: string, details?: unknown, context?: Record<string, unknown>): ServiceError {
    return new ServiceError(message, undefined, 409, 'CONFLICT', details, context);
  }

  /**
   * 创建权限错误（403）
   */
  static forbidden(operation: string, context?: Record<string, unknown>): ServiceError {
    return new ServiceError(`权限不足：${operation}`, undefined, 403, 'FORBIDDEN', undefined, context);
  }

  /**
   * 从路由捕获的未知错误中提取 HTTP 状态码
   * 用于统一错误处理中间件：若 service 层抛出 ServiceError 则直接取其 statusCode
   */
  static resolveStatus(error: unknown): number {
    if (error instanceof ServiceError) {
      return error.statusCode;
    }
    return 500;
  }

  /**
   * 获取错误的结构化表示（符合 API 错误应答规范）
   */
  toResponse(): {
    success: false;
    error: { code: string; message: string; details?: unknown };
  } {
    return {
      success: false,
      error: {
        code: this.code,
        message: this.message,
        details: this.details,
      },
    };
  }
}

/**
 * Extract error message from unknown error type
 * Used for consistent error handling across the application
 *
 * @param error - Unknown error object
 * @returns Error message string
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

/**
 * Extract error stack trace from unknown error type
 *
 * @param error - Unknown error object
 * @returns Stack trace string or undefined
 */
export function getErrorStack(error: unknown): string | undefined {
  if (error instanceof Error) {
    return error.stack;
  }
  return undefined;
}