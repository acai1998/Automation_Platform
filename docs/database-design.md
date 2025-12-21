# 自动化测试平台 - 数据库设计文档

## 数据库选型建议

推荐使用 **SQLite**（开发/小规模）或 **PostgreSQL/MySQL**（生产环境）

---

## 表结构设计

### 1. 用户表 (users)

用于存储用户登录信息和基本资料。

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| id | INTEGER | PRIMARY KEY, AUTO_INCREMENT | 用户ID |
| username | VARCHAR(50) | UNIQUE, NOT NULL | 用户名 |
| password_hash | VARCHAR(255) | NOT NULL | 密码哈希（加盐） |
| email | VARCHAR(100) | UNIQUE | 邮箱 |
| display_name | VARCHAR(100) | | 显示名称 |
| avatar | VARCHAR(255) | | 头像URL |
| role | ENUM('admin', 'tester', 'developer', 'viewer') | DEFAULT 'tester' | 角色 |
| status | ENUM('active', 'inactive', 'locked') | DEFAULT 'active' | 账户状态 |
| last_login_at | DATETIME | | 最后登录时间 |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | 创建时间 |
| updated_at | DATETIME | DEFAULT CURRENT_TIMESTAMP ON UPDATE | 更新时间 |

---

### 2. 项目表 (projects)

用于组织和分类测试用例。

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| id | INTEGER | PRIMARY KEY, AUTO_INCREMENT | 项目ID |
| name | VARCHAR(100) | NOT NULL | 项目名称 |
| description | TEXT | | 项目描述 |
| status | ENUM('active', 'archived') | DEFAULT 'active' | 项目状态 |
| owner_id | INTEGER | FOREIGN KEY -> users.id | 项目负责人 |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | 创建时间 |
| updated_at | DATETIME | DEFAULT CURRENT_TIMESTAMP ON UPDATE | 更新时间 |

---

### 3. 测试用例表 (test_cases)

存储自动化测试用例的详细信息。

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| id | INTEGER | PRIMARY KEY, AUTO_INCREMENT | 用例ID |
| name | VARCHAR(200) | NOT NULL | 用例名称 |
| description | TEXT | | 用例描述 |
| project_id | INTEGER | FOREIGN KEY -> projects.id | 所属项目 |
| module | VARCHAR(100) | | 所属模块 |
| priority | ENUM('P0', 'P1', 'P2', 'P3') | DEFAULT 'P1' | 优先级 |
| type | ENUM('api', 'ui', 'performance', 'security') | DEFAULT 'api' | 用例类型 |
| status | ENUM('active', 'inactive', 'deprecated') | DEFAULT 'active' | 用例状态 |
| tags | VARCHAR(500) | | 标签（逗号分隔） |
| script_path | VARCHAR(500) | | 脚本路径 |
| config_json | TEXT | | 用例配置（JSON格式） |
| created_by | INTEGER | FOREIGN KEY -> users.id | 创建人 |
| updated_by | INTEGER | FOREIGN KEY -> users.id | 最后修改人 |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | 创建时间 |
| updated_at | DATETIME | DEFAULT CURRENT_TIMESTAMP ON UPDATE | 更新时间 |

**索引：**
- `idx_test_cases_project` ON (project_id)
- `idx_test_cases_status` ON (status)
- `idx_test_cases_module` ON (module)

---

### 4. 测试任务表 (tasks)

定义测试任务（可包含多个用例的执行计划）。

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| id | INTEGER | PRIMARY KEY, AUTO_INCREMENT | 任务ID |
| name | VARCHAR(200) | NOT NULL | 任务名称 |
| description | TEXT | | 任务描述 |
| project_id | INTEGER | FOREIGN KEY -> projects.id | 所属项目 |
| case_ids | TEXT | | 包含的用例ID列表（JSON数组） |
| trigger_type | ENUM('manual', 'scheduled', 'ci_triggered') | DEFAULT 'manual' | 触发类型 |
| cron_expression | VARCHAR(50) | | Cron表达式（定时任务） |
| environment_id | INTEGER | FOREIGN KEY -> environments.id | 执行环境 |
| status | ENUM('active', 'paused', 'archived') | DEFAULT 'active' | 任务状态 |
| created_by | INTEGER | FOREIGN KEY -> users.id | 创建人 |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | 创建时间 |
| updated_at | DATETIME | DEFAULT CURRENT_TIMESTAMP ON UPDATE | 更新时间 |

---

### 5. 任务执行记录表 (task_executions)

记录每次任务执行的整体信息。

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| id | INTEGER | PRIMARY KEY, AUTO_INCREMENT | 执行记录ID |
| task_id | INTEGER | FOREIGN KEY -> tasks.id | 关联任务 |
| task_name | VARCHAR(200) | | 任务名称（冗余，便于查询） |
| trigger_type | ENUM('manual', 'scheduled', 'ci_triggered') | | 触发方式 |
| status | ENUM('pending', 'running', 'success', 'failed', 'cancelled') | DEFAULT 'pending' | 执行状态 |
| total_cases | INTEGER | DEFAULT 0 | 总用例数 |
| passed_cases | INTEGER | DEFAULT 0 | 成功用例数 |
| failed_cases | INTEGER | DEFAULT 0 | 失败用例数 |
| skipped_cases | INTEGER | DEFAULT 0 | 跳过用例数 |
| start_time | DATETIME | | 开始时间 |
| end_time | DATETIME | | 结束时间 |
| duration | INTEGER | | 执行耗时（秒） |
| executed_by | INTEGER | FOREIGN KEY -> users.id | 执行人 |
| environment_id | INTEGER | FOREIGN KEY -> environments.id | 执行环境 |
| error_message | TEXT | | 错误信息 |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | 创建时间 |

**索引：**
- `idx_task_executions_task` ON (task_id)
- `idx_task_executions_status` ON (status)
- `idx_task_executions_start_time` ON (start_time)
- `idx_task_executions_date` ON (DATE(start_time))

---

### 6. 用例执行结果表 (case_results)

记录每个用例在某次执行中的详细结果。

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| id | INTEGER | PRIMARY KEY, AUTO_INCREMENT | 结果ID |
| execution_id | INTEGER | FOREIGN KEY -> task_executions.id | 关联执行记录 |
| case_id | INTEGER | FOREIGN KEY -> test_cases.id | 关联用例 |
| case_name | VARCHAR(200) | | 用例名称（冗余） |
| status | ENUM('passed', 'failed', 'skipped', 'error') | | 执行状态 |
| start_time | DATETIME | | 开始时间 |
| end_time | DATETIME | | 结束时间 |
| duration | INTEGER | | 耗时（毫秒） |
| error_message | TEXT | | 错误信息 |
| error_stack | TEXT | | 错误堆栈 |
| screenshot_path | VARCHAR(500) | | 截图路径 |
| log_path | VARCHAR(500) | | 日志路径 |
| assertions_total | INTEGER | DEFAULT 0 | 断言总数 |
| assertions_passed | INTEGER | DEFAULT 0 | 断言通过数 |
| response_data | TEXT | | 响应数据（JSON） |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | 创建时间 |

**索引：**
- `idx_case_results_execution` ON (execution_id)
- `idx_case_results_case` ON (case_id)
- `idx_case_results_status` ON (status)

---

### 7. 每日统计汇总表 (daily_summaries)

存储每日聚合统计数据，用于加速历史趋势图加载。

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| id | INTEGER | PRIMARY KEY, AUTO_INCREMENT | 记录ID |
| summary_date | DATE | UNIQUE, NOT NULL | 统计日期 |
| total_executions | INTEGER | DEFAULT 0 | 当日执行总次数 |
| total_cases_run | INTEGER | DEFAULT 0 | 当日运行用例总数 |
| passed_cases | INTEGER | DEFAULT 0 | 成功用例数 |
| failed_cases | INTEGER | DEFAULT 0 | 失败用例数 |
| skipped_cases | INTEGER | DEFAULT 0 | 跳过用例数 |
| success_rate | DECIMAL(5,2) | | 成功率（百分比） |
| avg_duration | INTEGER | | 平均执行耗时（秒） |
| active_cases_count | INTEGER | DEFAULT 0 | 当日启用用例总数 |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | 创建时间 |
| updated_at | DATETIME | DEFAULT CURRENT_TIMESTAMP ON UPDATE | 更新时间 |

**索引：**
- `idx_daily_summaries_date` ON (summary_date)

---

### 8. 环境配置表 (environments)

存储测试环境配置信息。

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| id | INTEGER | PRIMARY KEY, AUTO_INCREMENT | 环境ID |
| name | VARCHAR(100) | NOT NULL | 环境名称 |
| description | TEXT | | 环境描述 |
| base_url | VARCHAR(255) | | 基础URL |
| config_json | TEXT | | 环境配置（JSON格式） |
| status | ENUM('active', 'inactive') | DEFAULT 'active' | 环境状态 |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | 创建时间 |
| updated_at | DATETIME | DEFAULT CURRENT_TIMESTAMP ON UPDATE | 更新时间 |

---

### 9. 系统日志表 (audit_logs)

记录系统操作日志，用于审计。

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| id | INTEGER | PRIMARY KEY, AUTO_INCREMENT | 日志ID |
| user_id | INTEGER | FOREIGN KEY -> users.id | 操作用户 |
| action | VARCHAR(50) | NOT NULL | 操作类型 |
| target_type | VARCHAR(50) | | 目标类型（user/case/task等） |
| target_id | INTEGER | | 目标ID |
| details | TEXT | | 详细信息（JSON） |
| ip_address | VARCHAR(50) | | IP地址 |
| user_agent | VARCHAR(255) | | 用户代理 |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | 创建时间 |

**索引：**
- `idx_audit_logs_user` ON (user_id)
- `idx_audit_logs_action` ON (action)
- `idx_audit_logs_created` ON (created_at)

---

## ER 关系图（简化）

```
users
  │
  ├──< projects (owner_id)
  │      │
  │      ├──< test_cases (project_id)
  │      │      │
  │      │      └──< case_results (case_id)
  │      │
  │      └──< tasks (project_id)
  │             │
  │             └──< task_executions (task_id)
  │                    │
  │                    └──< case_results (execution_id)
  │
  ├──< task_executions (executed_by)
  │
  └──< audit_logs (user_id)

environments
  │
  └──< task_executions (environment_id)

daily_summaries (独立聚合表)
```

---

## Dashboard 数据查询示例

### 1. 自动化用例总数
```sql
SELECT COUNT(*) as total_cases
FROM test_cases
WHERE status = 'active';
```

### 2. 今日执行总次数
```sql
SELECT COUNT(*) as today_runs
FROM task_executions
WHERE DATE(start_time) = CURDATE();
```

### 3. 今日成功率
```sql
SELECT
  SUM(passed_cases) as passed,
  SUM(passed_cases + failed_cases + skipped_cases) as total,
  ROUND(SUM(passed_cases) * 100.0 / NULLIF(SUM(passed_cases + failed_cases + skipped_cases), 0), 2) as success_rate
FROM task_executions
WHERE DATE(start_time) = CURDATE();
```

### 4. 当前运行中任务
```sql
SELECT COUNT(*) as running_tasks
FROM task_executions
WHERE status = 'running';
```

### 5. 今日执行结果分布
```sql
SELECT
  SUM(passed_cases) as today_success,
  SUM(failed_cases) as today_failure,
  SUM(skipped_cases) as today_skipped
FROM task_executions
WHERE DATE(start_time) = CURDATE();
```

### 6. 历史趋势数据（近30天）
```sql
SELECT
  summary_date,
  total_executions,
  passed_cases,
  failed_cases,
  skipped_cases,
  success_rate
FROM daily_summaries
WHERE summary_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
ORDER BY summary_date ASC;
```

### 7. 最近测试运行
```sql
SELECT
  te.id,
  te.task_name,
  te.status,
  te.duration,
  te.start_time,
  u.display_name as executed_by_name
FROM task_executions te
LEFT JOIN users u ON te.executed_by = u.id
ORDER BY te.start_time DESC
LIMIT 10;
```
