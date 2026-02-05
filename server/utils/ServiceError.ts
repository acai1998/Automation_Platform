/**
 * 服务层错误类
 * 用于统一业务逻辑错误处理
 */
export class ServiceError extends Error {
  public readonly statusCode: number;
  public readonly details?: any;
  public readonly context?: Record<string, any>;

  constructor(
    message: string,
    originalError?: Error | string,
    statusCode: number = 500,
    details?: any,
    context?: Record<string, any>
  ) {
    super(message);
    
    this.name = 'ServiceError';
    this.statusCode = statusCode;
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
   * 创建业务逻辑错误
   */
  static business(message: string, details?: any, context?: Record<string, any>): ServiceError {
    return new ServiceError(message, undefined, 400, details, context);
  }

  /**
   * 创建数据访问错误
   */
  static dataAccess(message: string, originalError?: Error, context?: Record<string, any>): ServiceError {
    return new ServiceError(message, originalError, 500, undefined, context);
  }

  /**
   * 创建验证错误
   */
  static validation(message: string, details?: any, context?: Record<string, any>): ServiceError {
    return new ServiceError(message, undefined, 422, details, context);
  }

  /**
   * 创建未找到资源错误
   */
  static notFound(resource: string, identifier?: string, context?: Record<string, any>): ServiceError {
    const message = identifier 
      ? `${resource} with identifier ${identifier} not found`
      : `${resource} not found`;
    return new ServiceError(message, undefined, 404, undefined, context);
  }

  /**
   * 创建权限错误
   */
  static forbidden(operation: string, context?: Record<string, any>): ServiceError {
    return new ServiceError(`Access denied: ${operation}`, undefined, 403, undefined, context);
  }

  /**
   * 获取错误的结构化表示
   */
  toResponse(): {
    error: string;
    statusCode: number;
    details?: any;
    context?: Record<string, any>;
    timestamp: string;
  } {
    return {
      error: this.message,
      statusCode: this.statusCode,
      details: this.details,
      context: this.context,
      timestamp: new Date().toISOString(),
    };
  }
}