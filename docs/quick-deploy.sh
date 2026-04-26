#!/bin/bash

# 快速部署脚本 - 从 CNB 拉取最新镜像并部署

set -e

# 颜色输出
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

PROJECT_DIR="/opt/automation-platform"

print_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

# 检查项目目录
check_project_dir() {
    if [ ! -d "$PROJECT_DIR" ]; then
        echo "错误: 项目目录不存在: $PROJECT_DIR"
        echo "请先运行 sudo bash deploy-setup.sh 进行初始安装"
        exit 1
    fi
}

# 加载环境变量
load_env() {
    if [ -f "$PROJECT_DIR/.env" ]; then
        source "$PROJECT_DIR/.env"
    else
        echo "错误: .env 文件不存在"
        exit 1
    fi
}

# 登录 CNB 制品库
login_registry() {
    print_info "登录 CNB Docker 制品库..."
    echo "$CNB_DOCKER_TOKEN" | docker login docker.cnb.cool -u cnb --password-stdin
}

# 拉取镜像
pull_image() {
    IMAGE_TAG=${1:-latest}
    print_info "拉取镜像: docker.cnb.cool/imacaiy/automation_platform:$IMAGE_TAG"
    docker pull docker.cnb.cool/imacaiy/automation_platform:$IMAGE_TAG
}

# 备份当前版本
backup_current() {
    print_info "备份当前版本..."
    BACKUP_TAG="backup-$(date +%Y%m%d-%H%M%S)"
    docker tag docker.cnb.cool/imacaiy/automation_platform:latest \
        docker.cnb.cool/imacaiy/automation_platform:$BACKUP_TAG || true
    print_info "备份标签: $BACKUP_TAG"
}

# 停止旧容器
stop_container() {
    print_info "停止旧容器..."
    cd "$PROJECT_DIR"
    docker-compose down
}

# 更新镜像标签（如果指定）
update_image_tag() {
    if [ -n "$1" ] && [ "$1" != "latest" ]; then
        print_info "更新镜像标签为: $1"
        sed -i "s|docker.cnb.cool/imacaiy/automation_platform:latest|docker.cnb.cool/imacaiy/automation_platform:$1|g" \
            "$PROJECT_DIR/docker-compose.yml"
    fi
}

# 启动新容器
start_container() {
    print_info "启动新容器..."
    cd "$PROJECT_DIR"
    docker-compose up -d
}

# 等待服务启动
wait_for_service() {
    print_info "等待服务启动..."
    sleep 15
    
    local max_attempts=10
    local attempt=0
    
    while [ $attempt -lt $max_attempts ]; do
        if curl -f http://localhost:3000/api/health > /dev/null 2>&1; then
            print_info "服务启动成功！"
            return 0
        fi
        
        attempt=$((attempt + 1))
        echo "尝试 $attempt/$max_attempts..."
        sleep 3
    done
    
    echo "错误: 服务启动超时"
    return 1
}

# 清理旧镜像
cleanup_old_images() {
    print_info "清理未使用的镜像..."
    docker image prune -f
}

# 显示部署信息
show_info() {
    echo ""
    print_info "=================================="
    print_info "  部署完成！"
    print_info "=================================="
    echo ""
    echo "容器状态:"
    docker ps --filter "name=automation-platform"
    echo ""
    echo "查看日志:"
    echo "  cd $PROJECT_DIR"
    echo "  docker-compose logs -f"
    echo ""
}

# 主函数
main() {
    check_project_dir
    load_env
    
    IMAGE_TAG=${1:-latest}
    
    print_info "开始部署..."
    print_info "镜像标签: $IMAGE_TAG"
    echo ""
    
    login_registry
    pull_image "$IMAGE_TAG"
    backup_current
    stop_container
    update_image_tag "$IMAGE_TAG"
    start_container
    
    if wait_for_service; then
        cleanup_old_images
        show_info
    else
        echo ""
        echo "部署失败，查看日志:"
        cd "$PROJECT_DIR"
        docker-compose logs --tail=50
        exit 1
    fi
}

# 运行主函数
main "$@"
