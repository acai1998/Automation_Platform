#!/bin/bash

# 自动化平台回滚脚本
# 用途: 回滚应用到之前的版本
# 使用: ./rollback.sh <environment> [version]

set -euo pipefail

# 脚本配置
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_NAME="automation-platform"
LOG_FILE="/var/log/${APP_NAME}/rollback.log"

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
自动化平台回滚脚本

用法:
    $0 <environment> [version]

参数:
    environment    部署环境 (dev|staging|production)
    version        回滚到的版本 (可选，默认为上一个版本)

选项:
    --list         列出可用的回滚版本
    --force        强制回滚，跳过确认
    --no-backup    跳过当前版本备份
    --dry-run      模拟回滚，不实际执行
    -h, --help     显示帮助信息

示例:
    $0 production                    # 回滚到上一版本
    $0 staging 20240115_143022       # 回滚到指定版本
    $0 dev --list                    # 列出可用版本
    $0 production --force            # 强制回滚

回滚策略:
    1. 自动备份当前版本
    2. 停止当前服务
    3. 恢复指定版本的配置和数据
    4. 启动服务
    5. 验证服务状态
    6. 可选的数据库回滚

EOF
}

# 参数解析
parse_arguments() {
    ENVIRONMENT=""
    TARGET_VERSION=""
    LIST_VERSIONS=false
    FORCE_ROLLBACK=false
    NO_BACKUP=false
    DRY_RUN=false

    while [[ $# -gt 0 ]]; do
        case $1 in
            --list)
                LIST_VERSIONS=true
                shift
                ;;
            --force)
                FORCE_ROLLBACK=true
                shift
                ;;
            --no-backup)
                NO_BACKUP=true
                shift
                ;;
            --dry-run)
                DRY_RUN=true
                shift
                ;;
            -h|--help)
                show_help
                exit 0
                ;;
            -*)
                error_exit "未知选项: $1"
                ;;
            *)
                if [[ -z "$ENVIRONMENT" ]]; then
                    ENVIRONMENT="$1"
                elif [[ -z "$TARGET_VERSION" ]]; then
                    TARGET_VERSION="$1"
                else
                    error_exit "多余的参数: $1"
                fi
                shift
                ;;
        esac
    done

    # 验证必需参数
    if [[ -z "$ENVIRONMENT" ]]; then
        show_help
        error_exit "缺少环境参数"
    fi

    # 验证环境
    if [[ ! "$ENVIRONMENT" =~ ^(dev|staging|production)$ ]]; then
        error_exit "无效的环境: $ENVIRONMENT"
    fi
}

# 列出可用的回滚版本
list_available_versions() {
    log "列出可用的回滚版本..."

    local backup_dir="/opt/$APP_NAME/backups"

    if [[ ! -d "$backup_dir" ]]; then
        log_error "备份目录不存在: $backup_dir"
        return 1
    fi

    echo "可用的回滚版本:"
    echo "========================================"

    local versions
    versions=$(find "$backup_dir" -maxdepth 1 -type d -name "20*" | sort -r)

    if [[ -z "$versions" ]]; then
        echo "没有可用的回滚版本"
        return 1
    fi

    local current_version=""
    if [[ -f "$backup_dir/latest_backup.txt" ]]; then
        current_version=$(cat "$backup_dir/latest_backup.txt" | xargs basename)
    fi

    local count=1
    for version_path in $versions; do
        local version
        version=$(basename "$version_path")
        local size
        size=$(du -sh "$version_path" 2>/dev/null | cut -f1)
        local date_info
        date_info=$(date -d "${version:0:8} ${version:9:2}:${version:11:2}:${version:13:2}" "+%Y-%m-%d %H:%M:%S" 2>/dev/null || echo "Unknown")

        local marker=""
        if [[ "$version" == "$current_version" ]]; then
            marker=" (当前备份)"
        fi

        printf "%2d. %s - %s - %s%s\n" "$count" "$version" "$date_info" "$size" "$marker"

        # 显示备份内容概要
        if [[ -f "$version_path/deployment_info.txt" ]]; then
            local info
            info=$(grep "镜像:" "$version_path/deployment_info.txt" 2>/dev/null | head -1)
            if [[ -n "$info" ]]; then
                echo "    $info"
            fi
        fi

        count=$((count + 1))
    done

    echo "========================================"
    return 0
}

# 选择回滚版本
select_rollback_version() {
    local backup_dir="/opt/$APP_NAME/backups"

    if [[ -n "$TARGET_VERSION" ]]; then
        # 验证指定版本是否存在
        if [[ ! -d "$backup_dir/$TARGET_VERSION" ]]; then
            error_exit "指定的版本不存在: $TARGET_VERSION"
        fi
        ROLLBACK_VERSION="$TARGET_VERSION"
    else
        # 自动选择上一个版本
        local versions
        versions=$(find "$backup_dir" -maxdepth 1 -type d -name "20*" | sort -r | head -2)

        local version_count
        version_count=$(echo "$versions" | wc -l)

        if [[ $version_count -lt 2 ]]; then
            error_exit "没有足够的版本可供回滚"
        fi

        # 选择第二新的版本（跳过最新的，因为那可能是当前版本）
        ROLLBACK_VERSION=$(echo "$versions" | tail -1 | xargs basename)
    fi

    log "选择的回滚版本: $ROLLBACK_VERSION"
    return 0
}

# 确认回滚操作
confirm_rollback() {
    if [[ "$FORCE_ROLLBACK" == "true" ]]; then
        log "强制回滚模式，跳过确认"
        return 0
    fi

    echo ""
    echo "========================================"
    echo "⚠️  回滚确认"
    echo "========================================"
    echo "环境: $ENVIRONMENT"
    echo "回滚版本: $ROLLBACK_VERSION"
    echo "当前时间: $(date)"
    echo ""
    echo "此操作将:"
    echo "1. 停止当前运行的服务"
    echo "2. 恢复到指定版本的配置"
    echo "3. 重新启动服务"
    echo "4. 可能需要数据库回滚"
    echo ""
    echo "注意: 这可能会导致数据丢失！"
    echo "========================================"

    read -p "确认执行回滚操作? (yes/no): " -r
    if [[ ! $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
        log "用户取消回滚操作"
        exit 0
    fi

    log "用户确认执行回滚操作"
}

# 备份当前版本
backup_current_version() {
    if [[ "$NO_BACKUP" == "true" ]]; then
        log "跳过当前版本备份"
        return 0
    fi

    log "备份当前版本..."

    local backup_dir="/opt/$APP_NAME/backups/rollback_$(date +%Y%m%d_%H%M%S)"
    mkdir -p "$backup_dir"

    cd /opt/"$APP_NAME"

    # 备份配置文件
    if [[ -f ".env" ]]; then
        cp ".env" "$backup_dir/"
        log "已备份环境配置"
    fi

    if [[ -f "docker-compose.yml" ]]; then
        cp "docker-compose.yml" "$backup_dir/"
        log "已备份 Docker Compose 配置"
    fi

    # 备份当前运行的镜像信息
    if docker ps --format "table {{.Image}}" | grep -q "$APP_NAME"; then
        docker ps --format "table {{.Image}}\t{{.Status}}" | grep "$APP_NAME" > "$backup_dir/current_images.txt"
        log "已记录当前镜像版本"
    fi

    # 记录回滚信息
    cat > "$backup_dir/rollback_info.txt" << EOF
回滚时间: $(date)
回滚环境: $ENVIRONMENT
回滚目标版本: $ROLLBACK_VERSION
回滚执行用户: ${USER}
回滚原因: 手动回滚操作
EOF

    log_success "当前版本备份完成: $backup_dir"
}

# 停止当前服务
stop_current_services() {
    log "停止当前服务..."

    cd /opt/"$APP_NAME"

    if [[ "$DRY_RUN" == "true" ]]; then
        log "模拟模式: 将停止 Docker Compose 服务"
        return 0
    fi

    # 停止 Docker Compose 服务
    if [[ -f "docker-compose.yml" ]]; then
        docker-compose down || log_warning "停止服务时出现警告"
        log_success "Docker Compose 服务已停止"
    else
        log_warning "docker-compose.yml 不存在，跳过服务停止"
    fi

    # 等待服务完全停止
    sleep 10

    # 验证服务已停止
    local running_containers
    running_containers=$(docker ps | grep "$APP_NAME" | wc -l)

    if [[ $running_containers -gt 0 ]]; then
        log_warning "仍有 $running_containers 个相关容器在运行"
        docker ps | grep "$APP_NAME" || true
    else
        log_success "所有相关服务已停止"
    fi
}

# 恢复指定版本
restore_version() {
    log "恢复版本: $ROLLBACK_VERSION"

    local backup_path="/opt/$APP_NAME/backups/$ROLLBACK_VERSION"

    if [[ ! -d "$backup_path" ]]; then
        error_exit "备份版本不存在: $backup_path"
    fi

    cd /opt/"$APP_NAME"

    if [[ "$DRY_RUN" == "true" ]]; then
        log "模拟模式: 将恢复以下文件:"
        find "$backup_path" -type f | head -10
        return 0
    fi

    # 恢复环境配置
    if [[ -f "$backup_path/.env" ]]; then
        cp "$backup_path/.env" ".env"
        log_success "已恢复环境配置"
    else
        log_warning "备份中没有找到环境配置文件"
    fi

    # 恢复 Docker Compose 配置
    if [[ -f "$backup_path/docker-compose.yml" ]]; then
        cp "$backup_path/docker-compose.yml" "docker-compose.yml"
        log_success "已恢复 Docker Compose 配置"
    else
        log_warning "备份中没有找到 Docker Compose 配置"
    fi

    # 恢复数据（如果存在）
    if [[ -d "$backup_path/data" ]]; then
        log "恢复应用数据..."
        cp -r "$backup_path/data/"* "data/" 2>/dev/null || log_warning "数据恢复失败"
        log_success "应用数据已恢复"
    fi

    # 恢复数据库（如果是本地数据库）
    if [[ -d "$backup_path/db" ]]; then
        log "恢复数据库..."
        rm -rf "data/db" 2>/dev/null || true
        cp -r "$backup_path/db" "data/db"
        log_success "数据库已恢复"
    fi

    log_success "版本恢复完成"
}

# 拉取回滚版本的镜像
pull_rollback_image() {
    log "拉取回滚版本的镜像..."

    local backup_path="/opt/$APP_NAME/backups/$ROLLBACK_VERSION"

    # 从备份信息中获取镜像标签
    local image_tag=""
    if [[ -f "$backup_path/deployment_info.txt" ]]; then
        image_tag=$(grep "镜像:" "$backup_path/deployment_info.txt" | cut -d' ' -f2)
    elif [[ -f "$backup_path/current_images.txt" ]]; then
        image_tag=$(head -1 "$backup_path/current_images.txt" | awk '{print $1}')
    fi

    if [[ -z "$image_tag" ]]; then
        log_warning "无法确定回滚镜像标签，将使用配置文件中的镜像"
        return 0
    fi

    log "回滚镜像标签: $image_tag"

    if [[ "$DRY_RUN" == "true" ]]; then
        log "模拟模式: 将拉取镜像 $image_tag"
        return 0
    fi

    # 拉取镜像
    docker pull "$image_tag" || log_warning "镜像拉取失败，可能使用本地缓存"

    # 更新 docker-compose.yml 中的镜像标签
    if [[ -f "docker-compose.yml" ]] && [[ -n "$image_tag" ]]; then
        sed -i.bak "s|image:.*$APP_NAME:.*|image: $image_tag|g" docker-compose.yml
        log_success "已更新 Docker Compose 镜像标签"
    fi
}

# 启动回滚版本的服务
start_rollback_services() {
    log "启动回滚版本的服务..."

    cd /opt/"$APP_NAME"

    if [[ "$DRY_RUN" == "true" ]]; then
        log "模拟模式: 将启动 Docker Compose 服务"
        return 0
    fi

    # 验证配置文件
    if [[ ! -f "docker-compose.yml" ]]; then
        error_exit "docker-compose.yml 文件不存在"
    fi

    # 验证配置
    docker-compose config >/dev/null || error_exit "Docker Compose 配置验证失败"

    # 启动服务
    docker-compose up -d || error_exit "服务启动失败"

    log_success "回滚版本服务已启动"

    # 等待服务启动
    log "等待服务启动..."
    sleep 30
}

# 验证回滚结果
verify_rollback() {
    log "验证回滚结果..."

    cd /opt/"$APP_NAME"

    if [[ "$DRY_RUN" == "true" ]]; then
        log "模拟模式: 将验证服务状态"
        return 0
    fi

    # 检查容器状态
    local unhealthy_containers
    unhealthy_containers=$(docker-compose ps | grep -v "Up" | grep -v "Name" | wc -l)

    if [[ $unhealthy_containers -gt 0 ]]; then
        log_error "发现 $unhealthy_containers 个不健康的容器"
        docker-compose ps
        return 1
    fi

    log_success "所有容器状态正常"

    # 执行健康检查
    if [[ -f "$SCRIPT_DIR/health-check.sh" ]]; then
        log "执行健康检查..."
        if "$SCRIPT_DIR/health-check.sh" "$ENVIRONMENT" --timeout 120; then
            log_success "健康检查通过"
        else
            log_error "健康检查失败"
            return 1
        fi
    else
        log_warning "健康检查脚本不存在，跳过详细验证"

        # 简单的端点检查
        local max_attempts=12
        local attempt=1

        while [[ $attempt -le $max_attempts ]]; do
            if curl -f -s "http://localhost:3000/api/health" >/dev/null 2>&1; then
                log_success "基本健康检查通过"
                break
            fi

            log "健康检查尝试 $attempt/$max_attempts..."
            sleep 10
            attempt=$((attempt + 1))
        done

        if [[ $attempt -gt $max_attempts ]]; then
            log_error "基本健康检查失败"
            return 1
        fi
    fi

    log_success "回滚验证完成"
    return 0
}

# 记录回滚操作
record_rollback() {
    log "记录回滚操作..."

    local rollback_log="/opt/$APP_NAME/rollback_history.log"

    cat >> "$rollback_log" << EOF
========================================
回滚时间: $(date)
环境: $ENVIRONMENT
回滚版本: $ROLLBACK_VERSION
执行用户: ${USER}
执行结果: 成功
备份位置: $(cat /opt/"$APP_NAME"/backups/latest_backup.txt 2>/dev/null || echo "无")
========================================

EOF

    log_success "回滚操作已记录"
}

# 清理资源
cleanup_rollback() {
    log "清理回滚资源..."

    # 清理临时文件
    rm -f /tmp/rollback_* 2>/dev/null || true

    # 清理旧的 Docker 镜像
    docker image prune -f >/dev/null 2>&1 || true

    # 清理过多的备份
    local max_backups=10
    local backup_count
    backup_count=$(find /opt/"$APP_NAME"/backups -maxdepth 1 -type d -name "20*" | wc -l)

    if [[ $backup_count -gt $max_backups ]]; then
        find /opt/"$APP_NAME"/backups -maxdepth 1 -type d -name "20*" | sort | head -n $((backup_count - max_backups)) | xargs rm -rf
        log "已清理旧备份，保留最新 $max_backups 个"
    fi

    log_success "资源清理完成"
}

# 主函数
main() {
    echo "========================================="
    echo "🔄 自动化平台回滚脚本"
    echo "========================================="

    # 解析参数
    parse_arguments "$@"

    # 创建日志目录
    mkdir -p "$(dirname "$LOG_FILE")"
    touch "$LOG_FILE"

    # 如果是列出版本模式
    if [[ "$LIST_VERSIONS" == "true" ]]; then
        list_available_versions
        exit 0
    fi

    log "开始回滚操作..."
    log "环境: $ENVIRONMENT"
    log "目标版本: ${TARGET_VERSION:-自动选择}"

    # 选择回滚版本
    select_rollback_version

    # 确认回滚操作
    confirm_rollback

    # 备份当前版本
    backup_current_version

    # 停止当前服务
    stop_current_services

    # 恢复指定版本
    restore_version

    # 拉取回滚镜像
    pull_rollback_image

    # 启动回滚服务
    start_rollback_services

    # 验证回滚结果
    if verify_rollback; then
        # 记录回滚操作
        record_rollback

        # 清理资源
        cleanup_rollback

        echo "========================================="
        log_success "🎉 回滚操作成功完成！"
        echo "========================================="
        echo "环境: $ENVIRONMENT"
        echo "回滚版本: $ROLLBACK_VERSION"
        echo "完成时间: $(date)"
        echo "========================================="
    else
        error_exit "回滚验证失败，请检查服务状态"
    fi
}

# 脚本入口
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi