import { Request, Response, NextFunction } from 'express';
import { authService } from '../services/AuthService';
import logger from '../utils/logger';
import { LOG_CONTEXTS } from '../config/logging';

// 扩展 Request 类型以包含用户信息
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: number;
        email: string;
        role: string;
      };
    }
  }
}

// 验证 JWT Token 中间件
export function authenticate(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  const clientIP = req.headers['x-forwarded-for'] || req.connection.remoteAddress;

  if (!authHeader) {
    logger.warn('Authentication failed: No authorization header', {
      endpoint: req.path,
      method: req.method,
      clientIP,
      userAgent: req.headers['user-agent'],
    }, LOG_CONTEXTS.AUTH);

    res.status(401).json({ success: false, message: '未提供认证令牌' });
    return;
  }

  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;

  const decoded = authService.verifyToken(token);
  if (!decoded) {
    logger.warn('Authentication failed: Invalid or expired token', {
      endpoint: req.path,
      method: req.method,
      clientIP,
      userAgent: req.headers['user-agent'],
      tokenLength: token.length,
    }, LOG_CONTEXTS.AUTH);

    res.status(401).json({ success: false, message: '无效或过期的令牌' });
    return;
  }

  logger.debug('Authentication successful', {
    userId: decoded.id,
    email: decoded.email,
    role: decoded.role,
    endpoint: req.path,
    method: req.method,
    clientIP,
  }, LOG_CONTEXTS.AUTH);

  req.user = decoded;
  next();
}

// 可选认证中间件 - 如果有 token 则验证，没有也放行
export function optionalAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (authHeader) {
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
    const decoded = authService.verifyToken(token);
    if (decoded) {
      req.user = decoded;
    }
  }

  next();
}

// 角色检查中间件
export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const clientIP = req.headers['x-forwarded-for'] || req.connection.remoteAddress;

    if (!req.user) {
      logger.warn('Authorization failed: User not authenticated', {
        endpoint: req.path,
        method: req.method,
        requiredRoles: roles,
        clientIP,
      }, LOG_CONTEXTS.AUTH);

      res.status(401).json({ success: false, message: '未认证' });
      return;
    }

    if (!roles.includes(req.user.role)) {
      logger.warn('Authorization failed: Insufficient role permissions', {
        userId: req.user.id,
        userRole: req.user.role,
        requiredRoles: roles,
        endpoint: req.path,
        method: req.method,
        clientIP,
      }, LOG_CONTEXTS.AUTH);

      res.status(403).json({ success: false, message: '没有权限执行此操作' });
      return;
    }

    logger.debug('Authorization successful', {
      userId: req.user.id,
      userRole: req.user.role,
      requiredRoles: roles,
      endpoint: req.path,
      method: req.method,
      clientIP,
    }, LOG_CONTEXTS.AUTH);

    next();
  };
}

// 管理员权限中间件
export const requireAdmin = requireRole('admin');

// 测试人员及以上权限中间件
export const requireTester = requireRole('admin', 'tester', 'developer');

export default {
  authenticate,
  optionalAuth,
  requireRole,
  requireAdmin,
  requireTester,
};
