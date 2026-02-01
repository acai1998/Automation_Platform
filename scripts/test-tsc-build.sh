#!/bin/bash

# 测试 TypeScript 编译修复

set -e

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1"
    exit 1
}

warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

echo "========================================"
echo "  TypeScript 编译修复测试"
echo "========================================"

# 停止旧容器
info "停止旧容器..."
docker stop auto_test 2>/dev/null || true
docker rm auto_test 2>/dev/null || true

# 构建新镜像
info "开始构建镜像（这可能需要几分钟）..."
cd /workspace
docker build -f deployment/Dockerfile -t auto-test:tsc-build .

if [ $? -eq 0 ]; then
    info "✅ 镜像构建成功！"

    # 启动容器
    info "启动容器..."
    docker run -d -p 3000:3000 --name auto_test auto-test:tsc-build

    # 等待服务启动
    info "等待服务启动（15秒）..."
    sleep 15

    # 检查容器状态
    if docker ps | grep -q auto_test; then
        info "✅ 容器正在运行"

        # 查看日志
        info "查看应用日志："
        echo "========================================"
        docker logs --tail 50 auto_test
        echo "========================================"

        # 检查健康状态
        if curl -f -s http://localhost:3000/api/health > /dev/null 2>&1; then
            info "✅ 健康检查通过"

            # 测试其他端点
            info "测试 API 端点..."

            if curl -f -s http://localhost:3000/ > /dev/null 2>&1; then
                info "✅ 首页访问成功"
            else
                warn "⚠️ 首页访问失败"
            fi

            echo ""
            echo "========================================"
            echo "  🎉 部署成功！"
            echo "========================================"
            echo "访问地址: http://localhost:3000"
            echo "健康检查: http://localhost:3000/api/health"
            echo "查看日志: docker logs -f auto_test"
            echo "停止容器: docker stop auto_test"
            echo "========================================"

        else
            warn "⚠️ 健康检查失败，查看完整日志："
            docker logs -f auto_test
        fi
    else
        error "❌ 容器启动失败"
        docker logs auto_test
    fi
else
    error "❌ 镜像构建失败"
fi
