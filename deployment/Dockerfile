# 多阶段构建 - 自动化测试平台
# Multi-stage build - Automation Platform

# 阶段 1：构建前端
FROM node:20-alpine AS frontend-builder

WORKDIR /app

# 注意：不要在这里设置 NODE_ENV=production，否则 npm ci 不会安装 devDependencies
# Vite 在 devDependencies 中，构建时需要它
# 只设置 VITE_NODE_ENV，让 Vite 知道这是生产构建
ENV VITE_NODE_ENV=production

# 复制 package 文件
COPY package*.json ./

# 清理 npm 缓存并安装所有依赖（包括 devDependencies）
# 先正常安装，然后强制替换为 vite 5.0.12 以确保兼容性
RUN npm cache clean --force && \
    npm ci && \
    echo "原始 vite 版本:" && \
    npm list vite && \
    echo "强制替换为 vite 5.0.12..." && \
    npm uninstall vite && \
    npm install vite@5.0.12 && \
    echo "最终 vite 版本:" && \
    npm list vite

# 复制前端相关的配置文件
COPY vite.config.ts ./
COPY tsconfig.json ./
COPY index.html ./

# 复制配置目录
COPY configs/ ./configs/

# 复制源代码
COPY src/ ./src/
COPY shared/ ./shared/

# 确保关键目录被正确复制并修复文件权限
RUN echo "=== Checking source files ===" && \
    ls -la ./src/ && \
    ls -la ./src/lib/ && \
    echo "=== Checking utils.ts file ===" && \
    ls -la ./src/lib/utils.ts && \
    cat ./src/lib/utils.ts && \
    chmod -R 755 ./src && \
    echo "=== File check complete ==="

# 验证关键依赖是否安装
RUN echo "=== Checking installed dependencies ===" && \
    npm list vite && \
    ls -lh ./node_modules/.bin/vite && \
    echo "=== Dependencies check complete ==="

# 构建前端（使用本地安装的 vite）
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

# 安装所有依赖（包括 devDependencies，用于编译）
RUN npm ci

# 从构建阶段复制前端文件
COPY --from=frontend-builder /app/dist ./dist

# 复制后端代码和配置
COPY server/ ./server/
COPY shared/ ./shared/
COPY tsconfig.server.json ./

# 编译后端 TypeScript
RUN npm run server:build && \
    echo "=== 编译成功，检查输出 ===" && \
    ls -la dist/ && \
    echo "=== dist/server/ 目录内容 ===" && \
    ls -la dist/server/ && \
    echo "=== 验证关键文件 ===" && \
    test -f dist/server/index.js && echo "✅ index.js 存在" || echo "❌ index.js 不存在"

# 清理 devDependencies 减小镜像大小
RUN npm prune --production

# 创建数据库目录
RUN mkdir -p server/db

# 暴露端口
EXPOSE 3000

# 健康检查
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/api/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

# 启动命令 - 运行编译后的 JavaScript
CMD ["node", "dist/server/server/index.js"]