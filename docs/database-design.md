# 自动化测试平台数据库设计文档

## 概述

本文档记录自动化测试平台远程 MariaDB 数据库的表结构说明，包括 6 张核心业务表。

**数据库信息：**
- 数据库类型：远程 MariaDB 数据库
- 字符集：`utf8mb4`
- 排序规则：`utf8mb4_unicode_ci`
- 存储引擎：`InnoDB`

**重要说明：** 数据库表结构由 DBA 统一管理，本地不进行表结构初始化。

---

## 表清单

| 序号 | 表名 | 说明 |
|:---:|------|------|
| 1 | Auto_TestCase | 测试用例资产表 |
| 2 | Auto_Users | 用户表 |
| 3 | Auto_TestRun | 测试执行批次表 |
| 4 | Auto_TestRunResults | 测试用例执行结果表 |
| 5 | Auto_TestCaseTaskExecutions | 测试任务执行记录表 |
| 6 | Auto_TestCaseDailySummaries | 测试用例每日统计汇总表 |

---

## 表结构说明

### 1. Auto_TestCase（测试用例资产表）
存储自动化测试用例的定义和配置信息，包括用例名称、描述、优先级、类型、状态等核心属性。

### 2. Auto_Users（用户表）
存储平台所有用户的认证和基本信息，包括用户名、邮箱、角色权限等。

### 3. Auto_TestRun（测试执行批次表）
记录每次测试任务执行的详细信息和结果，包括执行状态、开始结束时间、执行统计等。

### 4. Auto_TestRunResults（测试用例执行结果表）
记录每个测试用例的执行详情和结果，包括执行状态、耗时、错误信息等。

### 5. Auto_TestCaseTaskExecutions（测试任务执行记录表）
记录测试任务的执行历史，关联任务与执行结果的映射关系。

### 6. Auto_TestCaseDailySummaries（测试用例每日统计汇总表）
按天聚合的测试执行统计数据，用于趋势图展示和历史数据分析。

---

## 数据访问说明

### API 路由对应关系
- `/api/dashboard/*` - 主要查询 Auto_TestCaseDailySummaries 和 Auto_TestRun
- `/api/cases` - 主要操作 Auto_TestCase 表
- `/api/executions` - 主要操作 Auto_TestRun 和 Auto_TestRunResults 表
- `/api/users` - 主要操作 Auto_Users 表

### 数据库连接
- 使用 `server/config/database.ts` 中的 mysql2 连接池
- 所有数据库操作通过 `server/services/` 中的服务层进行
- 禁止在代码中硬编码 SQL 语句

---

## 注意事项

1. **表结构管理**：数据库表结构由 DBA 统一管理，本地不进行表结构初始化
2. **数据访问**：所有数据库操作必须通过后端 API 接口进行
3. **命名规范**：表名采用 `Auto_` 前缀的统一命名规范
4. **权限控制**：数据访问权限由后端服务层统一控制

---

## 文档更新

**文档更新时间：** 2026-01-11

**数据库类型：** 远程 MariaDB 数据库
