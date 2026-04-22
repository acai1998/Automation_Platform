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

# 构建后端 TypeScript
npm run server:build
```

## 本地调试环境

| 服务 | 地址 | 说明 |
|------|------|------|
| 前端页面 | http://localhost:5173 | Vite 开发服务器 |
| 后端 API | http://localhost:3000 | Express API 服务 |

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

# 运行前端测试
npm run test:frontend

# 运行后端测试
npm run test:backend

# 运行测试并监听文件变化
npm run test:watch

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

## 架构概述

这是一个用于管理自动化测试用例、调度执行任务、展示测试报告的全栈自动化测试平台。
**注意**：实际测试执行由 Jenkins 等外部系统完成，平台专注于管理和调度。

- **前端**（`src/`）：React 18 + TypeScript + Vite，TailwindCSS + shadcn/ui，wouter 路由，TanStack Query 状态管理
- **后端**（`server/`）：Express + TypeScript（ts-node），TypeORM + mysql2（MariaDB），Socket.IO 实时推送，croner 定时调度
- **共享类型**（`shared/`）：前后端公用的 TypeScript 类型定义

## 路径别名配置

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
│   │   └── ui/              # UI 基础组件（shadcn/ui）
│   ├── contexts/            # React Context
│   ├── hooks/               # 自定义 Hooks
│   ├── lib/                 # 工具库（含 aiCaseMindMap.ts）
│   ├── pages/               # 页面组件
│   └── types/               # TypeScript 类型
├── server/                   # 后端源代码（Express）
│   ├── config/              # 配置文件（database.ts 等）
│   ├── entities/            # TypeORM 实体
│   ├── middleware/          # Express 中间件
│   ├── repositories/        # 数据仓库层
│   ├── routes/              # API 路由
│   └── services/            # 业务服务层
├── test_case/                # 测试文件目录
│   ├── frontend/            # 前端测试（components/ hooks/）
│   ├── backend/             # 后端测试（config/ services/）
│   └── scripts/             # Shell 脚本测试
├── shared/types/             # 前后端共享类型定义
├── configs/                  # 配置文件
├── docs/                     # 项目文档（详见末尾索引）
├── scripts/                  # 项目脚本（含数据库迁移）
└── deployment/               # 部署相关文件
```

## 测试规范

### 前端测试
- **框架**：Vitest + React Testing Library + jsdom
- **位置**：`test_case/frontend/`（组件测试：`components/`，Hook 测试：`hooks/`）
- **命名**：测试文件以 `.test.tsx` 结尾，使用 `describe()` 和 `it()` 组织
- **模拟**：UI 组件使用 `vi.mock()` 进行模拟

### 后端测试
- **位置**：`test_case/backend/`（`config/`、`services/`）
- **框架**：Vitest

---

## 代码规范

- **优先复用成熟开源库，禁止重复造轮子**（遇到通用问题先查速查表，再引入新库，最后才自行实现）
- **必须用 TypeScript**，禁止 `any` 类型（用 `unknown` 或具体类型替代）
- **路径别名必须使用**：`@/*`（前端）、`@shared/*`（共享类型）
- **React 组件**：函数组件 + hooks，文件名与组件名一致
- **测试文件**：新组件必须包含对应测试文件，放在 `test_case/frontend/components/`
- **说明文档**：放在 `docs/` 目录，**禁止**放置在项目根目录，**不要生成过多的说明文件**

## 项目结构约束

- **前端代码**：仅在 `src/` 目录下修改（Vite + React 18 + Tailwind）
- **后端代码**：仅在 `server/` 目录下修改（Express + TypeScript）
- **禁止**在 `src/` 写后端逻辑，或在 `server/` 写前端组件

## 关键功能实现规范

- **Jenkins 集成**：通过 `executionService.createExecution()` 创建执行记录；Jenkins 完成后调用回调接口更新结果；使用异步非阻塞设计，前端轮询获取进度
- **数据库操作**：通过 `server/config/database.ts` 中的连接池操作；**禁止**硬编码 SQL；使用 TypeORM 或参数化查询
- **API 路由**：严格遵循 RESTful 规范（详细路由列表见 `docs/API_DOCUMENTATION.md`）
- **图表开发**：使用 Recharts 库绑定真实数据，禁止用 SVG 手写或静态图片模拟

## 数据展示规范

- **T-1 数据口径**：统计类数据（趋势图等）不展示当天数据，最新可展示日期 = 当前日期 - 1 天
- **实时数据口径**：今日执行统计等实时数据直接查询当天数据，不受 T-1 限制
- **图表交互**：图表必须支持 Hover Tooltip 展示详细数据
- **实时更新**：执行状态等实时数据使用轮询机制（默认 3 秒间隔）

## 开源库速查表

### 前端（`src/`）

| 场景 | 使用库 | 说明 |
|------|--------|------|
| 日期格式化 / 计算 | `date-fns` | `format`, `addDays`, `differenceInDays` 等，**禁止**手写日期运算 |
| 日期选择器 | `react-day-picker` | 已集成，直接复用 |
| 图表 | `recharts` | 折线/柱状/饼图/甜甜圈，**禁止**用 SVG 手写 |
| 虚拟滚动 | `@tanstack/react-virtual` | 列表超 100 条时必须使用 |
| 脑图可视化 | `mind-elixir` | AI 用例脑图编辑器，已有封装，**勿重复实现**脑图逻辑 |
| 服务端状态 | `@tanstack/react-query` | 所有 API 请求走 TanStack Query，禁止裸 fetch + useState |
| UI 组件 | `shadcn/ui` + `radix-ui` | Button/Dialog/Select 等基础组件直接用，路径 `src/components/ui/` |
| 通知 Toast | `sonner` | `toast.success / toast.error`，禁止自写 Toast |
| 路由 | `wouter` | `useRoute`, `useLocation`, `<Link>`, `<Route>` |
| 样式工具 | `clsx` / `tailwind-merge` / `cn()` | 合并 className，路径 `src/lib/utils.ts` |
| 图标 | `lucide-react` | 已内置 600+ 图标，**禁止**手写 SVG 图标 |

### 后端（`server/`）

| 场景 | 使用库 | 说明 |
|------|--------|------|
| ORM / 数据库 | `TypeORM` + `mysql2` | 实体定义在 `server/entities/`，禁止裸 SQL 字符串拼接 |
| HTTP 路由 | `express` | 路由文件在 `server/routes/` |
| 定时任务 | `croner` | 已有 `TaskSchedulerService` 封装，**勿重复实现** Cron 逻辑 |
| Git 操作 | `simple-git` | 仓库克隆、diff、log 等，**禁止**用 `child_process.exec('git ...')` |
| 邮件发送 | `nodemailer` | 已有 `EmailService` 封装 |
| WebSocket | `socket.io` | 已有实时推送基础设施，新增实时功能接入现有 Socket 服务 |
| 密码加密 | `bcryptjs` | `bcrypt.hash / bcrypt.compare`，禁止明文存储 |
| JWT | `jsonwebtoken` | 已在 `AuthService` 封装，复用现有方法 |
| 环境变量 | `dotenv` | 统一从 `.env` 读取 |

---

## 📚 按需参考文档（AI：按场景主动读取）

| 场景 | 文档 |
|------|------|
| 新增/修改 API 端点，核对路由定义和请求/响应格式 | `docs/API_DOCUMENTATION.md` |
| 操作数据库表、添加新表、查看表结构变更历史 | `docs/database-design.md` |
| Jenkins 集成、回调格式、认证方式、Git 仓库同步 | `docs/integrations.md` |
| Jenkins 详细配置指南 | `docs/Jenkins/` |
| AI 脑图相关功能开发（节点结构、迁移逻辑） | `docs/ai-casemap.md` |
| 定时任务、调度引擎、重试策略相关开发 | `docs/task-scheduler.md` |
| 排查 Jenkins 连接失败、执行卡住、数据不准等问题 | `docs/TROUBLESHOOTING.md` |
| 查看历史版本变更、了解某功能何时引入 | `docs/CHANGELOG.md` |
| 系统架构图（Mermaid）、部署架构 | `docs/ARCHITECTURE.md` |
| 数据库表字段详细定义（DDL 级别） | `docs/Table/` |

---

**最后更新时间**：2026-04-19
**文档版本**：v1.5.2
