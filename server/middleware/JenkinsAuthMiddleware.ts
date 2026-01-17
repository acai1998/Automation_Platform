import { Request, Response, NextFunction } from 'express';
import jwt, { JwtPayload } from 'jsonwebtoken';
import crypto from 'crypto';
import {
  JenkinsAuthConfig,
  JenkinsAuthInfo,
  AuthenticationResult,
  JWTVerificationResult,
  APIKeyVerificationResult,
  SignatureVerificationResult,
  RateLimitRecord,
  SignatureUsageRecord,
  AuthErrorType,
  AuthenticationError,
} from '../../shared/types/jenkins-auth.js';

/**
 * 扩展 Express Request 类型以包含 Jenkins 认证信息
 */
declare global {
  namespace Express {
    interface Request {
      jenkinsAuth?: JenkinsAuthInfo;
    }
  }
}

/**
 * Jenkins 认证中间件类
 * 支持三种认证方式：JWT Token、API Key、请求签名
 */
export class JenkinsAuthMiddleware {
  private readonly config: JenkinsAuthConfig;
  private readonly usedSignatures = new Map<string, SignatureUsageRecord>();
  private readonly signatureCleanupInterval: NodeJS.Timeout;
  private readonly signatureExpiryMs: number = 5 * 60 * 1000; // 5分钟

  constructor() {
    this.config = this.validateAndLoadConfig();

    // 每 5 分钟清理一次过期的签名记录
    this.signatureCleanupInterval = setInterval(() => {
      this.cleanupExpiredSignatures();
    }, 5 * 60 * 1000) as NodeJS.Timeout;
  }

  /**
   * 验证并加载 Jenkins 认证配置
   * 启动时检查必需的环境变量
   */
  private validateAndLoadConfig(): JenkinsAuthConfig {
    const apiKey = process.env.JENKINS_API_KEY;
    const jwtSecret = process.env.JENKINS_JWT_SECRET;
    const signatureSecret = process.env.JENKINS_SIGNATURE_SECRET;
    const allowedIPsStr = process.env.JENKINS_ALLOWED_IPS;

    // 校验必需的环境变量
    if (!apiKey) {
      throw new AuthenticationError(
        AuthErrorType.MISSING_ENV_VARS,
        'Missing required environment variable: JENKINS_API_KEY',
        500
      );
    }
    if (!jwtSecret) {
      throw new AuthenticationError(
        AuthErrorType.MISSING_ENV_VARS,
        'Missing required environment variable: JENKINS_JWT_SECRET',
        500
      );
    }
    if (!signatureSecret) {
      throw new AuthenticationError(
        AuthErrorType.MISSING_ENV_VARS,
        'Missing required environment variable: JENKINS_SIGNATURE_SECRET',
        500
      );
    }

    return {
      apiKey,
      jwtSecret,
      signatureSecret,
      allowedIPs: (allowedIPsStr || '').split(',').filter(ip => ip.trim()),
    };
  }

  /**
   * 主验证中间件 - 支持多种认证方式
   */
  public verify = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      // 1. IP白名单检查
      if (!this.verifyIP(req)) {
        res.status(403).json({
          error: 'IP not allowed',
          message: 'Your IP address is not in the allowed list',
        });
        return;
      }

      // 2. 尝试多种认证方式
      const authResult = await this.tryMultipleAuth(req);

      if (!authResult.success) {
        res.status(401).json({
          error: 'Authentication failed',
          message: 'Invalid or missing authentication credentials',
          attempts: authResult.attempts,
        });
        return;
      }

      // 3. 设置认证信息到请求对象
      if (authResult.method && authResult.metadata) {
        req.jenkinsAuth = {
          verified: true,
          source: authResult.method,
          metadata: authResult.metadata,
        };
      }

      // 4. 记录认证成功日志
      this.logAuthSuccess(req, authResult);

      next();
    } catch (error) {
      const message = this.getErrorMessage(error);
      console.error('Jenkins auth middleware error:', message);
      res.status(500).json({
        error: 'Authentication error',
        message: 'Internal server error during authentication',
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
    const isAllowed = this.config.allowedIPs.some((allowedIP) => {
      if (allowedIP.includes('/')) {
        // CIDR格式支持 (例如: 192.168.1.0/24)
        return this.isIPInCIDR(clientIP, allowedIP);
      } else {
        // 精确匹配或localhost变体
        return (
          clientIP === allowedIP ||
          (allowedIP === 'localhost' &&
            ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(clientIP))
        );
      }
    });

    if (!isAllowed) {
      console.warn(
        `Jenkins auth: IP ${clientIP} not in allowed list:`,
        this.config.allowedIPs
      );
    }

    return isAllowed;
  }

  /**
   * 获取客户端真实IP
   * 优先从代理头获取，其次从 socket 获取
   */
  private getClientIP(req: Request): string {
    const forwarded = req.headers['x-forwarded-for'];
    const xRealIp = req.headers['x-real-ip'];
    const socketAddress = req.socket?.remoteAddress;

    const ipStr = Array.isArray(forwarded)
      ? forwarded[0]
      : forwarded || (typeof xRealIp === 'string' ? xRealIp : socketAddress) || 'unknown';

    return ipStr.split(',')[0].trim().toLowerCase();
  }

  /**
   * 检查IP是否在CIDR范围内
   * 注意：这是简化实现，生产环境建议使用 ipaddr.js 或 ip 库
   */
  private isIPInCIDR(ip: string, cidr: string): boolean {
    try {
      const [network, prefixLengthStr] = cidr.split('/');
      if (!prefixLengthStr) {
        return ip === network;
      }

      const prefixLength = parseInt(prefixLengthStr, 10);
      if (Number.isNaN(prefixLength) || prefixLength < 0 || prefixLength > 32) {
        console.warn(`Invalid CIDR prefix length: ${prefixLengthStr}`);
        return false;
      }

      const networkParts = network.split('.');
      const ipParts = ip.split('.');

      // 验证 IP 格式
      if (
        networkParts.length !== 4 ||
        ipParts.length !== 4 ||
        networkParts.some(p => {
          const num = parseInt(p, 10);
          return Number.isNaN(num) || num < 0 || num > 255;
        }) ||
        ipParts.some(p => {
          const num = parseInt(p, 10);
          return Number.isNaN(num) || num < 0 || num > 255;
        })
      ) {
        return false;
      }

      // 比较网络部分
      const bytes = Math.ceil(prefixLength / 8);
      for (let i = 0; i < bytes; i++) {
        const networkNum = parseInt(networkParts[i], 10);
        const ipNum = parseInt(ipParts[i], 10);

        if (i === bytes - 1) {
          // 最后一个字节，需要比较前 (prefixLength % 8) 位
          const bits = prefixLength % 8 || 8;
          const mask = (0xff << (8 - bits)) & 0xff;
          if ((networkNum & mask) !== (ipNum & mask)) {
            return false;
          }
        } else {
          // 全部比较
          if (networkNum !== ipNum) {
            return false;
          }
        }
      }

      return true;
    } catch (error) {
      console.error(`Error checking CIDR ${cidr}:`, this.getErrorMessage(error));
      return false;
    }
  }

  /**
   * 尝试多种认证方式
   */
  private async tryMultipleAuth(req: Request): Promise<AuthenticationResult> {
    const attempts: string[] = [];

    // 方式1: JWT Token认证
    try {
      const jwtResult = await this.verifyJWT(req);
      if (jwtResult.success && jwtResult.payload) {
        return {
          success: true,
          method: 'jwt',
          metadata: jwtResult.payload as unknown as any,
          attempts: ['jwt'],
        };
      }
      attempts.push('jwt-failed');
    } catch (error) {
      attempts.push('jwt-error');
      console.debug('JWT verification error:', this.getErrorMessage(error));
    }

    // 方式2: API Key认证
    try {
      const apiKeyResult = this.verifyAPIKey(req);
      if (apiKeyResult.success && apiKeyResult.metadata) {
        return {
          success: true,
          method: 'apikey',
          metadata: apiKeyResult.metadata,
          attempts: [...attempts, 'apikey'],
        };
      }
      attempts.push('apikey-failed');
    } catch (error) {
      attempts.push('apikey-error');
      console.debug('API Key verification error:', this.getErrorMessage(error));
    }

    // 方式3: 请求签名认证
    try {
      const signatureResult = this.verifySignature(req);
      if (signatureResult.success && signatureResult.metadata) {
        return {
          success: true,
          method: 'signature',
          metadata: signatureResult.metadata,
          attempts: [...attempts, 'signature'],
        };
      }
      attempts.push('signature-failed');
    } catch (error) {
      attempts.push('signature-error');
      console.debug('Signature verification error:', this.getErrorMessage(error));
    }

    return {
      success: false,
      attempts,
    };
  }

  /**
   * JWT Token验证
   */
  private async verifyJWT(req: Request): Promise<JWTVerificationResult> {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return { success: false };
    }

    const token = authHeader.substring(7);

    try {
      const payload = jwt.verify(token, this.config.jwtSecret) as JwtPayload;
      return { success: true, payload };
    } catch (error) {
      const message = this.getErrorMessage(error);
      console.warn('JWT verification failed:', message);
      return { success: false, error: message };
    }
  }

  /**
   * API Key验证
   */
  private verifyAPIKey(req: Request): APIKeyVerificationResult {
    const apiKey = req.headers['x-api-key'] as string | undefined;

    if (!apiKey) {
      return { success: false };
    }

    if (apiKey === this.config.apiKey) {
      return {
        success: true,
        metadata: {
          keyType: 'static',
          timestamp: Date.now(),
        },
      };
    }

    return { success: false, error: 'Invalid API Key' };
  }

  /**
   * 请求签名验证
   */
  private verifySignature(req: Request): SignatureVerificationResult {
    const signature = req.headers['x-jenkins-signature'] as string | undefined;
    const timestamp = req.headers['x-jenkins-timestamp'] as string | undefined;

    if (!signature || !timestamp) {
      return { success: false };
    }

    // 检查时间戳 (5分钟内有效)
    const now = Date.now();
    const requestTime = parseInt(timestamp, 10);
    if (Number.isNaN(requestTime)) {
      return { success: false, error: 'Invalid timestamp format' };
    }

    if (Math.abs(now - requestTime) > this.signatureExpiryMs) {
      console.warn('Request timestamp too old:', new Date(requestTime));
      return { success: false, error: 'Request timestamp expired' };
    }

    // 检查重放攻击
    const signatureKey = `${signature}-${timestamp}`;
    if (this.usedSignatures.has(signatureKey)) {
      console.warn('Signature replay detected:', signatureKey);
      return { success: false, error: 'Signature replay detected' };
    }

    // 生成期望的签名
    const payload = JSON.stringify(req.body) || '';
    const expectedSignature = this.generateSignature(payload, timestamp);

    if (signature === expectedSignature) {
      // 记录已使用的签名
      this.usedSignatures.set(signatureKey, {
        timestamp: now,
        expiresAt: now + this.signatureExpiryMs,
      });

      return {
        success: true,
        metadata: {
          timestamp: requestTime,
          signatureMethod: 'HMAC-SHA256',
        },
      };
    }

    return { success: false, error: 'Invalid signature' };
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
   * 清理过期的签名记录（防止内存泄漏）
   */
  private cleanupExpiredSignatures(): void {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [key, record] of this.usedSignatures.entries()) {
      if (now > record.expiresAt) {
        this.usedSignatures.delete(key);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      console.debug(`Cleaned up ${cleanedCount} expired signature records`);
    }
  }

  /**
   * 记录认证成功日志
   */
  private logAuthSuccess(req: Request, authResult: AuthenticationResult): void {
    const clientIP = this.getClientIP(req);
    console.log(`Jenkins auth success: ${authResult.method} from ${clientIP}`, {
      method: authResult.method,
      ip: clientIP,
      timestamp: new Date().toISOString(),
      userAgent: req.headers['user-agent'],
      endpoint: `${req.method} ${req.path}`,
    });
  }

   /**
    * 生成JWT Token (用于Jenkins端)
    */
   public generateJWT(
     payload: Record<string, unknown>,
     expiresIn: string = '1h'
   ): string {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
     return jwt.sign(payload, this.config.jwtSecret, { expiresIn } as any);
   }

  /**
   * 生成API签名 (用于Jenkins端)
   */
  public generateAPISignature(payload: string): { signature: string; timestamp: string } {
    const timestamp = Date.now().toString();
    const signature = this.generateSignature(payload, timestamp);

    return { signature, timestamp };
  }

  /**
   * 清理资源（用于服务器关闭时）
   */
  public cleanup(): void {
    clearInterval(this.signatureCleanupInterval);
    this.usedSignatures.clear();
    console.log('JenkinsAuthMiddleware cleaned up');
  }

  /**
   * 获取错误消息的辅助函数
   */
  private getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    if (typeof error === 'string') {
      return error;
    }
    return 'Unknown error';
  }
}

/**
 * 频率限制中间件
 * 防止 Jenkins 接口被滥用
 */
export class RateLimitMiddleware {
  private readonly requestCounts = new Map<string, RateLimitRecord>();
  private readonly maxRequests: number;
  private readonly windowMs: number;
  private readonly cleanupInterval: NodeJS.Timeout;

  constructor(maxRequests: number = 100, windowMs: number = 60 * 1000) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;

    // 每 10 分钟执行一次清理
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredCounts();
    }, 10 * 60 * 1000) as NodeJS.Timeout;
  }

  /**
   * 频率限制中间件函数
   */
  public limit = (req: Request, res: Response, next: NextFunction): void => {
    const clientIP = this.getClientIP(req);
    const now = Date.now();

    const record = this.requestCounts.get(clientIP);

    if (!record) {
      // 首次请求
      this.requestCounts.set(clientIP, {
        count: 1,
        resetTime: now + this.windowMs,
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
      const retryAfterSeconds = Math.ceil((record.resetTime - now) / 1000);
      res.set('Retry-After', retryAfterSeconds.toString());
      res.status(429).json({
        error: 'Too many requests',
        message: `Rate limit exceeded. Max ${this.maxRequests} requests per ${this.windowMs / 1000} seconds`,
        retryAfter: retryAfterSeconds,
      });
      return;
    }

    // 增加计数
    record.count++;
    next();
  };

  /**
   * 获取客户端IP
   */
  private getClientIP(req: Request): string {
    const forwarded = req.headers['x-forwarded-for'];
    const xRealIp = req.headers['x-real-ip'];
    const socketAddress = req.socket?.remoteAddress;

    const ipStr = Array.isArray(forwarded)
      ? forwarded[0]
      : forwarded || (typeof xRealIp === 'string' ? xRealIp : socketAddress) || 'unknown';

    return ipStr.split(',')[0].trim().toLowerCase();
  }

  /**
   * 清理过期的计数记录
   */
  private cleanupExpiredCounts(): void {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [ip, record] of this.requestCounts.entries()) {
      if (now > record.resetTime) {
        this.requestCounts.delete(ip);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      console.debug(`Rate limit: Cleaned up ${cleanedCount} expired records`);
    }
  }

  /**
   * 清理资源（用于服务器关闭时）
   */
  public cleanup(): void {
    clearInterval(this.cleanupInterval);
    this.requestCounts.clear();
    console.log('RateLimitMiddleware cleaned up');
  }
}

// 导出单例实例
export const jenkinsAuthMiddleware = new JenkinsAuthMiddleware();
export const rateLimitMiddleware = new RateLimitMiddleware();
