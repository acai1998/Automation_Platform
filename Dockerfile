# ========================================
# 阶段 1: 构建阶段
# ========================================
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

# ========================================
# 阶段 2: 生产阶段
# ========================================
FROM node:20-alpine AS production

WORKDIR /app

# 设置生产环境
ENV NODE_ENV=production

# 复制构建产物和必要文件
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

# 暴露端口
EXPOSE 3000

# 健康检查
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1

# 启动服务
CMD ["node", "dist/server/server/index.js"]

# ========================================
# 阶段 3: 开发阶段（可选）
# ========================================
FROM node:20-alpine AS development

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .

ENV NODE_ENV=development

EXPOSE 3000 5173

CMD ["npm", "run", "start"]
