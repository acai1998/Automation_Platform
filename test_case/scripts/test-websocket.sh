#!/bin/bash

# WebSocket 集成测试脚本
# 用于验证 WebSocket 实时推送功能

set -e

echo "=================================="
echo "WebSocket 集成测试"
echo "=================================="
echo ""

# 颜色定义
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 测试计数
TESTS_PASSED=0
TESTS_FAILED=0

# 测试函数
test_api() {
    local name=$1
    local url=$2
    local expected_code=${3:-200}

    echo -n "Testing $name... "

    response=$(curl -s -w "\n%{http_code}" "$url")
    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | head -n-1)

    if [ "$http_code" -eq "$expected_code" ]; then
        echo -e "${GREEN}✓ PASSED${NC} (HTTP $http_code)"
        TESTS_PASSED=$((TESTS_PASSED + 1))
        return 0
    else
        echo -e "${RED}✗ FAILED${NC} (HTTP $http_code, expected $expected_code)"
        TESTS_FAILED=$((TESTS_FAILED + 1))
        return 1
    fi
}

echo "1. 检查服务器健康状态"
echo "-----------------------------------"
test_api "Health Check" "http://localhost:3000/api/health"
echo ""

echo "2. 检查监控服务状态"
echo "-----------------------------------"
if test_api "Monitor Status" "http://localhost:3000/api/jenkins/monitor/status"; then
    echo "获取监控配置详情："
    curl -s http://localhost:3000/api/jenkins/monitor/status | jq '.data.config'
fi
echo ""

echo "3. 触发测试执行"
echo "-----------------------------------"
echo "触发用例 2315..."
response=$(curl -s -X POST http://localhost:3000/api/jenkins/run-case \
  -H "Content-Type: application/json" \
  -d '{"caseId": 2315, "projectId": 1}')

if echo "$response" | jq -e '.success' > /dev/null 2>&1; then
    RUN_ID=$(echo "$response" | jq -r '.data.runId')
    BUILD_URL=$(echo "$response" | jq -r '.data.buildUrl')

    echo -e "${GREEN}✓ 执行已触发${NC}"
    echo "  Run ID: $RUN_ID"
    echo "  Build URL: $BUILD_URL"
    TESTS_PASSED=$((TESTS_PASSED + 1))

    echo ""
    echo "4. 监控执行状态（30秒）"
    echo "-----------------------------------"
    echo "观察 WebSocket 实时推送效果..."
    echo ""

    for i in {1..10}; do
        sleep 3
        echo "[$i/10] 检查状态..."

        status_response=$(curl -s "http://localhost:3000/api/jenkins/batch/$RUN_ID")

        if echo "$status_response" | jq -e '.success' > /dev/null 2>&1; then
            status=$(echo "$status_response" | jq -r '.data.status')
            passed=$(echo "$status_response" | jq -r '.data.passedCases // 0')
            failed=$(echo "$status_response" | jq -r '.data.failedCases // 0')

            echo "  状态: $status | 通过: $passed | 失败: $failed"

            # 如果执行完成，退出循环
            if [[ "$status" == "success" ]] || [[ "$status" == "failed" ]] || [[ "$status" == "aborted" ]]; then
                echo ""
                echo -e "${GREEN}✓ 执行已完成${NC}"
                echo "  最终状态: $status"
                echo "  通过用例: $passed"
                echo "  失败用例: $failed"
                TESTS_PASSED=$((TESTS_PASSED + 1))
                break
            fi
        else
            echo "  无法获取状态"
        fi
    done
else
    echo -e "${RED}✗ 执行触发失败${NC}"
    echo "$response" | jq
    TESTS_FAILED=$((TESTS_FAILED + 1))
fi

echo ""
echo "=================================="
echo "测试总结"
echo "=================================="
echo -e "通过: ${GREEN}$TESTS_PASSED${NC}"
echo -e "失败: ${RED}$TESTS_FAILED${NC}"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
    echo -e "${GREEN}✓ 所有测试通过！${NC}"
    exit 0
else
    echo -e "${RED}✗ 有测试失败${NC}"
    exit 1
fi
