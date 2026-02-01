#!/bin/bash

# 自动化测试平台部署脚本
# 用途: 快速部署应用到 Docker 环境
# 使用方式: ./deploy.sh [options]

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 打印带颜色的消息
print_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 显示帮助信息
show_help() {
    cat << EOF
自动化测试平台部署脚本

用法:
    ./deploy.sh [选项]

选项:
    -h, --help              显示此帮助信息
    -m, --mode MODE         部署模式: simple（仅应用） | full（应用+数据库） | prod（生产环境）
    -b, --build             重新构建镜像
    -d, --down              停止并删除容器
    -l, --logs              显示日志
    --check                 检查配置文件和环境
    --backup                备份数据库（仅 full 模式）

示例:
    # 快速启动（连接外部数据库）
    ./deploy.sh -m simple

    # 完整部署（包含数据库）
    ./deploy.sh -m full -b

    # 生产环境部署
    ./deploy.sh -m prod -b

    # 查看日志
    ./deploy.sh -l

    # 停止服务
    ./deploy.sh -d

EOF
}

# 检查 Docker 是否安装
check_docker() {
    if ! command -v docker &> /dev/null; then
        print_error "Docker 未安装，请先安装 Docker"
        exit 1
    fi
    
    if ! command -v docker-compose &> /dev/null; then
        print_error "Docker Compose 未安装，请先安装 Docker Compose"
        exit 1
    fi
    
    print_info "Docker 环境检查通过"
}

# 检查配置文件
check_config() {
    local env_file="$1"
    
    if [ ! -f "$env_file" ]; then
        print_error "配置文件 $env_file 不存在"
        print_warn "请复制 .env.example 并填写配置："
        echo "    cp .env.example $env_file"
        echo "    vim $env_file"
        exit 1
    fi
    
    # 检查关键配置项
    if ! grep -q "DB_HOST=" "$env_file" || grep -q "DB_HOST=your-database-host.com" "$env_file"; then
        print_error "数据库配置未正确填写"
        print_warn "请编辑 $env_file 并填写真实的数据库信息"
        exit 1
    fi
    
    print_info "配置文件检查通过"
}

# 构建镜像
build_image() {
    print_info "开始构建 Docker 镜像..."
    cd ..
    docker build -t automation-platform:latest -f deployment/Dockerfile .
    cd deployment
    print_info "镜像构建完成"
}

# 启动服务 - 简单模式（仅应用，连接外部数据库）
deploy_simple() {
    print_info "使用简单模式部署（连接外部数据库）"
    
    check_config ".env.production"
    
    docker-compose -f docker-compose.simple.yml --env-file .env.production up -d
    
    print_info "应用已启动"
    print_info "访问地址: http://localhost:3000"
    print_warn "请确保外部数据库可访问"
}

# 启动服务 - 完整模式（应用 + 数据库）
deploy_full() {
    print_info "使用完整模式部署（包含数据库）"
    
    if [ ! -f ".env" ]; then
        print_warn "未找到 .env 文件，使用默认配置"
        cp .env.example .env
        print_warn "请修改 .env 中的密码配置"
    fi
    
    docker-compose -f docker-compose.full.yml up -d
    
    print_info "所有服务已启动"
    print_info "应用地址: http://localhost:3000"
    print_info "数据库地址: localhost:3306"
    print_info "Redis 地址: localhost:6379"
}

# 启动服务 - 生产模式
deploy_prod() {
    print_info "使用生产模式部署"
    
    check_config ".env.production"
    
    docker-compose -f docker-compose.prod.yml --env-file .env.production up -d
    
    print_info "生产环境已启动"
}

# 停止服务
stop_services() {
    print_info "停止服务..."
    
    if [ -f "docker-compose.simple.yml" ]; then
        docker-compose -f docker-compose.simple.yml down
    fi
    
    if [ -f "docker-compose.full.yml" ]; then
        docker-compose -f docker-compose.full.yml down
    fi
    
    if [ -f "docker-compose.prod.yml" ]; then
        docker-compose -f docker-compose.prod.yml down
    fi
    
    print_info "服务已停止"
}

# 查看日志
show_logs() {
    print_info "显示应用日志..."
    
    if docker ps | grep -q "automation-platform-app"; then
        docker logs -f automation-platform-app
    else
        print_error "容器未运行"
        exit 1
    fi
}

# 备份数据库
backup_database() {
    print_info "备份数据库..."
    
    local timestamp=$(date +%Y%m%d_%H%M%S)
    local backup_file="backup_${timestamp}.sql"
    
    if docker ps | grep -q "automation-mariadb"; then
        docker exec automation-mariadb mysqldump \
            -u root \
            -p"${DB_ROOT_PASSWORD:-root_password_change_me}" \
            "${DB_NAME:-autotest}" > "$backup_file"
        
        print_info "数据库已备份到: $backup_file"
    else
        print_error "数据库容器未运行"
        exit 1
    fi
}

# 检查服务状态
check_status() {
    print_info "检查服务状态..."
    
    docker ps -a | grep -E "automation|CONTAINER"
    
    echo ""
    print_info "健康检查..."
    
    if curl -f http://localhost:3000/api/health &> /dev/null; then
        print_info "✓ 应用健康检查通过"
    else
        print_warn "✗ 应用健康检查失败"
    fi
}

# 主函数
main() {
    # 切换到脚本所在目录
    cd "$(dirname "$0")"
    
    # 检查 Docker 环境
    check_docker
    
    # 解析参数
    MODE="simple"
    BUILD=false
    DOWN=false
    LOGS=false
    CHECK=false
    BACKUP=false
    
    while [[ $# -gt 0 ]]; do
        case $1 in
            -h|--help)
                show_help
                exit 0
                ;;
            -m|--mode)
                MODE="$2"
                shift 2
                ;;
            -b|--build)
                BUILD=true
                shift
                ;;
            -d|--down)
                DOWN=true
                shift
                ;;
            -l|--logs)
                LOGS=true
                shift
                ;;
            --check)
                CHECK=true
                shift
                ;;
            --backup)
                BACKUP=true
                shift
                ;;
            *)
                print_error "未知参数: $1"
                show_help
                exit 1
                ;;
        esac
    done
    
    # 执行操作
    if [ "$DOWN" = true ]; then
        stop_services
        exit 0
    fi
    
    if [ "$LOGS" = true ]; then
        show_logs
        exit 0
    fi
    
    if [ "$CHECK" = true ]; then
        check_status
        exit 0
    fi
    
    if [ "$BACKUP" = true ]; then
        backup_database
        exit 0
    fi
    
    # 构建镜像
    if [ "$BUILD" = true ]; then
        build_image
    fi
    
    # 部署服务
    case $MODE in
        simple)
            deploy_simple
            ;;
        full)
            deploy_full
            ;;
        prod)
            deploy_prod
            ;;
        *)
            print_error "未知的部署模式: $MODE"
            print_warn "支持的模式: simple, full, prod"
            exit 1
            ;;
    esac
    
    # 等待服务启动
    print_info "等待服务启动..."
    sleep 5
    
    # 检查状态
    check_status
    
    print_info "部署完成！"
}

# 运行主函数
main "$@"
