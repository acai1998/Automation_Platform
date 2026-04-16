import fs from 'fs';
import path from 'path';
import logger from './logger';
import { LOG_CONTEXTS } from '../config/logging';

/**
 * 从文件中读取 Secret（Docker Secrets 支持）
 * Docker Secrets 将秘密挂载到 /run/secrets/ 目录
 * 
 * @param secretPath Secret 文件路径
 * @returns Secret 内容（去除首尾空白）
 */
function readSecretFromFile(secretPath: string): string | null {
  try {
    if (fs.existsSync(secretPath)) {
      const content = fs.readFileSync(secretPath, 'utf8').trim();
      logger.debug('Successfully read secret from file', {
        event: 'SECRETS_FILE_READ_SUCCESS',
        secretPath,
      }, LOG_CONTEXTS.SECURITY);
      return content;
    }
  } catch (error) {
    logger.warn('Failed to read secret from file', {
      event: 'SECRETS_FILE_READ_FAILED',
      secretPath,
      error: error instanceof Error ? error.message : String(error),
    }, LOG_CONTEXTS.SECURITY);
  }
  return null;
}

/**
 * 获取环境变量或 Docker Secret
 * 
 * 优先级顺序：
 * 1. 如果存在 {KEY}_FILE 环境变量，从文件读取
 * 2. 否则从普通环境变量读取
 * 3. 如果都不存在，返回默认值
 * 
 * @param key 环境变量名称
 * @param defaultValue 默认值（可选）
 * @returns 配置值
 * 
 * @example
 * // 方式1: 使用普通环境变量
 * // DB_PASSWORD=mypassword
 * getSecretOrEnv('DB_PASSWORD'); // 返回 "mypassword"
 * 
 * // 方式2: 使用 Docker Secret
 * // DB_PASSWORD_FILE=/run/secrets/db_password
 * // /run/secrets/db_password 文件内容: mypassword
 * getSecretOrEnv('DB_PASSWORD'); // 返回 "mypassword"
 */
export function getSecretOrEnv(key: string, defaultValue: string = ''): string {
  // 检查是否有 _FILE 环境变量
  const fileEnvKey = `${key}_FILE`;
  const filePath = process.env[fileEnvKey];
  
  if (filePath) {
    const secretValue = readSecretFromFile(filePath);
    if (secretValue !== null) {
      logger.debug('Using secret from file', {
        event: 'SECRETS_SOURCE_FILE_USED',
        key,
        filePath,
      }, LOG_CONTEXTS.SECURITY);
      return secretValue;
    }
    logger.warn('Secret file env var is set but file is missing or empty', {
      event: 'SECRETS_FILE_ENV_INVALID',
      fileEnvKey,
      filePath,
      key,
    }, LOG_CONTEXTS.SECURITY);
  }
  
  // 回退到普通环境变量
  const envValue = process.env[key];
  if (envValue !== undefined) {
    logger.debug('Using secret from environment variable', {
      event: 'SECRETS_SOURCE_ENV_USED',
      key,
    }, LOG_CONTEXTS.SECURITY);
    return envValue;
  }
  
  // 返回默认值
  if (defaultValue) {
    logger.debug('Using default secret value', {
      event: 'SECRETS_DEFAULT_USED',
      key,
    }, LOG_CONTEXTS.SECURITY);
  }
  return defaultValue;
}

/**
 * 批量获取多个 Secret
 * 
 * @param keys 环境变量名称数组
 * @returns 键值对对象
 * 
 * @example
 * const secrets = getSecretsOrEnv(['DB_PASSWORD', 'JWT_SECRET']);
 * logger.info(secrets.DB_PASSWORD);
 * logger.info(secrets.JWT_SECRET);
 */
export function getSecretsOrEnv(keys: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const key of keys) {
    result[key] = getSecretOrEnv(key);
  }
  return result;
}

/**
 * 检查必需的 Secret 是否存在
 * 
 * @param keys 必需的环境变量名称数组
 * @throws Error 如果有必需的 Secret 缺失
 * 
 * @example
 * validateRequiredSecrets(['DB_PASSWORD', 'JWT_SECRET']);
 */
export function validateRequiredSecrets(keys: string[]): void {
  const missing: string[] = [];
  
  for (const key of keys) {
    const value = getSecretOrEnv(key);
    if (!value) {
      missing.push(key);
    }
  }
  
  if (missing.length > 0) {
    const errorMsg = `Missing required secrets or environment variables: ${missing.join(', ')}`;
    logger.error(errorMsg, {
      event: 'SECRETS_REQUIRED_MISSING',
      missing,
    }, LOG_CONTEXTS.SECURITY);
    throw new Error(errorMsg);
  }
  
  logger.info('All required secrets validated successfully', {
    event: 'SECRETS_REQUIRED_VALIDATED',
    keys,
  }, LOG_CONTEXTS.SECURITY);
}

/**
 * 获取 Secret 来源信息（用于调试）
 * 
 * @param key 环境变量名称
 * @returns Secret 来源信息
 */
export function getSecretSource(key: string): {
  source: 'file' | 'env' | 'none';
  path?: string;
  exists: boolean;
} {
  const fileEnvKey = `${key}_FILE`;
  const filePath = process.env[fileEnvKey];
  
  if (filePath) {
    const exists = fs.existsSync(filePath);
    return {
      source: 'file',
      path: filePath,
      exists,
    };
  }
  
  if (process.env[key] !== undefined) {
    return {
      source: 'env',
      exists: true,
    };
  }
  
  return {
    source: 'none',
    exists: false,
  };
}

/**
 * 列出所有 Secret 的状态（用于调试）
 * 
 * @param keys 要检查的 Secret 名称列表
 */
export function listSecretsStatus(keys: string[]): void {
  logger.info('Secrets status check started', {
    event: 'SECRETS_STATUS_CHECK_STARTED',
    keyCount: keys.length,
  }, LOG_CONTEXTS.SECURITY);
  
  for (const key of keys) {
    const source = getSecretSource(key);
    const value = getSecretOrEnv(key);
    const hasValue = value ? '✓' : '✗';
    
    logger.info('Secret status item', {
      event: 'SECRETS_STATUS_ITEM',
      key,
      hasValueSymbol: hasValue,
      source: source.source,
      path: source.path,
      exists: source.exists,
      hasValue: !!value,
      valueLength: value ? value.length : 0,
    }, LOG_CONTEXTS.SECURITY);
  }
  
  logger.info('Secrets status check completed', {
    event: 'SECRETS_STATUS_CHECK_COMPLETED',
  }, LOG_CONTEXTS.SECURITY);
}

export default {
  getSecretOrEnv,
  getSecretsOrEnv,
  validateRequiredSecrets,
  getSecretSource,
  listSecretsStatus,
};
