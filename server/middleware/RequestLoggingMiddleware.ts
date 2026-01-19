import { Request, Response, NextFunction } from 'express';
import logger, { Logger } from '../utils/logger.js';
import {
  LOG_CONTEXTS,
  generateRequestId,
  isCriticalEndpoint,
  getLogLevelForStatus,
  createTimer,
  sanitizeObject,
  PERFORMANCE_THRESHOLDS,
} from '../config/logging.js';

// 扩展Request接口以包含请求上下文
declare global {
  namespace Express {
    interface Request {
      requestId: string;
      startTime: number;
      timer: () => number;
    }
  }
}

// 需要过滤的请求头
const FILTERED_HEADERS = [
  'authorization',
  'cookie',
  'x-api-key',
  'x-jenkins-signature',
  'x-auth-token',
];

// 需要过滤的查询参数
const FILTERED_QUERY_PARAMS = [
  'token',
  'key',
  'secret',
  'password',
  'auth',
];

// 静态资源路径 (不记录详细日志)
const STATIC_PATHS = [
  '/favicon.ico',
  '/robots.txt',
  '/sitemap.xml',
  '/.well-known/',
  '/assets/',
  '/static/',
  '/public/',
];

// 健康检查路径 (简化日志)
const HEALTH_CHECK_PATHS = [
  '/api/health',
  '/health',
  '/ping',
  '/status',
];

/**
 * 过滤敏感请求头
 */
function filterHeaders(headers: Record<string, unknown>): Record<string, unknown> {
  const filtered: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(headers)) {
    const lowerKey = key.toLowerCase();
    if (FILTERED_HEADERS.some(filtered => lowerKey.includes(filtered))) {
      filtered[key] = '[REDACTED]';
    } else {
      filtered[key] = value;
    }
  }

  return filtered;
}

/**
 * 过滤敏感查询参数
 */
function filterQuery(query: Record<string, unknown>): Record<string, unknown> {
  const filtered: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(query)) {
    const lowerKey = key.toLowerCase();
    if (FILTERED_QUERY_PARAMS.some(filtered => lowerKey.includes(filtered))) {
      filtered[key] = '[REDACTED]';
    } else {
      filtered[key] = value;
    }
  }

  return filtered;
}

/**
 * 过滤请求体
 */
function filterBody(body: unknown): unknown {
  if (!body || typeof body !== 'object') {
    return body;
  }

  return sanitizeObject(body);
}

/**
 * 判断是否为静态资源请求
 */
function isStaticRequest(path: string): boolean {
  return STATIC_PATHS.some(staticPath => path.startsWith(staticPath));
}

/**
 * 判断是否为健康检查请求
 */
function isHealthCheckRequest(path: string): boolean {
  return HEALTH_CHECK_PATHS.some(healthPath => path === healthPath || path.startsWith(healthPath));
}

/**
 * 获取客户端IP地址
 */
function getClientIP(req: Request): string {
  return (
    (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
    (req.headers['x-real-ip'] as string) ||
    req.connection.remoteAddress ||
    req.socket.remoteAddress ||
    'unknown'
  );
}

/**
 * 获取User-Agent
 */
function getUserAgent(req: Request): string {
  return (req.headers['user-agent'] as string) || 'unknown';
}

/**
 * 记录请求开始日志
 */
function logRequestStart(req: Request): void {
  const { method, originalUrl, path } = req;
  const ip = getClientIP(req);
  const userAgent = getUserAgent(req);

  // 静态资源请求只记录debug级别
  if (isStaticRequest(path)) {
    logger.debug(`${method} ${originalUrl}`, { ip, userAgent }, LOG_CONTEXTS.HTTP);
    return;
  }

  // 健康检查请求简化日志
  if (isHealthCheckRequest(path)) {
    logger.debug(`Health check: ${method} ${originalUrl}`, { ip }, LOG_CONTEXTS.HTTP);
    return;
  }

  const requestInfo = {
    method,
    url: originalUrl,
    path,
    ip,
    userAgent,
    headers: filterHeaders(req.headers),
    query: Object.keys(req.query).length > 0 ? filterQuery(req.query) : undefined,
    body: req.body && Object.keys(req.body).length > 0 ? filterBody(req.body) : undefined,
    critical: isCriticalEndpoint(path),
    timestamp: new Date().toISOString(),
  };

  // 关键端点使用info级别，其他使用debug级别
  const level = isCriticalEndpoint(path) ? 'info' : 'debug';
  logger[level](`Request started: ${method} ${originalUrl}`, requestInfo, LOG_CONTEXTS.HTTP);
}

/**
 * 记录请求结束日志
 */
function logRequestEnd(req: Request, res: Response): void {
  const { method, originalUrl, path } = req;
  const duration = req.timer();
  const ip = getClientIP(req);
  const statusCode = res.statusCode;

  // 静态资源请求只记录debug级别
  if (isStaticRequest(path)) {
    logger.debug(`${method} ${originalUrl} ${statusCode} ${duration.toFixed(0)}ms`, {
      statusCode,
      duration: `${duration.toFixed(0)}ms`,
      ip,
    }, LOG_CONTEXTS.HTTP);
    return;
  }

  // 健康检查请求简化日志
  if (isHealthCheckRequest(path)) {
    logger.debug(`Health check completed: ${method} ${originalUrl} ${statusCode}`, {
      statusCode,
      duration: `${duration.toFixed(0)}ms`,
    }, LOG_CONTEXTS.HTTP);
    return;
  }

  const isSlowRequest = duration >= PERFORMANCE_THRESHOLDS.SLOW_REQUEST;
  const isCritical = isCriticalEndpoint(path);

  const responseInfo = {
    method,
    url: originalUrl,
    path,
    statusCode,
    duration: `${duration.toFixed(0)}ms`,
    ip,
    critical: isCritical,
    slow: isSlowRequest,
    contentLength: res.get('content-length'),
    timestamp: new Date().toISOString(),
  };

  // 根据状态码和性能确定日志级别
  const statusLevel = getLogLevelForStatus(statusCode);
  const isError = statusCode >= 500;
  const isWarning = statusCode >= 400 || isSlowRequest;

  const message = `Request completed: ${method} ${originalUrl} ${statusCode} ${duration.toFixed(0)}ms${isSlowRequest ? ' (SLOW)' : ''}`;

  if (isError) {
    logger.error(message, responseInfo, LOG_CONTEXTS.HTTP);
  } else if (isWarning) {
    logger.warn(message, responseInfo, LOG_CONTEXTS.HTTP);
  } else {
    logger.info(message, responseInfo, LOG_CONTEXTS.HTTP);
  }

  // 记录性能指标
  if (isSlowRequest || isCritical) {
    logger.performanceLog(
      `HTTP ${method} ${path}`,
      duration,
      {
        statusCode,
        ip,
        critical: isCritical,
        slow: isSlowRequest,
      }
    );
  }
}

/**
 * 请求日志中间件
 */
export function requestLoggingMiddleware(req: Request, res: Response, next: NextFunction): void {
  // 生成请求ID
  const requestId = generateRequestId();
  req.requestId = requestId;
  req.startTime = Date.now();
  req.timer = createTimer();

  // 设置请求上下文
  const ip = getClientIP(req);
  const userAgent = getUserAgent(req);

  Logger.setContext({
    requestId,
    ip,
    userAgent,
  });

  // 记录请求开始
  logRequestStart(req);

  // 监听响应结束事件
  res.on('finish', () => {
    logRequestEnd(req, res);
  });

  // 监听响应错误事件
  res.on('error', (error) => {
    logger.errorLog(error, 'Response error', {
      requestId,
      method: req.method,
      url: req.originalUrl,
      ip,
      userAgent,
    });
  });

  next();
}

/**
 * 错误日志中间件 (应该在所有路由之后注册)
 */
export function errorLoggingMiddleware(
  error: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const requestId = req.requestId || 'unknown';
  const duration = req.timer ? req.timer() : 0;
  const ip = getClientIP(req);

  const errorInfo = {
    requestId,
    method: req.method,
    url: req.originalUrl,
    ip,
    userAgent: getUserAgent(req),
    duration: `${duration.toFixed(0)}ms`,
    stack: process.env.NODE_ENV !== 'production' ? error.stack : undefined,
  };

  logger.errorLog(error, 'Unhandled request error', errorInfo);

  // 如果响应还没有发送，发送500错误
  if (!res.headersSent) {
    res.status(500).json({
      error: 'Internal server error',
      requestId,
      timestamp: new Date().toISOString(),
    });
  }

  next(error);
}

export default {
  requestLoggingMiddleware,
  errorLoggingMiddleware,
};