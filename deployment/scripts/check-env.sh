#!/bin/bash

# 环境检查脚本
# 检查部署所需的所有环境和依赖

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# 日志函数
log_info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

log_success() {
    echo -e "${GREEN}✓${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

log_error() {
    echo -e "${RED}✗${NC} $1"
}

# 检查命令是否存在
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# 获取版本号
get_version() {
    $1 --version 2>/dev/null | head -n1 || echo "Unknown"
}

# 比较版本号
version_ge() {
    printf '%s\n%s' "$2" "$1" | sort -V -C
}

echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║           环境检查 - Environment Check                     ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# 检查操作系统
log_info "检查操作系统..."
OS=$(uname -s)
case "$OS" in
    Darwin*) OS_NAME="macOS" ;;
    Linux*) OS_NAME="Linux" ;;
    MINGW*|MSYS*) OS_NAME="Windows" ;;
    *) OS_NAME="Unknown" ;;
esac
log_success "操作系统: $OS_NAME ($OS)"

echo ""

# 检查 Node.js
log_info "检查 Node.js..."
if command_exists node; then
    NODE_VERSION=$(get_version node)
    NODE_MAJOR=$(echo $NODE_VERSION | cut -d'v' -f2 | cut -d'.' -f1)
    
    if [ "$NODE_MAJOR" -ge 18 ]; then
        log_success "Node.js: $NODE_VERSION"
    else
        log_warning "Node.js 版本过低: $NODE_VERSION (需要 >= 18.0.0)"
    fi
else
    log_error "未安装 Node.js"
    echo "  访问 https://nodejs.org 下载安装"
fi

# 检查 npm
log_info "检查 npm..."
if command_exists npm; then
    NPM_VERSION=$(get_version npm)
    NPM_MAJOR=$(echo $NPM_VERSION | cut -d'.' -f1)
    
    if [ "$NPM_MAJOR" -ge 9 ]; then
        log_success "npm: $NPM_VERSION"
    else
        log_warning "npm 版本过低: $NPM_VERSION (需要 >= 9.0.0)"
        log_info "  运行 'npm install -g npm' 升级"
    fi
else
    log_error "未安装 npm"
fi

# 检查 Git（可选）
log_info "检查 Git..."
if command_exists git; then
    GIT_VERSION=$(get_version git)
    log_success "Git: $GIT_VERSION"
else
    log_warning "未安装 Git（可选，用于版本控制）"
fi

echo ""

# 检查项目文件
log_info "检查项目文件..."

files_to_check=(
    "package.json"
    "tsconfig.json"
    "src"
    "server"
    "scripts"
)

for file in "${files_to_check[@]}"; do
    if [ -e "$file" ]; then
        log_success "$file"
    else
        log_error "$file 不存在"
    fi
done

echo ""

# 检查依赖安装
log_info "检查依赖安装..."
if [ -d "node_modules" ]; then
    log_success "node_modules 已安装"
    DEPS_COUNT=$(ls node_modules | wc -l)
    log_info "  已安装 $DEPS_COUNT 个依赖"
else
    log_warning "node_modules 未安装，请运行 'npm install'"
fi

echo ""

# 检查数据库
log_info "检查数据库..."
if [ -f "server/db/autotest.db" ]; then
    log_success "数据库文件存在"
    DB_SIZE=$(du -h server/db/autotest.db | cut -f1)
    log_info "  数据库大小: $DB_SIZE"
else
    log_warning "数据库文件不存在，请运行 'npm run db:init'"
fi

echo ""

# 检查磁盘空间
log_info "检查磁盘空间..."
if [ "$OS_NAME" = "macOS" ] || [ "$OS_NAME" = "Linux" ]; then
    DISK_USAGE=$(df -h . | tail -n1 | awk '{print $5}')
    DISK_AVAILABLE=$(df -h . | tail -n1 | awk '{print $4}')
    log_success "磁盘使用率: $DISK_USAGE"
    log_info "  可用空间: $DISK_AVAILABLE"
fi

echo ""

# 检查端口
log_info "检查端口..."
if command_exists lsof; then
    if lsof -i :3000 >/dev/null 2>&1; then
        log_warning "端口 3000 已被占用"
    else
        log_success "端口 3000 可用"
    fi
    
    if lsof -i :5173 >/dev/null 2>&1; then
        log_warning "端口 5173 已被占用"
    else
        log_success "端口 5173 可用"
    fi
else
    log_info "  无法检查端口（需要 lsof 命令）"
fi

echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║                     检查完成                                ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# 建议
log_info "建议："
echo ""
echo "1. 如果所有检查都通过，可以运行："
echo "   bash scripts/setup.sh"
echo ""
echo "2. 如果有警告或错误，请先解决后再部署"
echo ""
echo "3. 更多信息请查看 DEPLOYMENT.md"
echo ""