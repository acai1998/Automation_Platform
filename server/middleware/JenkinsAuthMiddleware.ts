import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

interface JenkinsAuthConfig {
  apiKey: string;
  jwtSecret: string;
  allowedIPs: string[];
  signatureSecret: string;
}

interface AuthenticatedRequest extends Request {
  jenkinsAuth?: {
    verified: boolean;
    source: 'jwt' | 'apikey' | 'signature';
    metadata?: any;
  };
}

export class JenkinsAuthMiddleware {
  private config: JenkinsAuthConfig;

  constructor() {
    this.config = {
      apiKey: process.env.JENKINS_API_KEY || 'default-api-key',
      jwtSecret: process.env.JENKINS_JWT_SECRET || 'default-jwt-secret',
      allowedIPs: (process.env.JENKINS_ALLOWED_IPS || '').split(',').filter(ip => ip.trim()),
      signatureSecret: process.env.JENKINS_SIGNATURE_SECRET || 'default-signature-secret'
    };
  }

  /**
   * 主验证中间件 - 支持多种认证方式
   */
  verify = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      // 1. IP白名单检查
      if (!this.verifyIP(req)) {
        res.status(403).json({
          error: 'IP not allowed',
          message: 'Your IP address is not in the allowed list'
        });
        return;
      }

      // 2. 尝试多种认证方式
      const authResult = await this.tryMultipleAuth(req);

      if (!authResult.success) {
        res.status(401).json({
          error: 'Authentication failed',
          message: 'Invalid or missing authentication credentials',
          attempts: authResult.attempts
        });
        return;
      }

      // 3. 设置认证信息到请求对象
      req.jenkinsAuth = {
        verified: true,
        source: authResult.method,
        metadata: authResult.metadata
      };

      // 4. 记录认证成功日志
      this.logAuthSuccess(req, authResult);

      next();
    } catch (error) {
      console.error('Jenkins auth middleware error:', error);
      res.status(500).json({
        error: 'Authentication error',
        message: 'Internal server error during authentication'
      });
    }
  };

  /**
   * IP白名单验证
   */
  private verifyIP(req: Request): boolean {
    // 如果没有配置IP白名单，则跳过IP检查
    if (this.config.allowedIPs.length === 0) {
      return true;
    }

    const clientIP = this.getClientIP(req);
    const isAllowed = this.config.allowedIPs.some(allowedIP => {
      if (allowedIP.includes('/')) {
        // CIDR格式支持 (例如: 192.168.1.0/24)
        return this.isIPInCIDR(clientIP, allowedIP);
      } else {
        // 精确匹配或localhost变体
        return clientIP === allowedIP ||
               (allowedIP === 'localhost' && ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(clientIP));
      }
    });

    if (!isAllowed) {
      console.warn(`Jenkins auth: IP ${clientIP} not in allowed list:`, this.config.allowedIPs);
    }

    return isAllowed;
  }

  /**
   * 获取客户端真实IP
   */
  private getClientIP(req: Request): string {
    return (
      req.headers['x-forwarded-for'] as string ||
      req.headers['x-real-ip'] as string ||
      req.connection.remoteAddress ||
      req.socket.remoteAddress ||
      'unknown'
    ).split(',')[0].trim();
  }

  /**
   * 检查IP是否在CIDR范围内
   */
  private isIPInCIDR(ip: string, cidr: string): boolean {
    // 简化的CIDR检查实现
    // 生产环境建议使用 ipaddr.js 等专业库
    const [network, prefixLength] = cidr.split('/');
    if (!prefixLength) return ip === network;

    // 这里可以实现完整的CIDR匹配逻辑
    // 暂时使用简单的网段匹配
    const networkParts = network.split('.');
    const ipParts = ip.split('.');

    for (let i = 0; i < Math.min(networkParts.length, ipParts.length); i++) {
      if (networkParts[i] !== ipParts[i] && networkParts[i] !== '*') {
        return false;
      }
    }

    return true;
  }

  /**
   * 尝试多种认证方式
   */
  private async tryMultipleAuth(req: Request): Promise<{
    success: boolean;
    method?: 'jwt' | 'apikey' | 'signature';
    metadata?: any;
    attempts: string[];
  }> {
    const attempts: string[] = [];

    // 方式1: JWT Token认证
    try {
      const jwtResult = await this.verifyJWT(req);
      if (jwtResult.success) {
        return {
          success: true,
          method: 'jwt',
          metadata: jwtResult.payload,
          attempts: ['jwt']
        };
      }
      attempts.push('jwt-failed');
    } catch (error) {
      attempts.push('jwt-error');
    }

    // 方式2: API Key认证
    try {
      const apiKeyResult = this.verifyAPIKey(req);
      if (apiKeyResult.success) {
        return {
          success: true,
          method: 'apikey',
          metadata: apiKeyResult.metadata,
          attempts: [...attempts, 'apikey']
        };
      }
      attempts.push('apikey-failed');
    } catch (error) {
      attempts.push('apikey-error');
    }

    // 方式3: 请求签名认证
    try {
      const signatureResult = this.verifySignature(req);
      if (signatureResult.success) {
        return {
          success: true,
          method: 'signature',
          metadata: signatureResult.metadata,
          attempts: [...attempts, 'signature']
        };
      }
      attempts.push('signature-failed');
    } catch (error) {
      attempts.push('signature-error');
    }

    return {
      success: false,
      attempts
    };
  }

  /**
   * JWT Token验证
   */
  private async verifyJWT(req: Request): Promise<{ success: boolean; payload?: any }> {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return { success: false };
    }

    const token = authHeader.substring(7);

    try {
      const payload = jwt.verify(token, this.config.jwtSecret);
      return { success: true, payload };
    } catch (error) {
      console.warn('JWT verification failed:', error.message);
      return { success: false };
    }
  }

  /**
   * API Key验证
   */
  private verifyAPIKey(req: Request): { success: boolean; metadata?: any } {
    const apiKey = req.headers['x-api-key'] as string;

    if (!apiKey) {
      return { success: false };
    }

    if (apiKey === this.config.apiKey) {
      return {
        success: true,
        metadata: {
          keyType: 'static',
          timestamp: Date.now()
        }
      };
    }

    return { success: false };
  }

  /**
   * 请求签名验证
   */
  private verifySignature(req: Request): { success: boolean; metadata?: any } {
    const signature = req.headers['x-jenkins-signature'] as string;
    const timestamp = req.headers['x-jenkins-timestamp'] as string;

    if (!signature || !timestamp) {
      return { success: false };
    }

    // 检查时间戳 (5分钟内有效)
    const now = Date.now();
    const requestTime = parseInt(timestamp);
    if (Math.abs(now - requestTime) > 5 * 60 * 1000) {
      console.warn('Request timestamp too old:', new Date(requestTime));
      return { success: false };
    }

    // 生成期望的签名
    const payload = JSON.stringify(req.body) || '';
    const expectedSignature = this.generateSignature(payload, timestamp);

    if (signature === expectedSignature) {
      return {
        success: true,
        metadata: {
          timestamp: requestTime,
          signatureMethod: 'HMAC-SHA256'
        }
      };
    }

    return { success: false };
  }

  /**
   * 生成请求签名
   */
  private generateSignature(payload: string, timestamp: string): string {
    const message = `${timestamp}.${payload}`;
    return crypto
      .createHmac('sha256', this.config.signatureSecret)
      .update(message)
      .digest('hex');
  }

  /**
   * 记录认证成功日志
   */
  private logAuthSuccess(req: AuthenticatedRequest, authResult: any): void {
    const clientIP = this.getClientIP(req);
    console.log(`Jenkins auth success: ${authResult.method} from ${clientIP}`, {
      method: authResult.method,
      ip: clientIP,
      timestamp: new Date().toISOString(),
      userAgent: req.headers['user-agent'],
      endpoint: `${req.method} ${req.path}`
    });
  }

  /**
   * 生成JWT Token (用于Jenkins端)
   */
  generateJWT(payload: any, expiresIn: string = '1h'): string {
    return jwt.sign(payload, this.config.jwtSecret, { expiresIn });
  }

  /**
   * 生成API签名 (用于Jenkins端)
   */
  generateAPISignature(payload: string): { signature: string; timestamp: string } {
    const timestamp = Date.now().toString();
    const signature = this.generateSignature(payload, timestamp);

    return { signature, timestamp };
  }
}

/**
 * 频率限制中间件
 */
export class RateLimitMiddleware {
  private requestCounts = new Map<string, { count: number; resetTime: number }>();
  private readonly maxRequests: number;
  private readonly windowMs: number;

  constructor(maxRequests: number = 100, windowMs: number = 60 * 1000) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
  }

  limit = (req: Request, res: Response, next: NextFunction): void => {
    const clientIP = this.getClientIP(req);
    const now = Date.now();

    // 清理过期的计数记录
    this.cleanupExpiredCounts(now);

    const record = this.requestCounts.get(clientIP);

    if (!record) {
      // 首次请求
      this.requestCounts.set(clientIP, {
        count: 1,
        resetTime: now + this.windowMs
      });
      next();
      return;
    }

    if (now > record.resetTime) {
      // 时间窗口已过期，重置计数
      record.count = 1;
      record.resetTime = now + this.windowMs;
      next();
      return;
    }

    if (record.count >= this.maxRequests) {
      // 超过频率限制
      res.status(429).json({
        error: 'Too many requests',
        message: `Rate limit exceeded. Max ${this.maxRequests} requests per ${this.windowMs / 1000} seconds`,
        retryAfter: Math.ceil((record.resetTime - now) / 1000)
      });
      return;
    }

    // 增加计数
    record.count++;
    next();
  };

  private getClientIP(req: Request): string {
    return (
      req.headers['x-forwarded-for'] as string ||
      req.headers['x-real-ip'] as string ||
      req.connection.remoteAddress ||
      'unknown'
    ).split(',')[0].trim();
  }

  private cleanupExpiredCounts(now: number): void {
    for (const [ip, record] of this.requestCounts.entries()) {
      if (now > record.resetTime) {
        this.requestCounts.delete(ip);
      }
    }
  }
}

// 导出单例实例
export const jenkinsAuthMiddleware = new JenkinsAuthMiddleware();
export const rateLimitMiddleware = new RateLimitMiddleware();