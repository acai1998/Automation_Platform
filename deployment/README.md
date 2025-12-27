# 📦 部署文件夹

> 自动化测试平台的完整部署解决方案

## 📂 文件结构

```
deployment/
├── README.md                   # 本文件
├── QUICK_START.md              # 快速开始指南（推荐首先阅读）
├── INSTALLATION.md             # 完整安装指南
├── DEPLOYMENT.md               # 生产部署指南
├── DEPLOYMENT_SUMMARY.md       # 部署文件总结
├── DEPLOYMENT_CHECKLIST.md     # 部署检查清单
├── Dockerfile                  # Docker 镜像定义
├── docker-compose.yml          # Docker Compose 配置
├── nginx.conf                  # Nginx 反向代理配置
├── .env.example                # 环境变量示例
└── scripts/
    ├── setup.sh                # macOS/Linux 自动部署脚本
    ├── setup.bat               # Windows 自动部署脚本
    └── check-env.sh            # 环境检查脚本
```

## 🚀 快速开始

### 方式 1：自动部署（推荐）⭐⭐⭐

```bash
# macOS / Linux
bash scripts/setup.sh

# Windows
scripts\setup.bat

# 启动应用
npm run start
```

**所需时间**: 5-15 分钟

### 方式 2：Docker 部署

```bash
docker-compose up -d
```

### 方式 3：手动部署

```bash
npm install
npm run db:init
npm run start
```

---

## 📚 文档导航

| 文档 | 用途 | 阅读时间 |
|------|------|--------|
| **QUICK_START.md** | 快速开始指南 | 3 分钟 |
| **INSTALLATION.md** | 详细安装步骤 | 15 分钟 |
| **DEPLOYMENT.md** | 生产环境部署 | 30 分钟 |
| **DEPLOYMENT_CHECKLIST.md** | 检查清单和快速参考 | 5 分钟 |
| **DEPLOYMENT_SUMMARY.md** | 文件总结和导航 | 10 分钟 |

---

## 🎯 按场景选择

### 场景 1：我想快速部署

1. 运行 `bash scripts/setup.sh` 或 `scripts\setup.bat`
2. 等待脚本完成
3. 运行 `npm run start`
4. 打开 http://localhost:5173

**查看**: [QUICK_START.md](./QUICK_START.md)

### 场景 2：我需要详细的安装步骤

**查看**: [INSTALLATION.md](./INSTALLATION.md)

### 场景 3：我要部署到生产环境

**查看**: [DEPLOYMENT.md](./DEPLOYMENT.md)

### 场景 4：我遇到了问题

**查看**: [DEPLOYMENT.md](./DEPLOYMENT.md) 的故障排除部分

### 场景 5：我想使用 Docker

```bash
docker-compose up -d
```

**查看**: [DEPLOYMENT.md](./DEPLOYMENT.md) 的 Docker 部分

---

## ✅ 系统要求

| 组件 | 最低版本 | 推荐版本 |
|------|---------|---------|
| Node.js | 18.0.0 | 20.x LTS |
| npm | 9.0.0 | 10.x+ |
| 磁盘空间 | 2GB | 5GB+ |
| 内存 | 4GB | 8GB+ |

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

# 环境检查
bash scripts/check-env.sh
```

---

## 🌐 部署完成后

- 前端应用: http://localhost:5173
- 后端 API: http://localhost:3000
- 健康检查: http://localhost:3000/api/health

---

## 📋 部署前检查

```bash
# 运行环境检查脚本
bash scripts/check-env.sh
```

---

## 🆘 需要帮助？

1. **快速问题** → 查看 [DEPLOYMENT_CHECKLIST.md](./DEPLOYMENT_CHECKLIST.md)
2. **详细问题** → 查看 [DEPLOYMENT.md](./DEPLOYMENT.md) 的故障排除部分
3. **环境问题** → 运行 `bash scripts/check-env.sh`

---

## 📖 返回主项目

返回项目根目录查看 [DEPLOYMENT_GUIDE.md](../DEPLOYMENT_GUIDE.md) 或 [README.md](../README.md)

---

**祝您部署顺利！** 🎉

最后更新：2025-12-28