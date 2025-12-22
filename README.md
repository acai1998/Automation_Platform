# AutoTest - 自动化测试平台

<p align="center">
  <img src="https://img.shields.io/badge/React-18.2-61DAFB?logo=react" alt="React" />
  <img src="https://img.shields.io/badge/TypeScript-5.3-3178C6?logo=typescript" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Vite-5.0-646CFF?logo=vite" alt="Vite" />
  <img src="https://img.shields.io/badge/Express-4.18-000000?logo=express" alt="Express" />
  <img src="https://img.shields.io/badge/SQLite-3-003B57?logo=sqlite" alt="SQLite" />
  <img src="https://img.shields.io/badge/TailwindCSS-3.4-06B6D4?logo=tailwindcss" alt="TailwindCSS" />
</p>

一个现代化的全栈自动化测试管理平台，用于管理、执行和监控自动化测试用例。支持多种测试执行方式，提供直观的仪表盘和详细的测试报告。

## ✨ 功能特性

- 📊 **仪表盘概览** - 实时展示测试执行统计、成功率趋势、今日执行情况
- 📝 **测试用例管理** - 创建、编辑、组织测试用例，支持标签和优先级分类
- ⏰ **任务调度** - 支持手动执行、定时调度（Cron）和 CI 触发
- 🔌 **多执行器支持** - 内置 HTTP/API、Postman (Newman)、Pytest 执行器
- 📈 **执行历史** - 完整的执行记录和详细的测试结果
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
| SQLite | 轻量级数据库 (better-sqlite3) |
| tsx | TypeScript 运行时 |

## 🚀 快速开始

### 环境要求

- Node.js >= 18
- npm >= 9

### 安装

```bash
# 克隆仓库
git clone <repository-url>
cd automation-platform

# 安装依赖
npm install

# 初始化数据库
npm run db:init
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
│   ├── runners/           # 测试执行器
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
| `/api/executions` | GET | 获取执行记录 |

## 🔧 测试执行器

平台通过工厂模式支持多种测试执行方式：

| 执行器 | 类型标识 | 说明 |
|--------|----------|------|
| HttpRunner | `api` | 直接 HTTP/API 测试 |
| NewmanRunner | `postman` | Postman 集合执行 |
| PytestRunner | `pytest` | Python pytest 执行 |

```typescript
// 使用示例
import { RunnerFactory } from './server/runners';

const result = await RunnerFactory.execute({
  id: 1,
  name: 'API Test',
  type: 'api',
  config: {
    method: 'GET',
    url: 'https://api.example.com/users',
    assertions: [
      { type: 'status', operator: 'eq', expected: 200 }
    ]
  }
});
```

## 💾 数据库

使用 SQLite 作为数据存储，主要表结构：

| 表名 | 说明 |
|------|------|
| `users` | 用户信息 |
| `projects` | 项目管理 |
| `test_cases` | 测试用例 |
| `tasks` | 测试任务 |
| `task_executions` | 执行记录 |
| `case_results` | 用例结果 |
| `daily_summaries` | 每日统计 |

```bash
# 重置数据库（清空并重新初始化）
npm run db:reset
```

## 📋 开发命令

| 命令 | 说明 |
|------|------|
| `npm run start` | 启动开发服务（前端+后端） |
| `npm run dev` | 仅启动前端 |
| `npm run server` | 仅启动后端 |
| `npm run build` | 构建生产版本 |
| `npm run db:init` | 初始化数据库 |
| `npm run db:reset` | 重置数据库 |

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
