#!/bin/bash

# ========================================
# Docker Swarm Secrets 管理脚本
# ========================================

set -e

# 脚本配置
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
ENV_FILE="$PROJECT_ROOT/.env"

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

# 定义需要管理的 secrets
declare -A SECRETS_MAP=(
    ["db_password"]="DB_PASSWORD"
    ["jenkins_token"]="JENKINS_TOKEN"
    ["jenkins_api_key"]="JENKINS_API_KEY"
    ["jenkins_jwt_secret"]="JENKINS_JWT_SECRET"
    ["jenkins_signature_secret"]="JENKINS_SIGNATURE_SECRET"
    ["jwt_secret"]="JWT_SECRET"
)

# 检查 Docker Swarm
check_swarm() {
    if ! docker info | grep -q "Swarm: active"; then
        error "Docker Swarm 未激活，请运行: docker swarm init"
    fi
}

# 从 .env 文件读取值
read_env_value() {
    local env_var="$1"

    if [ ! -f "$ENV_FILE" ]; then
        error ".env 文件不存在: $ENV_FILE"
    fi

    # 读取环境变量值
    local value=$(grep "^${env_var}=" "$ENV_FILE" | cut -d'=' -f2- | sed 's/^"//' | sed 's/"$//')

    if [ -z "$value" ]; then
        error "在 .env 文件中找不到 $env_var"
    fi

    echo "$value"
}

# 创建单个 secret
create_secret() {
    local secret_name="$1"
    local env_var="${SECRETS_MAP[$secret_name]}"

    if [ -z "$env_var" ]; then
        error "未知的 secret: $secret_name"
    fi

    # 检查 secret 是否已存在
    if docker secret inspect "$secret_name" >/dev/null 2>&1; then
        warn "Secret '$secret_name' 已存在，跳过创建"
        return 0
    fi

    # 从 .env 读取值
    local value=$(read_env_value "$env_var")

    # 创建 secret
    echo "$value" | docker secret create "$secret_name" -
    success "创建 secret: $secret_name"
}

# 创建所有 secrets
create_all_secrets() {
    info "从 .env 文件创建所有 Docker Secrets..."
    echo

    for secret_name in "${!SECRETS_MAP[@]}"; do
        create_secret "$secret_name"
    done

    echo
    success "所有 Secrets 创建完成"
}

# 列出所有 secrets
list_secrets() {
    info "当前 Docker Secrets:"
    echo

    if ! docker secret ls --format "table {{.Name}}\t{{.CreatedAt}}\t{{.UpdatedAt}}" | grep -E "($(IFS='|'; echo "${!SECRETS_MAP[*]}"))" 2>/dev/null; then
        warn "没有找到相关的 Docker Secrets"
    fi
}

# 验证 secrets
verify_secrets() {
    info "验证 Docker Secrets..."
    echo

    local all_exist=true

    for secret_name in "${!SECRETS_MAP[@]}"; do
        if docker secret inspect "$secret_name" >/dev/null 2>&1; then
            echo -e "${GREEN}✓${NC} $secret_name"
        else
            echo -e "${RED}✗${NC} $secret_name (不存在)"
            all_exist=false
        fi
    done

    echo
    if [ "$all_exist" = true ]; then
        success "所有 Secrets 验证通过"
    else
        error "部分 Secrets 不存在"
    fi
}

# 删除单个 secret
remove_secret() {
    local secret_name="$1"

    if [ -z "$secret_name" ]; then
        error "请指定要删除的 secret 名称"
    fi

    if ! docker secret inspect "$secret_name" >/dev/null 2>&1; then
        warn "Secret '$secret_name' 不存在"
        return 0
    fi

    # 确认删除
    read -p "确定要删除 secret '$secret_name'? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        info "取消删除"
        return 0
    fi

    docker secret rm "$secret_name"
    success "删除 secret: $secret_name"
}

# 删除所有 secrets
remove_all_secrets() {
    warn "即将删除所有相关的 Docker Secrets"
    echo
    list_secrets
    echo

    read -p "确定要删除所有 secrets? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        info "取消删除"
        return 0
    fi

    for secret_name in "${!SECRETS_MAP[@]}"; do
        if docker secret inspect "$secret_name" >/dev/null 2>&1; then
            docker secret rm "$secret_name"
            success "删除 secret: $secret_name"
        fi
    done
}

# 轮换 secret
rotate_secret() {
    local secret_name="$1"

    if [ -z "$secret_name" ]; then
        error "请指定要轮换的 secret 名称"
    fi

    if [ -z "${SECRETS_MAP[$secret_name]}" ]; then
        error "未知的 secret: $secret_name"
    fi

    info "轮换 secret: $secret_name"

    # 创建新的 secret 名称
    local new_secret_name="${secret_name}_new"
    local old_secret_name="${secret_name}_old"

    # 备份当前 secret
    if docker secret inspect "$secret_name" >/dev/null 2>&1; then
        info "备份当前 secret 为: $old_secret_name"
        # 注意: Docker 不支持直接重命名 secret，这里只是演示流程
        warn "Docker 不支持直接备份 secret，请手动记录当前值"
    fi

    # 创建新 secret
    local env_var="${SECRETS_MAP[$secret_name]}"
    local value=$(read_env_value "$env_var")

    echo "$value" | docker secret create "$new_secret_name" -
    success "创建新 secret: $new_secret_name"

    warn "请更新 Docker Stack 配置以使用新 secret，然后删除旧 secret"
    echo "1. 更新 docker-stack.yml 中的 secret 引用"
    echo "2. 重新部署 Stack: docker stack deploy -c docker-stack.yml automation-platform"
    echo "3. 删除旧 secret: docker secret rm $secret_name"
    echo "4. 重命名新 secret: 手动操作"
}

# 显示帮助信息
show_help() {
    echo "Docker Swarm Secrets 管理脚本"
    echo
    echo "用法: $0 <命令> [选项]"
    echo
    echo "命令:"
    echo "  create              从 .env 文件创建所有 secrets"
    echo "  create <name>       创建指定的 secret"
    echo "  list                列出所有相关 secrets"
    echo "  verify              验证所有 secrets 是否存在"
    echo "  remove <name>       删除指定的 secret"
    echo "  remove-all          删除所有相关 secrets"
    echo "  rotate <name>       轮换指定的 secret"
    echo "  help                显示此帮助信息"
    echo
    echo "支持的 secrets:"
    for secret_name in "${!SECRETS_MAP[@]}"; do
        echo "  - $secret_name (${SECRETS_MAP[$secret_name]})"
    done
    echo
    echo "示例:"
    echo "  $0 create                    # 创建所有 secrets"
    echo "  $0 create db_password        # 创建数据库密码 secret"
    echo "  $0 list                      # 列出所有 secrets"
    echo "  $0 verify                    # 验证 secrets"
    echo "  $0 rotate jwt_secret         # 轮换 JWT secret"
}

# 主函数
main() {
    local command="${1:-}"
    local target="${2:-}"

    case "$command" in
        "create")
            check_swarm
            if [ -n "$target" ]; then
                create_secret "$target"
            else
                create_all_secrets
            fi
            ;;
        "list")
            list_secrets
            ;;
        "verify")
            verify_secrets
            ;;
        "remove")
            check_swarm
            if [ -z "$target" ]; then
                error "请指定要删除的 secret 名称"
            fi
            remove_secret "$target"
            ;;
        "remove-all")
            check_swarm
            remove_all_secrets
            ;;
        "rotate")
            check_swarm
            if [ -z "$target" ]; then
                error "请指定要轮换的 secret 名称"
            fi
            rotate_secret "$target"
            ;;
        "help"|"-h"|"--help"|"")
            show_help
            ;;
        *)
            error "未知命令: $command，使用 '$0 help' 查看帮助"
            ;;
    esac
}

# 执行主函数
main "$@"