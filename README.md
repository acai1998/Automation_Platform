# AutoTest - 自动化测试平台

<p align="center">
  <img src="https://img.shields.io/badge/React-18.2-61DAFB?logo=react" alt="React" />
  <img src="https://img.shields.io/badge/TypeScript-5.3-3178C6?logo=typescript" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Vite-5.0-646CFF?logo=vite" alt="Vite" />
  <img src="https://img.shields.io/badge/Express-4.18-000000?logo=express" alt="Express" />
  <img src="https://img.shields.io/badge/MariaDB-10.x-003545?logo=mariadb" alt="MariaDB" />
  <img src="https://img.shields.io/badge/TailwindCSS-3.4-06B6D4?logo=tailwindcss" alt="TailwindCSS" />
</p>

一个现代化的全栈自动化测试管理平台，用于管理测试用例、调度 Jenkins 执行任务、监控执行结果。平台专注于测试管理和调度，实际测试执行由 Jenkins 等外部系统完成。
<img width="1672" height="1001" alt="image" src="https://github.com/user-attachments/assets/1353f77c-297e-44ba-a790-ac3a68b85254" />

## ✨ 功能特性

- 📊 **仪表盘概览** - 实时展示测试执行统计、成功率趋势、今日执行情况
- 📝 **测试用例管理** - 创建、编辑、组织测试用例，支持标签和优先级分类
- ⏰ **任务调度** - 支持手动触发、定时调度（Cron）和 CI 触发
- 🔗 **Jenkins 集成** - 触发 Jenkins Job 执行，接收执行结果回调
- 📈 **执行历史** - 完整的运行记录和详细的测试结果
- 🌙 **深色模式** - 支持浅色/深色主题切换

## 🛠️ 技术栈

### 前端
| 技术 | 说明 |
|------|------|
| React 18 | 现代化 UI 框架 |
| TypeScript | 类型安全 |
| Vite | 快速构建工具 |
| TailwindCSS | 原子化 CSS 框架 |
| shadcn/ui | 高质量 UI 组件库 |
| TanStack Query | 服务端状态管理 |
| wouter | 轻量级路由 |

### 后端
| 技术 | 说明 |
|------|------|
| Express | Node.js Web 框架 |
| MariaDB | 企业级关系数据库 (mysql2) |
| tsx | TypeScript 运行时 |

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
# 构建生产版本
npm run build

# 预览构建结果
npm run preview
```

### 详细部署指南

详见 [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md) 和 [deployment/](./deployment/) 文件夹中的完整文档。

## 📁 项目结构

```text
automation-platform/
├── src/                    # 前端源代码
│   ├── components/         # React 组件
│   │   ├── ui/            # shadcn/ui 基础组件
│   │   └── dashboard/     # 仪表盘组件
│   ├── pages/             # 页面组件
│   ├── contexts/          # React Context
│   ├── lib/               # 工具函数
│   └── api/               # API 客户端
├── server/                 # 后端源代码
│   ├── routes/            # API 路由
│   ├── services/          # 业务逻辑
│   └── db/                # 数据库相关
├── configs/                # 配置文件
├── docs/                   # 项目文档
├── tests/                  # 测试文件
├── scripts/                # 工具脚本
└── shared/                 # 共享类型定义
```

## 🔗 API 接口

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/health` | GET | 健康检查 |
| `/api/dashboard/stats` | GET | 仪表盘统计 |
| `/api/dashboard/today` | GET | 今日执行情况 |
| `/api/dashboard/trend` | GET | 趋势数据 |
| `/api/cases` | GET | 获取测试用例列表 |
| `/api/tasks` | GET | 获取任务列表 |
| `/api/executions` | GET | 获取运行记录 |
| `/api/executions/callback` | POST | Jenkins 执行结果回调 |
| `/api/jenkins/trigger` | POST | 触发 Jenkins 执行 |
| `/api/jenkins/tasks/:id/cases` | GET | 获取任务用例列表 |

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

### 触发执行

```bash
# 触发 Jenkins 执行任务
curl -X POST http://localhost:3000/api/jenkins/trigger \
  -H "Content-Type: application/json" \
  -d '{"taskId": 1, "triggeredBy": 1}'
```

### 执行结果回调

Jenkins Job 完成后调用此接口上报结果：

```bash
curl -X POST http://localhost:3000/api/executions/callback \
  -H "Content-Type: application/json" \
  -d '{
    "executionId": 1,
    "status": "success",
    "duration": 120,
    "results": [
      {"caseId": 1, "caseName": "登录测试", "status": "passed", "duration": 1000},
      {"caseId": 2, "caseName": "注册测试", "status": "failed", "duration": 2000, "errorMessage": "断言失败"}
    ]
  }'
```

## 💾 数据库

使用远程 MariaDB 数据库，主要表结构：

| 表名 | 说明 |
|------|------|
| `Auto_TestCase` | 测试用例资产表 |
| `Auto_Users` | 用户表 |
| `Auto_TestRun` | 测试执行批次表 |
| `Auto_TestRunResults` | 测试用例执行结果表 |
| `Auto_TestCaseTaskExecutions` | 测试任务运行记录表 |
| `Auto_TestCaseDailySummaries` | 测试用例每日统计汇总表 |

**注意**：数据库表结构由 DBA 统一管理，本地不进行表结构初始化。

## 📋 开发命令

| 命令 | 说明 |
|------|------|
| `npm run start` | 启动开发服务（前端+后端） |
| `npm run dev` | 仅启动前端 |
| `npm run server` | 仅启动后端 |
| `npm run build` | 构建生产版本 |

## 🔍 类型检查

```bash
# 前端类型检查
npx tsc --noEmit -p tsconfig.json

# 后端类型检查
npx tsc --noEmit -p tsconfig.server.json
```

## 📍 路径别名

项目配置了以下路径别名：

| 别名 | 路径 | 说明 |
|------|------|------|
| `@/*` | `./src/*` | 前端源码 |
| `@shared/*` | `./shared/*` | 共享类型 |
| `@configs/*` | `./configs/*` | 配置文件 |

```typescript
// 使用示例
import { Button } from '@/components/ui/button';
import type { TestCase } from '@shared/types';
```

## 🌐 浏览器支持

| 浏览器 | 最低版本 |
|--------|----------|
| Chrome | 90+ |
| Firefox | 90+ |
| Safari | 14+ |
| Edge | 90+ |

## 🤝 贡献指南

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/amazing-feature`)
3. 提交更改 (`git commit -m 'Add amazing feature'`)
4. 推送到分支 (`git push origin feature/amazing-feature`)
5. 创建 Pull Request

## 📄 许可证

MIT License

## 🔗 相关链接

- [React 文档](https://react.dev/)
- [Vite 文档](https://vitejs.dev/)
- [TailwindCSS 文档](https://tailwindcss.com/)
- [shadcn/ui 组件](https://ui.shadcn.com/)
- [Express 文档](https://expressjs.com/)
