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

  // 1. 创建 users 表 - 用户账户信息表
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

  // 2. 创建 projects 表 - 项目表
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS projects (
      id INT PRIMARY KEY AUTO_INCREMENT COMMENT '项目唯一标识',
      name VARCHAR(100) NOT NULL COMMENT '项目名称',
      description TEXT COMMENT '项目描述',
      status ENUM('active', 'archived') DEFAULT 'active' COMMENT '项目状态: active-活跃, archived-已归档',
      owner_id INT COMMENT '项目负责人ID，关联users表',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
      INDEX idx_projects_status (status) COMMENT '状态索引',
      INDEX idx_projects_owner (owner_id) COMMENT '负责人索引',
      FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='项目表 - 管理测试项目的基本信息'
  `);
  console.log('MariaDB projects table initialized');

  // 3. 创建 environments 表 - 环境配置表
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS environments (
      id INT PRIMARY KEY AUTO_INCREMENT COMMENT '环境唯一标识',
      name VARCHAR(100) NOT NULL COMMENT '环境名称，如：开发环境、测试环境、预发布环境',
      description TEXT COMMENT '环境描述',
      base_url VARCHAR(255) COMMENT '环境基础URL地址',
      config_json TEXT COMMENT '环境配置JSON，存储超时时间、请求头等',
      status ENUM('active', 'inactive') DEFAULT 'active' COMMENT '环境状态: active-可用, inactive-不可用',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
      INDEX idx_env_status (status) COMMENT '状态索引'
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='环境配置表 - 管理不同测试环境的配置信息'
  `);
  console.log('MariaDB environments table initialized');

  // 4. 创建 test_cases 表 - 测试用例表
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS test_cases (
      id INT PRIMARY KEY AUTO_INCREMENT COMMENT '用例唯一标识',
      name VARCHAR(200) NOT NULL COMMENT '用例名称',
      description TEXT COMMENT '用例描述',
      project_id INT COMMENT '所属项目ID',
      module VARCHAR(100) COMMENT '功能模块名称',
      priority ENUM('P0', 'P1', 'P2', 'P3') DEFAULT 'P1' COMMENT '优先级: P0-最高, P1-高, P2-中, P3-低',
      type ENUM('api', 'ui', 'performance', 'security') DEFAULT 'api' COMMENT '用例类型: api-接口测试, ui-界面测试, performance-性能测试, security-安全测试',
      status ENUM('active', 'inactive', 'deprecated') DEFAULT 'active' COMMENT '用例状态: active-启用, inactive-禁用, deprecated-已废弃',
      tags VARCHAR(500) COMMENT '标签，多个标签用逗号分隔',
      script_path VARCHAR(500) COMMENT '测试脚本文件路径',
      config_json TEXT COMMENT '用例配置JSON，存储请求参数、断言规则等',
      created_by INT COMMENT '创建人ID',
      updated_by INT COMMENT '最后修改人ID',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
      INDEX idx_cases_project (project_id) COMMENT '项目索引',
      INDEX idx_cases_status (status) COMMENT '状态索引',
      INDEX idx_cases_module (module) COMMENT '模块索引',
      INDEX idx_cases_priority (priority) COMMENT '优先级索引',
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
      FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='测试用例表 - 存储自动化测试用例的定义和配置'
  `);
  console.log('MariaDB test_cases table initialized');

  // 5. 创建 tasks 表 - 测试任务表
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS tasks (
      id INT PRIMARY KEY AUTO_INCREMENT COMMENT '任务唯一标识',
      name VARCHAR(200) NOT NULL COMMENT '任务名称',
      description TEXT COMMENT '任务描述',
      project_id INT COMMENT '所属项目ID',
      case_ids TEXT COMMENT '关联的用例ID列表，JSON数组格式如[1,2,3]',
      trigger_type ENUM('manual', 'scheduled', 'ci_triggered') DEFAULT 'manual' COMMENT '触发方式: manual-手动, scheduled-定时, ci_triggered-CI触发',
      cron_expression VARCHAR(50) COMMENT 'Cron表达式，定时任务使用',
      environment_id INT COMMENT '执行环境ID',
      status ENUM('active', 'paused', 'archived') DEFAULT 'active' COMMENT '任务状态: active-活跃, paused-暂停, archived-归档',
      created_by INT COMMENT '创建人ID',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
      INDEX idx_tasks_project (project_id) COMMENT '项目索引',
      INDEX idx_tasks_status (status) COMMENT '状态索引',
      INDEX idx_tasks_trigger (trigger_type) COMMENT '触发类型索引',
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY (environment_id) REFERENCES environments(id) ON DELETE SET NULL,
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='测试任务表 - 定义测试任务的配置和调度信息'
  `);
  console.log('MariaDB tasks table initialized');

  // 6. 创建 task_executions 表 - 任务执行记录表
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS task_executions (
      id INT PRIMARY KEY AUTO_INCREMENT COMMENT '执行记录唯一标识',
      task_id INT COMMENT '关联的任务ID',
      task_name VARCHAR(200) COMMENT '任务名称快照（冗余存储，防止任务删除后丢失）',
      trigger_type ENUM('manual', 'scheduled', 'ci_triggered') COMMENT '本次执行的触发方式',
      status ENUM('pending', 'running', 'success', 'failed', 'cancelled') DEFAULT 'pending' COMMENT '执行状态: pending-等待中, running-运行中, success-成功, failed-失败, cancelled-已取消',
      total_cases INT DEFAULT 0 COMMENT '本次执行的用例总数',
      passed_cases INT DEFAULT 0 COMMENT '通过的用例数',
      failed_cases INT DEFAULT 0 COMMENT '失败的用例数',
      skipped_cases INT DEFAULT 0 COMMENT '跳过的用例数',
      start_time DATETIME COMMENT '执行开始时间',
      end_time DATETIME COMMENT '执行结束时间',
      duration INT COMMENT '执行耗时（秒）',
      executed_by INT COMMENT '执行人ID',
      environment_id INT COMMENT '执行环境ID',
      error_message TEXT COMMENT '错误信息（执行失败时记录）',
      jenkins_build_id VARCHAR(100) COMMENT 'Jenkins构建ID',
      jenkins_build_url VARCHAR(500) COMMENT 'Jenkins构建URL',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '记录创建时间',
      INDEX idx_exec_task (task_id) COMMENT '任务索引',
      INDEX idx_exec_status (status) COMMENT '状态索引',
      INDEX idx_exec_start_time (start_time) COMMENT '开始时间索引-用于趋势查询',
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE SET NULL,
      FOREIGN KEY (executed_by) REFERENCES users(id) ON DELETE SET NULL,
      FOREIGN KEY (environment_id) REFERENCES environments(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='任务执行记录表 - 记录每次测试任务执行的详细信息和结果'
  `);
  console.log('MariaDB task_executions table initialized');

  // 7. 创建 case_results 表 - 用例执行结果表
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS case_results (
      id INT PRIMARY KEY AUTO_INCREMENT COMMENT '结果记录唯一标识',
      execution_id INT NOT NULL COMMENT '关联的执行记录ID',
      case_id INT COMMENT '关联的用例ID',
      case_name VARCHAR(200) COMMENT '用例名称快照',
      status ENUM('passed', 'failed', 'skipped', 'error') COMMENT '执行结果: passed-通过, failed-失败, skipped-跳过, error-异常',
      start_time DATETIME COMMENT '用例开始执行时间',
      end_time DATETIME COMMENT '用例执行结束时间',
      duration INT COMMENT '执行耗时（毫秒）',
      error_message TEXT COMMENT '错误信息',
      error_stack TEXT COMMENT '错误堆栈信息',
      screenshot_path VARCHAR(500) COMMENT '失败截图路径',
      log_path VARCHAR(500) COMMENT '执行日志路径',
      assertions_total INT DEFAULT 0 COMMENT '断言总数',
      assertions_passed INT DEFAULT 0 COMMENT '断言通过数',
      response_data TEXT COMMENT '响应数据JSON（API测试时记录）',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '记录创建时间',
      INDEX idx_result_execution (execution_id) COMMENT '执行记录索引',
      INDEX idx_result_case (case_id) COMMENT '用例索引',
      INDEX idx_result_status (status) COMMENT '状态索引',
      FOREIGN KEY (execution_id) REFERENCES task_executions(id) ON DELETE CASCADE,
      FOREIGN KEY (case_id) REFERENCES test_cases(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用例执行结果表 - 记录每个测试用例的执行详情和结果'
  `);
  console.log('MariaDB case_results table initialized');

  // 8. 创建 daily_summaries 表 - 每日统计汇总表
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS daily_summaries (
      id INT PRIMARY KEY AUTO_INCREMENT COMMENT '记录唯一标识',
      summary_date DATE UNIQUE NOT NULL COMMENT '统计日期，唯一索引',
      total_executions INT DEFAULT 0 COMMENT '当日执行总次数',
      total_cases_run INT DEFAULT 0 COMMENT '当日执行的用例总数',
      passed_cases INT DEFAULT 0 COMMENT '通过的用例数',
      failed_cases INT DEFAULT 0 COMMENT '失败的用例数',
      skipped_cases INT DEFAULT 0 COMMENT '跳过的用例数',
      success_rate DECIMAL(5,2) COMMENT '成功率百分比，如95.50表示95.50%',
      avg_duration INT COMMENT '平均执行时长（秒）',
      active_cases_count INT DEFAULT 0 COMMENT '当日活跃用例总数',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '记录创建时间',
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '最后更新时间',
      INDEX idx_summary_date (summary_date) COMMENT '日期索引-用于趋势查询'
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='每日统计汇总表 - 按天聚合的测试执行统计数据，用于趋势图展示'
  `);
  console.log('MariaDB daily_summaries table initialized');

  // 9. 创建 audit_logs 表 - 系统审计日志表
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id INT PRIMARY KEY AUTO_INCREMENT COMMENT '日志唯一标识',
      user_id INT COMMENT '操作用户ID',
      action VARCHAR(50) NOT NULL COMMENT '操作类型，如：login, logout, create_case, delete_task等',
      target_type VARCHAR(50) COMMENT '操作对象类型，如：user, case, task, execution等',
      target_id INT COMMENT '操作对象ID',
      details TEXT COMMENT '操作详情JSON，记录变更前后的数据',
      ip_address VARCHAR(50) COMMENT '操作者IP地址',
      user_agent VARCHAR(255) COMMENT '操作者浏览器User-Agent',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '操作时间',
      INDEX idx_log_user (user_id) COMMENT '用户索引',
      INDEX idx_log_action (action) COMMENT '操作类型索引',
      INDEX idx_log_created (created_at) COMMENT '时间索引-用于日志查询',
      INDEX idx_log_target (target_type, target_id) COMMENT '操作对象索引',
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='系统审计日志表 - 记录用户的所有操作行为，用于安全审计'
  `);
  console.log('MariaDB audit_logs table initialized');

  console.log('All MariaDB tables initialized successfully');
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
