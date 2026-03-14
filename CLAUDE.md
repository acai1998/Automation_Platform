# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## ⚠️ 任务执行规范（必须遵守）

**每次开始任何任务之前，必须：**
1. 用自己的话重新复述用户的需求，明确描述要做什么、预期效果是什么
2. 等待用户回复"确认"之后，才能开始执行任务
3. 未经用户确认，不得修改任何代码或文件

## 开发命令

```bash
# 同时启动前端和后端
npm run start

# 仅启动前端（Vite 开发服务器，端口 5173）
npm run dev

# 仅启动后端（Express 服务，端口 3000，支持热重载）
npm run server

# 构建生产环境的前端代码
npm run build

# 预览构建后的前端
npm run preview

# 构建后端 TypeScript
npm run server:build
```

## 本地调试环境

| 服务 | 地址 | 说明 |
|------|------|------|
| 前端页面 | http://localhost:5173 | Vite 开发服务器 |
| 后端 API | http://localhost:3000 | Express API 服务 |

> 调试时直接使用本地服务，前端 5173 端口，API 3000 端口。

**测试账号**（本地登录）：
- 邮箱：`zhaoliu@autotest.com`
- 密码：`test123456`

**常用调试接口**：
```bash
# 调度器实时状态
curl http://localhost:3000/api/tasks/scheduler/status

# Jenkins 健康检查
curl http://localhost:3000/api/jenkins/health

# 诊断执行问题
curl "http://localhost:3000/api/jenkins/diagnose?runId=123"
```

## 测试

```bash
# 运行所有测试（Vitest + React Testing Library）
npm run test
# 或
npx vitest

# 运行前端测试
npm run test:frontend

# 运行后端测试
npm run test:backend

# 运行测试并监听文件变化
npm run test:watch

# 运行单次测试
npx vitest run

# 运行测试并生成覆盖率报告
npm run test:coverage

# 运行特定测试文件
npx vitest test_case/frontend/components/GitHubRepositoryTable.test.tsx
```

## 类型检查

```bash
# 前端（React/Vite）
npx tsc --noEmit -p tsconfig.json

# 后端（Express/Node）
npx tsc --noEmit -p tsconfig.server.json
```

## 架构说明

这是一个用于管理自动化测试用例、调度执行任务、展示测试报告的全栈自动化测试平台。
**注意**：实际测试执行由 Jenkins 等外部系统完成，平台专注于管理和调度。

### 前端（`src/`）
- 使用 React 18 与 TypeScript，基于 Vite 构建
- 样式：TailwindCSS + shadcn/ui 组件（位于 `src/components/ui/`）
- 路由：wouter（轻量级 React 路由器）
- 状态管理：TanStack Query（用于服务端状态）
- 路径别名：`@/*` 映射到 `src/*`
- UI 组件：Radix UI + 自定义组件库
- 通知系统：sonner
- 日期处理：date-fns + react-day-picker
- 图表库：Recharts（支持折线图、柱状图、饼图、甜甜圈图）
- 虚拟滚动：@tanstack/react-virtual（优化大数据列表性能）

### 后端（`server/`）
- 通过 ts-node 运行的 Express 服务器
- 使用 mysql2 + TypeORM 的 MariaDB 数据库
- 数据库配置位于 `server/config/database.ts`
- 路径别名：`@shared/*` 映射到 `shared/*`
- 中间件：认证、请求日志、速率限制、Jenkins 认证
- 服务层：分离的业务逻辑和服务层
- 实时通信：Socket.IO（支持 WebSocket 推送）
- Git 集成：simple-git（仓库同步和脚本解析）
- 任务调度：node-cron（定时任务和周期性任务）
- 邮件服务：nodemailer（测试报告通知）

### 核心功能模块

#### 1. 测试用例管理（`/api/cases`）
- GET `/api/cases` - 获取用例列表（支持分页、过滤、搜索）
- GET `/api/cases/modules/list` - 获取模块列表
- GET `/api/cases/running/list` - 获取正在运行的用例
- GET `/api/cases/:id` - 获取用例详情
- POST `/api/cases` - 创建新用例
- PUT `/api/cases/:id` - 更新用例
- DELETE `/api/cases/:id` - 删除用例
- POST `/api/cases/:id/run` - 执行单个用例

#### 2. 测试执行管理（`/api/executions`）
- GET `/api/executions` - 获取执行记录列表（支持按触发方式、状态、时间筛选）
- GET `/api/executions/:id` - 获取执行详情
- GET `/api/executions/:id/results` - 获取执行结果
- GET `/api/executions/test-runs` - 获取测试运行记录（支持分页、筛选）
- POST `/api/executions/callback` - Jenkins 回调更新结果（支持 pytest 真实结果解析）
- POST `/api/executions/:id/start` - 标记执行开始
- POST `/api/executions/:id/sync` - 同步执行状态
- POST `/api/executions/sync-stuck` - 修复卡住的执行
- GET `/api/executions/stuck` - 查询卡住的执行
- POST `/api/executions/:id/cancel` - 取消执行

#### 3. Jenkins 集成（`/api/jenkins`）
- POST `/api/jenkins/trigger` - 创建执行记录并触发 Jenkins
- POST `/api/jenkins/run-case` - 执行单个用例
- POST `/api/jenkins/run-batch` - 批量执行用例
- GET `/api/jenkins/batch/:runId` - 获取批次执行详情
- GET `/api/jenkins/health` - 验证 Jenkins 连接
- GET `/api/jenkins/diagnose?runId=XX` - 诊断执行问题
- POST `/api/jenkins/callback/manual-sync/:runId` - 手动同步执行结果

#### 4. 仪表盘统计（`/api/dashboard`）
- GET `/api/dashboard/stats` - 获取统计数据（支持日期范围筛选）
- GET `/api/dashboard/today-execution` - 获取今日执行统计（实时数据，支持甜甜圈图）
- GET `/api/dashboard/trend?days=30` - 获取趋势数据（T-1 口径，支持自定义日期范围）
- GET `/api/dashboard/comparison?days=30` - 获取对比数据
- GET `/api/dashboard/recent-runs?limit=10` - 获取最近运行记录（从 Auto_TestRun 表查询）
- GET `/api/dashboard/all?timeRange=30d` - 获取所有仪表盘数据
- POST `/api/dashboard/refresh-summary` - 刷新汇总数据
- GET `/api/dashboard/summary-status` - 获取汇总状态
- POST `/api/dashboard/trigger-manual-summary` - 手动触发汇总
- POST `/api/dashboard/backfill-summaries` - 回填历史汇总

#### 5. 测试任务管理（`/api/tasks`）
- GET `/api/tasks` - 获取任务列表（支持 keyword/status/triggerType 筛选与分页，内联 recentExecutions）
- POST `/api/tasks` - 创建任务（含 triggerType、cronExpression、caseIds 参数校验）
- PUT `/api/tasks/:id` - 更新任务（字段级校验）
- PATCH `/api/tasks/:id/status` - 切换任务状态（active/paused/archived）
- DELETE `/api/tasks/:id` - 删除任务
- GET `/api/tasks/:id/executions` - 获取任务执行历史
- POST `/api/tasks/:id/execute` - 立即执行任务
- POST `/api/tasks/:id/executions/:execId/cancel` - 取消运行中的执行
- GET `/api/tasks/:id/stats` - 获取任务维度统计（成功率趋势、失败原因聚合 Top 10）
- GET `/api/tasks/:id/audit` - 获取任务审计日志（谁创建/修改/执行）

#### 6. Git 仓库管理（`/api/repositories`）
- GET `/api/repositories` - 获取仓库配置列表
- GET `/api/repositories/:id` - 获取仓库详情
- POST `/api/repositories` - 创建仓库配置
- PUT `/api/repositories/:id` - 更新仓库配置
- DELETE `/api/repositories/:id` - 删除仓库配置
- POST `/api/repositories/:id/sync` - 同步仓库
- GET `/api/repositories/:id/sync-logs` - 获取同步日志
- POST `/api/repositories/:id/test-connection` - 测试连接
- GET `/api/repositories/:id/branches` - 获取分支列表

#### 7. 用户认证（`/api/auth`）
- POST `/api/auth/register` - 用户注册
- POST `/api/auth/login` - 用户登录
- POST `/api/auth/logout` - 用户登出
- GET `/api/auth/me` - 获取当前用户信息
- POST `/api/auth/refresh` - 刷新令牌
- POST `/api/auth/forgot-password` - 忘记密码
- POST `/api/auth/reset-password` - 重置密码

### 后端服务层
- `AuthService` - 用户认证和授权
- `ExecutionService` - 测试执行管理
- `JenkinsService` - Jenkins 集成
- `DashboardService` - 仪表盘数据服务
- `RepositoryService` - 仓库配置管理
- `RepositorySyncService` - 仓库同步服务
- `HybridSyncService` - 混合同步策略
- `ExecutionMonitorService` - 执行监控
- `ExecutionScheduler` - 执行调度器
- `SchedulerService` - 任务调度服务
- `TaskSchedulerService` - **定时调度引擎**（自研5段式Cron、24h补偿窗口、1分钟DB轮询、FIFO等待队列、指数退避重试、并发上限控制）
- `DailySummaryScheduler` - 每日汇总调度
- `ScriptParserService` - 脚本解析服务
- `JenkinsStatusService` - Jenkins 状态监控
- `EmailService` - 邮件服务

## 数据库结构
远程 MariaDB 数据库中的关键表：
- `Auto_Users` — 用户表
- `Auto_TestCaseProjects` — 测试用例项目表
- `Auto_TestCase` — 测试用例资产表
- `Auto_TestCaseTasks` — 测试任务表（v1.3.0 新增 `max_retries`、`retry_delay_ms` 字段）
- `Auto_TestEnvironments` — 测试环境配置表
- `Auto_TestRun` — 测试执行批次表（新增 execution_id 字段关联任务执行）
- `Auto_TestRunResults` — 测试用例执行结果表
- `Auto_TestCaseTaskExecutions` — 测试任务执行记录表
- `Auto_TestCaseDailySummaries` — 每日统计汇总表
- `Auto_TaskAuditLogs` — **任务操作审计日志表**（v1.3.0 新增，记录10种操作行为）
- `Auto_RepositoryConfigs` — Git 仓库配置表
- `Auto_RepositoryScriptMappings` — 仓库脚本映射表
- `Auto_SyncLogs` — 仓库同步日志表

**注意**：数据库表结构由 DBA 统一管理，本地不进行表结构初始化。详见 `docs/Table/` 目录。

### 重要表结构更新（2025-02）
- `Auto_TestRun` 表新增 `execution_id` 字段（int, nullable）：
  - 关联 `Auto_TestCaseTaskExecutions.id`，消除对时间窗口反查的依赖
  - 在 triggerExecution 事务中与 TestRun 同步创建后立即写入
  - 提升查询性能和数据一致性

### 重要表结构更新（2026-03，v1.3.0）
- `Auto_TestCaseTasks` 新增字段：
  - `max_retries TINYINT(3) NOT NULL DEFAULT 1` — 失败最大重试次数
  - `retry_delay_ms INT(11) NOT NULL DEFAULT 30000` — 重试延迟毫秒
- 新增 `Auto_TaskAuditLogs` 表：
  - `operator_id INT(11) DEFAULT NULL`（NULL = 系统自动操作，配合 `ON DELETE SET NULL` 外键）
  - 记录10种操作：`created / updated / deleted / status_changed / manually_triggered / execution_cancelled / compensated / triggered / retry_scheduled / permanently_failed`
- 新增性能索引：`Auto_TestCaseTaskExecutions`（task+start/status/created）、`Auto_TestCaseTasks`（trigger+status/updated）、`Auto_TestRunResults`（status+execution_id）
- 迁移脚本：`scripts/migrate-v1.3.0.sql`（可通过 `node scripts/run-migration.js` 或 mysql 客户端直接执行）

## 路径别名配置

在 `tsconfig.json` 中配置如下：
- `@/*` → `./src/*`（前端）
- `@shared/*` → `./shared/*`（共享类型）
- `@configs/*` → `./configs/*`（配置文件）

## 项目目录结构

```text
├── src/                      # 前端源代码（React）
│   ├── api/                  # API 客户端
│   ├── components/           # React 组件
│   │   ├── auth/            # 认证相关组件
│   │   ├── cases/           # 用例管理组件
│   │   ├── dashboard/       # 仪表盘组件
│   │   └── ui/              # UI 基础组件
│   ├── contexts/            # React Context
│   ├── hooks/               # 自定义 Hooks
│   ├── pages/               # 页面组件
│   │   ├── cases/          # 用例页面
│   │   ├── reports/        # 报告页面
│   │   └── tasks/          # 任务页面
│   ├── services/            # 服务层
│   ├── types/               # TypeScript 类型
│   ├── utils/               # 工具函数
│   └── test/                # 测试配置
├── server/                   # 后端源代码（Express）
│   ├── config/              # 配置文件
│   ├── entities/            # TypeORM 实体
│   ├── middleware/         # Express 中间件
│   ├── repositories/        # 数据仓库层
│   ├── routes/              # API 路由
│   ├── services/            # 业务服务层
│   └── utils/               # 工具函数
├── test_case/                # 测试文件目录
│   ├── frontend/            # 前端测试
│   │   ├── components/     # 组件测试
│   │   └── hooks/          # Hook 测试
│   ├── backend/             # 后端测试
│   │   ├── config/         # 配置测试
│   │   └── services/       # 服务测试
│   └── scripts/             # Shell 脚本测试
├── shared/                   # 共享类型定义
│   └── types/               # TypeScript 共享类型
├── configs/                  # 配置文件
├── docs/                     # 项目文档
│   ├── Jenkins/             # Jenkins 集成文档
│   └── Table/               # 数据库表结构文档
├── deployment/               # 部署相关文件
│   ├── configs/             # 部署配置
│   └── scripts/             # 部署脚本
├── scripts/                  # 项目脚本
├── public/                   # 静态资源
├── .aiconfig/                # AI 配置
├── archive/                  # 归档文件（不要使用）
└── tmp/                      # 临时文件（已忽略）
```

## 测试规范

### 前端测试
- **框架**：Vitest + React Testing Library + jsdom
- **配置**：测试配置在 `vite.config.ts`，设置文件在 `src/test/setup.ts`
- **位置**：测试文件放在 `test_case/frontend/` 目录
  - 组件测试：`test_case/frontend/components/`
  - Hook 测试：`test_case/frontend/hooks/`
- **命名**：测试文件以 `.test.tsx` 结尾
- **模式**：使用 `describe()` 和 `it()` 组织测试用例
- **模拟**：UI 组件使用 `vi.mock()` 进行模拟

### 测试文件示例
```typescript
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { Component } from '@/components/Component';

vi.mock('@/components/ui/button', () => ({
  Button: ({ children }: { children: React.ReactNode }) => <button>{children}</button>,
}));

describe('Component', () => {
  it('should render correctly', () => {
    render(<Component />);
    expect(screen.getByText('Expected Text')).toBeInTheDocument();
  });
});
```

### 后端测试
- **测试位置**：`test_case/backend/` 目录
  - 配置测试：`test_case/backend/config/`
  - 服务测试：`test_case/backend/services/`
- **测试类型**：单元测试、集成测试
- **使用 Vitest** 作为测试框架

### Shell 脚本测试
- **测试位置**：`test_case/scripts/` 目录
- **测试脚本**：
  - `test-websocket.sh` - WebSocket 集成测试
  - `quick-verify.sh` - 快速验证脚本
  - `test-callback.sh` - Jenkins 回调测试
  - `check-env.sh` - 环境检查脚本

## 开发规范

### 代码规范
- **尽可能减少自行实现的底层与通用逻辑，优先、直接、完整地复用既有成熟仓库与库代码，仅在必要时编写最小业务层与调度代码**
- **必须用 TypeScript**，禁止 `any` 类型（用 `unknown` 或具体类型替代）
- **路径别名必须使用**：
  - `@/*` → `src/*`（前端）
  - `@shared/*` → `shared/*`（共享类型）
- **React 组件**：必须用函数组件 + hooks，文件名与组件名一致（如 `Button.tsx`）
- **测试文件**：新组件必须包含对应的测试文件，放在 `test_case/frontend/components/` 目录
- **所有说明文件**必须放在对应目录，如 `docs/` 文件下
- **不要生成过多的说明文件，会显得文件结构太杂乱**

### 项目结构约束
- **前端代码**：仅在 `src/` 目录下修改（Vite + React 18 + Tailwind）
- **后端代码**：仅在 `server/` 目录下修改（Express + TypeScript）
- **禁止**在 `src/` 写后端逻辑，或在 `server/` 写前端组件

### 关键功能实现规范
- **Jenkins 集成**：
  - 通过 `executionService.createExecution()` 创建执行记录
  - Jenkins 完成后调用回调接口更新结果
  - 使用异步非阻塞设计，前端轮询获取进度
- **数据库操作**：
  - 通过 `server/config/database.ts` 中的连接池操作
  - **禁止**在代码中硬编码 SQL
  - 使用 TypeORM 或参数化查询
- **API 路由**：
  - 严格按 `API Routes` 部分定义
  - 遵循 RESTful 规范
- **图表开发**：
  - 使用 **Recharts** 库（`recharts`）绑定真实数据
  - 禁止使用静态图片或手写 SVG 模拟图表

### 数据展示规范
- **T-1 数据口径**：统计类数据（如趋势图）不展示当天数据，最新可展示日期 = 当前日期 - 1 天
- **实时数据口径**：今日执行统计等实时数据直接查询当天数据，不受 T-1 限制
- **图表交互**：图表必须支持 Hover Tooltip 展示详细数据
- **实时更新**：对于执行状态等实时数据，使用轮询机制（默认 3 秒间隔）
- **日期范围选择**：支持快捷选项（7天、30天、90天）和自定义日期范围
- **刷新时间显示**：数据加载完成后显示最后刷新时间

### 重要提示
- **不要修改** `tsconfig.json` 中的路径别名（已配置好）
- **不要添加** `node_modules` 或 `dist/` 文件到版本控制
- **所有新文件**必须放在对应目录（如新组件放 `src/components/`）
- **环境变量**：使用 `.env` 文件配置，参考 `.env.example`

---

## 执行与 Jenkins 集成规范

### 执行流程
执行流程采用**异步非阻塞设计**：
```
前端立即返回 → 显示加载状态
后台 Jenkins 执行 → 前端轮询进度（3秒间隔）
执行完成 → 回调更新 → 前端自动刷新
```

### Jenkins 参数格式
Jenkins Job 必须支持以下参数：
- `SCRIPT_PATH` — pytest 格式的脚本路径（如 `test_case/test_login.py::TestLogin::test_user_login`）
- `CASE_ID` — 测试用例ID
- `CASE_TYPE` — 用例类型（api/ui/performance）
- `CALLBACK_URL` — 平台回调地址

### 脚本路径规范
脚本路径采用 **pytest 完整路径格式**：
- ✅ **正确**：`test_case/test_login.py::TestLogin::test_user_login`（推荐）
- ⚠️ **可接受**：`test_case/test_login.py::TestClass`（类级别）
- ⚠️ **可接受**：`test_case/test_file.py`（文件级别）

### ExecutionService 关键方法
- `triggerTestExecution()` — 创建执行批次（同时创建 TestRun 和 TaskExecution，并关联）
- `getBatchExecution()` — 查询执行详情（通过 execution_id 直接关联查询）
- `completeBatchExecution()` — 完成执行并更新统计
- `updateBatchJenkinsInfo()` — 更新 Jenkins 构建信息
- `parseTestResults()` — 解析 pytest 测试结果（支持 passed/failed/skipped 统计）

### 前端轮询策略
- 执行状态为 `pending` 时：快速轮询（3秒间隔）
- 禁用缓存以获取最新数据
- 自动停止轮询当执行完成（status 为 success/failed/aborted）
- 参考实现：`src/hooks/useExecuteCase.ts` 中的 `useBatchExecution()` 方法

### Jenkins 回调数据格式
回调请求体应包含：
```json
{
  "runId": 123,
  "status": "success|failed|aborted",
  "passedCases": 5,
  "failedCases": 0,
  "skippedCases": 0,
  "durationMs": 120000,
  "results": [
    {
      "caseId": 1,
      "caseName": "test_case_1",
      "status": "passed|failed|skipped",
      "duration": 30000,
      "errorMessage": "可选的错误信息"
    }
  ]
}
```

**重要更新（2025-02）**：
- 回调接口现支持解析 pytest 真实执行结果
- 自动统计 passed/failed/skipped 数量
- 优化用例统计逻辑，确保数据准确性
- 修复今日执行统计甜甜圈图显示问题

### 回调认证方式
Jenkins 回调支持三种认证方式（任选其一）：
1. **API Key 认证**：`X-Api-Key: <jenkins_api_key>`
2. **JWT Token 认证**：`Authorization: Bearer <jenkins_jwt_token>`
3. **签名认证**：`X-Jenkins-Signature: <hmac_signature>` + `X-Jenkins-Timestamp: <unix_timestamp>`

### 故障排查
1. **验证 Jenkins 连接**：`curl http://localhost:3000/api/jenkins/health`
2. **诊断执行问题**：`curl http://localhost:3000/api/jenkins/diagnose?runId=123`
3. **查看执行详情**：`curl http://localhost:3000/api/jenkins/batch/:runId`

---

## Git 仓库集成规范

### 仓库配置
平台支持集成 Git 仓库来同步测试脚本：
- 支持多种 Git 托管平台（GitHub、GitLab、Gitee 等）
- 支持 SSH 和 HTTPS 两种连接方式
- 支持多分支管理
- 支持定时同步和手动同步

### 同步策略
平台提供两种同步策略：
1. **全量同步**：扫描整个仓库，解析所有测试脚本
2. **增量同步**：仅同步有变更的文件

### 脚本解析
- 自动解析 Python 测试脚本（pytest 格式）
- 识别测试类和测试方法
- 提取测试用例的元数据
- 支持自定义标记和分组

### 脚本映射
通过 `Auto_RepositoryScriptMappings` 表维护脚本与用例的映射关系：
- 每个脚本可以映射到多个测试用例
- 支持一对一、一对多、多对一的映射关系
- 映射关系可以手动维护或自动生成

---

## 任务调度规范

### 任务类型
1. **定时任务**：基于 Cron 表达式的定时执行
2. **一次性任务**：手动触发立即执行
3. **周期性任务**：按固定间隔重复执行

### TaskSchedulerService 核心能力（v1.3.0）

#### 调度引擎
- **自研5段式 Cron 解析**：无第三方依赖，支持 `* / , -` 语法
- **服务重启恢复**：启动时遍历 DB 中所有 `trigger_type='scheduled'` 的 active 任务并自动注册
- **漏触发补偿**：基于 `lastRunAt` 检测 24h 窗口内的漏触发，自动补偿执行
- **每分钟 DB 轮询**：自动同步任务增删改（cron 变更、状态变更、新任务注册）

#### 执行控制
- **并发上限**：默认 3，可通过环境变量 `TASK_CONCURRENCY_LIMIT` 配置
- **FIFO 内存等待队列**：超出并发上限的任务进入队列，有空闲时自动 drain
- **失败重试**：指数退避策略，由 `max_retries`（默认 1）和 `retry_delay_ms`（默认 30s）字段控制
- **取消执行**：支持取消 `pending/running` 状态的任务执行

#### 审计日志
- 10 种操作行为全链路追踪，写入 `Auto_TaskAuditLogs`
- `operator_id = NULL` 表示系统自动操作，非 NULL 表示真实用户操作
- 审计写入失败不影响主流程（静默处理）

### 环境变量
| 变量 | 默认值 | 说明 |
|------|--------|------|
| `TASK_CONCURRENCY_LIMIT` | `3` | 最大并发任务数 |

---

## 数据库操作规范
| 表名 | 说明 | 用途 |
|-----|------|------|
| `Auto_Users` | 用户表 | 存储用户信息和权限 |
| `Auto_TestCaseProjects` | 测试用例项目表 | 组织和分类测试用例项目 |
| `Auto_TestCase` | 测试用例资产表 | 存储用例定义、脚本路径和元数据 |
| `Auto_TestCaseTasks` | 测试任务表 | 定义和管理测试任务及其调度规则（含 max_retries/retry_delay_ms） |
| `Auto_TestEnvironments` | 测试环境配置表 | 管理测试执行环境配置 |
| `Auto_TestRun` | 测试执行批次表 | 记录执行批次的整体信息和统计 |
| `Auto_TestCaseTaskExecutions` | 测试任务执行记录表 | 记录任务维度的执行历史 |
| `Auto_TestRunResults` | 测试用例执行结果表 | 存储单个用例的执行结果详情 |
| `Auto_TestCaseDailySummaries` | 每日统计汇总表 | 统计类数据聚合及趋势分析 |
| `Auto_RepositoryConfigs` | 仓库配置表 | Git 仓库连接配置及认证管理 |
| `Auto_RepositoryScriptMappings` | 仓库脚本映射表 | 脚本文件与测试用例的映射关系 |
| `Auto_SyncLogs` | 仓库同步日志表 | 记录 Git 仓库同步的历史和状态 |
| `Auto_TaskAuditLogs` | 任务审计日志表 | 记录任务全生命周期10种操作行为，v1.3.0 新增 |

### 禁止硬编码 SQL
**所有数据库操作必须通过 `server/config/database.ts` 中的连接池进行，禁止在代码中硬编码 SQL**

### 表关联关系
- `Auto_Users` ← 多个表的 `trigger_by/created_by/updated_by/owner_id/executed_by` 字段（外键）
- `Auto_TestCaseProjects` ← `Auto_TestCase.project_id`（一对多）
- `Auto_TestCaseProjects` ← `Auto_TestCaseTasks.project_id`（一对多）
- `Auto_TestCase` ← `Auto_TestRunResults.case_id`（一对多）
- `Auto_TestCase` ← `Auto_RepositoryScriptMappings.case_id`（一对多）
- `Auto_TestRun` ← `Auto_TestRunResults.execution_id`（一对多）
- `Auto_TestCaseTasks` ← `Auto_TestCaseTaskExecutions.task_id`（一对多）
- `Auto_TestEnvironments` ← `Auto_TestCaseTasks.environment_id`（一对多）
- `Auto_TestEnvironments` ← `Auto_TestCaseTaskExecutions.environment_id`（一对多）
- `Auto_RepositoryConfigs` ← `Auto_RepositoryScriptMappings.repo_config_id`（一对多）
- `Auto_RepositoryConfigs` ← `Auto_SyncLogs.repo_config_id`（一对多）

### T-1 数据口径规则
对于**统计类数据**（如趋势图）：
- **不展示当天数据**
- 最新可展示日期 = 当前日期 - 1 天
- 确保数据完整性和准确性

### 实时数据规则
对于**实时监控数据**（如今日执行统计）：
- **展示当天数据**
- 实时查询 Auto_TestRun 表
- 支持按状态分类统计（pending/running/success/failed/aborted）
- 使用甜甜圈图或柱状图展示

---

## 前端开发规范

### 表单字段验证
- 所有输入必须验证非空
- 数值字段验证格式和范围
- 提供清晰的错误提示信息

### 状态管理
使用 TanStack Query 进行服务端状态管理：
- 自动缓存管理
- 自动重试机制
- 实时同步

### 图表展示
使用 **Recharts** 库实现：
- ✅ 绑定真实数据
- ✅ 支持 Hover Tooltip 展示详细数据
- ✅ 支持多种图表类型（折线图、柱状图、饼图、甜甜圈图）
- ✅ 支持自定义颜色主题和交互效果
- ✅ 支持日期范围筛选和数据刷新
- ❌ **禁止**使用静态图片或手写 SVG 模拟

### 异步操作模式
对于耗时操作（如 Jenkins 执行）：
- 立即返回并显示加载状态
- 使用轮询或 WebSocket 获取进度
- 显示明确的完成状态和错误提示

---

## 代码质量要求

### TypeScript 类型检查
- ✅ 完整的接口定义
- ✅ 严格的参数类型检查
- ❌ **禁止** `any` 类型（用 `unknown` 或具体类型替代）

### 错误处理
- 使用 try-catch 捕获异常
- 提供详细的错误信息
- 用户界面显示友好的错误提示

### 代码命名规范
- 统一的命名约定
- 文件名与组件名一致（如 `Button.tsx` 导出 `Button` 组件）
- 类和接口使用 PascalCase
- 函数和变量使用 camelCase

### 性能指标
| 指标 | 目标值 | 说明 |
|-----|-------|------|
| 轮询间隔 | 3000ms | 平衡实时性和性能 |
| API 响应时间 | < 500ms | 平均响应时间 |
| 前端加载时间 | < 3s | 首屏加载时间 |
| 图表渲染时间 | < 1s | 图表加载和渲染时间 |
| 数据刷新延迟 | < 2s | 数据刷新到页面更新的延迟 |

---

## 常用命令和工具

### 调试和验证
```bash
# Jenkins 健康检查
curl http://localhost:3000/api/jenkins/health

# 诊断执行问题
curl "http://localhost:3000/api/jenkins/diagnose?runId=123"

# 测试回调接口
curl -X POST http://localhost:3000/api/executions/callback \
  -H "X-Api-Key: <api_key>" \
  -H "Content-Type: application/json" \
  -d '{"runId": 123, "status": "success", ...}'

# 手动修复卡住的执行记录
curl -X POST http://localhost:3000/api/jenkins/callback/manual-sync/:runId \
  -H "X-Api-Key: <api_key>"

# 查看执行详情
curl http://localhost:3000/api/jenkins/batch/123

# 查询卡住的执行
curl http://localhost:3000/api/executions/stuck
```

### 测试命令
```bash
# 运行前端测试
npx vitest

# 运行测试并监听变化
npx vitest --watch

# 运行单次测试
npx vitest run

# 测试覆盖率
npx vitest --coverage

# 运行特定测试文件
npx vitest test_case/frontend/components/GitHubRepositoryTable.test.tsx
```

### 类型检查
```bash
# 检查前端类型
npx tsc --noEmit -p tsconfig.json

# 检查后端类型
npx tsc --noEmit -p tsconfig.server.json
```

### 部署相关
```bash
# 构建前端
npm run build

# 预览构建结果
npm run preview

# 构建后端
npm run server:build

# 生产环境启动（使用 PM2）
npm run prod:start

# 停止生产服务
npm run prod:stop

# 重启生产服务
npm run prod:restart

# 重新加载配置（零停机）
npm run prod:reload

# 查看生产日志
npm run prod:logs

# 查看服务状态
npm run prod:status

# 完整部署流程
npm run prod:deploy
```

### PM2 进程管理
```bash
# 查看所有进程
pm2 list

# 查看详细信息
pm2 show autotest-platform

# 监控资源使用
pm2 monit

# 重启所有进程
pm2 restart all

# 保存进程列表
pm2 save

# 设置开机自启
pm2 startup
```

### 环境配置
```bash
# 复制环境变量模板
cp .env.example .env

# 检查环境变量
bash scripts/check-env.sh

# 验证环境配置
bash deployment/scripts/verify-env.sh
```

---

## 故障排查指南

### 常见问题

#### 1. Jenkins 连接失败
**症状**：无法触发测试执行
**排查步骤**：
1. 检查 Jenkins 服务是否运行：`curl http://localhost:3000/api/jenkins/health`
2. 验证环境变量配置：`JENKINS_URL`, `JENKINS_USERNAME`, `JENKINS_PASSWORD`
3. 检查 Jenkins Job 配置是否正确
4. 查看 Jenkins 日志确认 API Token 是否有效

#### 2. 测试执行卡住
**症状**：执行状态一直为 `pending`
**排查步骤**：
1. 查询卡住的执行：`curl http://localhost:3000/api/executions/stuck`
2. 诊断执行问题：`curl "http://localhost:3000/api/jenkins/diagnose?runId=123"`
3. 手动同步：`curl -X POST http://localhost:3000/api/jenkins/callback/manual-sync/123`
4. 检查 Jenkins Pipeline 是否正常执行

#### 3. 数据库连接失败
**症状**：API 返回数据库错误
**排查步骤**：
1. 检查数据库服务是否运行
2. 验证环境变量配置：`DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`
3. 测试数据库连接：查看 `server/config/database.ts` 配置
4. 检查数据库用户权限

#### 4. Git 仓库同步失败
**症状**：无法同步测试脚本
**排查步骤**：
1. 测试仓库连接：`POST /api/repositories/:id/test-connection`
2. 检查 SSH 密钥或 HTTPS 认证是否配置正确
3. 查看同步日志：`GET /api/repositories/:id/sync-logs`
4. 验证仓库 URL 和分支是否正确

#### 5. 前端页面加载缓慢
**症状**：首屏加载时间超过 3 秒
**排查步骤**：
1. 检查网络连接
2. 清理浏览器缓存
3. 检查 API 响应时间
4. 查看浏览器控制台错误
5. 优化前端代码和资源加载

#### 6. 仪表盘数据不更新
**症状**：刷新后仍显示旧数据
**排查步骤**：
1. 检查 TanStack Query 缓存配置
2. 使用 `refetchOnMount` 和 `refetchOnWindowFocus` 强制刷新
3. 检查 API 接口是否返回最新数据
4. 清除浏览器缓存和 localStorage
5. 检查数据库查询逻辑是否正确

#### 7. 统计数据不准确
**症状**：用例统计数量与实际不符
**排查步骤**：
1. 检查 Jenkins 回调数据格式是否正确
2. 验证 pytest 结果解析逻辑
3. 检查数据库中 passed/failed/skipped 字段值
4. 查看执行日志确认实际执行结果
5. 手动触发数据同步修复

### 日志查看

#### 后端日志
- 日志位置：根据 `server/config/logging.ts` 配置
- 日志级别：`DEBUG`, `INFO`, `WARN`, `ERROR`
- 使用日志上下文：`LOG_CONTEXTS` 常量

#### 前端日志
- 浏览器控制台
- 使用 `console.log()`, `console.error()` 等
- 集成错误监控（可选）

---

## 安全最佳实践

### 认证和授权
- 使用 JWT Token 进行用户认证
- 实现基于角色的访问控制（RBAC）
- 敏感操作需要二次验证
- Token 有效期管理

### 数据保护
- 密码使用 bcrypt 加密
- 敏感信息不要记录到日志
- API 响应过滤敏感字段
- 使用 HTTPS 传输数据

### 输入验证
- 所有用户输入必须验证
- 防止 SQL 注入（使用参数化查询）
- 防止 XSS 攻击（输入转义）
- 限制文件上传类型和大小

### API 安全
- 实现速率限制
- CORS 配置
- CSRF 保护
- API Key 认证（用于 Jenkins 回调）

---

## 最佳实践

### 数据查询优化
1. **使用 execution_id 关联查询**：
   - ✅ 推荐：`TestRun.execution_id` 直接关联 `TaskExecution.id`
   - ❌ 避免：基于时间窗口的模糊查询
   - 性能提升：查询速度提升 3-5 倍

2. **统一数据口径**：
   - T-1 数据：趋势图、对比分析等统计类数据
   - 实时数据：今日执行、运行状态等监控类数据
   - 明确区分，避免混淆

3. **缓存策略**：
   - 使用 TanStack Query 自动缓存管理
   - 关键数据设置短缓存时间（30秒-1分钟）
   - 静态数据设置长缓存时间（5-10分钟）

### 前端性能优化
1. **虚拟滚动**：
   - 使用 `@tanstack/react-virtual` 处理大数据列表
   - 推荐场景：列表超过 100 条记录

2. **懒加载**：
   - 图表组件按需加载
   - 路由级别代码分割

3. **防抖和节流**：
   - 搜索输入使用防抖（300ms）
   - 滚动事件使用节流（100ms）

### 后端性能优化
1. **数据库查询**：
   - 使用索引优化查询（execution_id, created_at, status）
   - 避免 SELECT * 查询
   - 使用分页限制返回数据量

2. **批量操作**：
   - 批量插入使用事务
   - 批量更新合并为单次操作

3. **异步处理**：
   - 耗时操作使用异步队列
   - Jenkins 触发使用非阻塞调用

### 错误处理最佳实践
1. **前端错误处理**：
   - 使用 try-catch 包裹异步操作
   - 显示友好的错误提示
   - 记录错误日志供调试

2. **后端错误处理**：
   - 统一错误响应格式
   - 区分业务错误和系统错误
   - 敏感信息不要暴露给前端

3. **数据验证**：
   - 前端验证用户输入
   - 后端验证所有请求参数
   - 使用 TypeScript 类型检查

### 代码组织最佳实践
1. **组件拆分**：
   - 单一职责原则
   - 可复用组件抽取到 `src/components/`
   - 业务组件放在对应页面目录

2. **服务层设计**：
   - 业务逻辑放在 Service 层
   - 数据访问放在 Repository 层
   - 控制器只负责路由和参数验证

3. **类型定义**：
   - 共享类型放在 `shared/types/`
   - 前端类型放在 `src/types/`
   - 后端类型放在 `server/types/`

## 扩展开发指南

### 添加新的 API 端点
1. 在 `server/routes/` 创建或编辑路由文件
2. 在 `server/services/` 创建或编辑服务层
3. 在 `server/repositories/` 添加数据访问逻辑（如果需要）
4. 在 `src/api/` 添加前端 API 客户端
5. 编写测试文件

### 添加新的前端页面
1. 在 `src/pages/` 创建页面组件
2. 在 `src/components/` 创建相关组件
3. 在 `src/App.tsx` 添加路由
4. 在 `src/api/` 添加 API 调用
5. 编写组件测试

### 集成新的外部系统
1. 在 `server/services/` 创建服务类
2. 在 `.env` 添加配置项
3. 在 `server/routes/` 添加 API 端点
4. 编写集成测试
5. 更新文档

### 添加新的数据库表
1. 在数据库中创建表（联系 DBA）
2. 在 `server/entities/` 添加 TypeORM 实体
3. 在 `docs/Table/` 添加表结构文档
4. 在 `server/repositories/` 添加数据访问逻辑
5. 编写单元测试

---

## 相关文档

- [Jenkins 集成指南](docs/Jenkins/JENKINS_INTEGRATION.md)
- [Jenkins 快速设置](docs/Jenkins/JENKINS_QUICK_SETUP.md)
- [Jenkins 配置指南](docs/Jenkins/JENKINS_CONFIG_GUIDE.md)
- [Jenkins 故障排查](docs/Jenkins/JENKINS_TROUBLESHOOTING.md)
- [数据库表结构](docs/Table/)
- [数据库设计文档](docs/database-design.md)
- [API 文档](docs/API_DOCUMENTATION.md)
- [项目结构说明](docs/PROJECT_STRUCTURE.md)
- [项目快速开始](docs/QUICK_START.md)
- [运行详情页说明](docs/运行详情页.md)
- [部署指南](deployment/README.md)

---

## 联系与支持

如有问题或建议，请：
1. 查阅相关文档
2. 检查 GitHub Issues
3. 联系项目维护者

---

## 更新日志

### v1.3.1 (2026-03-12)
- ✨ 任务管理页面新增**关联用例**功能：新建/编辑任务时可通过选择器多选测试用例，支持关键字搜索（300ms防抖）和 API/UI/性能类型过滤
- 🎨 任务卡片新增关联用例数量显示（`ListChecks` 图标 + 数量，未关联时显示橙色提示）
- 🧹 移除任务卡片中无实际填写项的「未分类」和「测试环境」标签
- 🔧 前端 `useAllCasesForSelect` Hook（`src/hooks/useCases.ts`）：无需强制指定类型、支持 `enabled` 开关（弹窗关闭时不发请求）、30秒 stale 缓存
- 🔗 `caseIds` 正确传递至后端 `POST /api/tasks` 和 `PUT /api/tasks/:id`，执行时 `TaskSchedulerService` 从 `case_ids` 字段读取并触发 Jenkins 任务
- ⚠️ 若任务未关联任何用例，运行时调度引擎会记录 warn 日志并跳过执行（不触发 Jenkins），前端弹窗中有对应提示

### v1.3.0 (2026-03-12)
- 🚀 新增 `TaskSchedulerService` 定时调度引擎：自研5段式 Cron 解析、服务重启任务恢复、24h 漏触发补偿、每分钟 DB 轮询同步
- 🔒 新增任务执行控制：FIFO 等待队列、并发上限（默认3可配置）、指数退避重试策略、支持取消运行中执行
- 📊 新增任务维度统计：`GET /api/tasks/:id/stats`（成功率趋势、Top 10 失败原因聚合）
- 🔍 新增权限与审计：`Auto_TaskAuditLogs` + `GET /api/tasks/:id/audit`（10种操作行为追踪）
- 🗄️ 数据库迁移 `scripts/migrate-v1.3.0.sql`：新建审计表、重试配置字段、多组性能索引
- 🐛 修复外键约束：`operator_id` 改为 `DEFAULT NULL`，解决 `ON DELETE SET NULL` 与 `NOT NULL` 不兼容导致的 errno 150
- 🎨 任务 UI 增强：集成统计图表（成功率折线图、失败原因柱状图）、审计日志时间线、调度器状态监控面板

### v1.2.0 (2026-03-12)
- ✨ 任务管理页面新增新建/编辑/删除完整交互流程（含表单校验）
- 🔍 任务列表支持 keyword/status/triggerType 筛选与分页
- ⚡ 优化 `/api/tasks` 列表接口，内联 recentExecutions，消除前端 N+1 查询
- 🛡️ 完善任务 CRUD 参数校验（triggerType、cronExpression、caseIds）
- 🔄 新增 `PATCH /api/tasks/:id/status` 接口，支持 active/paused/archived 状态切换
- 🔗 任务卡片支持“查看报告”联动跳转（优先跳转最近运行详情）

### v1.1.0 (2025-03-10)
- ✨ 新增 TestRun.execution_id 字段，优化执行记录关联逻辑
- 🐛 修复今日执行统计甜甜圈图显示问题
- ⚡ 优化 Jenkins 回调用例统计逻辑，支持 pytest 真实结果解析
- 🎨 重构日期范围选择器，新增快捷选项和自定义双月历
- 📊 优化报告详情页展示和筛选功能
- 🔧 修复最近测试运行数据不更新问题
- 📈 统一测试统计数据口径，区分 T-1 和实时数据
- 🎯 优化仪表盘数据查询性能
- 🔄 支持测试运行记录按触发方式、状态和时间筛选

### v1.0.0 (2025-02-08)
- 🎉 初始版本发布
- 完整的测试用例管理功能
- Jenkins 集成和执行管理
- 仪表盘统计和报告展示
- Git 仓库集成和脚本同步
- 任务调度和定时执行

---

**最后更新时间**：2026-03-12
**文档版本**：v1.3.1