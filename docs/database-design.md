# 自动化测试平台数据库设计文档

## 概述

本文档记录自动化测试平台远程 MariaDB 数据库的表结构说明，包括 6 张核心业务表及其关联关系。

**数据库信息：**
- 数据库类型：远程 MariaDB 数据库
- 字符集：`utf8mb4`
- 排序规则：`utf8mb4_unicode_ci`
- 存储引擎：`InnoDB`

**重要说明：** 数据库表结构由 DBA 统一管理，本地不进行表结构初始化。

---

## 表清单

| 序号 | 表名 | 说明 | 类型 |
|:---:|------|------|------|
| 1 | Auto_Users | 用户表 | 主表 |
| 2 | Auto_TestCase | 测试用例资产表 | 主表 |
| 3 | Auto_TestRun | 测试执行批次表 | 主表 |
| 4 | Auto_TestCaseTaskExecutions | 测试任务执行记录表 | 主表/从表 |
| 5 | Auto_TestRunResults | 测试用例执行结果表 | 从表 |
| 6 | Auto_TestCaseDailySummaries | 测试用例每日统计汇总表 | 独立表 |

---

## 详细表结构及关联关系

### 1. Auto_Users（用户表）

**作用：** 存储平台用户信息，包括认证、角色权限等。作为核心主表被多个表引用。

**主要字段：**

| 字段名 | 类型 | 说明 |
|--------|------|------|
| `id` | INT | 主键 - 用户ID |
| `username` | VARCHAR | 用户名（唯一） |
| `email` | VARCHAR | 邮箱（唯一） |
| `password_hash` | VARCHAR | 密码哈希 |
| `display_name` | VARCHAR | 显示名称 |
| `avatar` | VARCHAR | 头像URL |
| `role` | ENUM | 角色（admin/tester/developer/viewer） |
| `status` | ENUM | 状态（active/inactive/locked） |
| `email_verified` | BOOLEAN | 邮箱是否验证 |
| `login_attempts` | INT | 登录失败次数 |
| `locked_until` | DATETIME | 锁定截止时间 |
| `last_login_at` | DATETIME | 最后登录时间 |
| `created_at` | DATETIME | 创建时间 |
| `updated_at` | DATETIME | 更新时间 |

**被引用关系（作为主表）：**
- ✅ `Auto_TestCase.created_by` → `Auto_Users.id`（用例创建者）
- ✅ `Auto_TestCase.updated_by` → `Auto_Users.id`（用例更新者）
- ✅ `Auto_TestRun.trigger_by` → `Auto_Users.id`（执行触发者）
- ✅ `Auto_TestCaseTaskExecutions.executed_by` → `Auto_Users.id`（任务执行者）

**代码位置：** `server/services/AuthService.ts`

---

### 2. Auto_TestCase（测试用例资产表）

**作用：** 存储自动化测试用例的定义和配置信息。

**主要字段：**

| 字段名 | 类型 | 说明 |
|--------|------|------|
| `id` | INT | 主键 - 用例ID |
| `case_key` | VARCHAR | 用例唯一标识 |
| `name` | VARCHAR | 用例名称 |
| `description` | TEXT | 用例描述 |
| `project_id` | INT | 项目ID |
| `repo_id` | INT | 仓库ID |
| `module` | VARCHAR | 模块名称 |
| `priority` | VARCHAR | 优先级（P0/P1/P2/P3） |
| `type` | VARCHAR | 类型（api/ui/performance） |
| `tags` | TEXT | 标签（JSON） |
| `owner` | VARCHAR | 负责人 |
| `source` | VARCHAR | 数据来源 |
| `enabled` | BOOLEAN | 是否启用（默认true） |
| `last_sync_commit` | VARCHAR | 最后同步的Git commit |
| `script_path` | VARCHAR | 测试脚本路径 |
| `config_json` | TEXT | 配置JSON |
| `created_by` | INT | 创建者ID（外键 → Auto_Users.id） |
| `updated_by` | INT | 更新者ID（外键 → Auto_Users.id） |
| `created_at` | DATETIME | 创建时间 |
| `updated_at` | DATETIME | 更新时间 |

**外键关联（作为从表）：**
- ✅ `created_by` → `Auto_Users.id`
- ✅ `updated_by` → `Auto_Users.id`

**被引用关系（作为主表）：**
- ✅ `Auto_TestRunResults.case_id` → `Auto_TestCase.id`（执行结果关联用例）

**代码位置：** `server/routes/cases.ts`

---

### 3. Auto_TestRun（测试执行批次表）

**作用：** 记录每次测试批次执行的整体信息和统计数据。面向批次维度，适用于Jenkins触发的批量测试。

**主要字段：**

| 字段名 | 类型 | 说明 |
|--------|------|------|
| `id` | INT | 主键 - 执行批次ID |
| `project_id` | INT | 项目ID |
| `trigger_type` | ENUM | 触发类型（manual/jenkins/schedule） |
| `trigger_by` | INT | 触发者ID（外键 → Auto_Users.id） |
| `jenkins_job` | VARCHAR | Jenkins任务名 |
| `jenkins_build_id` | VARCHAR | Jenkins构建ID |
| `jenkins_url` | VARCHAR | Jenkins构建URL |
| `status` | ENUM | 状态（pending/running/success/failed/aborted） |
| `total_cases` | INT | 总用例数 |
| `passed_cases` | INT | 通过用例数 |
| `failed_cases` | INT | 失败用例数 |
| `skipped_cases` | INT | 跳过用例数 |
| `duration_ms` | INT | 执行时长（毫秒） |
| `start_time` | DATETIME | 开始时间 |
| `end_time` | DATETIME | 结束时间 |
| `run_config` | TEXT | 运行配置JSON |
| `created_at` | DATETIME | 创建时间 |

**外键关联（作为从表）：**
- ✅ `trigger_by` → `Auto_Users.id`

**关联关系：**
- 与 `Auto_TestRunResults` 是一对多关系（一次批次包含多条用例结果）
- 与 `Auto_TestCaseTaskExecutions` 通常同时创建（见下文设计说明）

**代码位置：** `server/services/ExecutionService.ts` (triggerTestExecution方法)

---

### 4. Auto_TestCaseTaskExecutions（测试任务执行记录表）

**作用：** 记录测试任务的执行历史和状态。面向任务维度，作为执行结果的主记录。

**主要字段：**

| 字段名 | 类型 | 说明 |
|--------|------|------|
| `id` | INT | 主键 - 执行记录ID |
| `task_id` | INT | 任务ID（可为NULL） |
| `task_name` | VARCHAR | 任务名称 |
| `status` | ENUM | 状态（pending/running/success/failed/cancelled） |
| `total_cases` | INT | 总用例数 |
| `passed_cases` | INT | 通过用例数 |
| `failed_cases` | INT | 失败用例数 |
| `skipped_cases` | INT | 跳过用例数 |
| `executed_by` | INT | 执行者ID（外键 → Auto_Users.id） |
| `start_time` | DATETIME | 开始时间 |
| `end_time` | DATETIME | 结束时间 |
| `duration` | INT | 执行时长（秒） |
| `created_at` | DATETIME | 创建时间 |

**外键关联（作为从表）：**
- ✅ `executed_by` → `Auto_Users.id`

**被引用关系（作为主表）：**
- ✅ `Auto_TestRunResults.execution_id` → `Auto_TestCaseTaskExecutions.id`

**代码位置：** `server/services/ExecutionService.ts` (triggerTestExecution、handleCallback方法)

---

### 5. Auto_TestRunResults（测试用例执行结果表）

**作用：** 记录每个测试用例的详细执行结果。

**主要字段：**

| 字段名 | 类型 | 说明 |
|--------|------|------|
| `id` | INT | 主键 - 结果记录ID |
| `execution_id` | INT | 执行记录ID（外键 → Auto_TestCaseTaskExecutions.id） |
| `case_id` | INT | 用例ID（外键 → Auto_TestCase.id） |
| `case_name` | VARCHAR | 用例名称（冗余字段，便于查询） |
| `status` | ENUM | 状态（passed/failed/skipped/error） |
| `duration` | INT | 执行时长（秒） |
| `error_message` | TEXT | 错误信息 |
| `start_time` | DATETIME | 开始时间 |
| `end_time` | DATETIME | 结束时间 |
| `created_at` | DATETIME | 创建时间 |

**外键关联（作为从表）：**
- ✅ `case_id` → `Auto_TestCase.id`
- ✅ `execution_id` → `Auto_TestCaseTaskExecutions.id`（⚠️ 注意：不是 Auto_TestRun.id）

**代码位置：** `server/services/ExecutionService.ts` (handleCallback、completeBatchExecution方法)

---

### 6. Auto_TestCaseDailySummaries（测试用例每日统计汇总表）

**作用：** 按天聚合的测试执行统计数据，用于趋势图展示和历史数据分析。

**主要字段：**

| 字段名 | 类型 | 说明 |
|--------|------|------|
| `id` | INT | 主键 - 记录ID |
| `summary_date` | DATE | 汇总日期（唯一索引） |
| `total_executions` | INT | 总执行次数 |
| `total_cases_run` | INT | 总执行用例数 |
| `passed_cases` | INT | 通过用例数 |
| `failed_cases` | INT | 失败用例数 |
| `skipped_cases` | INT | 跳过用例数 |
| `success_rate` | DECIMAL | 成功率（%） |
| `avg_duration` | INT | 平均执行时长（秒） |
| `active_cases_count` | INT | 活跃用例数 |
| `created_at` | DATETIME | 创建时间 |

**关联关系：**
- 独立汇总表，无外键关联
- 数据来源：从 `Auto_TestRun` 和 `Auto_TestCaseTaskExecutions` 聚合而来
- 更新机制：定时任务每日汇总（T-1数据口径，不展示当天数据）

**代码位置：** `server/services/DashboardService.ts` (refreshDailySummary方法)

---

## 表关联关系图

### 核心关联关系

```
┌─────────────────┐
│  Auto_Users     │ (用户表 - 核心主表)
└────────┬────────┘
         │
         ├──────────────────────────────────┐
         │                                  │
         │ created_by/updated_by            │ trigger_by
         ▼                                  ▼
┌─────────────────┐              ┌─────────────────┐
│ Auto_TestCase   │              │  Auto_TestRun   │
│ (用例资产表)    │              │  (执行批次表)   │
└────────┬────────┘              └─────────────────┘
         │ case_id
         │
         ▼
┌──────────────────────────┐
│ Auto_TestRunResults      │
│ (用例执行结果表)         │
└──────────┬───────────────┘
           │ execution_id
           │
           ▼
┌──────────────────────────────┐
│ Auto_TestCaseTaskExecutions  │
│ (任务执行记录表)             │
└──────────┬───────────────────┘
           │ executed_by
           │
           ▼
      (回到 Auto_Users)


独立汇总表：
┌─────────────────────────────┐
│ Auto_TestCaseDailySummaries │
│ (每日统计汇总表)            │
│ 数据来源: TestRun +         │
│          TaskExecutions     │
└─────────────────────────────┘
```

### 数据流向图

```
1. 用户创建用例
   Auto_Users → Auto_TestCase (created_by)

2. 用户触发执行
   Auto_Users → Auto_TestRun (trigger_by)
   同时创建 → Auto_TestCaseTaskExecutions (executed_by)

3. 记录执行结果
   Auto_TestCase + Auto_TestCaseTaskExecutions
   → Auto_TestRunResults (case_id + execution_id)

4. 每日数据汇总
   Auto_TestRun + Auto_TestCaseTaskExecutions
   → Auto_TestCaseDailySummaries (聚合统计)
```

---

## 关键设计说明

### 为什么需要两张执行表？

**Auto_TestRun vs Auto_TestCaseTaskExecutions：**

- **Auto_TestRun**：面向批次维度
  - 适用场景：Jenkins触发的批量测试
  - 包含Jenkins集成信息（job名、build ID、build URL）
  - 重点记录批次级别的统计数据

- **Auto_TestCaseTaskExecutions**：面向任务维度
  - 适用场景：任务调度、执行历史追溯
  - 作为 `Auto_TestRunResults` 的主记录（execution_id外键指向此表）
  - 可关联多个执行批次

**实际使用：** 当前代码中，触发执行时会同时创建两张表的记录（参考 `ExecutionService.triggerTestExecution` 方法）。

### execution_id 的指向

**重要：** `Auto_TestRunResults.execution_id` 指向的是 `Auto_TestCaseTaskExecutions.id`，而非 `Auto_TestRun.id`。

这意味着：
- 执行结果以 TaskExecution 为主记录
- TestRun 主要用于 Jenkins 集成和批次统计
- 查询执行详情时需要 JOIN TaskExecutions 表

### 冗余字段设计

为了提高查询性能，部分表采用了冗余字段设计：
- `Auto_TestRunResults.case_name`：冗余存储用例名称，避免频繁 JOIN Auto_TestCase
- 多处使用 `display_name`：JOIN Auto_Users 获取用户显示名称，避免只显示 ID

---

## 典型业务场景 SQL 示例

### 场景1：查询执行记录及执行者信息

```sql
SELECT 
  te.*, 
  u.display_name as executed_by_name
FROM Auto_TestCaseTaskExecutions te
LEFT JOIN Auto_Users u ON te.executed_by = u.id
WHERE te.id = ?;
```

### 场景2：查询执行结果及用例信息

```sql
SELECT 
  atrr.*,
  atc.module, 
  atc.priority, 
  atc.type
FROM Auto_TestRunResults atrr
LEFT JOIN Auto_TestCase atc ON atrr.case_id = atc.id
WHERE atrr.execution_id = ?
ORDER BY atrr.id;
```

### 场景3：Dashboard 趋势图数据（T-1口径）

```sql
-- 优先从汇总表获取（性能更好）
SELECT 
  summary_date as date,
  total_executions,
  passed_cases,
  failed_cases,
  success_rate
FROM Auto_TestCaseDailySummaries
WHERE summary_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
  AND summary_date < CURDATE()  -- T-1 口径：不展示当天
ORDER BY summary_date ASC;

-- 汇总表无数据时，实时计算
SELECT 
  DATE(start_time) as date,
  COUNT(*) as total_executions,
  SUM(passed_cases) as passed_cases,
  SUM(failed_cases) as failed_cases,
  ROUND(SUM(passed_cases) * 100.0 / 
        NULLIF(SUM(passed_cases + failed_cases + skipped_cases), 0), 2) 
    as success_rate
FROM Auto_TestCaseTaskExecutions
WHERE DATE(start_time) >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
  AND DATE(start_time) < CURDATE()
GROUP BY DATE(start_time)
ORDER BY date ASC;
```

### 场景4：查询用例的执行历史

```sql
SELECT 
  atrr.status,
  atrr.duration,
  atrr.error_message,
  atrr.created_at,
  atce.start_time,
  u.display_name as executed_by
FROM Auto_TestRunResults atrr
LEFT JOIN Auto_TestCaseTaskExecutions atce ON atrr.execution_id = atce.id
LEFT JOIN Auto_Users u ON atce.executed_by = u.id
WHERE atrr.case_id = ?
ORDER BY atrr.created_at DESC
LIMIT 20;
```

---

## 数据访问说明

### API 路由对应关系

| API路由 | 主要操作的表 | 说明 |
|---------|-------------|------|
| `/api/auth/*` | `Auto_Users` | 用户认证、注册、登录 |
| `/api/cases` | `Auto_TestCase` | 用例CRUD操作 |
| `/api/cases/:id/run` | `Auto_TestCase` + `Auto_TestRun` | 触发单用例执行 |
| `/api/jenkins/trigger` | `Auto_TestRun` + `Auto_TestCaseTaskExecutions` | 创建执行记录 |
| `/api/executions/callback` | `Auto_TestRunResults` + `Auto_TestCaseTaskExecutions` | Jenkins回调更新结果 |
| `/api/executions/test-runs` | `Auto_TestRun` | 查询执行批次列表 |
| `/api/executions/:id/results` | `Auto_TestRunResults` + `Auto_TestCase` | 查询执行结果详情 |
| `/api/dashboard/*` | `Auto_TestCaseDailySummaries` + `Auto_TestRun` | Dashboard统计数据 |

### 数据库连接

- 使用 `server/config/database.ts` 中的 mysql2 连接池
- 所有数据库操作通过 `server/services/` 中的服务层进行
- 禁止在代码中硬编码 SQL 语句

---

## 注意事项

### 数据库管理

1. **表结构管理**：数据库表结构由 DBA 统一管理，本地不进行表结构初始化
2. **数据访问**：所有数据库操作必须通过后端 API 接口进行
3. **命名规范**：表名采用 `Auto_` 前缀的统一命名规范
4. **权限控制**：数据访问权限由后端服务层统一控制

### 外键约束

虽然代码中存在逻辑上的外键关系，但需要DBA确认是否在数据库层面创建了物理外键约束。

### 数据一致性

- 创建执行时，需同时创建 `Auto_TestRun` 和 `Auto_TestCaseTaskExecutions` 记录
- 回调更新时，需同时更新两张表的状态
- 每日汇总数据需定时任务触发（cron job）

---

## 建议的后续优化

1. **统一执行表设计**
   - 考虑是否可以合并 `Auto_TestRun` 和 `Auto_TestCaseTaskExecutions`
   - 或者明确两者的职责边界和使用场景

2. **添加中间表**
   - 考虑添加 `Auto_TestRun_Cases` 中间表，明确记录批次包含的用例列表
   - 目前通过 `Auto_TestRunResults` 反查，不够直观

3. **索引优化**
   - 确保高频查询字段（如 `created_by`, `trigger_by`, `case_id`, `execution_id`）都有索引
   - 对 `summary_date`、`start_time` 等时间字段建立索引

4. **文档完善**
   - 建议DBA提供完整的DDL语句
   - 明确所有外键约束和索引定义

---

## 文档更新

**文档更新时间：** 2026-01-17

**数据库类型：** 远程 MariaDB 数据库

**数据来源：** 基于代码分析（`server/services/` 和 `server/routes/`）+ 业务逻辑推断
