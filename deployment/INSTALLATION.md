# 安装指南 - Installation Guide

自动化测试平台的完整安装和部署指南。

**目录**
1. [快速开始](#快速开始)
2. [系统要求](#系统要求)
3. [安装方法](#安装方法)
4. [验证安装](#验证安装)
5. [故障排除](#故障排除)

---

## 快速开始

### 最快的方式（推荐）

```bash
# 1. 进入项目目录
cd automation-platform

# 2. 运行自动部署脚本
bash scripts/setup.sh        # macOS/Linux
scripts\setup.bat            # Windows

# 3. 启动应用
npm run start

# 4. 打开浏览器访问
# http://localhost:5173
```

**所需时间**: 5-15 分钟

---

## 系统要求

### 必需环境

| 组件 | 最低版本 | 推荐版本 | 说明 |
|------|---------|---------|------|
| Node.js | 18.0.0 | 20.x LTS | JavaScript 运行时 |
| npm | 9.0.0 | 10.x+ | 包管理器 |
| 磁盘空间 | 2GB | 5GB+ | 依赖和构建文件 |
| 内存 | 4GB | 8GB+ | 开发和运行 |

### 操作系统支持

- ✅ macOS 10.15+
- ✅ Windows 10+
- ✅ Ubuntu 18.04+
- ✅ CentOS 7+
- ✅ 其他 Linux 发行版

---

## 安装方法

### 方法 1：自动脚本安装（推荐）

#### macOS / Linux

```bash
cd automation-platform
bash scripts/setup.sh
```

#### Windows

```bash
cd automation-platform
scripts\setup.bat
```

**优点**：
- ✅ 自动检查环境
- ✅ 自动安装依赖
- ✅ 自动初始化数据库
- ✅ 友好的错误提示

---

### 方法 2：手动安装

#### 步骤 1：检查环境

```bash
# 检查 Node.js
node --version    # 应输出 v18.0.0 或更高

# 检查 npm
npm --version     # 应输出 9.0.0 或更高

# 检查环境（可选）
bash scripts/check-env.sh
```

#### 步骤 2：安装依赖

```bash
# 进入项目目录
cd automation-platform

# 清除旧依赖（如果需要）
rm -rf node_modules package-lock.json

# 安装依赖
npm install

# 如果失败，尝试：
npm install --legacy-peer-deps
```

#### 步骤 3：初始化数据库

```bash
npm run db:init
```

#### 步骤 4：启动应用

```bash
# 启动前后端
npm run start

# 或分别启动
# 终端 1
npm run dev

# 终端 2
npm run server
```

---

### 方法 3：Docker 容器部署

#### 前置条件

- Docker >= 20.10
- Docker Compose >= 2.0

#### 快速部署

```bash
# 构建并启动容器
docker-compose up -d

# 查看日志
docker-compose logs -f app

# 停止容器
docker-compose down
```

#### 单独运行 Docker

```bash
# 构建镜像
docker build -t automation-platform:latest .

# 运行容器
docker run -d \
  -p 3000:3000 \
  -v automation-db:/app/server/db \
  --name automation-platform \
  automation-platform:latest

# 查看日志
docker logs -f automation-platform

# 停止容器
docker stop automation-platform
```

---

### 方法 4：生产环境部署

#### 使用 PM2

```bash
# 全局安装 PM2
npm install -g pm2

# 启动应用
pm2 start ecosystem.config.js

# 查看状态
pm2 status

# 查看日志
pm2 logs

# 设置开机自启
pm2 startup
pm2 save
```

#### 使用 Nginx 反向代理

```bash
# 编辑 Nginx 配置
sudo nano /etc/nginx/sites-available/automation-platform

# 将 nginx.conf 的内容复制到上述文件

# 启用配置
sudo ln -s /etc/nginx/sites-available/automation-platform \
           /etc/nginx/sites-enabled/

# 测试配置
sudo nginx -t

# 重启 Nginx
sudo systemctl restart nginx
```

---

## 验证安装

### 检查服务状态

```bash
# 检查前端
curl -s http://localhost:5173 | grep "<title>"
# 输出: <title>自动化测试平台</title>

# 检查后端
curl -s http://localhost:3000/api/health | jq .
# 输出: {"status":"ok","timestamp":"..."}

# 检查 API
curl -s http://localhost:3000/api/dashboard/stats | jq .
```

### 浏览器访问

1. **前端应用**: http://localhost:5173
2. **后端 API**: http://localhost:3000
3. **健康检查**: http://localhost:3000/api/health

### 数据库检查

```bash
# 检查数据库文件
ls -lh server/db/autotest.db

# 预期输出: -rw-r--r--  ... server/db/autotest.db
```

---

## 常见问题

### Q1: npm 安装失败

**错误**: `npm ERR! code ERESOLVE`

**解决方案**:

```bash
# 方式 1：使用 legacy peer deps
npm install --legacy-peer-deps

# 方式 2：升级 npm
npm install -g npm@latest

# 方式 3：清除缓存
npm cache clean --force
npm install
```

### Q2: 端口被占用

**错误**: `Error: listen EADDRINUSE :::3000`

**解决方案**:

```bash
# 查找占用端口的进程
lsof -i :3000        # macOS/Linux
netstat -ano | grep :3000  # Windows

# 杀死进程
kill -9 <PID>         # macOS/Linux
taskkill /PID <PID> /F   # Windows

# 或使用不同端口
PORT=3001 npm run server
```

### Q3: 数据库错误

**错误**: `Error: SQLITE_CANTOPEN`

**解决方案**:

```bash
# 重置数据库
npm run db:reset

# 或手动删除并重新初始化
rm server/db/autotest.db
npm run db:init
```

### Q4: 内存不足

**错误**: `JavaScript heap out of memory`

**解决方案**:

```bash
# 增加堆内存
NODE_OPTIONS="--max-old-space-size=4096" npm run build

# 或修改 package.json
"build": "NODE_OPTIONS=--max-old-space-size=4096 vite build"
```

### Q5: 网络连接问题

**错误**: `npm ERR! code ETIMEDOUT`

**解决方案**:

```bash
# 更换 npm 源
npm config set registry https://registry.npmjs.org/

# 或使用淘宝源
npm config set registry https://registry.npmmirror.com

# 清除缓存并重试
npm cache clean --force
npm install
```

### Q6: TypeScript 错误

**错误**: `TS2307: Cannot find module`

**解决方案**:

```bash
# 重新生成类型定义
npm run tsc --noEmit

# 清除缓存
rm -rf node_modules/.vite

# 重新启动
npm run dev
```

---

## 环境配置

### 创建 .env 文件

```bash
# 复制示例文件
cp .env.example .env

# 编辑配置
nano .env  # 或使用其他编辑器
```

### 常用配置

```env
# 开发环境
NODE_ENV=development
PORT=3000
FRONTEND_URL=http://localhost:5173
API_BASE_URL=http://localhost:3000

# Jenkins 集成
JENKINS_URL=http://jenkins-server:8080
JENKINS_USER=your-username
JENKINS_TOKEN=your-token
```

---

## 升级和更新

### 更新代码

```bash
# 拉取最新代码
git pull origin main

# 安装新依赖
npm install

# 重新启动
npm run start
```

### 数据库迁移

```bash
# 如果有数据库变更，运行迁移
npm run db:init

# 或重置数据库
npm run db:reset
```

---

## 性能优化

### 开发环境

```bash
# 启用热重载
npm run dev

# 启用调试
DEBUG=* npm run server
```

### 生产环境

```bash
# 构建优化
npm run build

# 启用 Gzip 压缩
# 在 Nginx 配置中启用 gzip

# 使用 CDN
# 配置静态资源 CDN

# 数据库优化
# 添加索引和优化查询
```

---

## 卸载和清理

### 完全卸载

```bash
# 停止所有进程
npm stop
pm2 stop all

# 删除依赖
rm -rf node_modules
rm -rf dist

# 删除数据库（谨慎操作）
rm server/db/autotest.db

# 删除日志
rm -rf logs
```

### 清除缓存

```bash
# npm 缓存
npm cache clean --force

# 浏览器缓存
# 手动清除或使用开发者工具
```

---

## 获取帮助

### 文档

- 📘 [快速开始](./QUICK_START.md) - 5 分钟快速开始
- 📗 [完整部署指南](./DEPLOYMENT.md) - 详细部署说明
- 📙 [项目说明](./README.md) - 项目功能和架构
- 📕 [开发指南](./CLAUDE.md) - 代码规范和开发规则

### 常见资源

- [Node.js 官网](https://nodejs.org)
- [npm 文档](https://docs.npmjs.com)
- [Docker 文档](https://docs.docker.com)
- [Nginx 文档](https://nginx.org/en/docs)

### 联系支持

如需帮助，请：

1. 查看本文档
2. 检查 [完整部署指南](./DEPLOYMENT.md) 的故障排除部分
3. 查看项目 Issues
4. 联系开发团队

---

**祝您安装顺利！** 🎉

最后更新：2025-12-27