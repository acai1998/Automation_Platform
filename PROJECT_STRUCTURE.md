# 📁 项目结构说明

## 项目组织规范

本项目采用**模块化和分层的目录结构**，保持项目根目录的整洁性，所有部署相关文件集中管理。

---

## 📂 完整的项目结构

```
automation-platform/
│
├── 📄 核心配置文件（项目根目录）
│   ├── package.json                # npm 项目配置
│   ├── package-lock.json           # 依赖锁定文件
│   ├── tsconfig.json               # TypeScript 配置（前端）
│   ├── tsconfig.server.json        # TypeScript 配置（后端）
│   ├── tsconfig.node.json          # TypeScript 配置（工具）
│   ├── vite.config.ts              # Vite 构建配置
│   ├── index.html                  # HTML 入口文件
│   ├── README.md                   # 项目说明
│   ├── CLAUDE.md                   # 开发规范
│   └── DEPLOYMENT_GUIDE.md         # 部署指南（入口）
│
├── 📦 部署文件夹（所有部署相关文件）
│   ├── deployment/
│   │   ├── README.md               # 部署文件夹说明
│   │   ├── QUICK_START.md          # 快速开始（3分钟）
│   │   ├── INSTALLATION.md         # 完整安装指南
│   │   ├── DEPLOYMENT.md           # 生产部署指南
│   │   ├── DEPLOYMENT_SUMMARY.md   # 部署文件总结
│   │   ├── DEPLOYMENT_CHECKLIST.md # 部署检查清单
│   │   │
│   │   ├── 🐳 Docker 配置
│   │   ├── Dockerfile              # Docker 镜像定义
│   │   ├── docker-compose.yml      # Docker Compose 编排
│   │   │
│   │   ├── ⚙️ 服务器配置
│   │   ├── nginx.conf              # Nginx 反向代理
│   │   ├── .env.example            # 环境变量示例
│   │   │
│   │   └── 🔧 部署脚本
│   │       └── scripts/
│   │           ├── setup.sh        # macOS/Linux 自动部署
│   │           ├── setup.bat       # Windows 自动部署
│   │           └── check-env.sh    # 环境检查脚本
│   │
│   ├── 🎨 前端源代码
│   ├── src/
│   │   ├── main.tsx                # 应用入口
│   │   ├── App.tsx                 # 主应用组件
│   │   ├── index.css               # 全局样式
│   │   │
│   │   ├── components/             # React 组件
│   │   │   ├── Layout.tsx          # 布局组件
│   │   │   ├── Sidebar.tsx         # 侧边栏
│   │   │   ├── ErrorBoundary.tsx   # 错误边界
│   │   │   ├── ProtectedRoute.tsx  # 受保护路由
│   │   │   ├── ThemeToggle.tsx     # 主题切换
│   │   │   ├── dashboard/          # 仪表盘组件
│   │   │   │   ├── StatsCards.tsx
│   │   │   │   ├── TodayExecution.tsx
│   │   │   │   ├── TrendChart.tsx
│   │   │   │   └── RecentTests.tsx
│   │   │   └── ui/                 # shadcn/ui 组件
│   │   │       ├── button.tsx
│   │   │       ├── card.tsx
│   │   │       ├── input.tsx
│   │   │       ├── dialog.tsx
│   │   │       └── ...
│   │   │
│   │   ├── pages/                  # 页面组件
│   │   │   ├── Home.tsx            # 首页/仪表盘
│   │   │   ├── Login.tsx           # 登录页
│   │   │   ├── Register.tsx        # 注册页
│   │   │   ├── Collections.tsx     # 用例管理
│   │   │   └── ...
│   │   │
│   │   ├── contexts/               # React Context
│   │   │   ├── AuthContext.tsx     # 认证上下文
│   │   │   └── ThemeContext.tsx    # 主题上下文
│   │   │
│   │   ├── lib/                    # 工具函数
│   │   │   ├── api.ts              # API 客户端
│   │   │   └── utils.ts            # 工具函数
│   │   │
│   │   ├── api/                    # API 定义
│   │   │   └── index.ts            # API 接口定义
│   │   │
│   │   └── services/               # 服务层
│   │       └── authApi.ts          # 认证 API
│   │
│   ├── 🔧 后端源代码
│   ├── server/
│   │   ├── index.ts                # 服务器入口
│   │   │
│   │   ├── routes/                 # API 路由
│   │   │   ├── auth.ts             # 认证路由
│   │   │   ├── dashboard.ts        # 仪表盘路由
│   │   │   ├── cases.ts            # 用例路由
│   │   │   ├── tasks.ts            # 任务路由
│   │   │   ├── executions.ts       # 执行路由
│   │   │   └── jenkins.ts          # Jenkins 集成
│   │   │
│   │   ├── services/               # 业务逻辑
│   │   │   ├── AuthService.ts      # 认证服务
│   │   │   ├── DashboardService.ts # 仪表盘服务
│   │   │   ├── ExecutionService.ts # 执行服务
│   │   │   └── EmailService.ts     # 邮件服务
│   │   │
│   │   ├── middleware/             # 中间件
│   │   │   └── auth.ts             # 认证中间件
│   │   │
│   │   ├── config/                 # 配置文件
│   │   │   └── database.ts         # 数据库配置
│   │   │
│   │   └── db/                     # 数据库
│   │       ├── index.ts            # 数据库初始化
│   │       ├── schema.sql          # 数据库 schema
│   │       ├── seed.sql            # 种子数据
│   │       └── autotest.db         # SQLite 数据库文件
│   │
│   ├── 🎨 样式和配置
│   ├── configs/
│   │   ├── tailwind.config.js      # Tailwind 配置
│   │   └── postcss.config.js       # PostCSS 配置
│   │
│   ├── 📚 文档
│   ├── docs/
│   │   ├── database-design.md      # 数据库设计
│   │   └── ...
│   │
│   ├── 🎨 静态资源
│   ├── public/
│   │   └── favicon.svg             # 网站图标
│   │
│   ├── 🛠️ 工具脚本
│   ├── scripts/
│   │   └── ai_refactor.ts          # AI 重构脚本
│   │
│   ├── 📦 共享代码
│   ├── shared/
│   │   └── types/                  # 共享类型定义
│   │
│   ├── 🔍 其他
│   ├── .gitignore                  # Git 忽略文件
│   ├── .env.example                # 环境变量示例
│   └── ...
```

---

## 🎯 文件分类说明

### 📄 项目根目录（仅保留核心文件）

| 文件 | 说明 |
|------|------|
| `package.json` | npm 项目配置 |
| `tsconfig.json` | TypeScript 配置 |
| `vite.config.ts` | Vite 构建配置 |
| `index.html` | HTML 入口 |
| `README.md` | 项目说明 |
| `CLAUDE.md` | 开发规范 |
| `DEPLOYMENT_GUIDE.md` | 部署指南入口 |
| `PROJECT_STRUCTURE.md` | 本文件 |

### 📦 deployment/ 文件夹（部署相关）

所有部署文件集中管理，包括：
- 📄 部署文档（5 个）
- 🐳 Docker 配置（2 个）
- ⚙️ 服务器配置（2 个）
- 🔧 部署脚本（3 个）

### src/ 文件夹（前端代码）

- `components/` - React 组件
- `pages/` - 页面组件
- `contexts/` - React Context
- `lib/` - 工具函数
- `api/` - API 定义
- `services/` - 服务层

### server/ 文件夹（后端代码）

- `routes/` - API 路由
- `services/` - 业务逻辑
- `middleware/` - 中间件
- `db/` - 数据库相关

---

## 🚀 快速导航

### 我想...

**快速部署应用**
→ 查看 `deployment/QUICK_START.md`

**了解项目功能**
→ 查看 `README.md`

**学习开发规范**
→ 查看 `CLAUDE.md`

**查看部署指南**
→ 查看 `DEPLOYMENT_GUIDE.md`

**修改前端代码**
→ 进入 `src/` 目录

**修改后端代码**
→ 进入 `server/` 目录

**查看数据库**
→ 查看 `server/db/schema.sql`

---

## 📋 规范说明

### 命名规范

- **文件夹**: 小写，用下划线分隔（如 `my_folder`）
- **文件**: 
  - 组件：PascalCase（如 `Button.tsx`）
  - 工具：camelCase（如 `utils.ts`）
  - 文档：PascalCase（如 `README.md`）

### 组织原则

1. **模块化** - 相关文件放在同一文件夹
2. **分层** - 前端、后端、部署分开管理
3. **整洁** - 项目根目录只保留核心文件
4. **可维护性** - 易于查找和修改

---

## 📊 项目统计

| 类别 | 数量 |
|------|------|
| 部署文档 | 5 个 |
| 部署脚本 | 3 个 |
| Docker 配置 | 2 个 |
| 服务器配置 | 2 个 |
| 前端组件 | 10+ 个 |
| 后端路由 | 6 个 |
| 数据库表 | 7 个 |

---

## 🔄 常见操作

### 添加新的前端组件

1. 在 `src/components/` 创建文件夹
2. 创建 `ComponentName.tsx`
3. 导出组件

### 添加新的后端路由

1. 在 `server/routes/` 创建文件
2. 定义路由处理程序
3. 在 `server/index.ts` 中注册

### 添加新的部署文档

1. 在 `deployment/` 创建 Markdown 文件
2. 在 `deployment/README.md` 中添加链接

---

## 💡 最佳实践

1. ✅ 保持项目根目录整洁
2. ✅ 相关文件放在同一目录
3. ✅ 使用有意义的文件名
4. ✅ 添加注释和文档
5. ✅ 遵循命名规范
6. ✅ 定期整理和重构

---

## 📞 获取帮助

- 部署问题 → `deployment/DEPLOYMENT.md`
- 代码问题 → `CLAUDE.md`
- 功能问题 → `README.md`

---

最后更新：2025-12-28