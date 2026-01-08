import mysql from 'mysql2/promise';

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
    console.log('MariaDB connection pool created');
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
  const pool = getPool();
  const [rows] = await pool.execute(sql, params);
  return rows as T;
}

// 执行单条查询并返回第一行
export async function queryOne<T>(sql: string, params?: unknown[]): Promise<T | null> {
  const rows = await query<T[]>(sql, params);
  return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
}

// 确保数据库存在（只在首次调用时执行）
async function ensureDatabaseExists(): Promise<void> {
  if (dbInitialized) return;

  const tempPool = mysql.createPool({
    ...dbConfigWithoutDB,
    connectionLimit: 1,  // 临时池只用 1 个连接
  });
  try {
    await tempPool.execute(`CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    console.log(`Database '${DB_NAME}' ensured to exist`);
    dbInitialized = true;
  } finally {
    await tempPool.end();
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
      console.log('MariaDB connection test successful');
      connection.release();
      return true;
    } catch (error: unknown) {
      const err = error as { code?: string };
      if (err.code === 'ER_CON_COUNT_ERROR' && i < retries - 1) {
        console.log(`Connection failed (Too many connections), retrying in ${delay / 1000}s... (${i + 1}/${retries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      console.error('MariaDB connection test failed:', error);
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
    console.log('MariaDB connection pool closed');
  }
}

// 初始化数据库表(仅检查,不创建表)
export async function initMariaDBTables(): Promise<void> {
  const pool = getPool();

  // 检查关键表是否存在
  try {
    const [result] = await pool.execute(`
      SELECT COUNT(*) as count 
      FROM information_schema.tables 
      WHERE table_schema = ? 
      AND table_name IN ('users', 'test_cases', 'tasks', 'task_executions', 'Auto_TestCaseDailySummaries')
    `, [DB_NAME]);
    
    const keyTableCount = (result as Array<{count: number}>)[0]?.count || 0;
    if (keyTableCount >= 5) {
      console.log(`✓ MariaDB database contains all ${keyTableCount} key tables`);
      return;
    } else if (keyTableCount > 0) {
      console.warn(`⚠️  MariaDB database contains only ${keyTableCount}/5 key tables`);
      console.warn(`   Please run 'npm run db:init' to initialize missing tables`);
      return;
    } else {
      console.warn(`⚠️  MariaDB database is empty`);
      console.warn(`   Please run 'npm run db:init' to initialize all tables`);
      return;
    }
  } catch (error) {
    console.error('❌ Failed to check existing tables:', error);
    throw error;
  }
}

export default {
  getPool,
  getConnection,
  query,
  queryOne,
  testConnection,
  closePool,
  initMariaDBTables,
};