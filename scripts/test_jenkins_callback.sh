#!/bin/bash

# ========================================
# Jenkins 回调接口测试脚本
# ========================================
# 功能:
# 1. 测试回调接口的可访问性
# 2. 验证认证配置是否正确
# 3. 模拟 Jenkins 回调更新执行状态
# ========================================

set -e

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 配置
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
ENV_FILE="$PROJECT_ROOT/.env"

# 默认值
PLATFORM_URL="http://localhost:3000"
API_KEY=""
RUN_ID=""

# 显示帮助信息
show_help() {
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}Jenkins 回调接口测试脚本${NC}"
    echo -e "${BLUE}========================================${NC}"
    echo ""
    echo "用法:"
    echo "  $0 [选项]"
    echo ""
    echo "选项:"
    echo "  -h, --help              显示帮助信息"
    echo "  -u, --url <URL>         平台地址 (默认: http://localhost:3000)"
    echo "  -k, --api-key <KEY>     API Key (从 .env 读取)"
    echo "  -r, --run-id <ID>       运行ID (用于测试真实回调)"
    echo "  -t, --test-only         仅测试连接,不更新数据"
    echo ""
    echo "示例:"
    echo "  # 测试连接"
    echo "  $0 --test-only"
    echo ""
    echo "  # 更新 runId=64 的状态为 failed"
    echo "  $0 --run-id 64"
    echo ""
}

# 加载 .env 文件
load_env() {
    if [ -f "$ENV_FILE" ]; then
        echo -e "${GREEN}✓${NC} 找到 .env 文件: $ENV_FILE"
        
        # 读取 API_KEY
        API_KEY=$(grep "^JENKINS_API_KEY=" "$ENV_FILE" | cut -d'=' -f2 | tr -d '"' | tr -d "'")
        
        if [ -z "$API_KEY" ]; then
            echo -e "${RED}✗${NC} 未在 .env 中找到 JENKINS_API_KEY"
            exit 1
        fi
        
        echo -e "${GREEN}✓${NC} API Key 已加载 (长度: ${#API_KEY})"
    else
        echo -e "${RED}✗${NC} 未找到 .env 文件: $ENV_FILE"
        exit 1
    fi
}

# 测试连接
test_connection() {
    echo ""
    echo -e "${YELLOW}[1/3] 测试平台服务连接...${NC}"
    
    if curl -s -f -m 5 "$PLATFORM_URL/api/health" > /dev/null 2>&1; then
        echo -e "${GREEN}✓${NC} 平台服务运行正常"
    else
        echo -e "${RED}✗${NC} 无法连接到平台服务: $PLATFORM_URL"
        echo -e "${YELLOW}提示:${NC} 请确保后端服务正在运行 (npm run server)"
        exit 1
    fi
}

# 测试认证配置
test_authentication() {
    echo ""
    echo -e "${YELLOW}[2/3] 测试认证配置...${NC}"
    
    RESPONSE=$(curl -s -X POST "$PLATFORM_URL/api/jenkins/callback/test" \
        -H "X-Api-Key: $API_KEY" \
        -H "Content-Type: application/json" \
        -d '{"testMessage": "authentication test"}' 2>&1)
    
    if echo "$RESPONSE" | grep -q '"success":true'; then
        echo -e "${GREEN}✓${NC} 认证配置正确"
        echo -e "${GREEN}✓${NC} 回调接口可访问"
    else
        echo -e "${RED}✗${NC} 认证失败"
        echo -e "${YELLOW}响应:${NC}"
        echo "$RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$RESPONSE"
        exit 1
    fi
}

# 测试真实回调
test_real_callback() {
    local run_id=$1
    
    if [ -z "$run_id" ]; then
        echo ""
        echo -e "${YELLOW}[3/3] 跳过真实回调测试 (未提供 runId)${NC}"
        echo ""
        echo -e "${GREEN}========================================${NC}"
        echo -e "${GREEN}✓ 所有测试通过!${NC}"
        echo -e "${GREEN}========================================${NC}"
        echo ""
        echo -e "${BLUE}提示:${NC} 使用 --run-id 参数可以测试更新真实执行记录"
        echo "示例: $0 --run-id 64"
        return
    fi
    
    echo ""
    echo -e "${YELLOW}[3/3] 测试真实回调处理 (runId: $run_id)...${NC}"
    
    # 先查询当前状态
    echo -e "${BLUE}→${NC} 查询当前执行状态..."
    CURRENT_STATUS=$(curl -s "$PLATFORM_URL/api/jenkins/batch/$run_id" 2>&1)
    
    if echo "$CURRENT_STATUS" | grep -q '"success":true'; then
        STATUS=$(echo "$CURRENT_STATUS" | python3 -c "import sys, json; print(json.load(sys.stdin)['data']['status'])" 2>/dev/null || echo "unknown")
        echo -e "${BLUE}  当前状态:${NC} $STATUS"
    else
        echo -e "${RED}✗${NC} 查询失败,runId 可能不存在"
        echo "$CURRENT_STATUS"
        exit 1
    fi
    
    # 询问用户确认
    echo ""
    echo -e "${YELLOW}⚠️  警告:${NC} 这将更新 runId=$run_id 的执行状态为 'failed'"
    read -p "是否继续? (y/N): " -n 1 -r
    echo
    
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "已取消"
        exit 0
    fi
    
    # 发送真实回调
    echo -e "${BLUE}→${NC} 发送回调请求..."
    RESPONSE=$(curl -s -X POST "$PLATFORM_URL/api/jenkins/callback/test" \
        -H "X-Api-Key: $API_KEY" \
        -H "Content-Type: application/json" \
        -d "{
            \"runId\": $run_id,
            \"status\": \"failed\",
            \"passedCases\": 0,
            \"failedCases\": 1,
            \"skippedCases\": 0,
            \"durationMs\": 120000,
            \"results\": [
                {
                    \"caseId\": 1,
                    \"caseName\": \"test_case\",
                    \"status\": \"failed\",
                    \"duration\": 120000,
                    \"errorMessage\": \"Manual callback test\"
                }
            ]
        }" 2>&1)
    
    if echo "$RESPONSE" | grep -q '"success":true'; then
        echo -e "${GREEN}✓${NC} 回调处理成功"
        
        # 再次查询验证
        sleep 1
        echo -e "${BLUE}→${NC} 验证更新后的状态..."
        NEW_STATUS=$(curl -s "$PLATFORM_URL/api/jenkins/batch/$run_id" 2>&1)
        
        if echo "$NEW_STATUS" | grep -q '"success":true'; then
            NEW_STATUS_VALUE=$(echo "$NEW_STATUS" | python3 -c "import sys, json; print(json.load(sys.stdin)['data']['status'])" 2>/dev/null || echo "unknown")
            echo -e "${GREEN}✓${NC} 状态已更新: $STATUS → $NEW_STATUS_VALUE"
        fi
    else
        echo -e "${RED}✗${NC} 回调处理失败"
        echo "$RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$RESPONSE"
        exit 1
    fi
    
    echo ""
    echo -e "${GREEN}========================================${NC}"
    echo -e "${GREEN}✓ 所有测试通过!${NC}"
    echo -e "${GREEN}========================================${NC}"
}

# 主函数
main() {
    TEST_ONLY=false
    
    # 解析参数
    while [[ $# -gt 0 ]]; do
        case $1 in
            -h|--help)
                show_help
                exit 0
                ;;
            -u|--url)
                PLATFORM_URL="$2"
                shift 2
                ;;
            -k|--api-key)
                API_KEY="$2"
                shift 2
                ;;
            -r|--run-id)
                RUN_ID="$2"
                shift 2
                ;;
            -t|--test-only)
                TEST_ONLY=true
                shift
                ;;
            *)
                echo -e "${RED}未知选项: $1${NC}"
                show_help
                exit 1
                ;;
        esac
    done
    
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}Jenkins 回调接口测试${NC}"
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}平台地址:${NC} $PLATFORM_URL"
    
    # 加载配置
    if [ -z "$API_KEY" ]; then
        load_env
    else
        echo -e "${GREEN}✓${NC} 使用命令行提供的 API Key"
    fi
    
    # 执行测试
    test_connection
    test_authentication
    
    if [ "$TEST_ONLY" = false ]; then
        test_real_callback "$RUN_ID"
    else
        echo ""
        echo -e "${YELLOW}[3/3] 跳过真实回调测试 (--test-only 模式)${NC}"
        echo ""
        echo -e "${GREEN}========================================${NC}"
        echo -e "${GREEN}✓ 连接和认证测试通过!${NC}"
        echo -e "${GREEN}========================================${NC}"
    fi
}

# 运行主函数
main "$@"
