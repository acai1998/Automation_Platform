import { Request, Response, NextFunction } from 'express';

/**
 * IP 白名单验证中间件
 * 用于验证 Jenkins 回调请求的来源 IP
 */
export class IPWhitelistMiddleware {
  private readonly allowedIPs: string[];

  constructor() {
    this.allowedIPs = this.loadAllowedIPs();
  }

  /**
   * 从环境变量加载 IP 白名单
   */
  private loadAllowedIPs(): string[] {
    const allowedIPsStr = process.env.JENKINS_ALLOWED_IPS;
    const allowedIPs = (allowedIPsStr || '')
      .split(',')
      .map(ip => ip.trim())
      .filter(ip => ip.length > 0);

    if (allowedIPs.length > 0) {
      console.log(`✅ Jenkins IP 白名单已启用 (${allowedIPs.length} 条规则):`);
      allowedIPs.forEach(ip => console.log(`   - ${ip}`));
    } else {
      console.warn('⚠️  警告：未配置 JENKINS_ALLOWED_IPS，将允许所有 IP 访问 Jenkins 回调接口');
      console.warn('   建议配置 IP 白名单以提高安全性');
    }

    return allowedIPs;
  }

  /**
   * 获取客户端真实 IP
   * 优先从代理头获取，其次从 socket 获取
   */
  private getClientIP(req: Request): string {
    const forwarded = req.headers['x-forwarded-for'];
    const xRealIp = req.headers['x-real-ip'];
    const cfConnectingIp = req.headers['cf-connecting-ip'];
    const xClientIp = req.headers['x-client-ip'];
    const socketAddress = req.socket?.remoteAddress;

    let ipStr: string;

    if (Array.isArray(forwarded)) {
      ipStr = forwarded[0];
    } else if (forwarded) {
      ipStr = forwarded as string;
    } else if (typeof xRealIp === 'string') {
      ipStr = xRealIp;
    } else if (typeof cfConnectingIp === 'string') {
      ipStr = cfConnectingIp;
    } else if (typeof xClientIp === 'string') {
      ipStr = xClientIp;
    } else {
      ipStr = socketAddress || 'unknown';
    }

    const clientIP = ipStr.split(',')[0].trim();

    if (process.env.NODE_ENV === 'development' && process.env.JENKINS_DEBUG_IP === 'true') {
      console.debug(`[IP-DETECTION] Detected IP: ${clientIP}`, {
        sources: {
          forwarded: Array.isArray(forwarded) ? forwarded[0] : forwarded,
          xRealIp,
          cfConnectingIp,
          xClientIp,
          socketAddress,
        }
      });
    }

    return clientIP.toLowerCase();
  }

  /**
   * 检查 IP 是否在 CIDR 范围内
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
          const bits = prefixLength % 8 || 8;
          const mask = (0xff << (8 - bits)) & 0xff;
          if ((networkNum & mask) !== (ipNum & mask)) {
            return false;
          }
        } else {
          if (networkNum !== ipNum) {
            return false;
          }
        }
      }

      return true;
    } catch (error) {
      console.error(`Error checking CIDR ${cidr}:`, error);
      return false;
    }
  }

  /**
   * 验证 IP 是否在白名单中
   */
  private verifyIP(req: Request): boolean {
    // 如果没有配置 IP 白名单，则允许所有请求
    if (this.allowedIPs.length === 0) {
      return true;
    }

    const clientIP = this.getClientIP(req);
    const isAllowed = this.allowedIPs.some((allowedIP) => {
      if (allowedIP.includes('/')) {
        // CIDR 格式
        return this.isIPInCIDR(clientIP, allowedIP);
      } else {
        // 精确匹配或 localhost 变体
        return (
          clientIP === allowedIP ||
          (allowedIP === 'localhost' &&
            ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(clientIP))
        );
      }
    });

    if (!isAllowed) {
      console.warn(
        `Jenkins callback: IP ${clientIP} not in allowed list:`,
        this.allowedIPs
      );
    }

    return isAllowed;
  }

  /**
   * IP 验证中间件
   */
  public verify = (
    req: Request,
    res: Response,
    next: NextFunction
  ): void => {
    try {
      if (!this.verifyIP(req)) {
        res.status(403).json({
          error: 'IP not allowed',
          message: 'Your IP address is not in the allowed list',
          clientIP: this.getClientIP(req),
        });
        return;
      }

      const clientIP = this.getClientIP(req);
      console.log(`[Jenkins IP Whitelist] ✅ Access allowed from IP: ${clientIP}`, {
        endpoint: `${req.method} ${req.path}`,
        timestamp: new Date().toISOString(),
      });

      next();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('IP whitelist middleware error:', message);
      res.status(500).json({
        error: 'Verification error',
        message: 'Internal server error during IP verification',
      });
    }
  };

  /**
   * 清理资源（用于服务器关闭时）
   */
  public cleanup(): void {
    console.log('IPWhitelistMiddleware cleaned up');
  }
}

/**
 * 频率限制中间件
 * 防止 Jenkins 接口被滥用
 */
export class RateLimitMiddleware {
  private readonly requestCounts = new Map<string, { count: number; resetTime: number }>();
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
   * 获取客户端 IP
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
export const ipWhitelistMiddleware = new IPWhitelistMiddleware();
export const rateLimitMiddleware = new RateLimitMiddleware();

// 保持向后兼容性
export const jenkinsAuthMiddleware = ipWhitelistMiddleware;
