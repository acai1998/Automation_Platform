/**
 * 数据库配置统一管理
 * 解决 dataSource.ts 和 database.ts 中重复配置的问题
 */

// 配置常量
export const DB_CONFIG_CONSTANTS = {
  // 连接配置
  DEFAULT_PORT: 3306,
  DEFAULT_HOST: 'localhost',
  DEFAULT_USER: 'root',
  DEFAULT_DATABASE: 'autotest',

  // 连接池配置
  CONNECTION_LIMIT: 10, // 增加连接数以支持更高并发
  QUEUE_LIMIT: 20, // 设置队列限制避免内存泄漏
  CONNECT_TIMEOUT: 10000, // 10秒连接超时
  IDLE_TIMEOUT: 60000, // 60秒空闲超时
  KEEP_ALIVE_DELAY: 10000, // 10秒保活延迟

  // 重试配置
  RETRY_ATTEMPTS: 3,
  RETRY_DELAY: 3000, // 3秒重试延迟

  // 字符集和时区
  CHARSET: 'utf8mb4',
  COLLATION: 'utf8mb4_unicode_ci',
  TIMEZONE: '+08:00',
} as const;

// 环境变量验证接口
interface DbEnvironmentConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
}

/**
 * 安全解析端口号
 * @param portStr 端口字符串
 * @param defaultPort 默认端口
 * @returns 有效的端口号
 */
function parsePort(portStr: string | undefined, defaultPort: number): number {
  if (!portStr) return defaultPort;

  const port = parseInt(portStr, 10);
  if (isNaN(port) || port <= 0 || port > 65535) {
    throw new Error(`Invalid port number: ${portStr}. Port must be between 1 and 65535.`);
  }
  return port;
}

/**
 * 验证必需的环境变量
 * @param config 配置对象
 * @throws Error 如果必需的环境变量缺失
 */
function validateRequiredConfig(config: Partial<DbEnvironmentConfig>): void {
  const missingVars: string[] = [];

  if (!config.password && process.env.NODE_ENV === 'production') {
    missingVars.push('DB_PASSWORD');
  }

  if (missingVars.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missingVars.join(', ')}. ` +
      'Please check your environment configuration.'
    );
  }
}

/**
 * 获取验证后的数据库配置
 * @returns 安全的数据库配置
 */
export function getDbConfig(): DbEnvironmentConfig {
  const config: Partial<DbEnvironmentConfig> = {
    host: process.env.DB_HOST || DB_CONFIG_CONSTANTS.DEFAULT_HOST,
    port: parsePort(process.env.DB_PORT, DB_CONFIG_CONSTANTS.DEFAULT_PORT),
    username: process.env.DB_USER || DB_CONFIG_CONSTANTS.DEFAULT_USER,
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || DB_CONFIG_CONSTANTS.DEFAULT_DATABASE,
  };

  // 验证必需的配置
  validateRequiredConfig(config);

  return config as DbEnvironmentConfig;
}

/**
 * 获取 MySQL2 连接池配置
 */
export function getMysql2PoolConfig() {
  const dbConfig = getDbConfig();

  return {
    host: dbConfig.host,
    port: dbConfig.port,
    user: dbConfig.username,
    password: dbConfig.password,
    database: dbConfig.database,
    waitForConnections: true,
    connectionLimit: DB_CONFIG_CONSTANTS.CONNECTION_LIMIT,
    queueLimit: DB_CONFIG_CONSTANTS.QUEUE_LIMIT,
    enableKeepAlive: true,
    keepAliveInitialDelay: DB_CONFIG_CONSTANTS.KEEP_ALIVE_DELAY,
    connectTimeout: DB_CONFIG_CONSTANTS.CONNECT_TIMEOUT,
    idleTimeout: DB_CONFIG_CONSTANTS.IDLE_TIMEOUT,
    charset: DB_CONFIG_CONSTANTS.CHARSET,
  };
}

/**
 * 获取 TypeORM 连接配置
 */
export function getTypeOrmConfig() {
  const dbConfig = getDbConfig();

  return {
    type: 'mysql' as const,
    host: dbConfig.host,
    port: dbConfig.port,
    username: dbConfig.username,
    password: dbConfig.password,
    database: dbConfig.database,
    charset: DB_CONFIG_CONSTANTS.CHARSET,
    timezone: DB_CONFIG_CONSTANTS.TIMEZONE,
  };
}

/**
 * 过滤敏感信息用于日志记录
 * @param config 原始配置
 * @returns 过滤后的配置（不包含密码）
 */
export function sanitizeConfigForLogging(config: any): Record<string, unknown> {
  const { password, ...safeConfig } = config;
  return {
    ...safeConfig,
    password: password ? '***' : undefined,
  };
}

export default {
  getDbConfig,
  getMysql2PoolConfig,
  getTypeOrmConfig,
  sanitizeConfigForLogging,
  constants: DB_CONFIG_CONSTANTS,
};