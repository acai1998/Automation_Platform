#!/bin/bash

# ═══════════════════════════════════════════════════════════════════════════
# Jenkins 环境变量配置检查脚本
# ═══════════════════════════════════════════════════════════════════════════
# 用途：验证 .env 文件中的 Jenkins 配置是否完整和正确
# 使用：./scripts/check-env.sh
# ═══════════════════════════════════════════════════════════════════════════

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 统计
PASSED=0
FAILED=0
WARNINGS=0

# 打印函数
print_header() {
  echo -e "\n${BLUE}╔════════════════════════════════════════════════════════════════════════╗${NC}"
  echo -e "${BLUE}║ $1${NC}"
  echo -e "${BLUE}╚════════════════════════════════════════════════════════════════════════╝${NC}\n"
}

print_success() {
  echo -e "${GREEN}✅ $1${NC}"
  ((PASSED++))
}

print_error() {
  echo -e "${RED}❌ $1${NC}"
  ((FAILED++))
}

print_warning() {
  echo -e "${YELLOW}⚠️  $1${NC}"
  ((WARNINGS++))
}

print_info() {
  echo -e "${BLUE}ℹ️  $1${NC}"
}

# 检查 .env 文件是否存在
print_header "1. 检查 .env 文件"

if [ -f ".env" ]; then
  print_success ".env 文件存在"
else
  print_error ".env 文件不存在"
  echo ""
  echo "快速修复："
  echo "  1. 复制配置模板："
  echo "     cp .env.example .env"
  echo "  2. 编辑 .env 文件，填入必需的配置值"
  echo "  3. 重新运行此脚本：./scripts/check-env.sh"
  exit 1
fi

# 检查必需的环境变量
print_header "2. 检查必需的环境变量"

check_env_var() {
  local var_name=$1
  local description=$2
  local min_length=${3:-1}

  local value=$(grep "^${var_name}=" .env | cut -d= -f2- | tr -d "\"'" 2>/dev/null || echo "")

  if [ -z "$value" ]; then
    print_error "$var_name：未配置"
    return 1
  elif [ ${#value} -lt $min_length ]; then
    print_warning "$var_name：已配置但长度过短 (${#value} < $min_length)"
    return 2
  else
    print_success "$var_name：已配置 (长度: ${#value})"
    return 0
  fi
}

# 检查关键变量
check_env_var "JENKINS_API_KEY" "API Key" 8
API_KEY_CHECK=$?

check_env_var "JENKINS_JWT_SECRET" "JWT Secret" 8
JWT_CHECK=$?

check_env_var "JENKINS_SIGNATURE_SECRET" "Signature Secret" 8
SIG_CHECK=$?

# 检查可选的 Jenkins 配置
print_header "3. 检查可选的 Jenkins 配置"

check_optional_var() {
  local var_name=$1
  local description=$2
  local default_value=$3

  local value=$(grep "^${var_name}=" .env | cut -d= -f2- | tr -d "\"'" 2>/dev/null || echo "")

  if [ -z "$value" ]; then
    print_info "$var_name：未配置 (将使用默认值: $default_value)"
  else
    print_success "$var_name：已配置 (值: $value)"
  fi
}

check_optional_var "JENKINS_URL" "Jenkins 服务器地址" "http://jenkins.wiac.xyz:8080/"
check_optional_var "JENKINS_USER" "Jenkins 用户名" "root"
check_optional_var "JENKINS_TOKEN" "Jenkins API Token" "[未配置]"
check_optional_var "JENKINS_ALLOWED_IPS" "IP 白名单" "[所有 IP]"

# 检查网络配置
print_header "4. 检查网络和连接"

JENKINS_URL=$(grep "^JENKINS_URL=" .env | cut -d= -f2- | tr -d "\"'" 2>/dev/null || echo "http://jenkins.wiac.xyz:8080/")
JENKINS_USER=$(grep "^JENKINS_USER=" .env | cut -d= -f2- | tr -d "\"'" 2>/dev/null || echo "root")
JENKINS_TOKEN=$(grep "^JENKINS_TOKEN=" .env | cut -d= -f2- | tr -d "\"'" 2>/dev/null || echo "")

if [ -n "$JENKINS_TOKEN" ] && [ -n "$JENKINS_USER" ]; then
  print_info "检查 Jenkins 连接..."
  
  # 确保 URL 以 / 结尾
  if [[ ! "$JENKINS_URL" =~ /$ ]]; then
    JENKINS_URL="${JENKINS_URL}/"
  fi

  # 尝试连接 Jenkins
  if timeout 5 curl -s -u "${JENKINS_USER}:${JENKINS_TOKEN}" "${JENKINS_URL}api/json" > /dev/null 2>&1; then
    print_success "可以连接到 Jenkins 服务器"
  else
    print_warning "无法连接到 Jenkins 服务器"
    print_info "可能的原因："
    print_info "  1. Jenkins 服务未运行"
    print_info "  2. JENKINS_URL 配置不正确"
    print_info "  3. JENKINS_USER 或 JENKINS_TOKEN 不正确"
    print_info "  4. 网络连接问题"
  fi
else
  print_info "Jenkins Token 未配置，跳过连接测试"
fi

# 检查应用依赖
print_header "5. 检查应用依赖"

if command -v node &> /dev/null; then
  NODE_VERSION=$(node -v)
  print_success "Node.js 已安装 ($NODE_VERSION)"
else
  print_error "Node.js 未安装"
fi

if command -v npm &> /dev/null; then
  NPM_VERSION=$(npm -v)
  print_success "npm 已安装 ($NPM_VERSION)"
else
  print_error "npm 未安装"
fi

if [ -f "package.json" ]; then
  print_success "package.json 存在"
else
  print_error "package.json 不存在"
fi

# 总结
print_header "6. 配置检查总结"

echo -e "通过检查：${GREEN}${PASSED}${NC}"
echo -e "警告：${YELLOW}${WARNINGS}${NC}"
echo -e "失败：${RED}${FAILED}${NC}"

if [ $FAILED -gt 0 ]; then
  echo ""
  echo -e "${RED}❌ 配置检查失败！${NC}"
  echo ""
  echo "快速修复步骤："
  echo "  1. 编辑 .env 文件"
  echo "  2. 确保以下变量已配置："
  echo "     - JENKINS_API_KEY"
  echo "     - JENKINS_JWT_SECRET"
  echo "     - JENKINS_SIGNATURE_SECRET"
  echo "  3. 检查值的长度（建议至少 8 字符）"
  echo "  4. 保存文件后重新运行此脚本"
  echo ""
  echo "详细文档：docs/JENKINS_AUTH_QUICK_START.md"
  exit 1
elif [ $WARNINGS -gt 0 ]; then
  echo ""
  echo -e "${YELLOW}⚠️  配置检查完成，但有警告${NC}"
  echo ""
  echo "建议："
  if [ $API_KEY_CHECK -eq 2 ] || [ $JWT_CHECK -eq 2 ] || [ $SIG_CHECK -eq 2 ]; then
    echo "  - 使用更强的密钥（至少 32 字符）"
    echo "    生成方法：node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""
  fi
  echo ""
  echo "应用仍然可以启动，但可能存在安全风险。"
  exit 0
else
  echo ""
  echo -e "${GREEN}✅ 所有配置检查通过！${NC}"
  echo ""
  echo "下一步："
  echo "  1. 启动应用：npm run start"
  echo "  2. 测试回调连接："
  echo "     curl -X POST http://localhost:3000/api/jenkins/callback/test \\"
  echo "       -H \"X-Api-Key: \$(grep JENKINS_API_KEY .env | cut -d= -f2)\" \\"
  echo "       -H \"Content-Type: application/json\" \\"
  echo "       -d '{\"testMessage\": \"hello\"}'"
  echo ""
  exit 0
fi
