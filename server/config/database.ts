import mysql from 'mysql2/promise';
import logger from '../utils/logger';
import { LOG_CONTEXTS, createTimer } from './logging';
import { AppDataSource, initializeDataSource } from './dataSource';

// MariaDB 连接配置
const DB_NAME = process.env.DB_NAME || 'autotest';

const dbConfigWithoutDB = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306'),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD,
  waitForConnections: true,
  connectionLimit: 5,  // 减少连接数限制
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000,
  // 连接超时和空闲超时配置
  connectTimeout: 10000,  // 连接超时 10 秒
  idleTimeout: 60000,     // 空闲连接 60 秒后释放
};

const dbConfig = {
  ...dbConfigWithoutDB,
  database: DB_NAME,
};

// 创建连接池
let pool: mysql.Pool | null = null;
let dbInitialized = false;

export function getPool(): mysql.Pool {
  if (!pool) {
    pool = mysql.createPool(dbConfig);
    logger.info('MariaDB connection pool created', {
      host: dbConfig.host,
      port: dbConfig.port,
      database: dbConfig.database,
      connectionLimit: dbConfig.connectionLimit,
    }, LOG_CONTEXTS.DATABASE);
  }
  return pool;
}

// 获取单个连接
export async function getConnection(): Promise<mysql.PoolConnection> {
  const pool = getPool();
  return pool.getConnection();
}

// 执行查询
export async function query<T>(sql: string, params?: unknown[]): Promise<T> {
  const timer = createTimer();
  const pool = getPool();

  try {
    logger.debug('Executing database query', {
      sql: sql.substring(0, 200) + (sql.length > 200 ? '...' : ''),
      paramsCount: params?.length || 0,
    }, LOG_CONTEXTS.DATABASE);

    const [rows] = await pool.execute(sql, params);
    const duration = timer();
    const rowCount = Array.isArray(rows) ? rows.length : 1;

    // 使用logger的queryLog方法记录查询日志
    logger.queryLog(sql, params || [], duration, rowCount);

    return rows as T;
  } catch (error) {
    const duration = timer();

    logger.errorLog(error, 'Database query failed', {
      sql: sql.substring(0, 200) + (sql.length > 200 ? '...' : ''),
      paramsCount: params?.length || 0,
      duration: `${duration}ms`,
    });

    throw error;
  }
}

// 执行单条查询并返回第一行
export async function queryOne<T>(sql: string, params?: unknown[]): Promise<T | null> {
  const rows = await query<T[]>(sql, params);
  return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
}

// 确保数据库存在（只在首次调用时执行）
async function ensureDatabaseExists(): Promise<void> {
  if (dbInitialized) return;

  try {
    // 先尝试直接连接到指定的数据库（适用于远程数据库）
    const testPool = mysql.createPool({
      ...dbConfig,
      connectionLimit: 1,
    });
    await testPool.execute('SELECT 1');
    await testPool.end();
    logger.info(`Database '${DB_NAME}' exists and is accessible`, {
      database: DB_NAME,
      host: dbConfig.host,
      port: dbConfig.port,
    }, LOG_CONTEXTS.DATABASE);
    dbInitialized = true;
  } catch (error: unknown) {
    // 如果连接失败,尝试创建数据库（适用于本地开发环境）
    const err = error as { code?: string };
    if (err.code === 'ER_BAD_DB_ERROR') {
      const tempPool = mysql.createPool({
        ...dbConfigWithoutDB,
        connectionLimit: 1,
      });
      try {
        await tempPool.execute(`CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
        logger.info(`Database '${DB_NAME}' created`, {
          database: DB_NAME,
          host: dbConfigWithoutDB.host,
          port: dbConfigWithoutDB.port,
        }, LOG_CONTEXTS.DATABASE);
        dbInitialized = true;
      } finally {
        await tempPool.end();
      }
    } else {
      throw error;
    }
  }
}

// 测试数据库连接（带重试机制）
export async function testConnection(retries = 3, delay = 2000): Promise<boolean> {
  for (let i = 0; i < retries; i++) {
    try {
      // 先确保数据库存在
      await ensureDatabaseExists();

      const pool = getPool();
      const connection = await pool.getConnection();
      logger.info('MariaDB connection test successful', {
        database: DB_NAME,
        host: dbConfig.host,
        port: dbConfig.port,
      }, LOG_CONTEXTS.DATABASE);
      connection.release();
      return true;
    } catch (error: unknown) {
      const err = error as { code?: string };
      if (err.code === 'ER_CON_COUNT_ERROR' && i < retries - 1) {
        logger.warn(`Connection failed (Too many connections), retrying in ${delay / 1000}s... (${i + 1}/${retries})`, {
          attempt: i + 1,
          maxRetries: retries,
          delayMs: delay,
          errorCode: err.code,
        }, LOG_CONTEXTS.DATABASE);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      logger.errorLog(error, 'MariaDB connection test failed', {
        database: DB_NAME,
        host: dbConfig.host,
        port: dbConfig.port,
        attempt: i + 1,
        maxRetries: retries,
      });
      return false;
    }
  }
  return false;
}

// 关闭连接池
export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    logger.info('MariaDB connection pool closed', {
      database: DB_NAME,
      host: dbConfig.host,
      port: dbConfig.port,
    }, LOG_CONTEXTS.DATABASE);
  }
}

// TypeORM 相关导出
export { AppDataSource, initializeDataSource };

export default {
  getPool,
  getConnection,
  query,
  queryOne,
  testConnection,
  closePool,
};