#!/bin/bash

# 快速测试 Docker 镜像修复

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
echo "  Docker 镜像修复测试脚本"
echo "========================================"

# 检查是否在运行容器
if docker ps | grep -q auto_test; then
    warn "auto_test 容器正在运行，需要停止"
    info "停止容器..."
    docker stop auto_test
    docker rm auto_test
fi

# 询问用户选择测试方式
echo ""
echo "请选择测试方式:"
echo "1) 使用修复后的 Dockerfile 重新构建（推荐）"
echo "2) 临时修复现有 master 镜像"
echo "3) 仅查看当前 Dockerfile 修改"
echo ""
read -p "请输入选项 (1/2/3): " choice

case $choice in
    1)
        info "使用修复后的 Dockerfile 重新构建..."
        echo ""

        # 停止旧容器
        docker stop auto_test 2>/dev/null || true
        docker rm auto_test 2>/dev/null || true

        # 构建新镜像
        info "开始构建镜像（这可能需要几分钟）..."
        cd /workspace
        docker build -f deployment/Dockerfile -t auto-test:fixed .

        if [ $? -eq 0 ]; then
            info "✅ 镜像构建成功！"

            # 启动容器
            info "启动容器..."
            docker run -d -p 3000:3000 --name auto_test auto-test:fixed

            # 等待服务启动
            info "等待服务启动（10秒）..."
            sleep 10

            # 检查容器状态
            if docker ps | grep -q auto_test; then
                info "✅ 容器正在运行"

                # 检查健康状态
                if curl -f -s http://localhost:3000/api/health > /dev/null 2>&1; then
                    info "✅ 健康检查通过"
                    echo ""
                    echo "========================================"
                    echo "  部署成功！"
                    echo "========================================"
                    echo "访问地址: http://localhost:3000"
                    echo "查看日志: docker logs -f auto_test"
                    echo "停止容器: docker stop auto_test"
                    echo "========================================"
                else
                    warn "⚠️ 健康检查失败，查看日志："
                    docker logs --tail 50 auto_test
                fi
            else
                error "❌ 容器启动失败"
                docker logs auto_test
            fi
        else
            error "❌ 镜像构建失败"
        fi
        ;;

    2)
        info "临时修复现有 master 镜像..."
        echo ""

        # 停止旧容器
        docker stop auto_test 2>/dev/null || true
        docker rm auto_test 2>/dev/null || true

        # 启动保持运行的容器
        info "启动容器..."
        docker run -d -p 3000:3000 --name auto_test \
            crpi-dytkl1o45qyeksph.cn-hangzhou.personal.cr.aliyuncs.com/caijinwei/auto_test:master \
            tail -f /dev/null

        info "安装 tsx（这可能需要几分钟）..."
        docker exec auto_test npm install tsx

        if [ $? -eq 0 ]; then
            info "✅ tsx 安装成功"

            # 停止 tail 进程
            docker exec auto_test pkill tail || true

            # 启动应用
            info "启动应用..."
            docker exec -d auto_test npx tsx server/index.ts

            # 等待服务启动
            info "等待服务启动（10秒）..."
            sleep 10

            # 检查日志
            info "查看最新日志："
            docker logs --tail 30 auto_test

            # 检查健康状态
            if curl -f -s http://localhost:3000/api/health > /dev/null 2>&1; then
                info "✅ 健康检查通过"
                echo ""
                echo "========================================"
                echo "  临时修复成功！"
                echo "========================================"
                echo "访问地址: http://localhost:3000"
                echo "查看日志: docker logs -f auto_test"
                echo "========================================"
                warn "⚠️ 这是临时修复，重新构建镜像后才能持久化"
            else
                warn "⚠️ 健康检查失败，查看完整日志："
                docker logs -f auto_test
            fi
        else
            error "❌ tsx 安装失败"
            docker logs auto_test
        fi
        ;;

    3)
        info "显示 Dockerfile 修改..."
        echo ""
        echo "修复前的启动命令:"
        echo "  ❌ CMD [\"node\", \"--loader\", \"tsx\", \"server/index.ts\"]"
        echo ""
        echo "修复后的启动命令:"
        echo "  ✅ CMD [\"npx\", \"tsx\", \"server/index.ts\"]"
        echo ""
        echo "修复前的 tsx 安装:"
        echo "  ❌ RUN npm ci --only=production"
        echo "  ❌ RUN npm install -g tsx"
        echo ""
        echo "修复后的 tsx 安装:"
        echo "  ✅ RUN npm install tsx"
        echo "  ✅ RUN npm ci --only=production"
        echo ""
        info "详细修复说明请查看: deployment/DOCKERFILE_FIX.md"
        ;;

    *)
        error "无效的选项"
        ;;
esac
