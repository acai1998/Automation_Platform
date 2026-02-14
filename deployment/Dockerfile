# 多阶段构建优化版 - 自动化测试平台
FROM node:20-alpine AS frontend-builder
WORKDIR /app
RUN npm config set proxy null && npm config set https-proxy null && npm config delete proxy && npm config delete https-proxy && npm cache clean --force
ENV VITE_NODE_ENV=production
COPY package*.json ./
RUN npm ci --prefer-offline --no-audit 2>&1 | tail -20 || npm install --verbose
COPY tsconfig.json vite.config.ts index.html ./
COPY configs/ ./configs/
COPY src/ ./src/
COPY shared/ ./shared/
RUN npm run build && test -f dist/index.html && test -d dist/assets || exit 1

FROM node:20-alpine AS backend-builder
WORKDIR /app
RUN npm config set proxy null && npm config set https-proxy null && npm config delete proxy && npm config delete https-proxy && npm cache clean --force
COPY package*.json ./
RUN npm ci --prefer-offline --no-audit 2>&1 | tail -20 || npm install --verbose
COPY tsconfig.server.json ./
COPY server/ ./server/
COPY shared/ ./shared/
RUN npm run server:build && test -d dist/server || exit 1

FROM node:20-alpine AS prod-dependencies
WORKDIR /app
RUN npm config set proxy null && npm config set https-proxy null && npm config delete proxy && npm config delete https-proxy && npm cache clean --force
COPY package*.json ./
RUN npm ci --prefer-offline --no-audit 2>&1 | tail -20 || npm install --verbose
RUN npm prune --omit=dev --no-audit

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=3000
COPY --from=backend-builder /app/dist/server/server ./dist/server/
COPY --from=backend-builder /app/dist/server/shared ./dist/shared/
COPY --from=frontend-builder /app/dist/assets ./dist/assets/
COPY --from=frontend-builder /app/dist/index.html ./dist/index.html
COPY --from=prod-dependencies /app/node_modules ./node_modules
COPY package.json ./
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1
CMD ["node", "-r", "tsconfig-paths/register", "dist/server/index.js"]