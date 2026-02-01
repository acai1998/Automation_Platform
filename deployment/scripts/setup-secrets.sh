#!/bin/bash

# Docker Secrets 设置脚本
# 用途: 从 .env 文件创建 Docker Secrets 文件

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
echo "Docker Secrets 设置向导"
echo "======================================"
echo ""

# 检查 .env 文件
if [ ! -f "../.env" ]; then
    print_error ".env 文件不存在"
    echo "请先创建 .env 文件并配置敏感信息"
    exit 1
fi

# 创建 secrets 目录
SECRETS_DIR="./secrets"
if [ ! -d "$SECRETS_DIR" ]; then
    mkdir -p "$SECRETS_DIR"
    print_info "创建 secrets 目录: $SECRETS_DIR"
fi

# 设置目录权限
chmod 700 "$SECRETS_DIR"
print_info "设置 secrets 目录权限: 700"

# 从 .env 读取配置
source ../.env

echo ""
print_step "正在从 .env 提取敏感信息..."
echo ""

# 创建 secret 文件的函数
create_secret_file() {
    local name=$1
    local value=$2
    local file_path="$SECRETS_DIR/${name}.txt"
    
    if [ -z "$value" ]; then
        print_warn "${name}: 未配置（跳过）"
        return 1
    fi
    
    echo -n "$value" > "$file_path"
    chmod 600 "$file_path"
    
    local length=${#value}
    print_info "${name}: 已保存 ($length 字符)"
    return 0
}

# 提取并保存敏感信息
SECRET_COUNT=0

print_step "1️⃣  数据库密码"
if create_secret_file "db_password" "$DB_PASSWORD"; then
    ((SECRET_COUNT++))
fi

echo ""
print_step "2️⃣  Jenkins Token"
if create_secret_file "jenkins_token" "$JENKINS_TOKEN"; then
    ((SECRET_COUNT++))
fi

echo ""
print_step "3️⃣  Jenkins API Key"
if create_secret_file "jenkins_api_key" "$JENKINS_API_KEY"; then
    ((SECRET_COUNT++))
fi

echo ""
print_step "4️⃣  Jenkins JWT Secret"
if create_secret_file "jenkins_jwt_secret" "$JENKINS_JWT_SECRET"; then
    ((SECRET_COUNT++))
fi

echo ""
print_step "5️⃣  Jenkins Signature Secret"
if create_secret_file "jenkins_signature_secret" "$JENKINS_SIGNATURE_SECRET"; then
    ((SECRET_COUNT++))
fi

echo ""
print_step "6️⃣  JWT Secret"
if create_secret_file "jwt_secret" "$JWT_SECRET"; then
    ((SECRET_COUNT++))
fi

echo ""
echo "======================================"
print_info "已创建 $SECRET_COUNT 个 Secret 文件"
echo "======================================"
echo ""

# 列出创建的文件
print_step "Secret 文件列表:"
echo ""
ls -lh "$SECRETS_DIR/" | tail -n +2 | while read line; do
    echo "  $line"
done

echo ""
print_warn "重要提示:"
echo "  1. secrets/ 目录包含敏感信息，不应提交到 Git"
echo "  2. 请确保 secrets/ 已添加到 .gitignore"
echo "  3. 生产环境建议使用外部 Secret 管理服务"
echo ""

# 检查 .gitignore
if ! grep -q "secrets/" ../.gitignore 2>/dev/null; then
    print_warn "secrets/ 未在 .gitignore 中，正在添加..."
    echo "" >> ../.gitignore
    echo "# Docker Secrets" >> ../.gitignore
    echo "deployment/secrets/" >> ../.gitignore
    print_info "已添加到 .gitignore"
fi

echo ""
print_info "设置完成！"
echo ""
echo "📋 下一步操作:"
echo "  1. 启动服务: docker-compose up -d"
echo "  2. 验证 Secrets: ./scripts/verify-secrets.sh"
echo "  3. 查看日志: docker logs automation-platform"
echo ""
