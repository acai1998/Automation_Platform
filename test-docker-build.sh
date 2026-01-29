#!/bin/bash

# 测试 Docker 构建 demo
echo "=== 开始测试 Docker 构建 ==="

# 清理旧镜像
echo "清理旧镜像..."
docker rmi test-build 2>/dev/null || true

# 构建镜像
echo "开始构建..."
docker build -f deployment/Dockerfile -t test-build . 2>&1 | tee build.log

# 检查构建结果
if [ $? -eq 0 ]; then
    echo "✅ 构建成功！"
else
    echo "❌ 构建失败！"
    echo ""
    echo "=== 最后 50 行日志 ==="
    tail -50 build.log
    exit 1
fi
