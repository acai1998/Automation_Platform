# Docker 构建修复验证指南

## 快速测试步骤

### 1. 清理旧的 Docker 镜像和缓存

```bash
# 删除旧镜像
docker rmi automation-platform:latest || true
docker rmi $(docker images -q -f "dangling=true") || true

# 清理 Docker 构建缓存（可选，用于完全重新构建）
docker builder prune -a --force
```

### 2. 构建新镜像

```bash
cd /Users/wb_caijinwei/Automation_Platform
docker build -t automation-platform:latest -f deployment/Dockerfile .
```

**预期结果**: 构建成功完成，没有 TypeScript 缺失错误

### 3. 验证 TypeScript 安装

```bash
# 方法 1: 检查 TypeScript 是否在容器中
docker run --rm automation-platform:latest npm list typescript

# 预期输出:
# automation-platform@1.0.0 /app
# └── typescript@5.3.3
```

### 4. 验证后端编译产物

```bash
# 检查编译后的 JavaScript 是否存在
docker run --rm automation-platform:latest ls -la dist/server/ | head -20
```

### 5. 启动容器并测试应用

```bash
# 启动容器
docker run -d -p 3000:3000 --name test-automation automation-platform:latest

# 等待应用启动
sleep 5

# 测试健康检查端点
curl http://localhost:3000/api/health

# 预期响应:
# {"status":"ok"}  或类似的成功响应

# 查看容器日志
docker logs test-automation

# 停止容器
docker stop test-automation
docker rm test-automation
```

### 6. 完整测试场景

```bash
#!/bin/bash

# 颜色定义
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

echo "=========================================="
echo "Docker 构建修复验证测试"
echo "=========================================="

# 构建镜像
echo -e "\n${GREEN}[1]${NC} 构建 Docker 镜像..."
if docker build -t automation-platform:test -f deployment/Dockerfile . > /tmp/docker-build.log 2>&1; then
    echo -e "${GREEN}✓ 构建成功${NC}"
else
    echo -e "${RED}✗ 构建失败${NC}"
    tail -50 /tmp/docker-build.log
    exit 1
fi

# 验证 TypeScript
echo -e "\n${GREEN}[2]${NC} 验证 TypeScript 安装..."
if docker run --rm automation-platform:test npm list typescript > /tmp/ts-check.log 2>&1; then
    if grep -q "typescript@5.3.3" /tmp/ts-check.log; then
        echo -e "${GREEN}✓ TypeScript 已安装${NC}"
    else
        echo -e "${RED}✗ TypeScript 版本不匹配${NC}"
        cat /tmp/ts-check.log
        exit 1
    fi
else
    echo -e "${RED}✗ 无法检查 TypeScript${NC}"
    cat /tmp/ts-check.log
    exit 1
fi

# 验证后端编译产物
echo -e "\n${GREEN}[3]${NC} 验证后端编译产物..."
if docker run --rm automation-platform:test test -f dist/server/index.js; then
    echo -e "${GREEN}✓ 后端编译产物存在${NC}"
else
    echo -e "${RED}✗ 后端编译产物缺失${NC}"
    exit 1
fi

# 验证前端资源
echo -e "\n${GREEN}[4]${NC} 验证前端资源..."
if docker run --rm automation-platform:test test -f dist/index.html && \
   docker run --rm automation-platform:test test -d dist/assets; then
    echo -e "${GREEN}✓ 前端资源完整${NC}"
else
    echo -e "${RED}✗ 前端资源缺失${NC}"
    exit 1
fi

# 启动容器并测试
echo -e "\n${GREEN}[5]${NC} 启动容器并测试应用..."
docker run -d -p 3000:3000 --name test-app automation-platform:test > /dev/null 2>&1
sleep 3

if curl -s http://localhost:3000/api/health > /tmp/health-check.log 2>&1; then
    echo -e "${GREEN}✓ 应用运行正常${NC}"
    cat /tmp/health-check.log
else
    echo -e "${RED}✗ 健康检查失败${NC}"
    docker logs test-app
    exit 1
fi

# 清理
docker stop test-app > /dev/null 2>&1
docker rm test-app > /dev/null 2>&1
docker rmi automation-platform:test > /dev/null 2>&1

echo -e "\n${GREEN}=========================================="
echo "所有测试通过! ✓"
echo "==========================================${NC}"
```

## 常见问题排查

### Q: npm ci 仍然失败？

**A**: 检查 package-lock.json 是否与 package.json 匹配。运行：

```bash
npm install  # 更新 package-lock.json
git add package-lock.json
git commit -m "Update package-lock.json"
```

然后重新构建镜像。

### Q: TypeScript 仍然缺失？

**A**: 检查 Dockerfile 中的 `|| npm install --verbose` 是否已被添加。使用以下命令验证：

```bash
grep "npm install --verbose" deployment/Dockerfile
# 应该看到 3 行结果
```

### Q: 构建速度很慢？

**A**: 这是因为回退机制可能在执行 `npm install`。这是正常的，后续构建会从 Docker 缓存中受益。

### Q: 镜像大小比预期大？

**A**: 确保 `npm prune --omit=dev` 在生产依赖阶段被正确执行：

```bash
docker run --rm automation-platform:latest npm list --all | wc -l
# 应该只列出生产依赖
```

## 性能基准

| 阶段 | 时间 | 说明 |
|-----|------|------|
| 前端构建 | 60-120s | 取决于依赖安装 |
| 后端编译 | 30-60s | TypeScript 编译 |
| 生产依赖 | 60-120s | 完整安装 + 精简 |
| 总耗时 | ~3-5 分钟 | 首次构建 |

## Docker 构建命令参考

```bash
# 基础构建
docker build -t automation-platform:latest -f deployment/Dockerfile .

# 不使用缓存（完全重新构建）
docker build --no-cache -t automation-platform:latest -f deployment/Dockerfile .

# 显示构建详细过程
docker build --progress=plain -t automation-platform:latest -f deployment/Dockerfile .

# 构建并指定平台（用于跨平台构建）
docker buildx build --platform linux/amd64 -t automation-platform:latest -f deployment/Dockerfile .
```

## 后续改进建议

1. 在 GitHub Actions/GitLab CI 中添加 Docker 构建测试
2. 添加 `.dockerignore` 文件优化上下文大小
3. 考虑使用 docker buildx 构建多平台镜像
4. 定期更新 Node Alpine 基础镜像版本