/**
 * Jenkins 认证中间件 - 类型定义
 * 用于定义认证相关的接口和类型，保证类型安全
 */

/**
 * JWT 负载中的用户信息
 */
export interface JWTPayload {
  sub?: string;
  iat?: number;
  exp?: number;
  [key: string]: unknown;
}

/**
 * API Key 认证的元数据
 */
export interface APIKeyMetadata {
  keyType: 'static';
  timestamp: number;
}

/**
 * 签名认证的元数据
 */
export interface SignatureMetadata {
  timestamp: number;
  signatureMethod: 'HMAC-SHA256';
}

/**
 * JWT 认证的元数据
 */
export interface JWTMetadata extends JWTPayload {
  authenticatedAt?: number;
}

/**
 * 认证元数据的联合类型
 */
export type AuthMetadata = JWTMetadata | APIKeyMetadata | SignatureMetadata;

/**
 * 认证来源类型
 */
export type AuthSource = 'jwt' | 'apikey' | 'signature';

/**
 * Jenkins 认证配置
 */
export interface JenkinsAuthConfig {
  apiKey: string;
  jwtSecret: string;
  allowedIPs: string[];
  signatureSecret: string;
}

/**
 * 认证结果对象
 */
export interface AuthenticationResult {
  success: boolean;
  method?: AuthSource;
  metadata?: AuthMetadata;
  payload?: JWTPayload;
  attempts: string[];
  error?: string;
}

/**
 * JWT 验证结果
 */
export interface JWTVerificationResult {
  success: boolean;
  payload?: JWTPayload;
  error?: string;
}

/**
 * API Key 验证结果
 */
export interface APIKeyVerificationResult {
  success: boolean;
  metadata?: APIKeyMetadata;
  error?: string;
}

/**
 * 签名验证结果
 */
export interface SignatureVerificationResult {
  success: boolean;
  metadata?: SignatureMetadata;
  error?: string;
}

/**
 * 认证信息（附加到 Request 对象上）
 */
export interface JenkinsAuthInfo {
  verified: boolean;
  source: AuthSource;
  metadata?: AuthMetadata;
}

/**
 * 速率限制计数记录
 */
export interface RateLimitRecord {
  count: number;
  resetTime: number;
}

/**
 * 速率限制配置
 */
export interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
}

/**
 * 重放攻击防护的签名记录
 */
export interface SignatureUsageRecord {
  timestamp: number;
  expiresAt: number;
}

/**
 * 验证错误类型
 */
export enum AuthErrorType {
  IP_NOT_ALLOWED = 'IP_NOT_ALLOWED',
  INVALID_CREDENTIALS = 'INVALID_CREDENTIALS',
  INVALID_JWT = 'INVALID_JWT',
  INVALID_API_KEY = 'INVALID_API_KEY',
  INVALID_SIGNATURE = 'INVALID_SIGNATURE',
  TIMESTAMP_EXPIRED = 'TIMESTAMP_EXPIRED',
  SIGNATURE_REPLAY = 'SIGNATURE_REPLAY',
  MISSING_ENV_VARS = 'MISSING_ENV_VARS',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
}

/**
 * 认证异常
 */
export class AuthenticationError extends Error {
  constructor(
    public readonly type: AuthErrorType,
    message: string,
    public readonly statusCode: number = 401
  ) {
    super(message);
    this.name = 'AuthenticationError';
  }
}
