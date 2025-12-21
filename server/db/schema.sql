-- 自动化测试平台数据库 Schema (SQLite)
-- 创建日期: 2025-12-21

-- 启用外键约束
PRAGMA foreign_keys = ON;

-- ============================================
-- 1. 用户表 (users)
-- ============================================
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    email VARCHAR(100) UNIQUE,
    display_name VARCHAR(100),
    avatar VARCHAR(255),
    role VARCHAR(20) DEFAULT 'tester' CHECK (role IN ('admin', 'tester', 'developer', 'viewer')),
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'locked')),
    last_login_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- 2. 项目表 (projects)
-- ============================================
CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'archived')),
    owner_id INTEGER REFERENCES users(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- 3. 测试用例表 (test_cases)
-- ============================================
CREATE TABLE IF NOT EXISTS test_cases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name VARCHAR(200) NOT NULL,
    description TEXT,
    project_id INTEGER REFERENCES projects(id),
    module VARCHAR(100),
    priority VARCHAR(10) DEFAULT 'P1' CHECK (priority IN ('P0', 'P1', 'P2', 'P3')),
    type VARCHAR(20) DEFAULT 'api' CHECK (type IN ('api', 'ui', 'performance', 'security')),
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'deprecated')),
    tags VARCHAR(500),
    script_path VARCHAR(500),
    config_json TEXT,
    created_by INTEGER REFERENCES users(id),
    updated_by INTEGER REFERENCES users(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_test_cases_project ON test_cases(project_id);
CREATE INDEX IF NOT EXISTS idx_test_cases_status ON test_cases(status);
CREATE INDEX IF NOT EXISTS idx_test_cases_module ON test_cases(module);

-- ============================================
-- 4. 环境配置表 (environments)
-- ============================================
CREATE TABLE IF NOT EXISTS environments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    base_url VARCHAR(255),
    config_json TEXT,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- 5. 测试任务表 (tasks)
-- ============================================
CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name VARCHAR(200) NOT NULL,
    description TEXT,
    project_id INTEGER REFERENCES projects(id),
    case_ids TEXT, -- JSON array of case IDs
    trigger_type VARCHAR(20) DEFAULT 'manual' CHECK (trigger_type IN ('manual', 'scheduled', 'ci_triggered')),
    cron_expression VARCHAR(50),
    environment_id INTEGER REFERENCES environments(id),
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'paused', 'archived')),
    created_by INTEGER REFERENCES users(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- 6. 任务执行记录表 (task_executions)
-- ============================================
CREATE TABLE IF NOT EXISTS task_executions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id INTEGER REFERENCES tasks(id),
    task_name VARCHAR(200),
    trigger_type VARCHAR(20) CHECK (trigger_type IN ('manual', 'scheduled', 'ci_triggered')),
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'success', 'failed', 'cancelled')),
    total_cases INTEGER DEFAULT 0,
    passed_cases INTEGER DEFAULT 0,
    failed_cases INTEGER DEFAULT 0,
    skipped_cases INTEGER DEFAULT 0,
    start_time DATETIME,
    end_time DATETIME,
    duration INTEGER, -- seconds
    executed_by INTEGER REFERENCES users(id),
    environment_id INTEGER REFERENCES environments(id),
    error_message TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_task_executions_task ON task_executions(task_id);
CREATE INDEX IF NOT EXISTS idx_task_executions_status ON task_executions(status);
CREATE INDEX IF NOT EXISTS idx_task_executions_start_time ON task_executions(start_time);

-- ============================================
-- 7. 用例执行结果表 (case_results)
-- ============================================
CREATE TABLE IF NOT EXISTS case_results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    execution_id INTEGER REFERENCES task_executions(id) ON DELETE CASCADE,
    case_id INTEGER REFERENCES test_cases(id),
    case_name VARCHAR(200),
    status VARCHAR(20) CHECK (status IN ('passed', 'failed', 'skipped', 'error')),
    start_time DATETIME,
    end_time DATETIME,
    duration INTEGER, -- milliseconds
    error_message TEXT,
    error_stack TEXT,
    screenshot_path VARCHAR(500),
    log_path VARCHAR(500),
    assertions_total INTEGER DEFAULT 0,
    assertions_passed INTEGER DEFAULT 0,
    response_data TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_case_results_execution ON case_results(execution_id);
CREATE INDEX IF NOT EXISTS idx_case_results_case ON case_results(case_id);
CREATE INDEX IF NOT EXISTS idx_case_results_status ON case_results(status);

-- ============================================
-- 8. 每日统计汇总表 (daily_summaries)
-- ============================================
CREATE TABLE IF NOT EXISTS daily_summaries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    summary_date DATE UNIQUE NOT NULL,
    total_executions INTEGER DEFAULT 0,
    total_cases_run INTEGER DEFAULT 0,
    passed_cases INTEGER DEFAULT 0,
    failed_cases INTEGER DEFAULT 0,
    skipped_cases INTEGER DEFAULT 0,
    success_rate DECIMAL(5,2),
    avg_duration INTEGER, -- seconds
    active_cases_count INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_daily_summaries_date ON daily_summaries(summary_date);

-- ============================================
-- 9. 系统日志表 (audit_logs)
-- ============================================
CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id),
    action VARCHAR(50) NOT NULL,
    target_type VARCHAR(50),
    target_id INTEGER,
    details TEXT, -- JSON
    ip_address VARCHAR(50),
    user_agent VARCHAR(255),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at);

-- ============================================
-- 触发器：自动更新 updated_at
-- ============================================
CREATE TRIGGER IF NOT EXISTS update_users_timestamp
AFTER UPDATE ON users
BEGIN
    UPDATE users SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS update_projects_timestamp
AFTER UPDATE ON projects
BEGIN
    UPDATE projects SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS update_test_cases_timestamp
AFTER UPDATE ON test_cases
BEGIN
    UPDATE test_cases SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS update_tasks_timestamp
AFTER UPDATE ON tasks
BEGIN
    UPDATE tasks SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS update_environments_timestamp
AFTER UPDATE ON environments
BEGIN
    UPDATE environments SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS update_daily_summaries_timestamp
AFTER UPDATE ON daily_summaries
BEGIN
    UPDATE daily_summaries SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;
