import { Request, Response, NextFunction } from 'express';
import { authService } from '../services/AuthService.js';

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

  if (!authHeader) {
    res.status(401).json({ success: false, message: '未提供认证令牌' });
    return;
  }

  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;

  const decoded = authService.verifyToken(token);
  if (!decoded) {
    res.status(401).json({ success: false, message: '无效或过期的令牌' });
    return;
  }

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
    if (!req.user) {
      res.status(401).json({ success: false, message: '未认证' });
      return;
    }

    if (!roles.includes(req.user.role)) {
      res.status(403).json({ success: false, message: '没有权限执行此操作' });
      return;
    }

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
