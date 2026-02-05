# Dockerfile 快速参考指南

## 🚀 快速开始

### 本地构建

```bash
# 标准构建
docker build -f deployment/Dockerfile -t automation-platform:latest .

# 显示构建进度
docker build -f deployment/Dockerfile --progress=plain -t automation-platform:latest .
```

### 本地运行

```bash
# 启动容器
docker run -d \
  --name automation \
  -p 3000:3000 \
  automation-platform:latest

# 查看日志
docker logs -f automation

# 停止容器
docker stop automation
```

---

## 📊 性能对比

```
原方案  vs  新方案
─────────────────────
  800MB      300MB  ⬇️ 62.5%
  5 min      3 min  ⬇️ 40%
  3 阶段     4 阶段  ✅ 更清晰
```

---

## 📁 文件说明

| 文件 | 作用 |
|-----|------|
| `deployment/Dockerfile` | 优化后的多阶段构建文件 |
| `.dockerignore` | 排除不需要的构建文件 |
| `tsconfig.server.json` | 后端编译配置（outDir: ./dist/server） |
| `server/config/dataSource.ts` | 数据库配置（实体路径） |

---

## 🔧 构建阶段说明

### 阶段 1️⃣ : 前端构建

```dockerfile
FROM node:20-alpine AS frontend-builder
# 构建 React 应用 → dist/ 目录
# 输出：index.html、assets/
```

### 阶段 2️⃣ : 后端编译

```dockerfile
FROM node:20-alpine AS backend-builder
# 编译 TypeScript → dist/server/ 目录
# 输出：dist/server/server/、dist/server/shared/
```

### 阶段 3️⃣ : 依赖精简

```dockerfile
FROM node:20-alpine AS prod-dependencies
# npm prune --omit=dev
# 移除 vite、typescript 等
```

### 阶段 4️⃣ : 最终镜像

```dockerfile
FROM node:20-alpine
# 合并前三个阶段的产物
# 启动：node dist/server/index.js
```

---

## 🎯 目录结构

### 构建输出

```
最终镜像 (/app/)
├── dist/
│   ├── server/              ← 后端代码
│   ├── shared/              ← 共享代码
│   ├── index.html           ← 前端入口
│   └── assets/              ← 前端静态资源
├── node_modules/            ← 仅生产依赖
└── package.json
```

---

## 📈 构建缓存策略

| 层级 | 复制顺序 | 变化频率 | 缓存命中率 |
|-----|--------|--------|---------|
| 依赖 | 第一个 | 低 | 95%+ |
| 配置 | 第二个 | 中 | 80%+ |
| 源代码 | 最后 | 高 | 50% |

**效果**：仅改动代码时，npm install 被跳过，节省 1-2 分钟

---

## ✅ 验证清单

### 构建完成后检查

```bash
# 检查镜像大小
docker images automation-platform

# 验证镜像内容
docker run --rm automation-platform:latest \
  ls -lh /app/dist/

# 检查依赖大小
docker run --rm automation-platform:latest \
  du -sh /app/node_modules/

# 健康检查
docker run --rm -d -p 3000:3000 automation-platform:latest && \
sleep 2 && \
curl http://localhost:3000/api/health && \
docker kill $(docker ps -q --filter "ancestor=automation-platform:latest")
```

---

## 🐛 常见问题

### Q: 构建时间还是很长？

**A:** 检查缓存是否命中：
```bash
# 添加 --progress 查看每层耗时
docker build --progress=plain -f deployment/Dockerfile -t automation-platform:latest .

# 清除缓存重新构建
docker build --no-cache -f deployment/Dockerfile -t automation-platform:latest .
```

### Q: 镜像大小与预期不符？

**A:** 验证依赖是否被正确精简：
```bash
# 进入镜像检查
docker run -it --rm automation-platform:latest sh

# 在容器内执行
ls -lh /app/node_modules/
du -sh /app/node_modules/
# 应该在 150-200MB 之间
```

### Q: 应用启动失败？

**A:** 检查日志：
```bash
docker run --rm automation-platform:latest
# 看启动错误信息

# 或运行已启动的容器查看日志
docker logs automation
```

### Q: 运行时找不到实体文件？

**A:** 验证数据库配置和实体路径：
```bash
docker run --rm automation-platform:latest \
  find dist -name "*.js" -path "*/entities/*"

# 应该输出类似于：
# dist/server/entities/User.js
# dist/server/entities/TestCase.js
```

---

## 🔐 生产部署

### 启用非 root 用户（推荐）

编辑 `deployment/Dockerfile`，取消注释：

```dockerfile
# 创建非 root 用户以提高安全性
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    chown -R nodejs:nodejs /app
USER nodejs
```

### 云容器服务部署

#### Aliyun 容器镜像服务

```bash
# 登录
docker login registry.cn-hangzhou.aliyuncs.com

# 构建并推送
docker build -f deployment/Dockerfile \
  -t registry.cn-hangzhou.aliyuncs.com/your-namespace/automation-platform:latest .

docker push registry.cn-hangzhou.aliyuncs.com/your-namespace/automation-platform:latest
```

#### 腾讯云容器镜像服务

```bash
# 登录
docker login ccr.ccs.tencentyun.com

# 构建并推送
docker build -f deployment/Dockerfile \
  -t ccr.ccs.tencentyun.com/your-namespace/automation-platform:latest .

docker push ccr.ccs.tencentyun.com/your-namespace/automation-platform:latest
```

---

## 📚 相关命令速查

```bash
# 查看构建历史
docker history automation-platform:latest

# 查看镜像层大小
docker history --human --quiet automation-platform:latest

# 导出镜像
docker save automation-platform:latest -o automation-platform.tar

# 查看容器文件系统大小
docker exec <container_id> du -sh /app

# 进入运行中的容器
docker exec -it <container_id> sh

# 清理未使用的镜像
docker image prune -a

# 查看构建日志（保存）
docker build -f deployment/Dockerfile -t automation-platform:latest . 2>&1 | tee build.log
```

---

## 📖 深入学习

- 详细说明：查看 `DOCKERFILE_OPTIMIZATION.md`
- Docker 最佳实践：https://docs.docker.com/develop/dev-best-practices/
- 多阶段构建：https://docs.docker.com/build/building/multi-stage/

