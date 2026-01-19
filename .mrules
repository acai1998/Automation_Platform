# CLAUDE.md

本文件为 Claude Code（claude.ai/code）在处理本代码仓库中的代码时提供指导。

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

```

## 类型检查

```bash
# 前端（React/Vite）
npx tsc --noEmit -p tsconfig.json

# 后端（Express/Node）
npx tsc --noEmit -p tsconfig.server.json
```

## 架构说明

```bash
这是一个用于管理自动化测试用例、调度执行任务、展示测试报告的全栈自动化测试平台。
**注意**：实际测试执行由 Jenkins 等外部系统完成，平台专注于管理和调度。

### 前端（`src/`）
- 使用 React 18 与 TypeScript，基于 Vite 构建
- 样式：TailwindCSS + shadcn/ui 组件（位于 `src/components/ui/`）
- 路由：wouter（轻量级 React 路由器）
- 状态管理：TanStack Query（用于服务端状态）
- 路径别名：`@/*` 映射到 `src/*`

### 后端（`server/`）
- 通过 tsx 运行的 Express 服务器
- 使用 mysql2 的 MariaDB 数据库
- 数据库配置位于 `server/config/database.ts`，表结构自动初始化
- 路径别名：`@shared/*` 映射到 `shared/*`

### API 路由
- `/api/dashboard` - 仪表盘统计数据
- `/api/executions` - 测试执行记录
- `/api/cases` - 测试用例管理
- `/api/tasks` - 测试任务管理
- `/api/jenkins` - Jenkins 集成（触发执行、获取用例）
- `/api/health` - 健康检查端点

### Jenkins 集成
平台通过 API 与 Jenkins 集成：
- `POST /api/jenkins/trigger` — 创建执行记录，触发 Jenkins Job
- `GET /api/jenkins/tasks/:id/cases` — 获取任务关联的用例列表
- `POST /api/executions/callback` — Jenkins 执行完成后回调上报结果
- `POST /api/executions/:id/start` — 标记执行开始运行

## 数据库结构
远程 MariaDB 数据库中的关键表：
- `Auto_Users` — 用户表（远程表）
- `Auto_TestCase` — 测试用例资产表（远程表）
- `Auto_TestRun` — 测试执行批次表（远程表）
- `Auto_TestRunResults` — 测试用例执行结果表（远程表）
- `Auto_TestCaseTaskExecutions` — 测试任务执行记录表（远程表）
- `Auto_TestCaseDailySummaries` — 测试用例每日统计汇总表（远程表）

**注意**：数据库表结构由 DBA 统一管理，本地不进行表结构初始化。

## 路径别名配置

在 `tsconfig.json` 中配置如下：
- `@/*` → `./src/*`（前端）
- `@shared/*` → `./shared/*`（共享类型）
- `@configs/*` → `./configs/*`（配置文件）
```

## 项目目录结构

```text
├── src/           # 前端源代码（React）
├── server/        # 后端源代码（Express）
├── configs/       # 配置文件（tailwind, postcss）
├── tests/         # 测试文件
├── scripts/       # 工具脚本
├── docs/          # 项目相关文档
├── shared/        # 共享类型定义
├── public/        # 静态资源
├── .aiconfig/     # AI 重构配置和历史
├── archive/       # 归档文件（不要使用）
└── tmp/           # 临时文件（已忽略）
```

## **请严格遵守以下规则，当生成代码时：**

- **尽可能减少自行实现的底层与通用逻辑，优先、直接、完整地复用既有成熟仓库与库代码，仅在必要时编写最小业务层与调度代码**
- **必须用 TypeScript**，禁止 `any` 类型（用 `unknown` 或具体类型替代）
- **路径别名必须使用**：  
  `@/*` → `src/*`（前端）  
  `@shared/*` → `shared/*`（共享类型）
-  **React 组件**：必须用函数组件 + hooks，文件名与组件名一致（如 `Button.tsx`）
- **所有说明文件**必须放在对应目录,如 `docs/`文件下
- **不要生成过多的说明文件，会显得文件结构太杂乱**


## 项目结构
- **前端代码**：仅在 `src/` 目录下修改（Vite + React 18 + Tailwind）
- **后端代码**：仅在 `server/` 目录下修改（Express + TypeScript）
- **禁止**在 `src/` 写后端逻辑，或在 `server/` 写前端组件

## 关键功能实现
- **Jenkins 集成**：
  通过 `executionService.createExecution()` 创建执行记录，Jenkins 完成后调用回调接口
- **数据库操作**：
  通过 `server/config/database.ts` 中的 `mysql2` 连接池操作，**禁止**在代码中硬编码 SQL
- **API 路由**：
  严格按 `API Routes` 部分定义（如 `/api/cases` 用于测试用例管理）
- **图表开发**：
  使用 **Recharts** 库（`recharts`）绑定真实数据，禁止使用静态图片或手写 SVG 模拟图表

## 数据展示规范
- **T-1 数据口径**：统计类数据（如趋势图）不展示当天数据，最新可展示日期 = 当前日期 - 1 天
- **图表交互**：图表必须支持 Hover Tooltip 展示详细数据

## 重要提示
- **不要修改** `tsconfig.json` 中的路径别名（已配置好）
- ️**不要添加** `node_modules` 或 `dist/` 文件到版本控制
- ️**所有新文件**必须放在对应目录（如新组件放 `src/components/`）

---

## 执行与 Jenkins 集成规范

### 执行流程
执行流程采用**异步非阻塞设计**：
```
前端立即返回 → 显示加载状态
后台 Jenkins 执行 → 前端轮询进度（3秒间隔）
执行完成 → 回调更新 → 前端自动刷新
```

### 关键 API 端点
- `POST /api/jenkins/run-batch` — 批量执行用例
- `POST /api/jenkins/run-case` — 单个执行用例
- `POST /api/executions/callback` — Jenkins 回调更新结果
- `GET /api/jenkins/health` — 验证 Jenkins 连接
- `GET /api/jenkins/diagnose?runId=XX` — 诊断执行问题

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
- `triggerTestExecution()` — 创建执行批次
- `getBatchExecution()` — 查询执行详情
- `completeBatchExecution()` — 完成执行并更新统计
- `updateBatchJenkinsInfo()` — 更新 Jenkins 构建信息

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

## 数据库操作规范

### 核心业务表
| 表名 | 说明 | 用途 |
|-----|------|------|
| `Auto_TestCase` | 测试用例资产表 | 存储用例定义和脚本路径 |
| `Auto_TestRun` | 测试执行批次表 | 记录执行批次的整体信息和统计 |
| `Auto_TestRunResults` | 测试用例执行结果表 | 存储单个用例的执行结果 |
| `Auto_TestCaseTaskExecutions` | 测试任务执行记录表 | 记录任务维度的执行历史 |
| `Auto_TestCaseDailySummaries` | 每日统计汇总表 | 统计类数据聚合 |
| `Auto_Users` | 用户表 | 存储用户信息和权限 |

### 禁止硬编码 SQL
**所有数据库操作必须通过 `server/config/database.ts` 中的连接池进行，禁止在代码中硬编码 SQL**

### 表关联关系
- `Auto_TestCase` ← `Auto_TestRunResults.case_id`（一对多）
- `Auto_TestRun` ← `Auto_TestRunResults.run_id`（一对多）
- `Auto_Users` ← 多个表的 `trigger_by/created_by/updated_by` 字段（外键）

### T-1 数据口径规则
对于**统计类数据**（如趋势图）：
- **不展示当天数据**
- 最新可展示日期 = 当前日期 - 1 天
- 确保数据完整性和准确性

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
```

### 类型检查
```bash
# 检查前端类型
npx tsc --noEmit -p tsconfig.json

# 检查后端类型
npx tsc --noEmit -p tsconfig.server.json
```