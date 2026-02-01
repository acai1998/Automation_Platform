# 📌 关于本项目

## 项目简介

**AutoTest** 是一个现代化的全栈自动化测试管理平台，用于管理测试用例、调度 Jenkins 执行任务、监控执行结果。

## 核心功能

- 📊 **仪表盘** - 实时展示测试统计和成功率趋势
- 📝 **用例管理** - 创建、编辑、组织测试用例
- ⏰ **任务调度** - 手动触发、定时调度、CI 触发
- 🔗 **Jenkins 集成** - 自动触发执行、接收结果回调
- 📈 **执行历史** - 完整的执行记录和详细结果

## 技术栈

**前端**: React 18 + TypeScript + Vite + TailwindCSS  
**后端**: Express + TypeScript + SQLite  
**部署**: Docker + Nginx + PM2

## 快速开始

```bash
# 自动部署
bash deployment/scripts/setup.sh

# 启动应用
npm run start

# 访问
http://localhost:5173
```

## 文档

- 📖 [README.md](./README.md) - 项目详细说明
- 📖 [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md) - 部署指南
- 📖 [PROJECT_STRUCTURE.md](./PROJECT_STRUCTURE.md) - 项目结构

## 许可证

MIT License