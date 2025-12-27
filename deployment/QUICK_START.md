# 🚀 快速开始指南

> 5 分钟快速部署自动化测试平台

## 📋 前置要求

- **Node.js** >= 18.0.0
- **npm** >= 9.0.0

> 💡 检查版本: `node --version` 和 `npm --version`

---

## ⚡ 一键部署

### macOS / Linux

```bash
# 进入项目目录
cd automation-platform

# 运行部署脚本
bash scripts/setup.sh
```

### Windows

```bash
# 进入项目目录
cd automation-platform

# 运行部署脚本
scripts\setup.bat
```

---

## 🔧 手动部署（3 步）

### 步骤 1：安装依赖

```bash
npm install
```

### 步骤 2：初始化数据库

```bash
npm run db:init
```

### 步骤 3：启动应用

```bash
npm run start
```

> ✅ 完成！访问 http://localhost:5173

---

## 📚 常用命令

| 命令 | 说明 | 访问地址 |
|------|------|--------|
| `npm run start` | 启动前后端（推荐） | http://localhost:5173 |
| `npm run dev` | 仅启动前端 | http://localhost:5173 |
| `npm run server` | 仅启动后端 | http://localhost:3000 |
| `npm run build` | 构建生产版本 | - |
| `npm run db:init` | 初始化数据库 | - |
| `npm run db:reset` | 重置数据库 | - |

---

## ❓ 常见问题

### Q: npm 安装失败？

```bash
# 清除缓存并重试
npm cache clean --force
npm install
```

### Q: 端口被占用？

```bash
# 使用不同端口启动后端
PORT=3001 npm run server
```

### Q: 数据库错误？

```bash
# 重置数据库
npm run db:reset
```

---

## 📖 详细文档

- 📘 [完整部署指南](./DEPLOYMENT.md) - 详细的部署步骤和配置
- 📗 [项目说明](./README.md) - 项目功能和架构
- 📙 [开发指南](./CLAUDE.md) - 代码规范和开发规则

---

## 🎯 下一步

1. ✅ 应用启动成功
2. 📝 查看 [功能演示](#功能演示) 了解平台功能
3. 🔗 配置 Jenkins 集成（可选）
4. 📊 创建测试用例和任务

---

## 📞 支持

遇到问题？

1. 查看 [完整部署指南](./DEPLOYMENT.md) 的故障排除部分
2. 检查 [常见问题](#常见问题)
3. 查看日志获取错误信息

---

**祝您使用愉快！** 🎉