# 🚀 部署指南

> 所有部署文件已整理到 `deployment/` 文件夹中

## 快速开始

### 方式 1：自动部署（推荐）⭐⭐⭐

```bash
# macOS / Linux
bash deployment/scripts/setup.sh

# Windows
deployment\scripts\setup.bat

# 启动应用
npm run start
```

**所需时间**: 5-15 分钟

### 方式 2：Docker 部署

```bash
docker-compose -f deployment/docker-compose.yml up -d
```

### 方式 3：手动部署

```bash
npm install
npm run db:init
npm run start
```

---

## 📚 详细文档

所有部署文档位于 `deployment/` 文件夹：

| 文档 | 说明 |
|------|------|
| [deployment/QUICK_START.md](./deployment/QUICK_START.md) | 快速开始（3分钟）|
| [deployment/INSTALLATION.md](./deployment/INSTALLATION.md) | 完整安装指南 |
| [deployment/DEPLOYMENT.md](./deployment/DEPLOYMENT.md) | 生产部署指南 |
| [deployment/DEPLOYMENT_CHECKLIST.md](./deployment/DEPLOYMENT_CHECKLIST.md) | 检查清单 |

---

## 🔧 常用命令

```bash
# 启动应用
npm run start

# 仅启动前端
npm run dev

# 仅启动后端
npm run server

# 构建生产版本
npm run build

# 初始化数据库
npm run db:init

# 重置数据库
npm run db:reset
```

---

## 📁 部署文件结构

```
deployment/
├── QUICK_START.md              # 快速开始指南
├── INSTALLATION.md             # 安装指南
├── DEPLOYMENT.md               # 部署指南
├── DEPLOYMENT_SUMMARY.md       # 文件总结
├── DEPLOYMENT_CHECKLIST.md     # 检查清单
├── Dockerfile                  # Docker 镜像
├── docker-compose.yml          # Docker Compose
├── nginx.conf                  # Nginx 配置
├── .env.example                # 环境变量示例
└── scripts/
    ├── setup.sh                # macOS/Linux 脚本
    ├── setup.bat               # Windows 脚本
    └── check-env.sh            # 环境检查脚本
```

---

## ✅ 系统要求

- Node.js >= 18.0.0
- npm >= 9.0.0
- 磁盘空间 >= 2GB
- 内存 >= 4GB

---

## 🌐 访问地址

- 前端应用: http://localhost:5173
- 后端 API: http://localhost:3000
- 健康检查: http://localhost:3000/api/health

---

## 📖 更多信息

详见 `deployment/` 文件夹中的完整文档。

祝您部署顺利！🎉