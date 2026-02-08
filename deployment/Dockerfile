# 多阶段构建优化版 - 自动化测试平台
# Multi-stage optimized build - Automation Platform

# ============================================================================
# 阶段 1: 前端构建
# ============================================================================
FROM node:20-alpine AS frontend-builder

WORKDIR /app

# 清理 npm 缓存配置（避免代理问题）
RUN npm config set proxy null && \
    npm config set https-proxy null && \
    npm config delete proxy && \
    npm config delete https-proxy

# 设置构建环境变量
ENV VITE_NODE_ENV=production

# 复制依赖声明文件（最先复制，利用 Docker 缓存）
COPY package*.json ./

# 安装所有依赖（包括 devDependencies，前端构建需要 vite）
RUN npm ci --prefer-offline --no-audit 2>&1 | grep -v "^npm notice"

# 复制构建配置
COPY tsconfig.json vite.config.ts index.html ./
COPY configs/ ./configs/

# 复制前端和共享源代码
COPY src/ ./src/
COPY shared/ ./shared/

# 构建前端产物
RUN npm run build && \
    # 验证构建产物
    test -f dist/index.html && test -d dist/assets || exit 1


# ============================================================================
# 阶段 2: 后端编译
# ============================================================================
FROM node:20-alpine AS backend-builder

WORKDIR /app

# 清理 npm 缓存配置
RUN npm config set proxy null && \
    npm config set https-proxy null && \
    npm config delete proxy && \
    npm config delete https-proxy

# 复制依赖声明文件
COPY package*.json ./

# 安装所有依赖（包括 devDependencies，后端编译需要 typescript）
RUN npm ci --prefer-offline --no-audit 2>&1 | grep -v "^npm notice"

# 复制后端源代码和配置
COPY tsconfig.server.json ./
COPY server/ ./server/
COPY shared/ ./shared/

# 编译 TypeScript 后端代码
# 注意：tsconfig.server.json 中 outDir 为 ./dist/server
# 编译后会生成 dist/server/server/ 和 dist/server/shared/ 的嵌套结构
RUN npm run server:build && \
    # 验证编译产物
    test -d dist/server || exit 1


# ============================================================================
# 阶段 3: 生产依赖精简
# ============================================================================
FROM node:20-alpine AS prod-dependencies

WORKDIR /app

# 清理 npm 缓存配置
RUN npm config set proxy null && \
    npm config set https-proxy null && \
    npm config delete proxy && \
    npm config delete https-proxy

# 复制依赖声明文件
COPY package*.json ./

# 安装所有依赖
RUN npm ci --prefer-offline --no-audit 2>&1 | grep -v "^npm notice"

# 删除开发依赖（不需要 vite、typescript、vitest 等）
RUN npm prune --omit=dev --no-audit 2>&1 | grep -v "^npm notice"


# ============================================================================
# 阶段 4: 最终运行时镜像（超小化）
# ============================================================================
FROM node:20-alpine

WORKDIR /app

# 设置生产环境
ENV NODE_ENV=production \
    PORT=3000

# 从后端编译阶段复制编译好的代码（结构为 dist/server/server 和 dist/server/shared）
COPY --from=backend-builder /app/dist/server/server ./dist/server/
COPY --from=backend-builder /app/dist/server/shared ./dist/shared/

# 从前端构建阶段复制前端产物到 dist 目录
# 这样后端在提供静态资源时可以访问到：/app/dist/assets、/app/dist/index.html
COPY --from=frontend-builder /app/dist/assets ./dist/assets/
COPY --from=frontend-builder /app/dist/index.html ./dist/index.html

# 从生产依赖阶段复制精简后的 node_modules
COPY --from=prod-dependencies /app/node_modules ./node_modules

# 复制 package.json（某些包可能需要读取）
COPY package.json ./

# 创建非 root 用户以提高安全性（可选但推荐）
# RUN addgroup -g 1001 -S nodejs && \
#     adduser -S nodejs -u 1001 && \
#     chown -R nodejs:nodejs /app
# USER nodejs

# 暴露端口
EXPOSE 3000

# 健康检查
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1

# 启动应用（运行预编译的 JavaScript）
CMD ["node", "dist/server/index.js"]
