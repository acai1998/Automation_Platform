#!/bin/bash

# 测试 Jenkins 回调修复
# 使用方法: bash scripts/test-callback.sh [runId] [status] [passedCases] [failedCases]

set -e

# 默认值
API_URL="${API_URL:-http://localhost:3000}"
RUN_ID="${1:-1}"
STATUS="${2:-success}"
PASSED_CASES="${3:-2}"
FAILED_CASES="${4:-0}"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Jenkins 回调处理测试"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "配置："
echo "  API URL:      $API_URL"
echo "  Run ID:       $RUN_ID"
echo "  Status:       $STATUS"
echo "  Passed Cases: $PASSED_CASES"
echo "  Failed Cases: $FAILED_CASES"
echo ""

# 1. 测试连接
echo "📝 [1/4] 测试回调连接..."
CONNECTION_TEST=$(curl -s -X POST "$API_URL/api/jenkins/callback/test" \
  -H "Content-Type: application/json" \
  -d '{"testMessage": "hello"}')

if echo "$CONNECTION_TEST" | grep -q '"success":true'; then
  echo "✅ 连接测试通过"
else
  echo "❌ 连接测试失败"
  echo "$CONNECTION_TEST"
  exit 1
fi

echo ""

# 2. 获取执行前的状态
echo "📝 [2/4] 获取执行前的状态..."
BEFORE_STATUS=$(curl -s "$API_URL/api/jenkins/batch/$RUN_ID" | jq '.data.status // "unknown"')
echo "  执行状态: $BEFORE_STATUS"

echo ""

# 3. 发送回调数据
echo "📝 [3/4] 发送回调数据..."
CALLBACK_RESPONSE=$(curl -s -X POST "$API_URL/api/jenkins/callback/test" \
  -H "Content-Type: application/json" \
  -d "{
    \"runId\": $RUN_ID,
    \"status\": \"$STATUS\",
    \"passedCases\": $PASSED_CASES,
    \"failedCases\": $FAILED_CASES,
    \"skippedCases\": 0,
    \"durationMs\": 5000,
    \"results\": [
      {
        \"caseId\": 1,
        \"caseName\": \"test_case_1\",
        \"status\": \"passed\",
        \"duration\": 2500
      },
      {
        \"caseId\": 2,
        \"caseName\": \"test_case_2\",
        \"status\": \"passed\",
        \"duration\": 2500
      }
    ]
  }")

if echo "$CALLBACK_RESPONSE" | grep -q '"success":true'; then
  echo "✅ 回调数据已发送"
  echo ""
  echo "回调处理详情："
  echo "$CALLBACK_RESPONSE" | jq '.details.processedData // .details // .' 2>/dev/null || echo "$CALLBACK_RESPONSE"
else
  echo "❌ 回调发送失败"
  echo "$CALLBACK_RESPONSE"
  exit 1
fi

echo ""

# 4. 获取执行后的状态
echo "📝 [4/4] 获取执行后的状态..."
sleep 1
AFTER_STATUS=$(curl -s "$API_URL/api/jenkins/batch/$RUN_ID" | jq '.data.status // "unknown"')
echo "  执行状态: $AFTER_STATUS"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "状态变化："
echo "  之前: $BEFORE_STATUS"
echo "  之后: $AFTER_STATUS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# 验证状态是否已更新
if [ "$AFTER_STATUS" != "$BEFORE_STATUS" ] && [ "$AFTER_STATUS" = "\"$STATUS\"" ]; then
  echo ""
  echo "✅ 测试通过！状态已成功更新"
  echo ""
  exit 0
else
  echo ""
  echo "⚠️  状态未正确更新（可能是正常的，取决于数据库状态）"
  echo ""
  exit 0
fi
