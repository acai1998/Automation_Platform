#!/bin/bash

# 检查编译输出的脚本

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
echo "  检查 TypeScript 编译输出"
echo "========================================"

# 先在本地测试编译
info "本地测试编译..."

cd /workspace

# 安装依赖（如果需要）
if [ ! -d "node_modules" ]; then
    info "安装依赖..."
    npm install
fi

# 编译 TypeScript
info "编译后端 TypeScript..."
npm run server:build

if [ $? -eq 0 ]; then
    info "✅ 编译成功"

    # 检查输出
    info "编译后的文件结构："
    echo "========================================"
    ls -la dist/
    echo ""
    echo "dist/server/ 目录："
    ls -la dist/server/ | head -20
    echo "========================================"

    # 检查 index.js
    if [ -f "dist/server/index.js" ]; then
        info "✅ 找到 dist/server/index.js"
        info "文件大小："
        du -h dist/server/index.js
        info "文件前几行："
        head -20 dist/server/index.js
    else
        error "❌ 未找到 dist/server/index.js"
        warn "可能的问题："
        warn "1. TypeScript 配置问题"
        warn "2. 源文件路径问题"
        warn "3. 编译错误"
    fi
else
    error "❌ TypeScript 编译失败"
fi
