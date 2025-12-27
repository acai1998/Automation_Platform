# 自动化测试平台 - 部署指南

本文档提供了在新设备上部署自动化测试平台的完整步骤。

## 📋 目录

1. [系统要求](#系统要求)
2. [环境准备](#环境准备)
3. [项目部署](#项目部署)
4. [开发环境启动](#开发环境启动)
5. [生产环境部署](#生产环境部署)
6. [故障排除](#故障排除)
7. [常见问题](#常见问题)

---

## 系统要求

### 最低配置

| 项目 | 要求 | 说明 |
|------|------|------|
| **操作系统** | macOS 10.15+ / Windows 10+ / Ubuntu 18.04+ | 支持主流操作系统 |
| **Node.js** | 18.0.0 或更高版本 | 推荐使用 LTS 版本 |
| **npm** | 9.0.0 或更高版本 | Node.js 自带 |
| **磁盘空间** | 至少 2GB | 用于安装依赖和构建 |
| **内存** | 至少 4GB | 运行开发服务器 |

### 推荐配置

- **Node.js**: 20.x LTS 或 22.x LTS
- **npm**: 10.x 或更高版本
- **磁盘空间**: 5GB 或更多
- **内存**: 8GB 或更多

---

## 环境准备

### 第一步：安装 Node.js

根据您的操作系统选择相应的安装方式。

#### macOS（使用 Homebrew）

```bash
# 安装 Homebrew（如果还未安装）
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# 安装 Node.js
brew install node

# 验证安装
node --version
npm --version
```

#### Windows

**方式一：使用 Chocolatey**

```bash
# 安装 Chocolatey（管理员权限运行）
@"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -InputFormat None -ExecutionPolicy Bypass -Command "[System.Net.ServicePointManager]::SecurityProtocol = 3072; iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))"

# 安装 Node.js
choco install nodejs

# 验证安装
node --version
npm --version
```

**方式二：直接下载安装**

访问 [Node.js 官网](https://nodejs.org)，下载 LTS 版本安装程序，按提示安装即可。

#### Linux（Ubuntu/Debian）

```bash
# 更新包管理器
sudo apt-get update
sudo apt-get upgrade -y

# 安装 Node.js
sudo apt-get install -y nodejs npm

# 验证安装
node --version
npm --version
```

#### Linux（CentOS/RHEL）

```bash
# 添加 NodeSource 仓库
curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -

# 安装 Node.js
sudo yum install -y nodejs

# 验证安装
node --version
npm --version
```

### 第二步：验证 Node.js 和 npm

```bash
# 检查 Node.js 版本（应为 18.0.0 或更高）
node --version
# 输出示例: v20.11.0

# 检查 npm 版本（应为 9.0.0 或更高）
npm --version
# 输出示例: 10.2.4

# 检查 npm 缓存
npm cache verify
```

### 第三步：配置 npm（可选但推荐）

```bash
# 设置 npm 源（使用官方源或淘宝源）
npm config set registry https://registry.npmjs.org/

# 查看当前配置
npm config list
```

---

## 项目部署

### 第一步：克隆或下载项目

**方式一：使用 Git 克隆**

```bash
# 克隆仓库
git clone <repository-url>
cd automation-platform

# 如果需要特定分支
git checkout <branch-name>
```

**方式二：下载 ZIP 文件**

1. 从代码仓库下载 ZIP 文件
2. 解压到本地目录
3. 进入项目目录

```bash
cd automation-platform
```

### 第二步：安装项目依赖

```bash
# 进入项目目录
cd /path/to/automation-platform

# 清除旧的依赖（如果之前安装过）
rm -rf node_modules package-lock.json

# 安装所有依赖
npm install

# 验证安装成功
npm list --depth=0
```

**安装时间**: 通常需要 3-10 分钟，取决于网络速度。

**常见问题处理**:

```bash
# 如果安装失败，尝试以下方法

# 1. 清除 npm 缓存
npm cache clean --force

# 2. 重新安装
npm install

# 3. 如果仍然失败，使用 npm ci（更严格的安装）
npm ci

# 4. 检查磁盘空间
df -h  # Linux/macOS
Get-Volume  # Windows PowerShell
```

### 第三步：初始化数据库

```bash
# 初始化数据库（创建表和导入种子数据）
npm run db:init

# 输出应该显示：
# 数据库已存在，跳过初始化
# 或
# 数据库初始化完成！
```

### 第四步：验证环境

```bash
# 检查项目结构
ls -la

# 检查关键文件是否存在
test -f package.json && echo "✓ package.json 存在"
test -f tsconfig.json && echo "✓ tsconfig.json 存在"
test -d src && echo "✓ src 目录存在"
test -d server && echo "✓ server 目录存在"
test -d node_modules && echo "✓ node_modules 目录存在"

# 检查数据库
test -f server/db/autotest.db && echo "✓ 数据库文件存在"
```

---

## 开发环境启动

### 方式一：启动完整开发环境（推荐）

```bash
# 同时启动前端（Vite）和后端（Express）
npm run start

# 输出示例：
# [0] > automation-platform@1.0.0 dev
# [0] > vite
# [0]   VITE v5.0.12  ready in 234 ms
# [0]   ➜  Local:   http://localhost:5173/
# [0]   ➜  press h to show help
#
# [1] > automation-platform@1.0.0 server
# [1] > tsx watch server/index.ts
# [1] Express server running on port 3000
```

### 方式二：分别启动前后端

```bash
# 终端 1：启动前端（Vite 开发服务器）
npm run dev
# 访问: http://localhost:5173

# 终端 2：启动后端（Express 服务器）
npm run server
# 访问: http://localhost:3000
```

### 访问应用

启动成功后，在浏览器中访问：

- **前端应用**: http://localhost:5173
- **后端 API**: http://localhost:3000
- **健康检查**: http://localhost:3000/api/health

### 验证服务状态

```bash
# 检查前端是否运行
curl -s http://localhost:5173 | grep -o "<title>.*</title>"
# 输出: <title>自动化测试平台</title>

# 检查后端是否运行
curl -s http://localhost:3000/api/health | jq .
# 输出: {"status":"ok","timestamp":"2025-12-27T16:04:35.910Z"}
```

---

## 生产环境部署

### 第一步：构建生产版本

```bash
# 构建前端
npm run build

# 输出示例：
# ✓ 1234 modules transformed.
# dist/index.html                   0.46 kB │ gzip:  0.30 kB
# dist/assets/index-abc123.js   245.67 kB │ gzip: 78.90 kB

# 构建后的文件位于 dist/ 目录
ls -la dist/
```

### 第二步：类型检查

```bash
# 前端类型检查
npx tsc --noEmit -p tsconfig.json

# 后端类型检查
npx tsc --noEmit -p tsconfig.server.json

# 如果没有错误输出，说明类型检查通过
```

### 第三步：生产服务器配置

#### 使用 PM2 管理进程

```bash
# 全局安装 PM2
npm install -g pm2

# 创建 ecosystem.config.js 配置文件
cat > ecosystem.config.js << 'EOF'
module.exports = {
  apps: [
    {
      name: 'automation-platform-backend',
      script: './server/index.ts',
      interpreter: 'tsx',
      instances: 1,
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      },
      error_file: 'logs/error.log',
      out_file: 'logs/out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
    }
  ]
};
EOF

# 启动应用
pm2 start ecosystem.config.js

# 查看运行状态
pm2 status

# 查看日志
pm2 logs automation-platform-backend

# 设置开机自启
pm2 startup
pm2 save
```

#### 使用 Nginx 反向代理

```bash
# 创建 Nginx 配置文件
cat > /etc/nginx/sites-available/automation-platform << 'EOF'
upstream backend {
    server localhost:3000;
}

server {
    listen 80;
    server_name your-domain.com;

    # 前端静态文件
    location / {
        root /path/to/automation-platform/dist;
        try_files $uri $uri/ /index.html;
    }

    # 后端 API
    location /api {
        proxy_pass http://backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # 缓存策略
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 30d;
        add_header Cache-Control "public, immutable";
    }
}
EOF

# 启用配置
sudo ln -s /etc/nginx/sites-available/automation-platform /etc/nginx/sites-enabled/

# 测试配置
sudo nginx -t

# 重启 Nginx
sudo systemctl restart nginx
```

#### 使用 Docker 部署

```dockerfile
# 创建 Dockerfile
FROM node:20-alpine

WORKDIR /app

# 复制 package.json
COPY package*.json ./

# 安装依赖
RUN npm ci --only=production

# 复制源代码
COPY . .

# 构建前端
RUN npm run build

# 暴露端口
EXPOSE 3000

# 启动命令
CMD ["node", "server/index.ts"]
```

```bash
# 构建 Docker 镜像
docker build -t automation-platform:latest .

# 运行 Docker 容器
docker run -d \
  -p 3000:3000 \
  -v /path/to/db:/app/server/db \
  --name automation-platform \
  automation-platform:latest

# 查看容器状态
docker ps

# 查看容器日志
docker logs automation-platform
```

### 第四步：环境变量配置

```bash
# 创建 .env 文件
cat > .env << 'EOF'
# 服务器配置
NODE_ENV=production
PORT=3000
HOST=0.0.0.0

# 数据库配置
DB_PATH=./server/db/autotest.db

# Jenkins 集成
JENKINS_URL=http://jenkins-server:8080
JENKINS_USER=jenkins-user
JENKINS_TOKEN=jenkins-token

# 应用配置
API_BASE_URL=http://your-domain.com/api
FRONTEND_URL=http://your-domain.com
EOF

# 加载环境变量
source .env
```

---

## 故障排除

### 常见错误和解决方案

#### 1. npm 安装失败

**错误信息**: `npm ERR! code ERESOLVE`

**解决方案**:

```bash
# 方式 1：使用 legacy peer deps
npm install --legacy-peer-deps

# 方式 2：升级 npm
npm install -g npm@latest

# 方式 3：清除缓存后重新安装
npm cache clean --force
rm -rf node_modules package-lock.json
npm install
```

#### 2. 端口被占用

**错误信息**: `Error: listen EADDRINUSE: address already in use :::3000`

**解决方案**:

```bash
# macOS/Linux：查找占用端口的进程
lsof -i :3000

# 杀死进程
kill -9 <PID>

# Windows：查找占用端口的进程
netstat -ano | findstr :3000

# 杀死进程
taskkill /PID <PID> /F

# 或使用不同的端口
PORT=3001 npm run server
```

#### 3. 数据库错误

**错误信息**: `Error: SQLITE_CANTOPEN`

**解决方案**:

```bash
# 重置数据库
npm run db:reset

# 检查数据库文件权限
ls -la server/db/

# 修改权限
chmod 644 server/db/autotest.db
```

#### 4. 内存不足

**错误信息**: `JavaScript heap out of memory`

**解决方案**:

```bash
# 增加 Node.js 堆内存
NODE_OPTIONS="--max-old-space-size=4096" npm run build

# 或在 package.json 中配置
"build": "NODE_OPTIONS=--max-old-space-size=4096 vite build"
```

#### 5. TypeScript 类型错误

**错误信息**: `TS2307: Cannot find module`

**解决方案**:

```bash
# 重新生成类型定义
npm run tsc --noEmit

# 清除 TypeScript 缓存
rm -rf node_modules/.vite

# 重新启动开发服务器
npm run dev
```

### 日志查看

```bash
# 查看前端日志
# 浏览器开发者工具 → Console 标签

# 查看后端日志
# 终端输出

# 查看系统日志
tail -f logs/error.log
tail -f logs/out.log
```

---

## 常见问题

### Q1: 如何更新项目代码？

```bash
# 拉取最新代码
git pull origin main

# 安装新的依赖
npm install

# 重新启动服务
npm run start
```

### Q2: 如何重置数据库？

```bash
# 完全重置数据库（会删除所有数据）
npm run db:reset

# 只初始化（保留现有数据）
npm run db:init
```

### Q3: 如何修改数据库位置？

编辑 `server/db/index.ts` 文件，修改数据库路径：

```typescript
const DB_PATH = process.env.DB_PATH || './server/db/autotest.db';
```

### Q4: 如何添加新的环境变量？

1. 在 `.env` 文件中添加变量
2. 在代码中使用 `process.env.VARIABLE_NAME`
3. 重新启动服务

### Q5: 如何查看 API 文档？

访问以下端点获取 API 信息：

```bash
# 健康检查
curl http://localhost:3000/api/health

# 仪表盘统计
curl http://localhost:3000/api/dashboard/stats

# 执行记录
curl http://localhost:3000/api/executions
```

### Q6: 如何调试前端代码？

```bash
# 启用 Source Map（开发环境默认启用）
npm run dev

# 在浏览器中打开开发者工具
# macOS: Cmd + Option + I
# Windows: F12 或 Ctrl + Shift + I
# Linux: F12 或 Ctrl + Shift + I
```

### Q7: 如何调试后端代码？

```bash
# 使用 Node 内置调试器
node --inspect-brk server/index.ts

# 使用 VS Code 调试
# 1. 创建 .vscode/launch.json
# 2. 配置调试器
# 3. 按 F5 启动调试
```

### Q8: 性能优化建议

```bash
# 1. 使用生产构建
npm run build

# 2. 启用 HTTP/2 和 Gzip 压缩
# 在 Nginx 配置中添加：
# http2_push_preload on;
# gzip on;

# 3. 使用 CDN 加速静态资源
# 配置 Nginx 或 CloudFlare

# 4. 数据库索引优化
# 检查 server/db/schema.sql 中的索引
```

---

## 支持和反馈

如遇到问题，请：

1. 查看本文档的故障排除部分
2. 检查项目 GitHub Issues
3. 联系开发团队

## 更新日志

| 版本 | 日期 | 更新内容 |
|------|------|--------|
| 1.0.0 | 2025-12-27 | 初始版本发布 |

---

**最后更新**: 2025-12-27