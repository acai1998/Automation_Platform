#!/bin/sh

# ========================================
# Docker 容器启动脚本
# ========================================

set -e

# 颜色输出函数
info() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') [INFO] $*"
}

warn() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') [WARN] $*" >&2
}

error() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') [ERROR] $*" >&2
    exit 1
}

# 验证 Docker Secrets
validate_secrets() {
    info "验证 Docker Secrets..."

    local secrets_dir="/run/secrets"
    local required_secrets="db_password jenkins_token jenkins_api_key jenkins_jwt_secret jenkins_signature_secret jwt_secret"
    local missing_secrets=""

    for secret in $required_secrets; do
        if [ ! -f "$secrets_dir/$secret" ]; then
            missing_secrets="$missing_secrets $secret"
        else
            # 验证 secret 文件不为空
            if [ ! -s "$secrets_dir/$secret" ]; then
                warn "Secret $secret 文件为空"
            else
                info "✓ Secret $secret 已找到"
            fi
        fi
    done

    if [ -n "$missing_secrets" ]; then
        error "缺少必需的 Docker Secrets:$missing_secrets"
    fi

    info "所有 Docker Secrets 验证通过"
}

# 验证环境变量
validate_environment() {
    info "验证环境变量..."

    local required_vars="NODE_ENV PORT DB_HOST DB_PORT DB_USER DB_NAME JENKINS_URL"
    local missing_vars=""

    for var in $required_vars; do
        if ! eval "[ -n \"\$$var\" ]"; then
            missing_vars="$missing_vars $var"
        fi
    done

    if [ -n "$missing_vars" ]; then
        error "缺少必需的环境变量:$missing_vars"
    fi

    info "环境变量验证通过"
}

# 等待数据库连接
wait_for_database() {
    info "等待数据库连接..."

    local max_attempts=30
    local attempt=1

    while [ $attempt -le $max_attempts ]; do
        if nc -z "$DB_HOST" "$DB_PORT" >/dev/null 2>&1; then
            info "数据库连接成功"
            return 0
        fi

        info "等待数据库连接... (尝试 $attempt/$max_attempts)"
        sleep 2
        attempt=$((attempt + 1))
    done

    error "数据库连接超时"
}

# 检查磁盘空间
check_disk_space() {
    local min_space_mb=100
    local available_mb=$(df /app | awk 'NR==2 {print int($4/1024)}')

    if [ "$available_mb" -lt "$min_space_mb" ]; then
        warn "磁盘空间不足: ${available_mb}MB 可用 (最少需要 ${min_space_mb}MB)"
    else
        info "磁盘空间充足: ${available_mb}MB 可用"
    fi
}

# 设置日志目录权限
setup_logging() {
    info "设置日志目录..."

    if [ ! -d "/app/logs" ]; then
        mkdir -p /app/logs
    fi

    # 确保日志目录可写
    if [ ! -w "/app/logs" ]; then
        error "日志目录不可写: /app/logs"
    fi

    info "日志目录设置完成"
}

# 主函数
main() {
    info "==========================================="
    info "启动自动化测试平台 (生产环境)"
    info "版本: $(cat package.json 2>/dev/null | grep '"version"' | cut -d'"' -f4 || echo 'unknown')"
    info "Node.js: $(node --version)"
    info "用户: $(whoami)"
    info "工作目录: $(pwd)"
    info "==========================================="

    # 验证步骤
    validate_environment
    validate_secrets
    check_disk_space
    setup_logging
    wait_for_database

    info "所有检查通过，启动应用..."

    # 启动应用
    cd /app/server
    exec node index.js
}

# 信号处理
trap 'info "收到停止信号，正在关闭..."; exit 0' TERM INT

# 执行主函数
main "$@"