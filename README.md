# AutoTest - 自动化测试平台

<p align="center">
  <img src="https://img.shields.io/badge/React-18.2-61DAFB?logo=react" alt="React" />
  <img src="https://img.shields.io/badge/TypeScript-5.3-3178C6?logo=typescript" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Vite-5.0-646CFF?logo=vite" alt="Vite" />
  <img src="https://img.shields.io/badge/Express-4.18-000000?logo=express" alt="Express" />
  <img src="https://img.shields.io/badge/MariaDB-10.x-003545?logo=mariadb" alt="MariaDB" />
  <img src="https://img.shields.io/badge/TailwindCSS-3.4-06B6D4?logo=tailwindcss" alt="TailwindCSS" />
  <img src="https://img.shields.io/badge/PM2-5.x-2B037A?logo=pm2" alt="PM2" />
  <img src="https://img.shields.io/badge/Socket.IO-4.x-010101?logo=socket.io" alt="Socket.IO" />
</p>

一个现代化的全栈自动化测试管理平台，用于管理测试用例、调度 Jenkins 执行任务、监控执行结果。平台专注于测试管理和调度，实际测试执行由 Jenkins 等外部系统完成。

<img width="1672" height="1001" alt="image" src="https://github.com/user-attachments/assets/1353f77c-297e-44ba-a790-ac3a68b85254" />

## ✨ 功能特性

- 📊 **仪表盘概览** - 实时展示测试执行统计、成功率趋势、今日执行情况（支持 T-1 口径与实时双数据视图）
- 📝 **测试用例管理** - 创建、编辑、组织测试用例，支持标签、优先级、模块分类
- ⏰ **任务调度** - 支持手动触发、定时调度（自研 5 段式 Cron）、CI 触发，含 FIFO 等待队列与并发控制
- 🔗 **Jenkins 集成** - 触发 Jenkins Job 执行，接收执行结果回调，支持多种回调认证方式
- 📈 **执行历史** - 完整的运行记录、详细的测试结果，支持按状态/触发方式/时间筛选
- 🗂️ **Git 仓库管理** - 集成 Git 仓库，自动同步测试脚本，维护脚本与用例的映射关系
- 🔐 **用户认证** - JWT 认证体系，支持注册、登录、密码重置
- 📧 **邮件通知** - 测试执行结果邮件推送
- 🔍 **审计日志** - 任务全生命周期 10 种操作行为追踪
- 🔄 **实时推送** - 基于 Socket.IO 的 WebSocket 实时状态更新
- 🌙 **深色模式** - 支持浅色/深色主题切换

## 🛠️ 技术栈

### 前端
| 技术 | 说明 |
|------|------|
| React 18 | 现代化 UI 框架 |
| TypeScript | 类型安全 |
| Vite 5 | 快速构建工具 |
| TailwindCSS | 原子化 CSS 框架 |
| shadcn/ui + Radix UI | 高质量 UI 组件库 |
| TanStack Query | 服务端状态管理与缓存 |
| wouter | 轻量级路由 |
| Recharts | 折线图、柱状图、饼图、甜甜圈图 |
| sonner | Toast 通知系统 |
| @tanstack/react-virtual | 大数据列表虚拟滚动 |
| date-fns + react-day-picker | 日期处理与选择器 |

### 后端
| 技术 | 说明 |
|------|------|
| Express 4 | Node.js Web 框架 |
| TypeScript (tsx) | TypeScript 运行时 |
| MariaDB + mysql2 | 企业级关系数据库 |
| TypeORM | ORM 与实体管理 |
| Socket.IO | WebSocket 实时通信 |
| node-cron | 定时任务调度 |
| simple-git | Git 仓库集成 |
| nodemailer | 邮件发送服务 |
| express-rate-limit | API 限流 |
| jsonwebtoken + bcrypt | 认证与加密 |

### 部署
| 技术 | 说明 |
|------|------|
| PM2 | Node.js 进程管理（生产环境） |
| Docker + Nginx | 容器化部署（可选） |
| tsconfig-paths | TypeScript 路径别名解析 |

## 🚀 快速开始

### 环境要求

- Node.js >= 18
- npm >= 9

### 快速部署（推荐）

```bash
# 自动部署脚本（macOS/Linux）
bash deployment/scripts/setup.sh

# 启动应用
npm run start
```

**所需时间**: 5-15 分钟

### 手动安装

```bash
# 克隆仓库
git clone <repository-url>
cd automation-platform

# 安装依赖
npm install

# 复制环境变量模板并填写配置
cp .env.example .env
```

### 开发

```bash
# 同时启动前端和后端（推荐）
npm run start

# 或分别启动
npm run dev      # 前端 (http://localhost:5173)
npm run server   # 后端 (http://localhost:3000)
```

### 构建

```bash
# 构建生产版本（前端）
npm run build

# 构建后端 TypeScript
npm run server:build

# 预览构建结果
npm run preview
```

### 生产环境部署（PM2）

```bash
# 完整部署流程（构建 + 启动 PM2）
npm run prod:deploy

# 单独操作
npm run prod:start    # 启动
npm run prod:stop     # 停止
npm run prod:restart  # 重启
npm run prod:reload   # 零停机重载配置
npm run prod:logs     # 查看日志
npm run prod:status   # 查看进程状态
```

> 详见 [deployment/](./deployment/) 文件夹中的完整部署文档。

## 📁 项目结构

```text
automation-platform/
├── src/                      # 前端源代码（React + Vite）
│   ├── api/                  # API 客户端
│   ├── components/           # React 组件
│   │   ├── auth/            # 认证相关组件
│   │   ├── cases/           # 用例管理组件
│   │   ├── dashboard/       # 仪表盘组件
│   │   ├── tasks/           # 任务管理组件
│   │   └── ui/              # shadcn/ui 基础组件
│   ├── contexts/            # React Context（主题、认证等）
│   ├── hooks/               # 自定义 Hooks
│   ├── pages/               # 页面组件
│   │   ├── cases/          # 用例页面
│   │   ├── reports/        # 报告页面
│   │   └── tasks/          # 任务页面
│   ├── types/               # TypeScript 类型定义
│   └── utils/               # 工具函数
├── server/                   # 后端源代码（Express + TypeScript）
│   ├── config/              # 配置文件（数据库、日志等）
│   ├── entities/            # TypeORM 实体定义
│   ├── middleware/          # Express 中间件（认证、限流、日志）
│   ├── repositories/        # 数据仓库层（数据访问逻辑）
│   ├── routes/              # API 路由
│   ├── services/            # 业务服务层
│   └── utils/               # 工具函数
├── shared/                   # 前后端共享类型定义
│   └── types/
├── test_case/                # 测试文件目录
│   ├── frontend/            # 前端测试（Vitest + RTL）
│   ├── backend/             # 后端测试（Vitest）
│   └── scripts/             # Shell 脚本测试
├── configs/                  # 配置文件
├── docs/                     # 项目文档
│   ├── Jenkins/             # Jenkins 集成文档
│   └── Table/               # 数据库表结构文档
├── deployment/               # 部署相关文件
│   ├── configs/             # 部署配置（Nginx 等）
│   ├── scripts/             # 部署脚本（setup.sh、health-check.sh 等）
│   ├── Dockerfile           # Docker 镜像构建文件
│   └── nginx.conf           # Nginx 配置
├── scripts/                  # 项目工具脚本（数据库迁移等）
├── public/                   # 静态资源
├── ecosystem.config.js       # PM2 生态配置文件
└── shared/                   # 共享类型定义
```

## 🔗 API 接口

### 核心接口

| 模块 | 端点 | 方法 | 说明 |
|------|------|------|------|
| 健康检查 | `/api/health` | GET | 服务健康检查 |
| **仪表盘** | `/api/dashboard/stats` | GET | 统计数据（支持日期范围） |
| | `/api/dashboard/today-execution` | GET | 今日执行统计（实时） |
| | `/api/dashboard/trend` | GET | 趋势数据（T-1 口径） |
| | `/api/dashboard/recent-runs` | GET | 最近运行记录 |
| **测试用例** | `/api/cases` | GET/POST | 用例列表/创建 |
| | `/api/cases/:id` | GET/PUT/DELETE | 用例详情/更新/删除 |
| | `/api/cases/:id/run` | POST | 执行单个用例 |
| **任务管理** | `/api/tasks` | GET/POST | 任务列表/创建 |
| | `/api/tasks/:id` | PUT/DELETE | 更新/删除任务 |
| | `/api/tasks/:id/status` | PATCH | 切换任务状态 |
| | `/api/tasks/:id/execute` | POST | 立即执行任务 |
| | `/api/tasks/:id/stats` | GET | 任务维度统计 |
| | `/api/tasks/:id/audit` | GET | 任务审计日志 |
| **执行管理** | `/api/executions` | GET | 执行记录列表 |
| | `/api/executions/:id` | GET | 执行详情 |
| | `/api/executions/callback` | POST | Jenkins 回调入口 |
| | `/api/executions/:id/cancel` | POST | 取消执行 |
| | `/api/executions/stuck` | GET | 查询卡住的执行 |
| | `/api/executions/sync-stuck` | POST | 修复卡住的执行 |
| **Jenkins** | `/api/jenkins/trigger` | POST | 触发 Jenkins 执行 |
| | `/api/jenkins/run-case` | POST | 执行单个用例 |
| | `/api/jenkins/run-batch` | POST | 批量执行用例 |
| | `/api/jenkins/health` | GET | Jenkins 连接检查 |
| | `/api/jenkins/diagnose` | GET | 诊断执行问题 |
| **Git 仓库** | `/api/repositories` | GET/POST | 仓库配置列表/创建 |
| | `/api/repositories/:id/sync` | POST | 同步仓库脚本 |
| | `/api/repositories/:id/branches` | GET | 获取分支列表 |
| **用户认证** | `/api/auth/login` | POST | 用户登录 |
| | `/api/auth/register` | POST | 用户注册 |
| | `/api/auth/me` | GET | 获取当前用户信息 |
| | `/api/auth/refresh` | POST | 刷新 Token |

## 🔗 Jenkins 集成

平台通过 API 与 Jenkins 集成，实现测试执行的调度和结果收集：

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   前端 Dashboard │────▶│  后端 API       │────▶│  Jenkins        │
│  (用例管理/报表) │     │  (调度/记录)    │     │  (实际执行)     │
└─────────────────┘     └────────┬────────┘     └────────┬────────┘
                                 │                       │
                                 │◀──────回调结果────────┘
                                 ▼
                        ┌─────────────────┐
                        │  MariaDB 数据库  │
                        └─────────────────┘
```

### 回调认证方式

Jenkins 回调支持三种认证方式（任选其一）：

1. **API Key**：`X-Api-Key: <jenkins_api_key>`
2. **JWT Token**：`Authorization: Bearer <jwt_token>`
3. **签名认证**：`X-Jenkins-Signature: <hmac>` + `X-Jenkins-Timestamp: <ts>`

### 触发执行示例

```bash
curl -X POST http://localhost:3000/api/jenkins/run-batch \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{"taskId": 1, "caseIds": [1, 2, 3], "triggeredBy": 1}'
```

### 回调数据格式

Jenkins Job 完成后调用此接口上报结果：

```json
{
  "runId": 123,
  "status": "success",
  "passedCases": 5,
  "failedCases": 0,
  "skippedCases": 0,
  "durationMs": 120000,
  "results": [
    {
      "caseId": 1,
      "caseName": "test_login",
      "status": "passed",
      "duration": 1000
    }
  ]
}
```

## 💾 数据库

使用远程 MariaDB 数据库（由 DBA 统一管理，本地不进行表结构初始化）：

| 表名 | 说明 |
|------|------|
| `Auto_Users` | 用户表 |
| `Auto_TestCaseProjects` | 测试用例项目表 |
| `Auto_TestCase` | 测试用例资产表 |
| `Auto_TestCaseTasks` | 测试任务表（含 `max_retries`/`retry_delay_ms`） |
| `Auto_TestEnvironments` | 测试环境配置表 |
| `Auto_TestRun` | 测试执行批次表（含 `execution_id` 关联字段） |
| `Auto_TestRunResults` | 测试用例执行结果表 |
| `Auto_TestCaseTaskExecutions` | 测试任务执行记录表 |
| `Auto_TestCaseDailySummaries` | 每日统计汇总表 |
| `Auto_TaskAuditLogs` | 任务审计日志表（v1.3.0 新增） |
| `Auto_RepositoryConfigs` | Git 仓库配置表 |
| `Auto_RepositoryScriptMappings` | 仓库脚本与用例映射表 |
| `Auto_SyncLogs` | 仓库同步日志表 |

> 数据库迁移脚本位于 `scripts/migrate-v1.3.0.sql`，通过 `node scripts/run-migration.js` 执行。

## 📋 开发命令

| 命令 | 说明 |
|------|------|
| `npm run start` | 同时启动前端+后端（开发） |
| `npm run dev` | 仅启动前端 (5173) |
| `npm run server` | 仅启动后端 (3000) |
| `npm run build` | 构建前端生产版本 |
| `npm run server:build` | 构建后端 TypeScript |
| `npm run test` | 运行全部测试 |
| `npm run test:frontend` | 仅运行前端测试 |
| `npm run test:backend` | 仅运行后端测试 |
| `npm run test:coverage` | 测试覆盖率报告 |
| `npm run prod:deploy` | 完整生产部署 |
| `npm run prod:status` | 查看 PM2 进程状态 |
| `npm run prod:logs` | 查看生产日志 |

## 🔍 类型检查

```bash
# 前端类型检查
npx tsc --noEmit -p tsconfig.json

# 后端类型检查
npx tsc --noEmit -p tsconfig.server.json
```

## 📍 路径别名

| 别名 | 路径 | 说明 |
|------|------|------|
| `@/*` | `./src/*` | 前端源码 |
| `@shared/*` | `./shared/*` | 共享类型 |
| `@configs/*` | `./configs/*` | 配置文件 |

## 🔧 故障排查

```bash
# Jenkins 连接检查
curl http://localhost:3000/api/jenkins/health

# 诊断执行问题
curl "http://localhost:3000/api/jenkins/diagnose?runId=123"

# 查询卡住的执行记录
curl http://localhost:3000/api/executions/stuck

# 手动修复卡住的执行
curl -X POST http://localhost:3000/api/jenkins/callback/manual-sync/123 \
  -H "X-Api-Key: <api_key>"
```

## 🌐 浏览器支持

| 浏览器 | 最低版本 |
|--------|----------|
| Chrome | 90+ |
| Firefox | 90+ |
| Safari | 14+ |
| Edge | 90+ |

## 📚 相关文档

- [Jenkins 集成指南](docs/Jenkins/JENKINS_INTEGRATION.md)
- [Jenkins 故障排查](docs/Jenkins/JENKINS_TROUBLESHOOTING.md)
- [数据库表结构](docs/Table/)
- [部署指南](deployment/README.md)
- [Docker 快速开始](deployment/快速开始.md)
- [文档索引](docs/README.md)

## 🤝 贡献指南

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/amazing-feature`)
3. 提交更改 (`git commit -m 'Add amazing feature'`)
4. 推送到分支 (`git push origin feature/amazing-feature`)
5. 创建 Pull Request

## 📄 许可证

MIT License

---

## 更新日志

### v1.3.2 (2026-03-14)
- 🔬 高并发执行问题专项调研：识别调度器槽位生命周期缺陷、回调限流误伤、DB 连接池瓶颈、前端瞬时压力等五大根因
- 📋 输出分层优化方案（P0/P1/P2），指导后续并发稳定性改进

### v1.3.1 (2026-03-12)
- ✨ 任务管理页面新增**关联用例**功能：新建/编辑任务时可通过选择器多选测试用例，支持关键字搜索（300ms防抖）和 API/UI/性能类型过滤
- 🎨 任务卡片新增关联用例数量显示（`ListChecks` 图标 + 数量，未关联时显示橙色提示）
- 🧹 移除任务卡片中无实际填写项的「未分类」和「测试环境」标签
- 🔧 前端 `useAllCasesForSelect` Hook：无需强制指定类型、支持 `enabled` 开关、30秒 stale 缓存
- 🔗 `caseIds` 正确传递至后端，执行时 `TaskSchedulerService` 从 `case_ids` 字段读取并触发 Jenkins 任务
- ⚠️ 若任务未关联任何用例，运行时调度引擎会记录 warn 日志并跳过执行

### v1.3.0 (2026-03-12)
- 🚀 新增 `TaskSchedulerService` 定时调度引擎：自研5段式 Cron 解析、服务重启任务恢复、24h 漏触发补偿、每分钟 DB 轮询同步
- 🔒 新增任务执行控制：FIFO 等待队列、并发上限（默认3可配置）、指数退避重试策略、支持取消运行中执行
- 📊 新增任务维度统计：`GET /api/tasks/:id/stats`（成功率趋势、Top 10 失败原因聚合）
- 🔍 新增权限与审计：`Auto_TaskAuditLogs` + `GET /api/tasks/:id/audit`（10种操作行为追踪）
- 🗄️ 数据库迁移 `scripts/migrate-v1.3.0.sql`：新建审计表、重试配置字段、多组性能索引
- 🎨 任务 UI 增强：集成统计图表（成功率折线图、失败原因柱状图）、审计日志时间线、调度器状态监控面板

### v1.2.0 (2026-03-12)
- ✨ 任务管理页面新增新建/编辑/删除完整交互流程（含表单校验）
- 🔍 任务列表支持 keyword/status/triggerType 筛选与分页
- ⚡ 优化 `/api/tasks` 列表接口，内联 recentExecutions，消除前端 N+1 查询
- 🛡️ 完善任务 CRUD 参数校验（triggerType、cronExpression、caseIds）
- 🔄 新增 `PATCH /api/tasks/:id/status` 接口，支持 active/paused/archived 状态切换
- 🔗 任务卡片支持"查看报告"联动跳转（优先跳转最近运行详情）

### v1.1.0 (2025-03-10)
- ✨ 新增 TestRun.execution_id 字段，优化执行记录关联逻辑
- 🐛 修复今日执行统计甜甜圈图显示问题
- ⚡ 优化 Jenkins 回调用例统计逻辑，支持 pytest 真实结果解析
- 🎨 重构日期范围选择器，新增快捷选项和自定义双月历
- 📊 优化报告详情页展示和筛选功能
- 🔧 修复最近测试运行数据不更新问题
- 📈 统一测试统计数据口径，区分 T-1 和实时数据

### v1.0.0 (2025-02-08)
- 🎉 初始版本发布
- 完整的测试用例管理功能
- Jenkins 集成和执行管理
- 仪表盘统计和报告展示
- Git 仓库集成和脚本同步
- 任务调度和定时执行

---

**最后更新时间**：2026-03-14  
**文档版本**：v1.3.2
