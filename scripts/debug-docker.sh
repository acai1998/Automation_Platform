#!/bin/bash

# Docker 构建调试脚本

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
echo "  Docker 构建调试"
echo "========================================"

# 构建镜像但不运行
info "构建调试镜像..."
cd /workspace
docker build -f deployment/Dockerfile -t auto-test:debug . 2>&1 | tail -50

if [ $? -eq 0 ]; then
    info "✅ 镜像构建成功"

    # 启动容器进入调试模式
    info "启动容器进行调试..."
    docker run --rm -it --name debug_container \
        -p 3000:3000 \
        --entrypoint sh \
        auto-test:debug

else
    error "❌ 镜像构建失败"
fi
