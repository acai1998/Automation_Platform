#!/bin/bash

# ========================================
# Docker Swarm 自动化部署脚本
# ========================================

set -e

# 脚本配置
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
DEPLOYMENT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# 配置文件
STACK_FILE="$DEPLOYMENT_DIR/docker-stack.yml"
ENV_FILE="$DEPLOYMENT_DIR/.env.swarm"
STACK_NAME="automation-platform"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 日志函数
info() {
    echo -e "${BLUE}[INFO]${NC} $(date '+%Y-%m-%d %H:%M:%S') $*"
}

success() {
    echo -e "${GREEN}[SUCCESS]${NC} $(date '+%Y-%m-%d %H:%M:%S') $*"
}

warn() {
    echo -e "${YELLOW}[WARN]${NC} $(date '+%Y-%m-%d %H:%M:%S') $*"
}

error() {
    echo -e "${RED}[ERROR]${NC} $(date '+%Y-%m-%d %H:%M:%S') $*" >&2
    exit 1
}

# 检查依赖
check_dependencies() {
    info "检查依赖..."

    # 检查 Docker
    if ! command -v docker >/dev/null 2>&1; then
        error "Docker 未安装"
    fi

    # 检查 Docker Swarm
    if ! docker info | grep -q "Swarm: active"; then
        error "Docker Swarm 未初始化，请运行: docker swarm init"
    fi

    # 检查文件
    if [ ! -f "$STACK_FILE" ]; then
        error "Stack 配置文件不存在: $STACK_FILE"
    fi

    if [ ! -f "$ENV_FILE" ]; then
        error "环境配置文件不存在: $ENV_FILE"
    fi

    success "依赖检查通过"
}

# 验证 Docker Secrets
verify_secrets() {
    info "验证 Docker Secrets..."

    local required_secrets=(
        "db_password"
        "jenkins_token"
        "jenkins_api_key"
        "jenkins_jwt_secret"
        "jenkins_signature_secret"
        "jwt_secret"
    )

    local missing_secrets=()

    for secret in "${required_secrets[@]}"; do
        if ! docker secret inspect "$secret" >/dev/null 2>&1; then
            missing_secrets+=("$secret")
        fi
    done

    if [ ${#missing_secrets[@]} -ne 0 ]; then
        error "缺少以下 Docker Secrets: ${missing_secrets[*]}"
        echo
        echo "请先创建 Secrets，参考命令："
        echo "echo 'your_secret_value' | docker secret create secret_name -"
        echo
        echo "或运行 secrets 管理脚本："
        echo "$SCRIPT_DIR/manage-secrets.sh create"
        exit 1
    fi

    success "Docker Secrets 验证通过"
}

# 构建 Docker 镜像
build_image() {
    info "构建 Docker 镜像..."

    cd "$PROJECT_ROOT"

    # 检查是否存在生产 Dockerfile
    if [ -f "$DEPLOYMENT_DIR/Dockerfile.prod" ]; then
        docker build -f "$DEPLOYMENT_DIR/Dockerfile.prod" -t automation-platform:latest .
    else
        docker build -f "$DEPLOYMENT_DIR/Dockerfile" -t automation-platform:latest .
    fi

    success "镜像构建完成"
}

# 部署 Stack
deploy_stack() {
    info "部署 Docker Stack..."

    cd "$DEPLOYMENT_DIR"

    # 加载环境变量
    set -a
    source "$ENV_FILE"
    set +a

    # 部署 Stack
    docker stack deploy -c "$STACK_FILE" "$STACK_NAME"

    success "Stack 部署完成"
}

# 等待服务启动
wait_for_services() {
    info "等待服务启动..."

    local max_attempts=60
    local attempt=1

    while [ $attempt -le $max_attempts ]; do
        local running_services=$(docker stack services "$STACK_NAME" --format "{{.Replicas}}" | grep -c "3/3" || echo "0")
        local total_services=$(docker stack services "$STACK_NAME" --quiet | wc -l)

        if [ "$running_services" -eq "$total_services" ] && [ "$total_services" -gt 0 ]; then
            success "所有服务启动成功"
            return 0
        fi

        info "等待服务启动... (尝试 $attempt/$max_attempts)"
        docker stack services "$STACK_NAME"
        echo
        sleep 5
        attempt=$((attempt + 1))
    done

    warn "服务启动超时，但部署可能仍在进行中"
}

# 健康检查
health_check() {
    info "执行健康检查..."

    local max_attempts=12
    local attempt=1

    while [ $attempt -le $max_attempts ]; do
        if curl -f -s http://localhost:3000/api/health >/dev/null 2>&1; then
            success "应用健康检查通过"
            return 0
        fi

        info "等待应用启动... (尝试 $attempt/$max_attempts)"
        sleep 10
        attempt=$((attempt + 1))
    done

    warn "应用健康检查超时"
}

# 显示部署状态
show_status() {
    info "部署状态:"
    echo
    docker stack services "$STACK_NAME"
    echo
    docker stack ps "$STACK_NAME" --no-trunc
    echo
}

# 显示访问信息
show_access_info() {
    echo
    echo "=========================================="
    success "部署完成！"
    echo "=========================================="
    echo
    echo "访问信息:"
    echo "  应用地址: http://localhost:3000"
    echo "  健康检查: http://localhost:3000/api/health"
    echo "  API 文档: http://localhost:3000/api"
    echo
    echo "管理命令:"
    echo "  查看服务: docker stack services $STACK_NAME"
    echo "  查看日志: docker service logs ${STACK_NAME}_app"
    echo "  扩缩容: docker service scale ${STACK_NAME}_app=5"
    echo "  更新服务: docker service update ${STACK_NAME}_app"
    echo "  删除 Stack: docker stack rm $STACK_NAME"
    echo
    echo "监控命令:"
    echo "  实时日志: docker service logs -f ${STACK_NAME}_app"
    echo "  服务状态: docker service ps ${STACK_NAME}_app"
    echo "  资源使用: docker stats"
    echo
}

# 清理函数
cleanup() {
    if [ $? -ne 0 ]; then
        error "部署失败"
        echo
        echo "故障排查:"
        echo "1. 检查 Docker Swarm 状态: docker info"
        echo "2. 检查 Secrets: docker secret ls"
        echo "3. 检查服务日志: docker service logs ${STACK_NAME}_app"
        echo "4. 检查镜像: docker images automation-platform"
        echo
        echo "清理命令:"
        echo "docker stack rm $STACK_NAME"
        exit 1
    fi
}

# 主函数
main() {
    echo "=========================================="
    info "Docker Swarm 自动化部署"
    echo "=========================================="
    echo

    # 设置错误处理
    trap cleanup EXIT

    # 执行部署步骤
    check_dependencies
    verify_secrets
    build_image
    deploy_stack
    wait_for_services
    health_check
    show_status
    show_access_info

    # 部署成功
    trap - EXIT
}

# 处理命令行参数
case "${1:-}" in
    "help"|"-h"|"--help")
        echo "用法: $0 [选项]"
        echo
        echo "选项:"
        echo "  help, -h, --help    显示帮助信息"
        echo "  status              显示当前部署状态"
        echo "  logs                显示应用日志"
        echo "  scale [数量]        扩缩容服务"
        echo
        exit 0
        ;;
    "status")
        if docker stack services "$STACK_NAME" >/dev/null 2>&1; then
            show_status
        else
            error "Stack '$STACK_NAME' 不存在"
        fi
        exit 0
        ;;
    "logs")
        docker service logs -f "${STACK_NAME}_app"
        exit 0
        ;;
    "scale")
        if [ -z "$2" ]; then
            error "请指定副本数量: $0 scale 3"
        fi
        docker service scale "${STACK_NAME}_app=$2"
        exit 0
        ;;
    "")
        main
        ;;
    *)
        error "未知选项: $1，使用 $0 help 查看帮助"
        ;;
esac