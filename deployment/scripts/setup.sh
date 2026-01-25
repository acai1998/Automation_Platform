#!/bin/bash

# 自动化测试平台 - 快速部署脚本
# 该脚本自动完成所有部署步骤

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 日志函数
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 检查命令是否存在
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# 获取操作系统
get_os() {
    case "$(uname -s)" in
        Darwin*) echo "macOS" ;;
        Linux*) echo "Linux" ;;
        MINGW*|MSYS*) echo "Windows" ;;
        *) echo "Unknown" ;;
    esac
}

# 环境变量配置向导
setup_environment() {
    log_info "配置环境变量..."
    echo ""
    
    # 检查 .env 文件是否存在
    if [ -f ".env" ]; then
        log_success ".env 文件已存在，跳过环境配置"
        echo ""
        return 0
    fi
    
    # 检查 .env.example 是否存在
    if [ ! -f ".env.example" ]; then
        log_error ".env.example 模板文件不存在"
        echo "请确保项目完整，或手动创建 .env 文件"
        exit 1
    fi
    
    log_info "检测到这是首次配置，需要设置数据库连接信息"
    echo ""
    echo "请输入数据库连接信息（按 Enter 使用默认值）："
    echo "════════════════════════════════════════"
    
    # 询问数据库主机
    read -p "数据库主机地址 [localhost]: " DB_HOST
    DB_HOST=${DB_HOST:-localhost}
    
    # 询问数据库端口
    read -p "数据库端口 [3306]: " DB_PORT
    DB_PORT=${DB_PORT:-3306}
    
    # 询问数据库用户名
    read -p "数据库用户名 [root]: " DB_USER
    DB_USER=${DB_USER:-root}
    
    # 询问数据库密码（隐藏输入）
    read -s -p "数据库密码: " DB_PASSWORD
    echo ""
    
    # 询问数据库名称
    read -p "数据库名称 [autotest]: " DB_NAME
    DB_NAME=${DB_NAME:-autotest}
    
    echo ""
    echo "════════════════════════════════════════"
    
    # 生成 .env 文件
    log_info "生成 .env 文件..."
    
    cp .env.example .env
    
    # 更新数据库配置
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        sed -i '' "s|DB_HOST=.*|DB_HOST=$DB_HOST|" .env
        sed -i '' "s|DB_PORT=.*|DB_PORT=$DB_PORT|" .env
        sed -i '' "s|DB_USER=.*|DB_USER=$DB_USER|" .env
        sed -i '' "s|DB_PASSWORD=.*|DB_PASSWORD=$DB_PASSWORD|" .env
        sed -i '' "s|DB_NAME=.*|DB_NAME=$DB_NAME|" .env
    else
        # Linux
        sed -i "s|DB_HOST=.*|DB_HOST=$DB_HOST|" .env
        sed -i "s|DB_PORT=.*|DB_PORT=$DB_PORT|" .env
        sed -i "s|DB_USER=.*|DB_USER=$DB_USER|" .env
        sed -i "s|DB_PASSWORD=.*|DB_PASSWORD=$DB_PASSWORD|" .env
        sed -i "s|DB_NAME=.*|DB_NAME=$DB_NAME|" .env
    fi
    
    log_success ".env 文件创建成功"
    echo ""
    log_info "配置摘要："
    echo "  数据库主机: $DB_HOST"
    echo "  数据库端口: $DB_PORT"
    echo "  数据库名称: $DB_NAME"
    echo "  数据库用户: $DB_USER"
    echo "  数据库密码: ********"
    echo ""
}

# 欢迎信息
echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║     自动化测试平台 - 快速部署脚本                          ║"
echo "║     Automation Platform - Quick Setup Script               ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# 检查 Node.js
log_info "检查 Node.js 环境..."

if command_exists node; then
    NODE_VERSION=$(node --version)
    log_success "Node.js 已安装: $NODE_VERSION"
    
    # 检查版本
    NODE_MAJOR=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$NODE_MAJOR" -lt 18 ]; then
        log_warning "Node.js 版本过低，建议升级到 18.0.0 或更高版本"
    fi
else
    log_error "未检测到 Node.js，请先安装 Node.js 18.0.0 或更高版本"
    echo ""
    echo "访问 https://nodejs.org 下载安装"
    echo ""
    exit 1
fi

# 检查 npm
log_info "检查 npm 环境..."

if command_exists npm; then
    NPM_VERSION=$(npm --version)
    log_success "npm 已安装: $NPM_VERSION"
else
    log_error "未检测到 npm，请重新安装 Node.js"
    exit 1
fi

echo ""

# 检查项目目录
if [ ! -f "package.json" ]; then
    log_error "当前目录不是项目根目录，请确保在项目根目录运行此脚本"
    exit 1
fi

log_success "检测到项目文件"

echo ""

# 配置环境变量
setup_environment

# 清理旧依赖（可选）
if [ -d "node_modules" ]; then
    read -p "检测到已存在的 node_modules，是否删除并重新安装? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        log_info "删除旧的依赖..."
        rm -rf node_modules package-lock.json
        log_success "已删除"
    fi
fi

echo ""
log_info "安装项目依赖..."
echo "这可能需要几分钟，请耐心等待..."
echo ""

if npm install; then
    log_success "依赖安装完成"
else
    log_error "依赖安装失败"
    log_info "尝试使用 legacy peer deps..."
    if npm install --legacy-peer-deps; then
        log_success "依赖安装完成（使用 legacy peer deps）"
    else
        log_error "依赖安装失败，请检查网络连接"
        exit 1
    fi
fi

echo ""

# 验证安装
log_info "验证安装..."

# 检查关键文件
files_to_check=(
    "package.json"
    "tsconfig.json"
    "src"
    "server"
    "node_modules"
    ".env"
)

all_ok=true
for file in "${files_to_check[@]}"; do
    if [ -e "$file" ]; then
        log_success "✓ $file"
    else
        log_warning "✗ $file"
        all_ok=false
    fi
done

echo ""

if [ "$all_ok" = true ]; then
    log_success "所有文件检查通过！"
else
    log_warning "部分文件缺失，但可能不影响正常运行"
fi

echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║                   部署完成！                                ║"
echo "║                                                            ║"
echo "║  接下来，您可以运行以下命令启动应用：                      ║"
echo "║                                                            ║"
echo "║  启动前后端（推荐）：                                      ║"
echo "║    npm run start                                           ║"
echo "║                                                            ║"
echo "║  仅启动前端（Vite）：                                      ║"
echo "║    npm run dev                                             ║"
echo "║    访问: http://localhost:5173                             ║"
echo "║                                                            ║"
echo "║  仅启动后端（Express）：                                   ║"
echo "║    npm run server                                          ║"
echo "║    访问: http://localhost:3000                             ║"
echo "║                                                            ║"
echo "║  构建生产版本：                                            ║"
echo "║    npm run build                                           ║"
echo "║                                                            ║"
echo "║  修改数据库配置：                                          ║"
echo "║    编辑 .env 文件并重启服务                                ║"
echo "║                                                            ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""
log_success "部署脚本执行完成！"