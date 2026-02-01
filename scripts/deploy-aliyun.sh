#!/bin/bash

# 阿里云镜像部署脚本
# 用于本地或服务器上拉取并部署阿里云镜像

set -e

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 配置变量
ALIYUN_REGISTRY="crpi-dytkl1o45qyeksph.cn-hangzhou.personal.cr.aliyuncs.com"
NAMESPACE="caijinwei"
IMAGE_NAME="auto_test"
DEFAULT_TAG="latest"
DEPLOY_DIR="${DEPLOY_DIR:-/opt/auto-test}"
COMPOSE_FILE="${DEPLOY_DIR}/docker-compose.aliyun.yml"
ENV_FILE="${DEPLOY_DIR}/.env"

# 函数: 打印信息
info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1"
    exit 1
}

# 函数: 检查命令是否存在
check_command() {
    if ! command -v $1 &> /dev/null; then
        error "$1 未安装，请先安装"
    fi
}

# 函数: 登录阿里云容器镜像服务
login_aliyun() {
    info "正在登录阿里云容器镜像服务..."

    if [ -z "$ALIYUN_USERNAME" ] || [ -z "$ALIYUN_PASSWORD" ]; then
        warn "未设置阿里云凭据环境变量，跳过自动登录"
        warn "如果需要拉取私有镜像，请手动登录:"
        warn "  docker login $ALIYUN_REGISTRY"
        return 0
    fi

    echo "$ALIYUN_PASSWORD" | docker login --username="$ALIYUN_USERNAME" --password-stdin "$ALIYUN_REGISTRY"
    info "✅ 阿里云登录成功"
}

# 函数: 拉取镜像
pull_image() {
    local tag=${1:-$DEFAULT_TAG}
    local full_image="${ALIYUN_REGISTRY}/${NAMESPACE}/${IMAGE_NAME}:${tag}"

    info "正在拉取镜像: $full_image"

    if docker pull "$full_image"; then
        info "✅ 镜像拉取成功"
    else
        error "❌ 镜像拉取失败"
    fi

    # 标记为 latest
    if [ "$tag" != "latest" ]; then
        docker tag "$full_image" "${ALIYUN_REGISTRY}/${NAMESPACE}/${IMAGE_NAME}:latest"
        info "已标记为 latest 版本"
    fi

    # 显示镜像信息
    info "镜像信息:"
    docker images | grep "$IMAGE_NAME" || true
}

# 函数: 停止现有服务
stop_services() {
    info "正在停止现有服务..."

    if [ -f "$COMPOSE_FILE" ]; then
        cd "$DEPLOY_DIR"
        docker-compose -f "$COMPOSE_FILE" down
        info "✅ 服务已停止"
    else
        warn "未找到 docker-compose 文件，跳过停止步骤"
    fi
}

# 函数: 创建必要的目录
create_directories() {
    info "创建必要的目录..."

    mkdir -p "$DEPLOY_DIR"/{data,logs,backups,configs}
    mkdir -p /var/log/auto-test

    info "✅ 目录创建完成"
}

# 函数: 准备部署文件
prepare_deploy_files() {
    info "准备部署文件..."

    # 复制 docker-compose 文件
    if [ ! -f "$COMPOSE_FILE" ]; then
        warn "未找到 docker-compose.aliyun.yml，请确保文件存在"
        warn "路径: $COMPOSE_FILE"
        return 1
    fi

    # 准备 .env 文件
    if [ ! -f "$ENV_FILE" ]; then
        if [ -f "${DEPLOY_DIR}/.env.aliyun.example" ]; then
            cp "${DEPLOY_DIR}/.env.aliyun.example" "$ENV_FILE"
            info "已创建 .env 文件，请根据需要编辑配置"
        else
            warn "未找到 .env 文件和示例文件"
        fi
    fi

    info "✅ 部署文件准备完成"
}

# 函数: 启动服务
start_services() {
    local tag=${1:-$DEFAULT_TAG}

    info "正在启动服务..."

    cd "$DEPLOY_DIR"

    # 设置镜像标签环境变量
    export IMAGE_TAG="$tag"

    # 启动服务
    if docker-compose -f "$COMPOSE_FILE" up -d; then
        info "✅ 服务启动成功"
    else
        error "❌ 服务启动失败"
    fi

    # 显示运行状态
    info "服务状态:"
    docker-compose -f "$COMPOSE_FILE" ps
}

# 函数: 健康检查
health_check() {
    local max_retries=30
    local retry=0
    local health_url="http://localhost:3000/api/health"

    info "正在进行健康检查..."

    while [ $retry -lt $max_retries ]; do
        if curl -f -s "$health_url" > /dev/null 2>&1; then
            info "✅ 健康检查通过"
            return 0
        fi

        retry=$((retry + 1))
        echo -n "."
        sleep 2
    done

    echo
    warn "⚠️ 健康检查超时，请检查服务日志"
    warn "查看日志: docker-compose -f $COMPOSE_FILE logs -f app"
}

# 函数: 显示使用帮助
show_help() {
    cat << EOF
阿里云镜像部署脚本

用法: $0 [命令] [选项]

命令:
    pull [tag]     拉取阿里云镜像 (默认: latest)
    deploy [tag]   部署镜像并启动服务
    stop           停止服务
    restart [tag]  重启服务
    status         查看服务状态
    logs           查看服务日志
    health         执行健康检查
    update [tag]   更新到新版本
    help           显示帮助信息

环境变量:
    ALIYUN_USERNAME      阿里云容器镜像服务用户名
    ALIYUN_PASSWORD      阿里云容器镜像服务密码
    DEPLOY_DIR           部署目录 (默认: /opt/auto-test)

示例:
    # 拉取 latest 标签的镜像
    $0 pull latest

    # 部署指定标签的镜像
    $0 deploy master

    # 停止服务
    $0 stop

    # 查看日志
    $0 logs

    # 更新到新版本
    $0 update d42144a

EOF
}

# 函数: 主函数
main() {
    local command=${1:-help}
    local tag=${2:-$DEFAULT_TAG}

    # 检查必要的命令
    check_command docker
    check_command docker-compose

    case $command in
        pull)
            login_aliyun
            pull_image "$tag"
            ;;
        deploy)
            check_command curl
            login_aliyun
            create_directories
            prepare_deploy_files
            stop_services
            pull_image "$tag"
            start_services "$tag"
            health_check
            info "部署完成! 访问: http://localhost:3000"
            ;;
        stop)
            stop_services
            ;;
        restart)
            stop_services
            start_services "$tag"
            health_check
            ;;
        status)
            if [ -f "$COMPOSE_FILE" ]; then
                cd "$DEPLOY_DIR"
                docker-compose -f "$COMPOSE_FILE" ps
            else
                error "未找到 docker-compose 文件"
            fi
            ;;
        logs)
            if [ -f "$COMPOSE_FILE" ]; then
                cd "$DEPLOY_DIR"
                docker-compose -f "$COMPOSE_FILE" logs -f
            else
                error "未找到 docker-compose 文件"
            fi
            ;;
        health)
            health_check
            ;;
        update)
            check_command curl
            login_aliyun
            stop_services
            pull_image "$tag"
            start_services "$tag"
            health_check
            info "更新完成!"
            ;;
        help|*)
            show_help
            ;;
    esac
}

# 执行主函数
main "$@"
