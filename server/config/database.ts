import mysql from 'mysql2/promise';

// MariaDB 连接配置
const DB_NAME = process.env.DB_NAME || 'autotest';

const dbConfigWithoutDB = {
  host: process.env.DB_HOST || '117.72.182.23',
  port: parseInt(process.env.DB_PORT || '3306'),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'Caijinwei2025',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
};

const dbConfig = {
  ...dbConfigWithoutDB,
  database: DB_NAME,
};

// 创建连接池
let pool: mysql.Pool | null = null;

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

// 确保数据库存在
async function ensureDatabaseExists(): Promise<void> {
  const tempPool = mysql.createPool(dbConfigWithoutDB);
  try {
    await tempPool.execute(`CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    console.log(`Database '${DB_NAME}' ensured to exist`);
  } finally {
    await tempPool.end();
  }
}

// 测试数据库连接
export async function testConnection(): Promise<boolean> {
  try {
    // 先确保数据库存在
    await ensureDatabaseExists();

    const pool = getPool();
    const connection = await pool.getConnection();
    console.log('MariaDB connection test successful');
    connection.release();
    return true;
  } catch (error) {
    console.error('MariaDB connection test failed:', error);
    return false;
  }
}

// 关闭连接池
export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    console.log('MariaDB connection pool closed');
  }
}

// 初始化数据库表
export async function initMariaDBTables(): Promise<void> {
  const pool = getPool();

  // 创建 users 表 - 用户账户信息表
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS users (
      id INT PRIMARY KEY AUTO_INCREMENT COMMENT '用户唯一标识',
      username VARCHAR(50) UNIQUE NOT NULL COMMENT '用户名，用于登录和显示',
      email VARCHAR(100) UNIQUE NOT NULL COMMENT '邮箱地址，用于登录和找回密码',
      password_hash VARCHAR(255) NOT NULL COMMENT '密码哈希值(bcrypt加密)',
      display_name VARCHAR(100) COMMENT '显示名称，可选的友好名称',
      avatar VARCHAR(255) COMMENT '头像URL地址',
      role ENUM('admin', 'tester', 'developer', 'viewer') DEFAULT 'tester' COMMENT '用户角色: admin-管理员, tester-测试人员, developer-开发人员, viewer-只读用户',
      status ENUM('active', 'inactive', 'locked') DEFAULT 'active' COMMENT '账户状态: active-正常, inactive-禁用, locked-锁定(登录失败过多)',
      email_verified BOOLEAN DEFAULT FALSE COMMENT '邮箱是否已验证',
      reset_token VARCHAR(255) COMMENT '密码重置令牌',
      reset_token_expires DATETIME COMMENT '密码重置令牌过期时间',
      remember_token VARCHAR(255) COMMENT '记住登录令牌(用于自动登录)',
      login_attempts INT DEFAULT 0 COMMENT '连续登录失败次数',
      locked_until DATETIME COMMENT '账户锁定截止时间',
      last_login_at DATETIME COMMENT '最后登录时间',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '账户创建时间',
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '最后更新时间',
      INDEX idx_users_email (email) COMMENT '邮箱索引-加速登录查询',
      INDEX idx_users_username (username) COMMENT '用户名索引',
      INDEX idx_users_reset_token (reset_token) COMMENT '重置令牌索引-加速密码重置验证'
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户账户表 - 存储平台所有用户的认证和基本信息'
  `);

  console.log('MariaDB users table initialized');

  // 更新表和字段注释（用于已存在的表）
  await updateTableComments(pool);
}

// 更新已存在表的字段注释
async function updateTableComments(pool: mysql.Pool): Promise<void> {
  try {
    // 更新表注释
    await pool.execute(`ALTER TABLE users COMMENT = '用户账户表 - 存储平台所有用户的认证和基本信息'`);

    // 更新各字段注释
    const columnComments = [
      { column: 'id', type: 'INT AUTO_INCREMENT', extra: 'PRIMARY KEY', comment: '用户唯一标识' },
      { column: 'username', type: 'VARCHAR(50)', extra: 'NOT NULL', comment: '用户名，用于登录和显示' },
      { column: 'email', type: 'VARCHAR(100)', extra: 'NOT NULL', comment: '邮箱地址，用于登录和找回密码' },
      { column: 'password_hash', type: 'VARCHAR(255)', extra: 'NOT NULL', comment: '密码哈希值(bcrypt加密)' },
      { column: 'display_name', type: 'VARCHAR(100)', extra: '', comment: '显示名称，可选的友好名称' },
      { column: 'avatar', type: 'VARCHAR(255)', extra: '', comment: '头像URL地址' },
      { column: 'role', type: "ENUM('admin', 'tester', 'developer', 'viewer')", extra: "DEFAULT 'tester'", comment: '用户角色: admin-管理员, tester-测试人员, developer-开发人员, viewer-只读用户' },
      { column: 'status', type: "ENUM('active', 'inactive', 'locked')", extra: "DEFAULT 'active'", comment: '账户状态: active-正常, inactive-禁用, locked-锁定(登录失败过多)' },
      { column: 'email_verified', type: 'BOOLEAN', extra: 'DEFAULT FALSE', comment: '邮箱是否已验证' },
      { column: 'reset_token', type: 'VARCHAR(255)', extra: '', comment: '密码重置令牌' },
      { column: 'reset_token_expires', type: 'DATETIME', extra: '', comment: '密码重置令牌过期时间' },
      { column: 'remember_token', type: 'VARCHAR(255)', extra: '', comment: '记住登录令牌(用于自动登录)' },
      { column: 'login_attempts', type: 'INT', extra: 'DEFAULT 0', comment: '连续登录失败次数' },
      { column: 'locked_until', type: 'DATETIME', extra: '', comment: '账户锁定截止时间' },
      { column: 'last_login_at', type: 'DATETIME', extra: '', comment: '最后登录时间' },
      { column: 'created_at', type: 'DATETIME', extra: 'DEFAULT CURRENT_TIMESTAMP', comment: '账户创建时间' },
      { column: 'updated_at', type: 'DATETIME', extra: 'DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP', comment: '最后更新时间' },
    ];

    for (const col of columnComments) {
      const sql = `ALTER TABLE users MODIFY COLUMN ${col.column} ${col.type} ${col.extra} COMMENT '${col.comment}'`;
      await pool.execute(sql);
    }

    console.log('Table comments updated successfully');
  } catch (error) {
    // 忽略错误，可能是字段类型不完全匹配
    console.log('Table comments update skipped or partially completed');
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
