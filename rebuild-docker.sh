#!/bin/bash

# Docker 完整重建脚本
# 用于彻底清理缓存并重新构建

set -e

echo "=========================================="
echo "Docker 完整重建脚本"
echo "=========================================="

PROJECT_DIR="/root/Automation_Platform"
COMPOSE_FILE="$PROJECT_DIR/deployment/docker-compose.simple.yml"
DOCKERFILE="$PROJECT_DIR/deployment/Dockerfile"
ENV_FILE="$PROJECT_DIR/deployment/.env.production"

cd "$PROJECT_DIR"

echo ""
echo "[1] 停止所有容器..."
docker-compose -f "$COMPOSE_FILE" down || true

echo ""
echo "[2] 删除旧容器（如果存在）..."
docker rm -f automation-platform-app || true

echo ""
echo "[3] 删除旧镜像..."
docker rmi -f automation-platform:latest || true

echo ""
echo "[4] 清理 Docker 构建缓存..."
docker builder prune -a -f

echo ""
echo "[5] 重新构建镜像（禁用缓存）..."
docker build --no-cache -f "$DOCKERFILE" -t automation-platform:latest .

echo ""
echo "[6] 验证镜像..."
docker images | grep automation-platform

echo ""
echo "[7] 启动容器..."
docker-compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d

echo ""
echo "[8] 等待容器启动..."
sleep 10

echo ""
echo "[9] 检查容器状态..."
docker ps -a | grep automation-platform-app

echo ""
echo "[10] 检查日志..."
echo "日志输出（最后 30 行）："
docker logs --tail 30 automation-platform-app 2>&1 || echo "无法获取日志"

echo ""
echo "[11] 测试连接..."
if timeout 5 curl -s http://localhost:3000/api/health > /dev/null 2>&1; then
    echo "✓ localhost:3000 可以访问"
else
    echo "✗ localhost:3000 无法访问，正在等待..."
    sleep 20
    docker logs --tail 50 automation-platform-app 2>&1
fi

echo ""
echo "=========================================="
echo "重建完成！"
echo "=========================================="
