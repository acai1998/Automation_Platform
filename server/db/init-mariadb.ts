/**
 * MariaDB 远程数据库初始化脚本
 * 用于在远程服务器上创建所有数据库表和测试数据
 */
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
};

async function main() {
  console.log('========================================');
  console.log('MariaDB 远程数据库初始化');
  console.log('========================================');
  console.log(`目标服务器: ${dbConfigWithoutDB.host}:${dbConfigWithoutDB.port}`);
  console.log(`数据库名称: ${DB_NAME}`);
  console.log('');

  // 检查是否需要重置
  const isReset = process.argv.includes('--reset');
  if (isReset) {
    console.log('⚠️  警告: 将删除并重新创建数据库！');
    console.log('');
  }

  let tempPool: mysql.Pool | null = null;
  let pool: mysql.Pool | null = null;

  try {
    // 1. 连接到 MariaDB（不指定数据库）
    console.log('1. 连接到 MariaDB 服务器...');
    tempPool = mysql.createPool(dbConfigWithoutDB);
    await tempPool.execute('SELECT 1');
    console.log('   ✓ 连接成功');

    // 2. 创建或重置数据库
    if (isReset) {
      console.log('2. 删除旧数据库...');
      await tempPool.execute(`DROP DATABASE IF EXISTS \`${DB_NAME}\``);
      console.log('   ✓ 旧数据库已删除');
    }

    console.log(`${isReset ? '3' : '2'}. 创建数据库...`);
    await tempPool.execute(
      `CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    );
    console.log(`   ✓ 数据库 '${DB_NAME}' 已创建`);

    // 关闭临时连接池
    await tempPool.end();
    tempPool = null;

    // 3. 连接到目标数据库
    console.log(`${isReset ? '4' : '3'}. 连接到目标数据库...`);
    pool = mysql.createPool({
      ...dbConfigWithoutDB,
      database: DB_NAME,
    });
    console.log('   ✓ 连接成功');

    // 4. 创建表结构
    console.log(`${isReset ? '5' : '4'}. 创建表结构...`);

    // 4.1 users 表
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS users (
        id INT PRIMARY KEY AUTO_INCREMENT COMMENT '用户唯一标识',
        username VARCHAR(50) UNIQUE NOT NULL COMMENT '用户名，用于登录和显示',
        email VARCHAR(100) UNIQUE NOT NULL COMMENT '邮箱地址，用于登录和找回密码',
        password_hash VARCHAR(255) NOT NULL COMMENT '密码哈希值(bcrypt加密)',
        display_name VARCHAR(100) COMMENT '显示名称，可选的友好名称',
        avatar VARCHAR(255) COMMENT '头像URL地址',
        role ENUM('admin', 'tester', 'developer', 'viewer') DEFAULT 'tester' COMMENT '用户角色',
        status ENUM('active', 'inactive', 'locked') DEFAULT 'active' COMMENT '账户状态',
        email_verified BOOLEAN DEFAULT FALSE COMMENT '邮箱是否已验证',
        reset_token VARCHAR(255) COMMENT '密码重置令牌',
        reset_token_expires DATETIME COMMENT '密码重置令牌过期时间',
        remember_token VARCHAR(255) COMMENT '记住登录令牌',
        login_attempts INT DEFAULT 0 COMMENT '连续登录失败次数',
        locked_until DATETIME COMMENT '账户锁定截止时间',
        last_login_at DATETIME COMMENT '最后登录时间',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '账户创建时间',
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '最后更新时间',
        INDEX idx_users_email (email),
        INDEX idx_users_username (username),
        INDEX idx_users_reset_token (reset_token)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户账户表'
    `);
    console.log('   ✓ users 表已创建');

    // 4.2 projects 表
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS projects (
        id INT PRIMARY KEY AUTO_INCREMENT COMMENT '项目唯一标识',
        name VARCHAR(100) NOT NULL COMMENT '项目名称',
        description TEXT COMMENT '项目描述',
        status ENUM('active', 'archived') DEFAULT 'active' COMMENT '项目状态',
        owner_id INT COMMENT '项目负责人ID',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
        INDEX idx_projects_status (status),
        INDEX idx_projects_owner (owner_id),
        FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='项目表'
    `);
    console.log('   ✓ projects 表已创建');

    // 4.3 environments 表
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS environments (
        id INT PRIMARY KEY AUTO_INCREMENT COMMENT '环境唯一标识',
        name VARCHAR(100) NOT NULL COMMENT '环境名称',
        description TEXT COMMENT '环境描述',
        base_url VARCHAR(255) COMMENT '环境基础URL地址',
        config_json TEXT COMMENT '环境配置JSON',
        status ENUM('active', 'inactive') DEFAULT 'active' COMMENT '环境状态',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
        INDEX idx_env_status (status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='环境配置表'
    `);
    console.log('   ✓ environments 表已创建');

    // 4.4 test_cases 表
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS test_cases (
        id INT PRIMARY KEY AUTO_INCREMENT COMMENT '用例唯一标识',
        name VARCHAR(200) NOT NULL COMMENT '用例名称',
        description TEXT COMMENT '用例描述',
        project_id INT COMMENT '所属项目ID',
        module VARCHAR(100) COMMENT '功能模块名称',
        priority ENUM('P0', 'P1', 'P2', 'P3') DEFAULT 'P1' COMMENT '优先级',
        type ENUM('api', 'ui', 'performance', 'security') DEFAULT 'api' COMMENT '用例类型',
        status ENUM('active', 'inactive', 'deprecated') DEFAULT 'active' COMMENT '用例状态',
        tags VARCHAR(500) COMMENT '标签',
        script_path VARCHAR(500) COMMENT '测试脚本文件路径',
        config_json TEXT COMMENT '用例配置JSON',
        created_by INT COMMENT '创建人ID',
        updated_by INT COMMENT '最后修改人ID',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
        INDEX idx_cases_project (project_id),
        INDEX idx_cases_status (status),
        INDEX idx_cases_module (module),
        INDEX idx_cases_priority (priority),
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
        FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='测试用例表'
    `);
    console.log('   ✓ test_cases 表已创建');

    // 4.5 tasks 表
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS tasks (
        id INT PRIMARY KEY AUTO_INCREMENT COMMENT '任务唯一标识',
        name VARCHAR(200) NOT NULL COMMENT '任务名称',
        description TEXT COMMENT '任务描述',
        project_id INT COMMENT '所属项目ID',
        case_ids TEXT COMMENT '关联的用例ID列表JSON',
        trigger_type ENUM('manual', 'scheduled', 'ci_triggered') DEFAULT 'manual' COMMENT '触发方式',
        cron_expression VARCHAR(50) COMMENT 'Cron表达式',
        environment_id INT COMMENT '执行环境ID',
        status ENUM('active', 'paused', 'archived') DEFAULT 'active' COMMENT '任务状态',
        created_by INT COMMENT '创建人ID',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
        INDEX idx_tasks_project (project_id),
        INDEX idx_tasks_status (status),
        INDEX idx_tasks_trigger (trigger_type),
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
        FOREIGN KEY (environment_id) REFERENCES environments(id) ON DELETE SET NULL,
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='测试任务表'
    `);
    console.log('   ✓ tasks 表已创建');

    // 4.6 task_executions 表
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS task_executions (
        id INT PRIMARY KEY AUTO_INCREMENT COMMENT '执行记录唯一标识',
        task_id INT COMMENT '关联的任务ID',
        task_name VARCHAR(200) COMMENT '任务名称快照',
        trigger_type ENUM('manual', 'scheduled', 'ci_triggered') COMMENT '本次执行的触发方式',
        status ENUM('pending', 'running', 'success', 'failed', 'cancelled') DEFAULT 'pending' COMMENT '执行状态',
        total_cases INT DEFAULT 0 COMMENT '本次执行的用例总数',
        passed_cases INT DEFAULT 0 COMMENT '通过的用例数',
        failed_cases INT DEFAULT 0 COMMENT '失败的用例数',
        skipped_cases INT DEFAULT 0 COMMENT '跳过的用例数',
        start_time DATETIME COMMENT '执行开始时间',
        end_time DATETIME COMMENT '执行结束时间',
        duration INT COMMENT '执行耗时（秒）',
        executed_by INT COMMENT '执行人ID',
        environment_id INT COMMENT '执行环境ID',
        error_message TEXT COMMENT '错误信息',
        jenkins_build_id VARCHAR(100) COMMENT 'Jenkins构建ID',
        jenkins_build_url VARCHAR(500) COMMENT 'Jenkins构建URL',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '记录创建时间',
        INDEX idx_exec_task (task_id),
        INDEX idx_exec_status (status),
        INDEX idx_exec_start_time (start_time),
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE SET NULL,
        FOREIGN KEY (executed_by) REFERENCES users(id) ON DELETE SET NULL,
        FOREIGN KEY (environment_id) REFERENCES environments(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='任务执行记录表'
    `);
    console.log('   ✓ task_executions 表已创建');

    // 4.7 case_results 表
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS case_results (
        id INT PRIMARY KEY AUTO_INCREMENT COMMENT '结果记录唯一标识',
        execution_id INT NOT NULL COMMENT '关联的执行记录ID',
        case_id INT COMMENT '关联的用例ID',
        case_name VARCHAR(200) COMMENT '用例名称快照',
        status ENUM('passed', 'failed', 'skipped', 'error') COMMENT '执行结果',
        start_time DATETIME COMMENT '用例开始执行时间',
        end_time DATETIME COMMENT '用例执行结束时间',
        duration INT COMMENT '执行耗时（毫秒）',
        error_message TEXT COMMENT '错误信息',
        error_stack TEXT COMMENT '错误堆栈信息',
        screenshot_path VARCHAR(500) COMMENT '失败截图路径',
        log_path VARCHAR(500) COMMENT '执行日志路径',
        assertions_total INT DEFAULT 0 COMMENT '断言总数',
        assertions_passed INT DEFAULT 0 COMMENT '断言通过数',
        response_data TEXT COMMENT '响应数据JSON',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '记录创建时间',
        INDEX idx_result_execution (execution_id),
        INDEX idx_result_case (case_id),
        INDEX idx_result_status (status),
        FOREIGN KEY (execution_id) REFERENCES task_executions(id) ON DELETE CASCADE,
        FOREIGN KEY (case_id) REFERENCES test_cases(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用例执行结果表'
    `);
    console.log('   ✓ case_results 表已创建');

    // 4.8 daily_summaries 表
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS daily_summaries (
        id INT PRIMARY KEY AUTO_INCREMENT COMMENT '记录唯一标识',
        summary_date DATE UNIQUE NOT NULL COMMENT '统计日期',
        total_executions INT DEFAULT 0 COMMENT '当日执行总次数',
        total_cases_run INT DEFAULT 0 COMMENT '当日执行的用例总数',
        passed_cases INT DEFAULT 0 COMMENT '通过的用例数',
        failed_cases INT DEFAULT 0 COMMENT '失败的用例数',
        skipped_cases INT DEFAULT 0 COMMENT '跳过的用例数',
        success_rate DECIMAL(5,2) COMMENT '成功率百分比',
        avg_duration INT COMMENT '平均执行时长（秒）',
        active_cases_count INT DEFAULT 0 COMMENT '当日活跃用例总数',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '记录创建时间',
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '最后更新时间',
        INDEX idx_summary_date (summary_date)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='每日统计汇总表'
    `);
    console.log('   ✓ daily_summaries 表已创建');

    // 4.9 audit_logs 表
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id INT PRIMARY KEY AUTO_INCREMENT COMMENT '日志唯一标识',
        user_id INT COMMENT '操作用户ID',
        action VARCHAR(50) NOT NULL COMMENT '操作类型',
        target_type VARCHAR(50) COMMENT '操作对象类型',
        target_id INT COMMENT '操作对象ID',
        details TEXT COMMENT '操作详情JSON',
        ip_address VARCHAR(50) COMMENT '操作者IP地址',
        user_agent VARCHAR(255) COMMENT '操作者浏览器User-Agent',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '操作时间',
        INDEX idx_log_user (user_id),
        INDEX idx_log_action (action),
        INDEX idx_log_created (created_at),
        INDEX idx_log_target (target_type, target_id),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='系统审计日志表'
    `);
    console.log('   ✓ audit_logs 表已创建');

    console.log('');
    console.log('   所有表结构创建完成！');

    // 5. 插入测试数据
    console.log(`${isReset ? '6' : '5'}. 插入测试数据...`);

    // 5.1 插入用户数据
    await pool.execute(`
      INSERT IGNORE INTO users (username, email, password_hash, display_name, role, status) VALUES
      ('admin', 'admin@autotest.com', '$2b$10$dummy_hash_admin', '系统管理员', 'admin', 'active'),
      ('zhangsan', 'zhangsan@autotest.com', '$2b$10$dummy_hash_1', '张三', 'tester', 'active'),
      ('lisi', 'lisi@autotest.com', '$2b$10$dummy_hash_2', '李四', 'tester', 'active'),
      ('wangwu', 'wangwu@autotest.com', '$2b$10$dummy_hash_3', '王五', 'developer', 'active'),
      ('zhaoliu', 'zhaoliu@autotest.com', '$2b$10$dummy_hash_4', '赵六', 'tester', 'active'),
      ('qianqi', 'qianqi@autotest.com', '$2b$10$dummy_hash_5', '钱七', 'viewer', 'active')
    `);
    console.log('   ✓ 用户数据已插入');

    // 5.2 插入项目数据
    await pool.execute(`
      INSERT IGNORE INTO projects (id, name, description, status, owner_id) VALUES
      (1, '电商平台', '电商平台核心功能自动化测试', 'active', 2),
      (2, '用户中心', '用户中心模块自动化测试', 'active', 3),
      (3, '支付系统', '支付系统接口自动化测试', 'active', 2),
      (4, '后台管理', '后台管理系统自动化测试', 'active', 4)
    `);
    console.log('   ✓ 项目数据已插入');

    // 5.3 插入环境配置
    await pool.execute(`
      INSERT IGNORE INTO environments (id, name, description, base_url, config_json, status) VALUES
      (1, '开发环境', '开发测试环境', 'https://dev-api.example.com', '{"timeout": 30000}', 'active'),
      (2, '测试环境', '集成测试环境', 'https://test-api.example.com', '{"timeout": 30000}', 'active'),
      (3, '预发布环境', '预发布验证环境', 'https://staging-api.example.com', '{"timeout": 30000}', 'active')
    `);
    console.log('   ✓ 环境配置已插入');

    // 5.4 插入测试用例
    await pool.execute(`
      INSERT IGNORE INTO test_cases (name, description, project_id, module, priority, type, status, tags, created_by) VALUES
      ('用户登录-正常流程', '验证用户正常登录功能', 1, '用户认证', 'P0', 'api', 'active', '登录,核心功能', 2),
      ('用户登录-密码错误', '验证密码错误时的提示', 1, '用户认证', 'P1', 'api', 'active', '登录,异常处理', 2),
      ('用户注册-新用户', '验证新用户注册流程', 1, '用户认证', 'P0', 'api', 'active', '注册,核心功能', 2),
      ('商品列表-分页查询', '验证商品列表分页功能', 1, '商品管理', 'P1', 'api', 'active', '商品,列表', 3),
      ('商品详情-正常查看', '验证商品详情页面展示', 1, '商品管理', 'P1', 'api', 'active', '商品,详情', 3),
      ('购物车-添加商品', '验证添加商品到购物车', 1, '购物车', 'P0', 'api', 'active', '购物车,核心功能', 2),
      ('购物车-修改数量', '验证修改购物车商品数量', 1, '购物车', 'P1', 'api', 'active', '购物车', 2),
      ('购物车-删除商品', '验证删除购物车商品', 1, '购物车', 'P1', 'api', 'active', '购物车', 3),
      ('订单-创建订单', '验证创建订单流程', 1, '订单管理', 'P0', 'api', 'active', '订单,核心功能', 2),
      ('订单-取消订单', '验证取消订单功能', 1, '订单管理', 'P1', 'api', 'active', '订单', 3),
      ('订单-查询订单', '验证订单查询功能', 1, '订单管理', 'P1', 'api', 'active', '订单,查询', 2),
      ('个人信息-查看', '验证查看个人信息', 2, '个人中心', 'P1', 'api', 'active', '个人信息', 3),
      ('个人信息-修改', '验证修改个人信息', 2, '个人中心', 'P1', 'api', 'active', '个人信息', 3),
      ('收货地址-添加', '验证添加收货地址', 2, '地址管理', 'P1', 'api', 'active', '地址', 3),
      ('收货地址-修改', '验证修改收货地址', 2, '地址管理', 'P2', 'api', 'active', '地址', 3),
      ('收货地址-删除', '验证删除收货地址', 2, '地址管理', 'P2', 'api', 'active', '地址', 3),
      ('消息通知-列表', '验证消息通知列表', 2, '消息中心', 'P2', 'api', 'active', '消息', 5),
      ('支付-微信支付', '验证微信支付流程', 3, '支付渠道', 'P0', 'api', 'active', '支付,微信', 2),
      ('支付-支付宝支付', '验证支付宝支付流程', 3, '支付渠道', 'P0', 'api', 'active', '支付,支付宝', 2),
      ('支付-银行卡支付', '验证银行卡支付流程', 3, '支付渠道', 'P1', 'api', 'active', '支付,银行卡', 2),
      ('退款-申请退款', '验证申请退款流程', 3, '退款管理', 'P0', 'api', 'active', '退款', 3),
      ('退款-退款查询', '验证退款查询功能', 3, '退款管理', 'P1', 'api', 'active', '退款,查询', 3),
      ('后台登录-管理员', '验证管理员后台登录', 4, '权限管理', 'P0', 'api', 'active', '后台,登录', 4),
      ('用户管理-列表', '验证用户管理列表', 4, '用户管理', 'P1', 'api', 'active', '后台,用户', 4),
      ('用户管理-禁用', '验证禁用用户功能', 4, '用户管理', 'P1', 'api', 'active', '后台,用户', 4),
      ('订单管理-列表', '验证后台订单列表', 4, '订单管理', 'P1', 'api', 'active', '后台,订单', 4),
      ('数据统计-概览', '验证数据统计概览', 4, '数据统计', 'P2', 'api', 'active', '后台,统计', 4)
    `);
    console.log('   ✓ 测试用例已插入');

    // 5.5 插入测试任务
    await pool.execute(`
      INSERT IGNORE INTO tasks (id, name, description, project_id, case_ids, trigger_type, cron_expression, environment_id, status, created_by) VALUES
      (1, '电商核心流程测试', '电商平台核心业务流程自动化测试', 1, '[1,3,6,9]', 'scheduled', '0 0 2 * * *', 2, 'active', 2),
      (2, '用户登录模块测试', '用户登录相关功能测试', 1, '[1,2]', 'manual', NULL, 2, 'active', 2),
      (3, '购物车功能测试', '购物车完整功能测试', 1, '[6,7,8]', 'manual', NULL, 2, 'active', 3),
      (4, '支付全流程测试', '支付系统全流程测试', 3, '[18,19,20,21,22]', 'scheduled', '0 30 1 * * *', 2, 'active', 2),
      (5, '每日冒烟测试', '每日冒烟测试套件', 1, '[1,3,6,9,18]', 'scheduled', '0 0 8 * * *', 2, 'active', 2),
      (6, '用户中心测试', '用户中心模块测试', 2, '[12,13,14,15,16,17]', 'manual', NULL, 2, 'active', 3)
    `);
    console.log('   ✓ 测试任务已插入');

    // 5.6 插入执行记录
    await pool.execute(`
      INSERT IGNORE INTO task_executions (task_id, task_name, trigger_type, status, total_cases, passed_cases, failed_cases, skipped_cases, start_time, end_time, duration, executed_by, environment_id) VALUES
      (5, '每日冒烟测试', 'scheduled', 'success', 5, 5, 0, 0, DATE_SUB(NOW(), INTERVAL 2 HOUR), DATE_SUB(NOW(), INTERVAL 117 MINUTE), 180, 2, 2),
      (1, '电商核心流程测试', 'scheduled', 'success', 4, 3, 1, 0, DATE_SUB(NOW(), INTERVAL 5 HOUR), DATE_SUB(NOW(), INTERVAL 295 MINUTE), 300, 2, 2),
      (2, '用户登录模块测试', 'manual', 'success', 2, 2, 0, 0, DATE_SUB(NOW(), INTERVAL 1 HOUR), DATE_SUB(NOW(), INTERVAL 59 MINUTE), 45, 3, 2),
      (4, '支付全流程测试', 'scheduled', 'failed', 5, 3, 2, 0, DATE_SUB(NOW(), INTERVAL 3 HOUR), DATE_SUB(NOW(), INTERVAL 176 MINUTE), 240, 2, 2),
      (3, '购物车功能测试', 'manual', 'running', 3, 1, 0, 0, DATE_SUB(NOW(), INTERVAL 5 MINUTE), NULL, NULL, 5, 2),
      (5, '每日冒烟测试', 'scheduled', 'success', 5, 5, 0, 0, DATE_SUB(NOW(), INTERVAL 1 DAY), DATE_SUB(DATE_SUB(NOW(), INTERVAL 1 DAY), INTERVAL 3 MINUTE), 180, 2, 2),
      (1, '电商核心流程测试', 'scheduled', 'success', 4, 4, 0, 0, DATE_SUB(NOW(), INTERVAL 1 DAY), DATE_SUB(DATE_SUB(NOW(), INTERVAL 1 DAY), INTERVAL 5 MINUTE), 300, 2, 2)
    `);
    console.log('   ✓ 执行记录已插入');

    // 5.7 插入每日汇总数据
    await pool.execute(`
      INSERT IGNORE INTO daily_summaries (summary_date, total_executions, total_cases_run, passed_cases, failed_cases, skipped_cases, success_rate, avg_duration, active_cases_count) VALUES
      (CURDATE(), 5, 20, 5, 15, 0, 25.00, 193, 27),
      (DATE_SUB(CURDATE(), INTERVAL 1 DAY), 3, 20, 7, 13, 0, 35.00, 240, 27),
      (DATE_SUB(CURDATE(), INTERVAL 2 DAY), 2, 20, 9, 11, 0, 45.00, 240, 27),
      (DATE_SUB(CURDATE(), INTERVAL 3 DAY), 3, 20, 11, 9, 0, 55.00, 240, 27),
      (DATE_SUB(CURDATE(), INTERVAL 4 DAY), 3, 20, 13, 7, 0, 65.00, 240, 27),
      (DATE_SUB(CURDATE(), INTERVAL 5 DAY), 3, 20, 15, 5, 0, 75.00, 240, 27),
      (DATE_SUB(CURDATE(), INTERVAL 6 DAY), 2, 20, 17, 3, 0, 85.00, 180, 27),
      (DATE_SUB(CURDATE(), INTERVAL 7 DAY), 2, 20, 19, 1, 0, 95.00, 180, 27),
      (DATE_SUB(CURDATE(), INTERVAL 8 DAY), 3, 20, 20, 0, 0, 100.00, 220, 27),
      (DATE_SUB(CURDATE(), INTERVAL 9 DAY), 3, 20, 19, 1, 0, 95.00, 230, 27),
      (DATE_SUB(CURDATE(), INTERVAL 10 DAY), 2, 20, 17, 3, 0, 85.00, 200, 27),
      (DATE_SUB(CURDATE(), INTERVAL 11 DAY), 3, 20, 15, 5, 0, 75.00, 210, 27),
      (DATE_SUB(CURDATE(), INTERVAL 12 DAY), 3, 20, 13, 7, 0, 65.00, 250, 27),
      (DATE_SUB(CURDATE(), INTERVAL 13 DAY), 2, 20, 11, 9, 0, 55.00, 190, 27),
      (DATE_SUB(CURDATE(), INTERVAL 14 DAY), 3, 20, 9, 11, 0, 45.00, 220, 27)
    `);
    console.log('   ✓ 每日汇总数据已插入');

    console.log('');
    console.log('   所有测试数据插入完成！');

    // 6. 验证结果
    console.log('');
    console.log(`${isReset ? '7' : '6'}. 验证数据...`);

    const [tables] = await pool.execute('SHOW TABLES');
    console.log(`   ✓ 共创建 ${(tables as unknown[]).length} 张表`);

    const [users] = await pool.execute('SELECT COUNT(*) as count FROM users');
    const [projects] = await pool.execute('SELECT COUNT(*) as count FROM projects');
    const [cases] = await pool.execute('SELECT COUNT(*) as count FROM test_cases');
    const [tasks] = await pool.execute('SELECT COUNT(*) as count FROM tasks');

    console.log(`   ✓ users: ${(users as Array<{count: number}>)[0].count} 条记录`);
    console.log(`   ✓ projects: ${(projects as Array<{count: number}>)[0].count} 条记录`);
    console.log(`   ✓ test_cases: ${(cases as Array<{count: number}>)[0].count} 条记录`);
    console.log(`   ✓ tasks: ${(tasks as Array<{count: number}>)[0].count} 条记录`);

    console.log('');
    console.log('========================================');
    console.log('✅ MariaDB 数据库初始化成功！');
    console.log('========================================');

  } catch (error) {
    console.error('');
    console.error('❌ 初始化失败:', error);
    process.exit(1);
  } finally {
    if (tempPool) {
      await tempPool.end();
    }
    if (pool) {
      await pool.end();
    }
  }
}

main();
