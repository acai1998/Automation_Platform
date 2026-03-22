# =========================================================
# Stage 1: 构建阶段
# =========================================================
FROM node:20-alpine AS builder

WORKDIR /app

# 优先复制依赖文件，利用 Docker 层缓存
# 只有 package*.json 变化时才重新 npm install
COPY package*.json ./

RUN npm ci --ignore-scripts

# 复制源码（.dockerignore 会排除 node_modules / dist 等）
COPY . .

# 构建前端（输出到 dist/）
RUN npm run build

# 编译后端（输出到 dist/server/）
RUN npm run server:build

# =========================================================
# Stage 2: 生产运行阶段
# =========================================================
FROM node:20-alpine

WORKDIR /app

# 只复制生产依赖（不含 devDependencies）
COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts

# 从构建阶段复制编译产物
COPY --from=builder /app/dist ./dist

EXPOSE 3000

# 启动后端服务（同时静态托管前端 dist/ 目录）
CMD ["node", "dist/server/server/index.js"]
