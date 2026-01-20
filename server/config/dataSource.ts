import 'reflect-metadata';
import { DataSource, DataSourceOptions } from 'typeorm';
import logger from '../utils/logger.js';
import { getTypeOrmConfig, sanitizeConfigForLogging, DB_CONFIG_CONSTANTS } from './dbConfig.js';
import * as path from 'path';

/**
 * 获取实体文件路径
 * 根据环境动态确定实体文件的加载路径
 */
function getEntityPaths(): string[] {
  const isJsRuntime = path.extname(__filename) === '.js';
  const entityPath = isJsRuntime
    ? path.resolve(process.cwd(), 'dist', 'server', 'server', 'entities', '*.js')
    : path.resolve(process.cwd(), 'server', 'entities', '*.ts');
  return [entityPath];
}

/**
 * 构建 TypeORM 数据源配置
 */
function createDataSourceOptions(): DataSourceOptions {
  const baseConfig = getTypeOrmConfig();

  return {
    ...baseConfig,
    // 实体路径配置 - 使用动态路径解析
    entities: getEntityPaths(),
    // 同步选项 - 生产环境禁用，开发环境谨慎启用
    synchronize: process.env.NODE_ENV === 'development' && process.env.DB_SYNC === 'true',
    // 连接池配置 - 使用统一的配置常量
    extra: {
      connectionLimit: DB_CONFIG_CONSTANTS.CONNECTION_LIMIT,
      waitForConnections: true,
      queueLimit: DB_CONFIG_CONSTANTS.QUEUE_LIMIT,
      enableKeepAlive: true,
      keepAliveInitialDelay: DB_CONFIG_CONSTANTS.KEEP_ALIVE_DELAY,
      connectTimeout: DB_CONFIG_CONSTANTS.CONNECT_TIMEOUT,
      idleTimeout: DB_CONFIG_CONSTANTS.IDLE_TIMEOUT,
    },
    // 日志配置 - 开发环境启用详细日志
    logging: process.env.NODE_ENV === 'development' ? ['query', 'error', 'schema', 'warn'] : ['error'],
    logger: 'advanced-console',
    // 连接选项
    connectTimeout: DB_CONFIG_CONSTANTS.CONNECT_TIMEOUT,
    acquireTimeout: DB_CONFIG_CONSTANTS.CONNECT_TIMEOUT,
    timeout: DB_CONFIG_CONSTANTS.CONNECT_TIMEOUT,
  } as DataSourceOptions;
}

// 创建数据源配置
const dataSourceOptions = createDataSourceOptions();

// 创建数据源实例
export const AppDataSource = new DataSource(dataSourceOptions);

// 初始化数据源
export async function initializeDataSource(): Promise<DataSource> {
  try {
    if (!AppDataSource.isInitialized) {
      // 记录初始化开始
      logger.info('Initializing TypeORM DataSource...', sanitizeConfigForLogging(dataSourceOptions));

      await AppDataSource.initialize();

      // 记录初始化成功，包含实体统计信息
      const entityNames = AppDataSource.entityMetadatas.map(metadata => metadata.name);
      logger.info('TypeORM DataSource initialized successfully', {
        ...sanitizeConfigForLogging(dataSourceOptions),
        entitiesCount: AppDataSource.entityMetadatas.length,
        entityNames: entityNames,
        connectionPoolSize: dataSourceOptions.extra?.connectionLimit || 'default',
      });
    } else {
      logger.debug('TypeORM DataSource already initialized, skipping...');
    }
    return AppDataSource;
  } catch (error) {
    // 增强错误日志，包含更多诊断信息
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;

    logger.error('Failed to initialize TypeORM DataSource', {
      error: errorMessage,
      stack: errorStack,
      config: sanitizeConfigForLogging(dataSourceOptions),
      entityPaths: dataSourceOptions.entities,
      nodeEnv: process.env.NODE_ENV,
    });

    // 重新抛出错误，保持原始错误信息
    throw new Error(`Database initialization failed: ${errorMessage}`);
  }
}

// 关闭数据源连接
export async function closeDataSource(): Promise<void> {
  try {
    if (AppDataSource.isInitialized) {
      logger.info('Closing TypeORM DataSource...');

      // 优雅关闭：等待所有活跃连接完成
      await AppDataSource.destroy();

      logger.info('TypeORM DataSource closed successfully', {
        database: (dataSourceOptions as any).database,
        host: (dataSourceOptions as any).host,
      });
    } else {
      logger.debug('TypeORM DataSource not initialized, nothing to close');
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;

    logger.error('Error closing TypeORM DataSource', {
      error: errorMessage,
      stack: errorStack,
      config: sanitizeConfigForLogging(dataSourceOptions),
    });

    // 重新抛出错误以便调用方处理
    throw new Error(`Database connection close failed: ${errorMessage}`);
  }
}

/**
 * 健康检查函数 - 验证数据源连接状态
 * @returns Promise<boolean> 连接是否健康
 */
export async function checkDataSourceHealth(): Promise<boolean> {
  try {
    if (!AppDataSource.isInitialized) {
      logger.warn('DataSource not initialized for health check');
      return false;
    }

    // 执行简单查询测试连接
    await AppDataSource.query('SELECT 1 as health_check');

    logger.debug('DataSource health check passed');
    return true;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('DataSource health check failed', {
      error: errorMessage,
      isInitialized: AppDataSource.isInitialized,
    });
    return false;
  }
}

/**
 * 获取数据源统计信息
 * @returns 数据源状态统计
 */
export function getDataSourceStats() {
  if (!AppDataSource.isInitialized) {
    return {
      isInitialized: false,
      entitiesCount: 0,
      entityNames: [],
    };
  }

  return {
    isInitialized: true,
    entitiesCount: AppDataSource.entityMetadatas.length,
    entityNames: AppDataSource.entityMetadatas.map(metadata => metadata.name),
    driverType: AppDataSource.driver.constructor.name,
    database: AppDataSource.options.database,
  };
}

export default AppDataSource;
