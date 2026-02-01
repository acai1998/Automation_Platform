# Docker 镜像 tsx 问题修复指南

## 🔍 问题分析

### 遇到的错误

1. **错误 1**: `Cannot find package 'tsx'`
   - 原因: Dockerfile 中使用 `npm install -g tsx` 但可能安装失败

2. **错误 2**: `tsx must be loaded with --import instead of --loader`
   - 原因: Node.js 20.6.0+ 已弃用 `--loader` 标志

3. **根本原因**:
   - `tsconfig.server.json` 配置为 CommonJS 模块 (`"module": "CommonJS"`)
   - 但代码中使用 ESM 风格的 `import` 语句
   - 需要使用正确的 tsx 启动方式

## ✅ 修复方案

### 1. 修复后的 Dockerfile

```dockerfile
# 多阶段构建 - 自动化测试平台

# 阶段 1：构建前端
FROM node:20-alpine AS frontend-builder

WORKDIR /app

ENV VITE_NODE_ENV=production

# 复制 package 文件
COPY package*.json ./

# 安装依赖（包括 devDependencies）
RUN npm cache clean --force && \
    npm ci && \
    npm uninstall vite && \
    npm install vite@5.0.12

# 复制前端配置和源代码
COPY vite.config.ts ./
COPY tsconfig.json ./
COPY index.html ./
COPY configs/ ./configs/
COPY src/ ./src/
COPY shared/ ./shared/

# 构建前端
RUN ./node_modules/.bin/vite build

# 阶段 2：运行时环境
FROM node:20-alpine

WORKDIR /app

# 安装必要的系统依赖
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    sqlite

# 复制 package 文件
COPY package*.json ./

# 安装 tsx（必须在 npm ci 之前）
RUN npm install tsx

# 仅安装生产依赖
RUN npm ci --only=production

# 从构建阶段复制前端文件
COPY --from=frontend-builder /app/dist ./dist

# 复制后端代码
COPY server/ ./server/
COPY shared/ ./shared/
COPY tsconfig.server.json ./

# 创建数据库目录
RUN mkdir -p server/db

# 暴露端口
EXPOSE 3000

# 健康检查
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/api/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

# 启动命令 - 使用 npx tsx 直接运行
CMD ["npx", "tsx", "server/index.ts"]
```

### 2. 关键修改点

#### 问题根因
TypeORM 的装饰器（如 `@Entity`, `@PrimaryGeneratedColumn`）需要 `reflect-metadata` 和 TypeScript 编译，tsx 在运行时处理这些装饰器时会遇到兼容性问题。

#### 修改 1: 编译后端 TypeScript
```dockerfile
# ❌ 错误做法 - 直接运行 TypeScript
RUN npm ci --only=production
CMD ["npx", "tsx", "server/index.ts"]

# ✅ 正确做法 - 先编译再运行 JavaScript
RUN npm ci
RUN npm run server:build
RUN npm prune --production
CMD ["node", "dist/server/index.js"]
```

#### 修改 2: 完整的构建流程
```dockerfile
# 安装所有依赖（包括 devDependencies）
RUN npm ci

# 复制源代码
COPY server/ ./server/
COPY shared/ ./shared/
COPY tsconfig.server.json ./

# 编译后端 TypeScript
RUN npm run server:build

# 清理 devDependencies 减小镜像大小
RUN npm prune --production

# 运行编译后的 JavaScript
CMD ["node", "dist/server/index.js"]
```

## 🚀 快速部署步骤

### 最终解决方案：先编译 TypeScript 再运行

```bash
# 运行测试脚本
cd /workspace/scripts
./test-tsc-build.sh
```

### 手动步骤

```bash
# 1. 停止并删除旧容器
docker stop auto_test
docker rm auto_test

# 2. 使用修复后的 Dockerfile 构建镜像
cd /workspace
docker build -f deployment/Dockerfile -t auto-test:fixed .

# 3. 运行新镜像
docker run -d -p 3000:3000 --name auto_test auto-test:fixed

# 4. 等待服务启动
sleep 15

# 5. 查看日志
docker logs auto_test

# 6. 测试访问
curl http://localhost:3000/api/health
curl http://localhost:3000/
```

### 选项 3: 修改 package.json（推荐）

将 tsx 添加到 dependencies 中：

```json
{
  "dependencies": {
    "tsx": "^4.7.0",
    // ... 其他依赖
  }
}
```

然后重新构建镜像。

## 🔧 验证部署

### 健康检查

```bash
# 等待服务启动
sleep 10

# 检查健康端点
curl http://localhost:3000/api/health

# 查看容器日志
docker logs auto_test

# 检查容器状态
docker ps | grep auto_test
```

### 访问应用

```bash
# 访问首页
curl http://localhost:3000/

# 访问 API 端点
curl http://localhost:3000/api/dashboard
```

## 📝 推荐的完整部署流程

### 1. 修改 package.json

```bash
# 添加 tsx 到 dependencies
npm install tsx --save
```

### 2. 更新 Dockerfile

使用修复后的 Dockerfile（见上文）。

### 3. 构建并推送新镜像

```bash
# 构建镜像
docker build -f deployment/Dockerfile \
  -t crpi-dytkl1o45qyeksph.cn-hangzhou.personal.cr.aliyuncs.com/caijinwei/auto_test:latest \
  -t crpi-dytkl1o45qyeksph.cn-hangzhou.personal.cr.aliyuncs.com/caijinwei/auto_test:master \
  .

# 登录阿里云
docker login crpi-dytkl1o45qyeksph.cn-hangzhou.personal.cr.aliyuncs.com

# 推送镜像
docker push crpi-dytkl1o45qyeksph.cn-hangzhou.personal.cr.aliyuncs.com/caijinwei/auto_test:latest
docker push crpi-dytkl1o45qyeksph.cn-hangzhou.personal.cr.aliyuncs.com/caijinwei/auto_test:master
```

### 4. 更新 GitHub Actions 工作流

确保 `.github/workflows/docker.yml` 使用正确的构建命令。

## 🐛 故障排查

### 问题 1: tsx 安装失败

```bash
# 检查网络连接
docker exec auto_test ping registry.npmjs.org

# 手动安装 tsx
docker exec auto_test npm install tsx --verbose

# 检查安装结果
docker exec auto_test npm list tsx
```

### 问题 2: 应用启动失败

```bash
# 查看完整日志
docker logs --tail 100 auto_test

# 进入容器调试
docker exec -it auto_test sh

# 在容器内手动运行
cd /app
npx tsx server/index.ts
```

### 问题 3: 端口冲突

```bash
# 检查端口占用
netstat -tlnp | grep 3000
lsof -i :3000

# 使用其他端口
docker run -d -p 3001:3000 --name auto_test auto-test:fixed
```

## 📚 参考资料

- [tsx 官方文档](https://tsx.is/)
- [Node.js ESM 模块文档](https://nodejs.org/api/esm.html)
- [Docker 多阶段构建](https://docs.docker.com/build/building/multi-stage/)

## 💡 最佳实践

1. **将 tsx 添加到 dependencies**: 确保生产环境包含 tsx
2. **使用 npx tsx**: 避免全局安装问题
3. **明确模块系统**: 统一使用 ESM 或 CommonJS
4. **健康检查**: 添加容器健康检查确保服务可用
5. **日志监控**: 定期检查容器日志

## 🔗 相关文件

- `deployment/Dockerfile` - 修复后的 Dockerfile
- `deployment/docker-compose.aliyun.yml` - Docker Compose 配置
- `scripts/deploy-aliyun.sh` - 自动化部署脚本
- `tsconfig.server.json` - TypeScript 配置
