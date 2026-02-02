# 多阶段构建 - 自动化测试平台
# Multi-stage build - Automation Platform

# 阶段 1：构建前端
FROM node:20-alpine AS frontend-builder

WORKDIR /app

# 禁用代理，避免网络连接问题
ENV http_proxy= \
    https_proxy= \
    HTTP_PROXY= \
    HTTPS_PROXY= \
    no_proxy= \
    NO_PROXY=

# 禁用 npm 代理配置
RUN npm config set proxy null && \
    npm config set https-proxy null && \
    npm config delete proxy && \
    npm config delete https-proxy

# 注意：不要在这里设置 NODE_ENV=production，否则 npm ci 不会安装 devDependencies
# Vite 在 devDependencies 中，构建时需要它
# 只设置 VITE_NODE_ENV，让 Vite 知道这是生产构建
ENV VITE_NODE_ENV=production

# 复制 package 文件
COPY package*.json ./

# 清理 npm 缓存并安装所有依赖（包括 devDependencies）
# 使用 npm install 而不是 npm ci 来避免 package-lock 冲突问题
RUN npm cache clean --force && \
    npm install --legacy-peer-deps

# 复制前端相关的配置文件
COPY vite.config.ts ./
COPY tsconfig.json ./
COPY index.html ./

# 复制配置目录
COPY configs/ ./configs/

# 复制源代码
COPY src/ ./src/
COPY shared/ ./shared/

# 构建前端（使用本地安装的 vite）
RUN npx vite build

# 阶段 2：运行时环境
FROM node:20-alpine

WORKDIR /app

# 禁用代理，避免网络连接问题
ENV http_proxy= \
    https_proxy= \
    HTTP_PROXY= \
    HTTPS_PROXY= \
    no_proxy= \
    NO_PROXY=

# 禁用 npm 代理配置
RUN npm config set proxy null && \
    npm config set https-proxy null && \
    npm config delete proxy && \
    npm config delete https-proxy

# 安装必要的系统依赖
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    sqlite

# 复制 package 文件
COPY package*.json ./

# 安装所有依赖（包括 devDependencies，用于编译）
RUN npm install --legacy-peer-deps

# 复制后端代码和配置
COPY server/ ./server/
COPY shared/ ./shared/
COPY tsconfig.server.json ./

# 编译后端 TypeScript
RUN npm run server:build

# 从构建阶段复制前端文件到 dist 目录（与后端编译输出同级）
# 这样后端的 path.join(__dirname, '../') 可以正确访问前端文件
COPY --from=frontend-builder /app/dist ./dist

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
CMD ["node", "dist/server/index.js"]