# 构建阶段
FROM node:20-alpine AS builder

WORKDIR /app

# 复制 package 文件
COPY package*.json ./

# 安装依赖（包含 devDependencies 用于构建）
RUN npm ci

# 复制源代码
COPY . .

# 构建前端和后端
RUN npm run build && npm run server:build

# 生产阶段
FROM node:20-alpine

WORKDIR /app

# 复制构建产物和必要文件
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

# 暴露端口
EXPOSE 3000

# 启动服务
CMD ["node", "dist/server/server/index.js"]