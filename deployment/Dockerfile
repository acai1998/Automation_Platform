# 多阶段构建 - 自动化测试平台
# Multi-stage build - Automation Platform

# 阶段 1：构建前端
FROM node:20-alpine AS frontend-builder

WORKDIR /app

# 复制 package 文件
COPY package*.json ./

# 安装所有依赖（包括开发依赖，构建需要）
RUN npm ci

# 复制源代码和配置文件
COPY . .

# 构建前端
RUN npm run build

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

# 仅安装生产依赖
RUN npm ci --only=production

# 安装 tsx 用于运行 TypeScript
RUN npm install -g tsx

# 从构建阶段复制前端文件
COPY --from=frontend-builder /app/dist ./dist

# 复制后端代码
COPY server ./server
COPY shared ./shared
COPY tsconfig.server.json ./

# 创建数据库目录
RUN mkdir -p server/db

# 暴露端口
EXPOSE 3000

# 健康检查
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/api/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

# 启动命令
CMD ["node", "--loader", "tsx", "server/index.ts"]