#!/bin/bash

# 快速测试编译输出

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

echo "========================================"
echo "  快速测试编译输出"
echo "========================================"

# 停止旧容器
docker stop auto_test 2>/dev/null || true
docker rm auto_test 2>/dev/null || true

cd /workspace

# 使用调试版 Dockerfile 构建
info "构建调试镜像..."
docker build -f deployment/Dockerfile.debug -t auto-test:debug .

if [ $? -eq 0 ]; then
    info "✅ 调试镜像构建成功"

    # 启动容器
    info "启动容器..."
    docker run -d --name debug_test -p 3000:3000 auto-test:debug sleep 300

    sleep 3

    # 检查文件
    info "检查容器内的文件结构..."
    docker exec debug_test sh -c "ls -la /app/dist/server/"

    # 检查 index.js
    if docker exec debug_test test -f /app/dist/server/index.js; then
        info "✅ 找到 index.js 文件"
        docker exec debug_test sh -c "ls -lh /app/dist/server/index.js"

        # 尝试运行
        info "尝试运行应用..."
        docker exec debug_test sh -c "cd /app && node dist/server/index.js" &
        APP_PID=$!

        sleep 5

        # 检查进程
        if docker exec debug_test ps | grep -q "node dist/server/index.js"; then
            info "✅ 应用启动成功"

            # 测试健康检查
            sleep 3
            if curl -f -s http://localhost:3000/api/health > /dev/null 2>&1; then
                info "✅ 健康检查通过"
            else
                warn "⚠️ 健康检查失败"
            fi

            # 查看日志
            info "应用日志："
            docker logs --tail 30 debug_test

            # 停止应用
            kill $APP_PID 2>/dev/null || true
        else
            warn "⚠️ 应用启动失败"
            docker logs debug_test
        fi
    else
        error "❌ 未找到 index.js 文件"
    fi

    # 清理
    info "清理容器..."
    docker stop debug_test
    docker rm debug_test

    echo ""
    echo "========================================"
    info "测试完成！"
    echo "========================================"

else
    error "❌ 镜像构建失败"
fi
