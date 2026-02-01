#!/bin/bash

# Docker Secrets 验证脚本
# 用途: 检查 Docker Secrets 是否正确配置和挂载

set -e

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_info() { echo -e "${GREEN}[✓]${NC} $1"; }
print_error() { echo -e "${RED}[✗]${NC} $1"; }
print_warn() { echo -e "${YELLOW}[!]${NC} $1"; }
print_step() { echo -e "${BLUE}[→]${NC} $1"; }

echo "======================================"
echo "Docker Secrets 验证"
echo "======================================"
echo ""

# 检查容器是否运行
if ! docker ps | grep -q "automation-platform"; then
    print_error "容器未运行"
    echo "请先启动容器: docker-compose up -d"
    exit 1
fi

print_info "容器正在运行"
echo ""

# 验证 Secrets 文件
print_step "1️⃣  检查本地 Secret 文件..."
echo ""

SECRETS_DIR="./secrets"
if [ ! -d "$SECRETS_DIR" ]; then
    print_error "secrets/ 目录不存在"
    echo "请先运行: ./scripts/setup-secrets.sh"
    exit 1
fi

SECRET_FILES=(
    "db_password.txt"
    "jenkins_token.txt"
    "jenkins_api_key.txt"
    "jenkins_jwt_secret.txt"
    "jenkins_signature_secret.txt"
    "jwt_secret.txt"
)

LOCAL_COUNT=0
for file in "${SECRET_FILES[@]}"; do
    if [ -f "$SECRETS_DIR/$file" ]; then
        size=$(stat -f%z "$SECRETS_DIR/$file" 2>/dev/null || stat -c%s "$SECRETS_DIR/$file" 2>/dev/null)
        if [ "$size" -gt 0 ]; then
            print_info "$file 存在 ($size 字节)"
            ((LOCAL_COUNT++))
        else
            print_warn "$file 存在但为空"
        fi
    else
        print_warn "$file 不存在"
    fi
done

echo ""
print_info "本地 Secret 文件: $LOCAL_COUNT/6"
echo ""

# 验证容器内的 Secrets
print_step "2️⃣  检查容器内挂载的 Secrets..."
echo ""

# 检查 /run/secrets 目录
if docker exec automation-platform test -d /run/secrets 2>/dev/null; then
    print_info "/run/secrets 目录存在"
    
    # 列出所有 secrets
    CONTAINER_SECRETS=$(docker exec automation-platform ls /run/secrets 2>/dev/null || echo "")
    
    if [ -n "$CONTAINER_SECRETS" ]; then
        echo ""
        echo "容器内的 Secrets:"
        echo "$CONTAINER_SECRETS" | while read secret; do
            if [ -n "$secret" ]; then
                size=$(docker exec automation-platform stat -c%s "/run/secrets/$secret" 2>/dev/null || echo "0")
                print_info "  /run/secrets/$secret ($size 字节)"
            fi
        done
    else
        print_warn "  /run/secrets 目录为空"
    fi
else
    print_error "/run/secrets 目录不存在"
fi

echo ""

# 验证环境变量
print_step "3️⃣  检查环境变量配置..."
echo ""

check_env_var() {
    local key=$1
    local file_key="${key}_FILE"
    
    # 检查普通环境变量
    local env_value=$(docker exec automation-platform sh -c "echo \$$key" 2>/dev/null || echo "")
    
    # 检查 _FILE 环境变量
    local file_path=$(docker exec automation-platform sh -c "echo \$$file_key" 2>/dev/null || echo "")
    
    if [ -n "$file_path" ]; then
        # 检查文件是否存在
        if docker exec automation-platform test -f "$file_path" 2>/dev/null; then
            local file_size=$(docker exec automation-platform stat -c%s "$file_path" 2>/dev/null || echo "0")
            print_info "$key: 使用 Secret 文件 ($file_path, $file_size 字节)"
        else
            print_error "$key: Secret 文件不存在 ($file_path)"
        fi
    elif [ -n "$env_value" ]; then
        local length=${#env_value}
        print_info "$key: 使用环境变量 ($length 字符)"
    else
        print_warn "$key: 未配置"
    fi
}

check_env_var "DB_PASSWORD"
check_env_var "JENKINS_TOKEN"
check_env_var "JENKINS_API_KEY"
check_env_var "JENKINS_JWT_SECRET"
check_env_var "JENKINS_SIGNATURE_SECRET"
check_env_var "JWT_SECRET"

echo ""

# 测试应用能否读取 Secrets
print_step "4️⃣  测试应用健康检查..."
echo ""

if curl -f http://localhost:3000/api/health &> /dev/null; then
    print_info "应用健康检查通过 ✓"
else
    print_error "应用健康检查失败"
    echo "请查看日志: docker logs automation-platform"
fi

echo ""
echo "======================================"
print_info "验证完成"
echo "======================================"
echo ""

# 安全提醒
print_warn "安全提醒:"
echo "  1. secrets/ 目录包含敏感信息"
echo "  2. 请确保文件权限正确 (600)"
echo "  3. 不要提交 secrets/ 到版本控制"
echo "  4. 定期轮换敏感凭证"
echo ""

# 显示文件权限
print_step "Secret 文件权限:"
ls -la "$SECRETS_DIR/" 2>/dev/null | grep -E "\.txt$" || echo "  无 Secret 文件"
echo ""

# 快速命令
echo "📋 常用命令:"
echo "  查看容器内 Secrets: docker exec automation-platform ls -la /run/secrets"
echo "  读取特定 Secret:    docker exec automation-platform cat /run/secrets/db_password"
echo "  查看环境变量:       docker exec automation-platform env | grep _FILE"
echo "  查看应用日志:       docker logs -f automation-platform"
echo ""
