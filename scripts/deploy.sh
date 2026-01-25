#!/bin/bash

# 自动化平台部署脚本
# 用途: 在远程服务器上部署应用
# 使用: ./deploy.sh <environment> <strategy> <image_tag>

set -euo pipefail

# 脚本配置
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_NAME="automation-platform"
LOG_FILE="/var/log/${APP_NAME}/deploy.log"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 日志函数
log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1" | tee -a "$LOG_FILE"
}

log_success() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] ✅ $1${NC}" | tee -a "$LOG_FILE"
}

log_error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ❌ $1${NC}" | tee -a "$LOG_FILE"
}

log_warning() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] ⚠️ $1${NC}" | tee -a "$LOG_FILE"
}

# 错误处理
error_exit() {
    log_error "$1"
    exit 1
}

# 显示帮助信息
show_help() {
    cat << EOF
自动化平台部署脚本

用法:
    $0 <environment> <strategy> <image_tag>

参数:
    environment    部署环境 (dev|staging|production)
    strategy       部署策略 (rolling|blue-green|recreate)
    image_tag      Docker镜像标签

示例:
    $0 production blue-green myregistry/automation-platform:1.0.0
    $0 dev rolling myregistry/automation-platform:latest

环境变量:
    BACKUP_RETENTION_DAYS    备份保留天数 (默认: 7)
    MAX_ROLLBACK_VERSIONS    最大回滚版本数 (默认: 5)
    HEALTH_CHECK_TIMEOUT     健康检查超时时间 (默认: 300秒)

EOF
}

# 参数验证
validate_params() {
    if [[ $# -ne 3 ]]; then
        show_help
        error_exit "参数数量错误"
    fi

    ENVIRONMENT="$1"
    STRATEGY="$2"
    IMAGE_TAG="$3"

    # 验证环境
    if [[ ! "$ENVIRONMENT" =~ ^(dev|staging|production)$ ]]; then
        error_exit "无效的环境: $ENVIRONMENT"
    fi

    # 验证策略
    if [[ ! "$STRATEGY" =~ ^(rolling|blue-green|recreate)$ ]]; then
        error_exit "无效的部署策略: $STRATEGY"
    fi

    # 验证镜像标签
    if [[ -z "$IMAGE_TAG" ]]; then
        error_exit "镜像标签不能为空"
    fi

    log "部署参数验证通过"
    log "环境: $ENVIRONMENT"
    log "策略: $STRATEGY"
    log "镜像: $IMAGE_TAG"
}

# 环境准备
prepare_environment() {
    log "准备部署环境..."

    # 创建必要的目录
    sudo mkdir -p /opt/"$APP_NAME"/{data,logs,backups,configs}
    sudo mkdir -p /var/log/"$APP_NAME"

    # 设置目录权限
    sudo chown -R "$USER:$USER" /opt/"$APP_NAME"
    sudo chown -R "$USER:$USER" /var/log/"$APP_NAME"

    # 创建日志文件
    mkdir -p "$(dirname "$LOG_FILE")"
    touch "$LOG_FILE"

    # 检查必要的工具
    command -v docker >/dev/null 2>&1 || error_exit "Docker 未安装"
    command -v docker-compose >/dev/null 2>&1 || error_exit "docker-compose 未安装"

    log_success "环境准备完成"
}

# 备份当前版本
backup_current_version() {
    log "备份当前版本..."

    local backup_dir="/opt/$APP_NAME/backups/$(date +%Y%m%d_%H%M%S)"
    mkdir -p "$backup_dir"

    # 备份配置文件
    if [[ -f "/opt/$APP_NAME/.env" ]]; then
        cp "/opt/$APP_NAME/.env" "$backup_dir/"
        log "已备份环境配置"
    fi

    # 备份 docker-compose.yml
    if [[ -f "/opt/$APP_NAME/docker-compose.yml" ]]; then
        cp "/opt/$APP_NAME/docker-compose.yml" "$backup_dir/"
        log "已备份 Docker Compose 配置"
    fi

    # 备份数据库（如果是本地数据库）
    if [[ -d "/opt/$APP_NAME/data/db" ]]; then
        cp -r "/opt/$APP_NAME/data/db" "$backup_dir/"
        log "已备份数据库"
    fi

    # 记录当前运行的镜像版本
    if docker ps --format "table {{.Image}}" | grep -q "$APP_NAME"; then
        docker ps --format "table {{.Image}}\t{{.Status}}" | grep "$APP_NAME" > "$backup_dir/current_images.txt"
        log "已记录当前镜像版本"
    fi

    # 清理旧备份
    local retention_days="${BACKUP_RETENTION_DAYS:-7}"
    find /opt/"$APP_NAME"/backups -type d -mtime +"$retention_days" -exec rm -rf {} + 2>/dev/null || true

    echo "$backup_dir" > /opt/"$APP_NAME"/backups/latest_backup.txt
    log_success "备份完成: $backup_dir"
}

# 拉取新镜像
pull_image() {
    log "拉取新镜像: $IMAGE_TAG"

    # 登录到 Docker 仓库（如果需要）
    if [[ -n "${DOCKER_REGISTRY_USER:-}" ]] && [[ -n "${DOCKER_REGISTRY_PASS:-}" ]]; then
        echo "$DOCKER_REGISTRY_PASS" | docker login "${DOCKER_REGISTRY:-}" -u "$DOCKER_REGISTRY_USER" --password-stdin
    fi

    # 拉取镜像
    docker pull "$IMAGE_TAG" || error_exit "镜像拉取失败"

    log_success "镜像拉取完成"
}

# 更新配置文件
update_configs() {
    log "更新配置文件..."

    cd /opt/"$APP_NAME"

    # 更新 docker-compose.yml 中的镜像标签
    if [[ -f "docker-compose.yml" ]]; then
        # 使用 sed 替换镜像标签
        sed -i.bak "s|image:.*$APP_NAME:.*|image: $IMAGE_TAG|g" docker-compose.yml
        log "已更新 Docker Compose 镜像标签"
    else
        error_exit "docker-compose.yml 文件不存在"
    fi

    # 验证配置文件
    docker-compose config >/dev/null || error_exit "Docker Compose 配置文件验证失败"

    log_success "配置文件更新完成"
}

# 滚动更新部署
deploy_rolling() {
    log "执行滚动更新部署..."

    cd /opt/"$APP_NAME"

    # 滚动更新服务
    docker-compose up -d --no-deps --scale app=2 app || error_exit "启动新容器失败"

    # 等待新容器健康检查通过
    log "等待新容器启动..."
    sleep 30

    # 检查新容器状态
    if ! docker-compose ps app | grep -q "Up"; then
        error_exit "新容器启动失败"
    fi

    # 停止旧容器
    log "停止旧容器..."
    docker-compose up -d --no-deps --scale app=1 app

    log_success "滚动更新部署完成"
}

# 蓝绿部署
deploy_blue_green() {
    log "执行蓝绿部署..."

    cd /opt/"$APP_NAME"

    # 获取当前环境颜色
    local current_color
    if docker-compose ps | grep -q "${APP_NAME}-blue"; then
        current_color="blue"
        new_color="green"
    else
        current_color="green"
        new_color="blue"
    fi

    log "当前环境: $current_color, 新环境: $new_color"

    # 创建新环境的 compose 文件
    cat > "docker-compose-${new_color}.yml" << EOF
version: '3.8'
services:
  app-${new_color}:
    image: ${IMAGE_TAG}
    container_name: ${APP_NAME}-${new_color}
    environment:
      - NODE_ENV=${ENVIRONMENT}
    env_file:
      - .env
    ports:
      - "300${new_color == "green" ? "1" : "2"}:3000"
    volumes:
      - ./data:/app/data
      - ./logs:/app/logs
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
EOF

    # 启动新环境
    docker-compose -f "docker-compose-${new_color}.yml" up -d || error_exit "新环境启动失败"

    # 等待健康检查
    log "等待新环境健康检查..."
    local timeout="${HEALTH_CHECK_TIMEOUT:-300}"
    local count=0
    while [[ $count -lt $timeout ]]; do
        if docker-compose -f "docker-compose-${new_color}.yml" ps app-"${new_color}" | grep -q "healthy"; then
            log_success "新环境健康检查通过"
            break
        fi
        sleep 10
        count=$((count + 10))
    done

    if [[ $count -ge $timeout ]]; then
        log_error "新环境健康检查超时"
        docker-compose -f "docker-compose-${new_color}.yml" down
        error_exit "蓝绿部署失败"
    fi

    # 切换流量（更新 Nginx 配置或负载均衡器）
    switch_traffic "$new_color"

    # 停止旧环境
    log "停止旧环境..."
    if [[ -f "docker-compose-${current_color}.yml" ]]; then
        docker-compose -f "docker-compose-${current_color}.yml" down
    fi

    # 更新主配置文件
    cp "docker-compose-${new_color}.yml" docker-compose.yml

    log_success "蓝绿部署完成"
}

# 切换流量
switch_traffic() {
    local new_color="$1"
    log "切换流量到 $new_color 环境..."

    # 更新 Nginx 配置（如果使用 Nginx）
    if [[ -f "/etc/nginx/sites-available/$APP_NAME" ]]; then
        local new_port
        if [[ "$new_color" == "green" ]]; then
            new_port="3001"
        else
            new_port="3002"
        fi

        # 更新上游服务器配置
        sudo sed -i "s/server localhost:[0-9]*/server localhost:$new_port/" "/etc/nginx/sites-available/$APP_NAME"
        sudo nginx -t && sudo systemctl reload nginx || log_warning "Nginx 配置更新失败"
    fi

    log_success "流量切换完成"
}

# 重建部署
deploy_recreate() {
    log "执行重建部署..."

    cd /opt/"$APP_NAME"

    # 停止所有服务
    docker-compose down || log_warning "停止服务时出现警告"

    # 清理旧镜像（可选）
    docker image prune -f || true

    # 启动新服务
    docker-compose up -d || error_exit "重建部署失败"

    log_success "重建部署完成"
}

# 执行部署
execute_deployment() {
    log "开始执行部署..."

    case "$STRATEGY" in
        "rolling")
            deploy_rolling
            ;;
        "blue-green")
            deploy_blue_green
            ;;
        "recreate")
            deploy_recreate
            ;;
        *)
            error_exit "未知的部署策略: $STRATEGY"
            ;;
    esac

    log_success "部署执行完成"
}

# 部署后验证
post_deploy_verification() {
    log "执行部署后验证..."

    cd /opt/"$APP_NAME"

    # 检查容器状态
    local unhealthy_containers
    unhealthy_containers=$(docker-compose ps | grep -v "Up" | grep -v "Name" | wc -l)

    if [[ $unhealthy_containers -gt 0 ]]; then
        log_error "发现 $unhealthy_containers 个不健康的容器"
        docker-compose ps
        error_exit "部署后验证失败"
    fi

    # 检查服务端点
    local max_attempts=30
    local attempt=1

    while [[ $attempt -le $max_attempts ]]; do
        if curl -f -s "http://localhost:3000/api/health" >/dev/null 2>&1; then
            log_success "健康检查端点响应正常"
            break
        fi

        log "健康检查尝试 $attempt/$max_attempts..."
        sleep 10
        attempt=$((attempt + 1))
    done

    if [[ $attempt -gt $max_attempts ]]; then
        error_exit "健康检查端点验证失败"
    fi

    # 记录部署信息
    cat > /opt/"$APP_NAME"/deployment_info.txt << EOF
部署时间: $(date)
环境: $ENVIRONMENT
策略: $STRATEGY
镜像: $IMAGE_TAG
构建用户: ${BUILD_USER:-unknown}
构建号: ${BUILD_NUMBER:-unknown}
EOF

    log_success "部署后验证完成"
}

# 清理资源
cleanup() {
    log "清理部署资源..."

    # 清理未使用的镜像
    docker image prune -f >/dev/null 2>&1 || true

    # 清理未使用的网络
    docker network prune -f >/dev/null 2>&1 || true

    # 清理未使用的卷
    docker volume prune -f >/dev/null 2>&1 || true

    # 限制回滚版本数量
    local max_versions="${MAX_ROLLBACK_VERSIONS:-5}"
    local backup_count
    backup_count=$(find /opt/"$APP_NAME"/backups -type d -name "20*" | wc -l)

    if [[ $backup_count -gt $max_versions ]]; then
        find /opt/"$APP_NAME"/backups -type d -name "20*" | sort | head -n $((backup_count - max_versions)) | xargs rm -rf
        log "已清理旧备份，保留最新 $max_versions 个版本"
    fi

    log_success "资源清理完成"
}

# 主函数
main() {
    echo "========================================="
    echo "🚀 自动化平台部署脚本"
    echo "========================================="

    # 参数验证
    validate_params "$@"

    # 环境准备
    prepare_environment

    # 备份当前版本
    backup_current_version

    # 拉取新镜像
    pull_image

    # 更新配置
    update_configs

    # 执行部署
    execute_deployment

    # 部署后验证
    post_deploy_verification

    # 清理资源
    cleanup

    echo "========================================="
    log_success "🎉 部署成功完成！"
    echo "========================================="
    echo "环境: $ENVIRONMENT"
    echo "策略: $STRATEGY"
    echo "镜像: $IMAGE_TAG"
    echo "时间: $(date)"
    echo "========================================="
}

# 脚本入口
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi