-- 自动化测试平台数据库 Schema (MariaDB/MySQL)
-- 创建日期: 2025-12-30
-- 数据库: autotest
-- 字符集: utf8mb4
-- 排序规则: utf8mb4_unicode_ci

-- ============================================
-- 创建数据库
-- ============================================
CREATE DATABASE IF NOT EXISTS autotest
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;

USE autotest;

-- ============================================
-- 1. 用户表 (users)
-- ============================================
CREATE TABLE IF NOT EXISTS users (
    id INT PRIMARY KEY AUTO_INCREMENT,
    username VARCHAR(50) UNIQUE NOT NULL COMMENT '用户名，用于登录和显示',
    email VARCHAR(100) UNIQUE NOT NULL COMMENT '邮箱地址，用于登录和找回密码',
    password_hash VARCHAR(255) NOT NULL COMMENT '密码哈希值(bcrypt加密)',
    display_name VARCHAR(100) DEFAULT NULL COMMENT '显示名称，可选的友好名称',
    avatar VARCHAR(255) DEFAULT NULL COMMENT '头像URL地址',
    role ENUM('admin', 'tester', 'developer', 'viewer') DEFAULT 'tester' COMMENT '用户角色',
    status ENUM('active', 'inactive', 'locked') DEFAULT 'active' COMMENT '账户状态',
    email_verified BOOLEAN DEFAULT FALSE COMMENT '邮箱是否已验证',
    reset_token VARCHAR(255) DEFAULT NULL COMMENT '密码重置令牌',
    reset_token_expires DATETIME DEFAULT NULL COMMENT '密码重置令牌过期时间',
    remember_token VARCHAR(255) DEFAULT NULL COMMENT '记住登录令牌(用于自动登录)',
    login_attempts INT DEFAULT 0 COMMENT '连续登录失败次数',
    locked_until DATETIME DEFAULT NULL COMMENT '账户锁定截止时间',
    last_login_at DATETIME DEFAULT NULL COMMENT '最后登录时间',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '账户创建时间',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '最后更新时间',

    INDEX idx_users_email (email),
    INDEX idx_users_username (username),
    INDEX idx_users_reset_token (reset_token)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户账户表';

-- ============================================
-- 2. 项目表 (projects)
-- ============================================
CREATE TABLE IF NOT EXISTS projects (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(100) NOT NULL COMMENT '项目名称',
    description TEXT DEFAULT NULL COMMENT '项目描述',
    status ENUM('active', 'archived') DEFAULT 'active' COMMENT '项目状态',
    owner_id INT DEFAULT NULL COMMENT '项目负责人ID',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',

    INDEX idx_projects_status (status),
    INDEX idx_projects_owner (owner_id),

    CONSTRAINT fk_projects_owner FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='项目表';

-- ============================================
-- 3. 环境配置表 (environments)
-- ============================================
CREATE TABLE IF NOT EXISTS environments (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(100) NOT NULL COMMENT '环境名称，如：开发环境、测试环境、预发布环境',
    description TEXT DEFAULT NULL COMMENT '环境描述',
    base_url VARCHAR(255) DEFAULT NULL COMMENT '环境基础URL地址',
    config_json TEXT DEFAULT NULL COMMENT '环境配置JSON，存储超时时间、请求头等',
    status ENUM('active', 'inactive') DEFAULT 'active' COMMENT '环境状态',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',

    INDEX idx_env_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='环境配置表';

-- ============================================
-- 4. 测试用例表 (test_cases)
-- ============================================
CREATE TABLE IF NOT EXISTS test_cases (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(200) NOT NULL COMMENT '用例名称',
    description TEXT DEFAULT NULL COMMENT '用例描述',
    project_id INT DEFAULT NULL COMMENT '所属项目ID',
    module VARCHAR(100) DEFAULT NULL COMMENT '功能模块名称',
    priority ENUM('P0', 'P1', 'P2', 'P3') DEFAULT 'P1' COMMENT '优先级: P0-最高, P1-高, P2-中, P3-低',
    type ENUM('api', 'ui', 'performance', 'security') DEFAULT 'api' COMMENT '用例类型',
    status ENUM('active', 'inactive', 'deprecated') DEFAULT 'active' COMMENT '用例状态',
    tags VARCHAR(500) DEFAULT NULL COMMENT '标签，多个标签用逗号分隔',
    script_path VARCHAR(500) DEFAULT NULL COMMENT '测试脚本文件路径',
    config_json TEXT DEFAULT NULL COMMENT '用例配置JSON，存储请求参数、断言规则等',
    created_by INT DEFAULT NULL COMMENT '创建人ID',
    updated_by INT DEFAULT NULL COMMENT '最后修改人ID',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',

    INDEX idx_cases_project (project_id),
    INDEX idx_cases_status (status),
    INDEX idx_cases_module (module),
    INDEX idx_cases_priority (priority),

    CONSTRAINT fk_cases_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    CONSTRAINT fk_cases_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT fk_cases_updated_by FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='测试用例表';

-- ============================================
-- 5. 测试任务表 (tasks)
-- ============================================
CREATE TABLE IF NOT EXISTS tasks (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(200) NOT NULL COMMENT '任务名称',
    description TEXT DEFAULT NULL COMMENT '任务描述',
    project_id INT DEFAULT NULL COMMENT '所属项目ID',
    case_ids TEXT DEFAULT NULL COMMENT '关联的用例ID列表，JSON数组格式如[1,2,3]',
    trigger_type ENUM('manual', 'scheduled', 'ci_triggered') DEFAULT 'manual' COMMENT '触发方式',
    cron_expression VARCHAR(50) DEFAULT NULL COMMENT 'Cron表达式，定时任务使用',
    environment_id INT DEFAULT NULL COMMENT '执行环境ID',
    status ENUM('active', 'paused', 'archived') DEFAULT 'active' COMMENT '任务状态',
    created_by INT DEFAULT NULL COMMENT '创建人ID',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',

    INDEX idx_tasks_project (project_id),
    INDEX idx_tasks_status (status),
    INDEX idx_tasks_trigger (trigger_type),

    CONSTRAINT fk_tasks_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    CONSTRAINT fk_tasks_environment FOREIGN KEY (environment_id) REFERENCES environments(id) ON DELETE SET NULL,
    CONSTRAINT fk_tasks_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='测试任务表';

-- ============================================
-- 6. 任务执行记录表 (task_executions)
-- ============================================
CREATE TABLE IF NOT EXISTS task_executions (
    id INT PRIMARY KEY AUTO_INCREMENT,
    task_id INT DEFAULT NULL COMMENT '关联的任务ID',
    task_name VARCHAR(200) DEFAULT NULL COMMENT '任务名称快照（冗余存储，防止任务删除后丢失）',
    trigger_type ENUM('manual', 'scheduled', 'ci_triggered') DEFAULT NULL COMMENT '本次执行的触发方式',
    status ENUM('pending', 'running', 'success', 'failed', 'cancelled') DEFAULT 'pending' COMMENT '执行状态',
    total_cases INT DEFAULT 0 COMMENT '本次执行的用例总数',
    passed_cases INT DEFAULT 0 COMMENT '通过的用例数',
    failed_cases INT DEFAULT 0 COMMENT '失败的用例数',
    skipped_cases INT DEFAULT 0 COMMENT '跳过的用例数',
    start_time DATETIME DEFAULT NULL COMMENT '执行开始时间',
    end_time DATETIME DEFAULT NULL COMMENT '执行结束时间',
    duration INT DEFAULT NULL COMMENT '执行耗时（秒）',
    executed_by INT DEFAULT NULL COMMENT '执行人ID',
    environment_id INT DEFAULT NULL COMMENT '执行环境ID',
    error_message TEXT DEFAULT NULL COMMENT '错误信息（执行失败时记录）',
    jenkins_build_id VARCHAR(100) DEFAULT NULL COMMENT 'Jenkins构建ID',
    jenkins_build_url VARCHAR(500) DEFAULT NULL COMMENT 'Jenkins构建URL',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '记录创建时间',

    INDEX idx_exec_task (task_id),
    INDEX idx_exec_status (status),
    INDEX idx_exec_start_time (start_time),

    CONSTRAINT fk_exec_task FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE SET NULL,
    CONSTRAINT fk_exec_executed_by FOREIGN KEY (executed_by) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT fk_exec_environment FOREIGN KEY (environment_id) REFERENCES environments(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='任务执行记录表';

-- ============================================
-- 7. 用例执行结果表 (case_results)
-- ============================================
CREATE TABLE IF NOT EXISTS case_results (
    id INT PRIMARY KEY AUTO_INCREMENT,
    execution_id INT NOT NULL COMMENT '关联的执行记录ID',
    case_id INT DEFAULT NULL COMMENT '关联的用例ID',
    case_name VARCHAR(200) DEFAULT NULL COMMENT '用例名称快照',
    status ENUM('passed', 'failed', 'skipped', 'error') DEFAULT NULL COMMENT '执行结果',
    start_time DATETIME DEFAULT NULL COMMENT '用例开始执行时间',
    end_time DATETIME DEFAULT NULL COMMENT '用例执行结束时间',
    duration INT DEFAULT NULL COMMENT '执行耗时（毫秒）',
    error_message TEXT DEFAULT NULL COMMENT '错误信息',
    error_stack TEXT DEFAULT NULL COMMENT '错误堆栈信息',
    screenshot_path VARCHAR(500) DEFAULT NULL COMMENT '失败截图路径',
    log_path VARCHAR(500) DEFAULT NULL COMMENT '执行日志路径',
    assertions_total INT DEFAULT 0 COMMENT '断言总数',
    assertions_passed INT DEFAULT 0 COMMENT '断言通过数',
    response_data TEXT DEFAULT NULL COMMENT '响应数据JSON（API测试时记录）',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '记录创建时间',

    INDEX idx_result_execution (execution_id),
    INDEX idx_result_case (case_id),
    INDEX idx_result_status (status),

    CONSTRAINT fk_result_execution FOREIGN KEY (execution_id) REFERENCES task_executions(id) ON DELETE CASCADE,
    CONSTRAINT fk_result_case FOREIGN KEY (case_id) REFERENCES test_cases(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用例执行结果表';

-- ============================================
-- 8. 每日统计汇总表 (daily_summaries)
-- ============================================
CREATE TABLE IF NOT EXISTS daily_summaries (
    id INT PRIMARY KEY AUTO_INCREMENT,
    summary_date DATE UNIQUE NOT NULL COMMENT '统计日期',
    total_executions INT DEFAULT 0 COMMENT '当日执行总次数',
    total_cases_run INT DEFAULT 0 COMMENT '当日执行的用例总数',
    passed_cases INT DEFAULT 0 COMMENT '通过的用例数',
    failed_cases INT DEFAULT 0 COMMENT '失败的用例数',
    skipped_cases INT DEFAULT 0 COMMENT '跳过的用例数',
    success_rate DECIMAL(5,2) DEFAULT NULL COMMENT '成功率百分比，如95.50表示95.50%',
    avg_duration INT DEFAULT NULL COMMENT '平均执行时长（秒）',
    active_cases_count INT DEFAULT 0 COMMENT '当日活跃用例总数',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '记录创建时间',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '最后更新时间',

    INDEX idx_summary_date (summary_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='每日统计汇总表';

-- ============================================
-- 9. 系统审计日志表 (audit_logs)
-- ============================================
CREATE TABLE IF NOT EXISTS audit_logs (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT DEFAULT NULL COMMENT '操作用户ID',
    action VARCHAR(50) NOT NULL COMMENT '操作类型，如：login, logout, create_case, delete_task等',
    target_type VARCHAR(50) DEFAULT NULL COMMENT '操作对象类型，如：user, case, task, execution等',
    target_id INT DEFAULT NULL COMMENT '操作对象ID',
    details TEXT DEFAULT NULL COMMENT '操作详情JSON，记录变更前后的数据',
    ip_address VARCHAR(50) DEFAULT NULL COMMENT '操作者IP地址',
    user_agent VARCHAR(255) DEFAULT NULL COMMENT '操作者浏览器User-Agent',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '操作时间',

    INDEX idx_log_user (user_id),
    INDEX idx_log_action (action),
    INDEX idx_log_created (created_at),
    INDEX idx_log_target (target_type, target_id),

    CONSTRAINT fk_log_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='系统审计日志表';
