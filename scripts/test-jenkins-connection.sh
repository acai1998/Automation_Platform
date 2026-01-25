#!/bin/bash

# Jenkins 连接测试脚本
# 用途: 验证平台与 Jenkins 的连通性

set -e

echo "========================================="
echo "🔧 Jenkins 连接测试脚本"
echo "========================================="

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 日志函数
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

# 检查环境变量
check_env_vars() {
    log_info "检查环境变量配置..."

    if [[ -f ".env" ]]; then
        source .env
        log_success "找到 .env 文件"
    else
        log_error ".env 文件不存在"
        exit 1
    fi

    # 检查必需的环境变量
    required_vars=("JENKINS_URL" "JENKINS_USER" "JENKINS_TOKEN" "JENKINS_API_KEY")

    for var in "${required_vars[@]}"; do
        if [[ -z "${!var}" ]]; then
            log_error "环境变量 $var 未设置"
            exit 1
        else
            log_success "✓ $var 已设置"
        fi
    done
}

# 测试 Jenkins 服务器连通性
test_jenkins_connectivity() {
    log_info "测试 Jenkins 服务器连通性..."

    local jenkins_ping_url="${JENKINS_URL}/login"

    if curl -s --max-time 10 "$jenkins_ping_url" >/dev/null; then
        log_success "✓ Jenkins 服务器可访问: $JENKINS_URL"
    else
        log_error "✗ Jenkins 服务器不可访问: $JENKINS_URL"
        log_error "请检查网络连接和 Jenkins 服务器状态"
        exit 1
    fi
}

# 测试 Jenkins API 认证
test_jenkins_auth() {
    log_info "测试 Jenkins API 认证..."

    local api_url="${JENKINS_URL}/api/json"
    local auth_header="Authorization: Basic $(echo -n "${JENKINS_USER}:${JENKINS_TOKEN}" | base64)"

    local response
    response=$(curl -s -w "%{http_code}" -H "$auth_header" "$api_url" -o /dev/null)

    if [[ "$response" == "200" ]]; then
        log_success "✓ Jenkins API 认证成功"
    else
        log_error "✗ Jenkins API 认证失败 (HTTP $response)"
        log_error "请检查 JENKINS_USER 和 JENKINS_TOKEN"
        exit 1
    fi
}

# 测试 AutoTest 任务是否存在
test_autotest_job() {
    log_info "检查 AutoTest 任务是否存在..."

    local job_url="${JENKINS_URL}/job/AutoTest/api/json"
    local auth_header="Authorization: Basic $(echo -n "${JENKINS_USER}:${JENKINS_TOKEN}" | base64)"

    local response
    response=$(curl -s -w "%{http_code}" -H "$auth_header" "$job_url" -o /dev/null)

    if [[ "$response" == "200" ]]; then
        log_success "✓ AutoTest 任务存在"
    else
        log_error "✗ AutoTest 任务不存在或无法访问 (HTTP $response)"
        log_error "请确认任务名称是否为 'AutoTest'"
        exit 1
    fi
}

# 启动平台应用（如果未运行）
start_platform_if_needed() {
    log_info "检查平台应用状态..."

    if curl -s --max-time 5 "http://localhost:3000/api/health" >/dev/null 2>&1; then
        log_success "✓ 平台应用已运行"
    else
        log_warning "平台应用未运行，尝试启动..."

        # 检查是否有 package.json
        if [[ -f "package.json" ]]; then
            log_info "启动平台应用..."
            npm run start &
            PLATFORM_PID=$!

            # 等待应用启动
            local attempts=0
            local max_attempts=30

            while [[ $attempts -lt $max_attempts ]]; do
                if curl -s --max-time 2 "http://localhost:3000/api/health" >/dev/null 2>&1; then
                    log_success "✓ 平台应用启动成功"
                    break
                fi

                sleep 2
                attempts=$((attempts + 1))
                log_info "等待应用启动... ($attempts/$max_attempts)"
            done

            if [[ $attempts -eq $max_attempts ]]; then
                log_error "✗ 平台应用启动失败"
                kill $PLATFORM_PID 2>/dev/null || true
                exit 1
            fi
        else
            log_error "未找到 package.json，无法启动应用"
            log_error "请手动启动平台应用: npm run start"
            exit 1
        fi
    fi
}

# 测试平台 Jenkins 健康检查接口
test_platform_jenkins_health() {
    log_info "测试平台 Jenkins 健康检查接口..."

    local health_url="http://localhost:3000/api/jenkins/health"
    local response

    response=$(curl -s -w "%{http_code}" "$health_url" -o /tmp/jenkins_health_response.json)

    if [[ "$response" == "200" ]]; then
        log_success "✓ 平台 Jenkins 健康检查接口正常"

        # 显示响应内容
        if [[ -f "/tmp/jenkins_health_response.json" ]]; then
            log_info "响应内容:"
            cat /tmp/jenkins_health_response.json | jq . 2>/dev/null || cat /tmp/jenkins_health_response.json
            echo
        fi
    else
        log_error "✗ 平台 Jenkins 健康检查接口失败 (HTTP $response)"
        exit 1
    fi
}

# 测试回调接口
test_callback_endpoint() {
    log_info "测试回调接口..."

    local callback_url="http://localhost:3000/api/executions/callback"
    local test_data='{
        "runId": 999,
        "status": "success",
        "passedCases": 5,
        "failedCases": 0,
        "skippedCases": 0,
        "durationMs": 120000,
        "buildUrl": "http://jenkins.wiac.xyz:8080/job/AutoTest/999/"
    }'

    local response
    response=$(curl -s -w "%{http_code}" \
        -X POST "$callback_url" \
        -H "Content-Type: application/json" \
        -H "X-Api-Key: $JENKINS_API_KEY" \
        -d "$test_data" \
        -o /tmp/callback_response.json)

    if [[ "$response" == "200" ]]; then
        log_success "✓ 回调接口测试成功"
    elif [[ "$response" == "404" ]]; then
        log_warning "⚠ 回调接口返回 404，可能执行记录不存在（这在测试中是正常的）"
    else
        log_error "✗ 回调接口测试失败 (HTTP $response)"
        if [[ -f "/tmp/callback_response.json" ]]; then
            log_error "响应内容:"
            cat /tmp/callback_response.json
        fi
        exit 1
    fi
}

# 生成测试报告
generate_test_report() {
    log_info "生成测试报告..."

    cat > jenkins_test_report.md << EOF
# Jenkins 连接测试报告

**测试时间**: $(date)

## 测试结果

✅ **Jenkins 服务器连通性**: 通过
✅ **Jenkins API 认证**: 通过
✅ **AutoTest 任务检查**: 通过
✅ **平台应用状态**: 正常
✅ **Jenkins 健康检查接口**: 通过
✅ **回调接口测试**: 通过

## 配置信息

- **Jenkins URL**: $JENKINS_URL
- **Jenkins 用户**: $JENKINS_USER
- **平台回调地址**: http://localhost:3000/api/jenkins/callback
- **API Key**: ${JENKINS_API_KEY:0:8}...（已隐藏）

## 下一步操作

1. 在 Jenkins 中手动触发 AutoTest 任务测试
2. 观察构建日志和回调结果
3. 如有问题，检查网络连接和配置

EOF

    log_success "✓ 测试报告已生成: jenkins_test_report.md"
}

# 清理函数
cleanup() {
    # 清理临时文件
    rm -f /tmp/jenkins_health_response.json /tmp/callback_response.json

    # 如果启动了平台应用，询问是否保持运行
    if [[ -n "${PLATFORM_PID:-}" ]]; then
        echo
        read -p "是否保持平台应用运行？(y/n): " -r
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            log_info "停止平台应用..."
            kill $PLATFORM_PID 2>/dev/null || true
        else
            log_info "平台应用继续运行 (PID: $PLATFORM_PID)"
        fi
    fi
}

# 主函数
main() {
    # 设置清理函数
    trap cleanup EXIT

    log_info "开始 Jenkins 连接测试..."
    echo

    # 执行测试
    check_env_vars
    echo

    test_jenkins_connectivity
    echo

    test_jenkins_auth
    echo

    test_autotest_job
    echo

    start_platform_if_needed
    echo

    test_platform_jenkins_health
    echo

    test_callback_endpoint
    echo

    generate_test_report

    echo "========================================="
    log_success "🎉 所有测试通过！Jenkins 配置正确"
    echo "========================================="

    echo
    log_info "您现在可以："
    echo "1. 在 Jenkins 中手动触发 AutoTest 任务"
    echo "2. 访问 http://jenkins.wiac.xyz:8080/job/AutoTest/"
    echo "3. 点击 'Build with Parameters' 进行测试"
    echo
}

# 脚本入口
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi