# 自动化测试平台数据库设计文档

## 概述

本文档记录自动化测试平台 MariaDB 数据库的完整表结构设计，包括 9 张核心业务表。

**数据库信息：**
- 数据库名称：`autotest`
- 字符集：`utf8mb4`
- 排序规则：`utf8mb4_unicode_ci`
- 存储引擎：`InnoDB`

---

## 表清单

| 序号 | 表名 | 说明 | 依赖表 |
|:---:|------|------|--------|
| 1 | users | 用户账户表 | - |
| 2 | projects | 项目表 | users |
| 3 | environments | 环境配置表 | - |
| 4 | test_cases | 测试用例表 | projects, users |
| 5 | tasks | 测试任务表 | projects, environments, users |
| 6 | task_executions | 任务执行记录表 | tasks, users, environments |
| 7 | case_results | 用例执行结果表 | task_executions, test_cases |
| 8 | daily_summaries | 每日统计汇总表 | - |
| 9 | audit_logs | 系统审计日志表 | users |

---

## 1. users（用户账户表）

**表说明：** 存储平台所有用户的认证和基本信息

| 字段名 | 类型 | 约束 | 默认值 | 说明 |
|--------|------|------|--------|------|
| id | INT | PRIMARY KEY, AUTO_INCREMENT | - | 用户唯一标识 |
| username | VARCHAR(50) | UNIQUE, NOT NULL | - | 用户名，用于登录和显示 |
| email | VARCHAR(100) | UNIQUE, NOT NULL | - | 邮箱地址，用于登录和找回密码 |
| password_hash | VARCHAR(255) | NOT NULL | - | 密码哈希值(bcrypt加密) |
| display_name | VARCHAR(100) | - | NULL | 显示名称，可选的友好名称 |
| avatar | VARCHAR(255) | - | NULL | 头像URL地址 |
| role | ENUM | - | 'tester' | 用户角色: admin-管理员, tester-测试人员, developer-开发人员, viewer-只读用户 |
| status | ENUM | - | 'active' | 账户状态: active-正常, inactive-禁用, locked-锁定 |
| email_verified | BOOLEAN | - | FALSE | 邮箱是否已验证 |
| reset_token | VARCHAR(255) | - | NULL | 密码重置令牌 |
| reset_token_expires | DATETIME | - | NULL | 密码重置令牌过期时间 |
| remember_token | VARCHAR(255) | - | NULL | 记住登录令牌(用于自动登录) |
| login_attempts | INT | - | 0 | 连续登录失败次数 |
| locked_until | DATETIME | - | NULL | 账户锁定截止时间 |
| last_login_at | DATETIME | - | NULL | 最后登录时间 |
| created_at | DATETIME | - | CURRENT_TIMESTAMP | 账户创建时间 |
| updated_at | DATETIME | - | CURRENT_TIMESTAMP ON UPDATE | 最后更新时间 |

**索引：**
- `idx_users_email` (email) - 邮箱索引，加速登录查询
- `idx_users_username` (username) - 用户名索引
- `idx_users_reset_token` (reset_token) - 重置令牌索引，加速密码重置验证

---

## 2. projects（项目表）

**表说明：** 管理测试项目的基本信息

| 字段名 | 类型 | 约束 | 默认值 | 说明 |
|--------|------|------|--------|------|
| id | INT | PRIMARY KEY, AUTO_INCREMENT | - | 项目唯一标识 |
| name | VARCHAR(100) | NOT NULL | - | 项目名称 |
| description | TEXT | - | NULL | 项目描述 |
| status | ENUM | - | 'active' | 项目状态: active-活跃, archived-已归档 |
| owner_id | INT | FOREIGN KEY | NULL | 项目负责人ID，关联users表 |
| created_at | DATETIME | - | CURRENT_TIMESTAMP | 创建时间 |
| updated_at | DATETIME | - | CURRENT_TIMESTAMP ON UPDATE | 更新时间 |

**索引：**
- `idx_projects_status` (status) - 状态索引
- `idx_projects_owner` (owner_id) - 负责人索引

**外键：**
- `owner_id` → `users(id)` ON DELETE SET NULL

---

## 3. environments（环境配置表）

**表说明：** 管理不同测试环境的配置信息

| 字段名 | 类型 | 约束 | 默认值 | 说明 |
|--------|------|------|--------|------|
| id | INT | PRIMARY KEY, AUTO_INCREMENT | - | 环境唯一标识 |
| name | VARCHAR(100) | NOT NULL | - | 环境名称，如：开发环境、测试环境、预发布环境 |
| description | TEXT | - | NULL | 环境描述 |
| base_url | VARCHAR(255) | - | NULL | 环境基础URL地址 |
| config_json | TEXT | - | NULL | 环境配置JSON，存储超时时间、请求头等 |
| status | ENUM | - | 'active' | 环境状态: active-可用, inactive-不可用 |
| created_at | DATETIME | - | CURRENT_TIMESTAMP | 创建时间 |
| updated_at | DATETIME | - | CURRENT_TIMESTAMP ON UPDATE | 更新时间 |

**索引：**
- `idx_env_status` (status) - 状态索引

---

## 4. test_cases（测试用例表）

**表说明：** 存储自动化测试用例的定义和配置

| 字段名 | 类型 | 约束 | 默认值 | 说明 |
|--------|------|------|--------|------|
| id | INT | PRIMARY KEY, AUTO_INCREMENT | - | 用例唯一标识 |
| name | VARCHAR(200) | NOT NULL | - | 用例名称 |
| description | TEXT | - | NULL | 用例描述 |
| project_id | INT | FOREIGN KEY | NULL | 所属项目ID |
| module | VARCHAR(100) | - | NULL | 功能模块名称 |
| priority | ENUM | - | 'P1' | 优先级: P0-最高, P1-高, P2-中, P3-低 |
| type | ENUM | - | 'api' | 用例类型: api-接口测试, ui-界面测试, performance-性能测试, security-安全测试 |
| status | ENUM | - | 'active' | 用例状态: active-启用, inactive-禁用, deprecated-已废弃 |
| tags | VARCHAR(500) | - | NULL | 标签，多个标签用逗号分隔 |
| script_path | VARCHAR(500) | - | NULL | 测试脚本文件路径 |
| config_json | TEXT | - | NULL | 用例配置JSON，存储请求参数、断言规则等 |
| created_by | INT | FOREIGN KEY | NULL | 创建人ID |
| updated_by | INT | FOREIGN KEY | NULL | 最后修改人ID |
| created_at | DATETIME | - | CURRENT_TIMESTAMP | 创建时间 |
| updated_at | DATETIME | - | CURRENT_TIMESTAMP ON UPDATE | 更新时间 |

**索引：**
- `idx_cases_project` (project_id) - 项目索引
- `idx_cases_status` (status) - 状态索引
- `idx_cases_module` (module) - 模块索引
- `idx_cases_priority` (priority) - 优先级索引

**外键：**
- `project_id` → `projects(id)` ON DELETE CASCADE
- `created_by` → `users(id)` ON DELETE SET NULL
- `updated_by` → `users(id)` ON DELETE SET NULL

---

## 5. tasks（测试任务表）

**表说明：** 定义测试任务的配置和调度信息

| 字段名 | 类型 | 约束 | 默认值 | 说明 |
|--------|------|------|--------|------|
| id | INT | PRIMARY KEY, AUTO_INCREMENT | - | 任务唯一标识 |
| name | VARCHAR(200) | NOT NULL | - | 任务名称 |
| description | TEXT | - | NULL | 任务描述 |
| project_id | INT | FOREIGN KEY | NULL | 所属项目ID |
| case_ids | TEXT | - | NULL | 关联的用例ID列表，JSON数组格式如[1,2,3] |
| trigger_type | ENUM | - | 'manual' | 触发方式: manual-手动, scheduled-定时, ci_triggered-CI触发 |
| cron_expression | VARCHAR(50) | - | NULL | Cron表达式，定时任务使用 |
| environment_id | INT | FOREIGN KEY | NULL | 执行环境ID |
| status | ENUM | - | 'active' | 任务状态: active-活跃, paused-暂停, archived-归档 |
| created_by | INT | FOREIGN KEY | NULL | 创建人ID |
| created_at | DATETIME | - | CURRENT_TIMESTAMP | 创建时间 |
| updated_at | DATETIME | - | CURRENT_TIMESTAMP ON UPDATE | 更新时间 |

**索引：**
- `idx_tasks_project` (project_id) - 项目索引
- `idx_tasks_status` (status) - 状态索引
- `idx_tasks_trigger` (trigger_type) - 触发类型索引

**外键：**
- `project_id` → `projects(id)` ON DELETE CASCADE
- `environment_id` → `environments(id)` ON DELETE SET NULL
- `created_by` → `users(id)` ON DELETE SET NULL

---

## 6. task_executions（任务执行记录表）

**表说明：** 记录每次测试任务执行的详细信息和结果

| 字段名 | 类型 | 约束 | 默认值 | 说明 |
|--------|------|------|--------|------|
| id | INT | PRIMARY KEY, AUTO_INCREMENT | - | 执行记录唯一标识 |
| task_id | INT | FOREIGN KEY | NULL | 关联的任务ID |
| task_name | VARCHAR(200) | - | NULL | 任务名称快照（冗余存储，防止任务删除后丢失） |
| trigger_type | ENUM | - | NULL | 本次执行的触发方式 |
| status | ENUM | - | 'pending' | 执行状态: pending-等待中, running-运行中, success-成功, failed-失败, cancelled-已取消 |
| total_cases | INT | - | 0 | 本次执行的用例总数 |
| passed_cases | INT | - | 0 | 通过的用例数 |
| failed_cases | INT | - | 0 | 失败的用例数 |
| skipped_cases | INT | - | 0 | 跳过的用例数 |
| start_time | DATETIME | - | NULL | 执行开始时间 |
| end_time | DATETIME | - | NULL | 执行结束时间 |
| duration | INT | - | NULL | 执行耗时（秒） |
| executed_by | INT | FOREIGN KEY | NULL | 执行人ID |
| environment_id | INT | FOREIGN KEY | NULL | 执行环境ID |
| error_message | TEXT | - | NULL | 错误信息（执行失败时记录） |
| jenkins_build_id | VARCHAR(100) | - | NULL | Jenkins构建ID |
| jenkins_build_url | VARCHAR(500) | - | NULL | Jenkins构建URL |
| created_at | DATETIME | - | CURRENT_TIMESTAMP | 记录创建时间 |

**索引：**
- `idx_exec_task` (task_id) - 任务索引
- `idx_exec_status` (status) - 状态索引
- `idx_exec_start_time` (start_time) - 开始时间索引，用于趋势查询

**外键：**
- `task_id` → `tasks(id)` ON DELETE SET NULL
- `executed_by` → `users(id)` ON DELETE SET NULL
- `environment_id` → `environments(id)` ON DELETE SET NULL

---

## 7. case_results（用例执行结果表）

**表说明：** 记录每个测试用例的执行详情和结果

| 字段名 | 类型 | 约束 | 默认值 | 说明 |
|--------|------|------|--------|------|
| id | INT | PRIMARY KEY, AUTO_INCREMENT | - | 结果记录唯一标识 |
| execution_id | INT | FOREIGN KEY, NOT NULL | - | 关联的执行记录ID |
| case_id | INT | FOREIGN KEY | NULL | 关联的用例ID |
| case_name | VARCHAR(200) | - | NULL | 用例名称快照 |
| status | ENUM | - | NULL | 执行结果: passed-通过, failed-失败, skipped-跳过, error-异常 |
| start_time | DATETIME | - | NULL | 用例开始执行时间 |
| end_time | DATETIME | - | NULL | 用例执行结束时间 |
| duration | INT | - | NULL | 执行耗时（毫秒） |
| error_message | TEXT | - | NULL | 错误信息 |
| error_stack | TEXT | - | NULL | 错误堆栈信息 |
| screenshot_path | VARCHAR(500) | - | NULL | 失败截图路径 |
| log_path | VARCHAR(500) | - | NULL | 执行日志路径 |
| assertions_total | INT | - | 0 | 断言总数 |
| assertions_passed | INT | - | 0 | 断言通过数 |
| response_data | TEXT | - | NULL | 响应数据JSON（API测试时记录） |
| created_at | DATETIME | - | CURRENT_TIMESTAMP | 记录创建时间 |

**索引：**
- `idx_result_execution` (execution_id) - 执行记录索引
- `idx_result_case` (case_id) - 用例索引
- `idx_result_status` (status) - 状态索引

**外键：**
- `execution_id` → `task_executions(id)` ON DELETE CASCADE
- `case_id` → `test_cases(id)` ON DELETE SET NULL

---

## 8. daily_summaries（每日统计汇总表）

**表说明：** 按天聚合的测试执行统计数据，用于趋势图展示

| 字段名 | 类型 | 约束 | 默认值 | 说明 |
|--------|------|------|--------|------|
| id | INT | PRIMARY KEY, AUTO_INCREMENT | - | 记录唯一标识 |
| summary_date | DATE | UNIQUE, NOT NULL | - | 统计日期，唯一索引 |
| total_executions | INT | - | 0 | 当日执行总次数 |
| total_cases_run | INT | - | 0 | 当日执行的用例总数 |
| passed_cases | INT | - | 0 | 通过的用例数 |
| failed_cases | INT | - | 0 | 失败的用例数 |
| skipped_cases | INT | - | 0 | 跳过的用例数 |
| success_rate | DECIMAL(5,2) | - | NULL | 成功率百分比，如95.50表示95.50% |
| avg_duration | INT | - | NULL | 平均执行时长（秒） |
| active_cases_count | INT | - | 0 | 当日活跃用例总数 |
| created_at | DATETIME | - | CURRENT_TIMESTAMP | 记录创建时间 |
| updated_at | DATETIME | - | CURRENT_TIMESTAMP ON UPDATE | 最后更新时间 |

**索引：**
- `idx_summary_date` (summary_date) - 日期索引，用于趋势查询

---

## 9. audit_logs（系统审计日志表）

**表说明：** 记录用户的所有操作行为，用于安全审计

| 字段名 | 类型 | 约束 | 默认值 | 说明 |
|--------|------|------|--------|------|
| id | INT | PRIMARY KEY, AUTO_INCREMENT | - | 日志唯一标识 |
| user_id | INT | FOREIGN KEY | NULL | 操作用户ID |
| action | VARCHAR(50) | NOT NULL | - | 操作类型，如：login, logout, create_case, delete_task等 |
| target_type | VARCHAR(50) | - | NULL | 操作对象类型，如：user, case, task, execution等 |
| target_id | INT | - | NULL | 操作对象ID |
| details | TEXT | - | NULL | 操作详情JSON，记录变更前后的数据 |
| ip_address | VARCHAR(50) | - | NULL | 操作者IP地址 |
| user_agent | VARCHAR(255) | - | NULL | 操作者浏览器User-Agent |
| created_at | DATETIME | - | CURRENT_TIMESTAMP | 操作时间 |

**索引：**
- `idx_log_user` (user_id) - 用户索引
- `idx_log_action` (action) - 操作类型索引
- `idx_log_created` (created_at) - 时间索引，用于日志查询
- `idx_log_target` (target_type, target_id) - 操作对象索引

**外键：**
- `user_id` → `users(id)` ON DELETE SET NULL

---

## ER 关系图（文字描述）

```
users (1) ←──────── (N) projects          // 一个用户可以负责多个项目
users (1) ←──────── (N) test_cases        // 一个用户可以创建/修改多个用例
users (1) ←──────── (N) tasks             // 一个用户可以创建多个任务
users (1) ←──────── (N) task_executions   // 一个用户可以执行多次任务
users (1) ←──────── (N) audit_logs        // 一个用户可以有多条审计日志

projects (1) ←───── (N) test_cases        // 一个项目包含多个用例
projects (1) ←───── (N) tasks             // 一个项目包含多个任务

environments (1) ← (N) tasks              // 一个环境可被多个任务使用
environments (1) ← (N) task_executions    // 一个环境可有多次执行记录

tasks (1) ←──────── (N) task_executions   // 一个任务可有多次执行记录

task_executions (1) ← (N) case_results    // 一次执行包含多个用例结果
test_cases (1) ←──── (N) case_results     // 一个用例可有多次执行结果
```

---

## 枚举值说明

### 用户角色 (users.role)
| 值 | 说明 |
|----|------|
| admin | 管理员 - 拥有所有权限 |
| tester | 测试人员 - 可执行测试、管理用例 |
| developer | 开发人员 - 可查看报告、触发测试 |
| viewer | 只读用户 - 仅可查看数据 |

### 用户状态 (users.status)
| 值 | 说明 |
|----|------|
| active | 正常 - 可正常使用 |
| inactive | 禁用 - 已禁止登录 |
| locked | 锁定 - 因登录失败过多被临时锁定 |

### 用例优先级 (test_cases.priority)
| 值 | 说明 |
|----|------|
| P0 | 最高优先级 - 核心功能 |
| P1 | 高优先级 - 重要功能 |
| P2 | 中优先级 - 一般功能 |
| P3 | 低优先级 - 边缘功能 |

### 用例类型 (test_cases.type)
| 值 | 说明 |
|----|------|
| api | 接口测试 |
| ui | 界面测试 |
| performance | 性能测试 |
| security | 安全测试 |

### 触发方式 (tasks.trigger_type / task_executions.trigger_type)
| 值 | 说明 |
|----|------|
| manual | 手动触发 |
| scheduled | 定时触发 |
| ci_triggered | CI/CD 触发 |

### 执行状态 (task_executions.status)
| 值 | 说明 |
|----|------|
| pending | 等待中 - 任务已创建，等待执行 |
| running | 运行中 - 任务正在执行 |
| success | 成功 - 执行完成，无失败 |
| failed | 失败 - 执行完成，有失败用例 |
| cancelled | 已取消 - 用户手动取消 |

### 用例执行结果 (case_results.status)
| 值 | 说明 |
|----|------|
| passed | 通过 - 用例执行成功 |
| failed | 失败 - 断言失败 |
| skipped | 跳过 - 条件不满足被跳过 |
| error | 异常 - 执行过程中发生错误 |

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

---

## 创建日期

**文档创建时间：** 2025-12-30

**数据库版本：** MariaDB 10.x / MySQL 8.x
