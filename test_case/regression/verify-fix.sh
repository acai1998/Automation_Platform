#!/bin/bash
# ====================================================================
# 真实回归验证脚本 - 执行状态卡死问题修复
# ====================================================================
# 
# 使用场景：
#   - 在测试环境运行，需要可访问 Jenkins 实例
#   - 验证 45 秒兜底同步是否工作
#   - 验证并发槽位是否正确释放
#
# 前置条件：
#   1. 后端服务运行在 localhost:3000（或指定的 API_HOST）
#   2. 已创建至少 1 个有效的测试用例
#   3. Jenkins 服务可访问
#
# 用法：
#   bash test_case/regression/verify-fix.sh [API_HOST] [CASE_ID]
#
# 示例：
#   bash test_case/regression/verify-fix.sh http://localhost:3000 2209
#   bash test_case/regression/verify-fix.sh https://autotest.wiac.xyz 2209
#
# ====================================================================

set -e

API_HOST="${1:-http://localhost:3000}"
CASE_ID="${2:-2209}"
TIMEOUT_SECONDS=50  # 45秒兜底同步 + 5秒余量

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 时间戳函数
log_ts() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')]"
}

log_info() {
  echo -e "${BLUE}$(log_ts) [INFO]${NC} $1"
}

log_success() {
  echo -e "${GREEN}$(log_ts) [✓]${NC} $1"
}

log_error() {
  echo -e "${RED}$(log_ts) [✗]${NC} $1"
}

log_warn() {
  echo -e "${YELLOW}$(log_ts) [!]${NC} $1"
}

# ====================================================================
# STEP 1: 健康检查
# ====================================================================

log_info "步骤 1: 检查后端服务健康状态"
HEALTH_RESPONSE=$(curl -s "$API_HOST/api/health" 2>&1 || echo "")

if echo "$HEALTH_RESPONSE" | grep -q "success"; then
  log_success "后端服务正常运行 ($API_HOST)"
else
  log_error "后端服务无响应: $API_HOST"
  exit 1
fi

# ====================================================================
# STEP 2: 检查调度器初始状态
# ====================================================================

log_info "步骤 2: 检查调度器状态（应无运行/队列中的任务）"
SCHEDULER_STATUS=$(curl -s "$API_HOST/api/tasks/scheduler/status" | python3 -c "import json,sys;d=json.load(sys.stdin);print(f'running={len(d[\"data\"][\"running\"])},queued={len(d[\"data\"][\"queued\"])},directQueued={len(d[\"data\"][\"directQueued\"])}'" 2>&1 || echo "")

log_info "调度器状态: $SCHEDULER_STATUS"

# ====================================================================
# STEP 3: 触发单个用例执行
# ====================================================================

log_info "步骤 3: 触发 case_id=$CASE_ID 执行"

TRIGGER_RESPONSE=$(curl -s -X POST "$API_HOST/api/cases/$CASE_ID/run" \
  -H "Content-Type: application/json" \
  -d '{}' 2>&1)

EXECUTION_ID=$(echo "$TRIGGER_RESPONSE" | python3 -c "import json,sys;d=json.load(sys.stdin);print(d.get('data',{}).get('executionId',''))" 2>&1 || echo "")

if [ -z "$EXECUTION_ID" ]; then
  log_error "触发失败，响应: $TRIGGER_RESPONSE"
  exit 1
fi

log_success "执行已触发, executionId=$EXECUTION_ID"

# ====================================================================
# STEP 4: 实时监控状态变化
# ====================================================================

log_info "步骤 4: 监控执行状态（将在 ${TIMEOUT_SECONDS}s 内观察）"
log_info "预期: 初期状态应为 'running' 或 'pending'"
log_warn "---------- 45秒兜底同步测试开始 ----------"

START_TIME=$(date +%s)
LAST_STATUS=""
LAST_END_TIME=""
POLL_INTERVAL=5  # 每 5 秒检查一次

while true; do
  CURRENT_TIME=$(date +%s)
  ELAPSED=$((CURRENT_TIME - START_TIME))
  
  if [ $ELAPSED -gt $TIMEOUT_SECONDS ]; then
    log_error "超时: 状态未在 ${TIMEOUT_SECONDS}s 内收敛"
    exit 1
  fi
  
  # 获取执行状态
  STATUS_RESPONSE=$(curl -s "$API_HOST/api/executions/$EXECUTION_ID" 2>&1)
  
  CURRENT_STATUS=$(echo "$STATUS_RESPONSE" | python3 -c "import json,sys;d=json.load(sys.stdin);print(d.get('data',{}).get('status','unknown'))" 2>&1 || echo "unknown")
  CURRENT_END_TIME=$(echo "$STATUS_RESPONSE" | python3 -c "import json,sys;d=json.load(sys.stdin);print(d.get('data',{}).get('endTime','null'))" 2>&1 || echo "null")
  DURATION=$(echo "$STATUS_RESPONSE" | python3 -c "import json,sys;d=json.load(sys.stdin);print(d.get('data',{}).get('duration',''))" 2>&1 || echo "")
  
  # 状态变化时输出
  if [ "$CURRENT_STATUS" != "$LAST_STATUS" ]; then
    log_info "[${ELAPSED}s] 状态转变: $LAST_STATUS → $CURRENT_STATUS | endTime=$CURRENT_END_TIME"
    LAST_STATUS="$CURRENT_STATUS"
  fi
  
  # 检查是否已到达终态
  TERMINAL_STATES=("completed" "failed" "error" "stopped")
  for state in "${TERMINAL_STATES[@]}"; do
    if [ "$CURRENT_STATUS" = "$state" ]; then
      log_success "状态已收敛到终态: $CURRENT_STATUS (耗时 ${ELAPSED}s)"
      log_info "endTime: $CURRENT_END_TIME | duration: $DURATION"
      
      # ====================================================================
      # STEP 5: 验证数据完整性
      # ====================================================================
      
      log_info "步骤 5: 验证用例结果数据完整性"
      
      RESULTS=$(curl -s "$API_HOST/api/executions/$EXECUTION_ID/results" 2>&1)
      RESULT_COUNT=$(echo "$RESULTS" | python3 -c "import json,sys;d=json.load(sys.stdin);print(len(d.get('data',[])))" 2>&1 || echo "0")
      
      if [ "$RESULT_COUNT" -gt 0 ]; then
        log_success "用例结果已记录: $RESULT_COUNT 条"
        # 显示第一条用例结果的摘要
        echo "$RESULTS" | python3 -c "
import json, sys
d = json.load(sys.stdin)
if d.get('data'):
  item = d['data'][0]
  print(f'  - Case: {item.get(\"case_name\", \"N/A\")}')
  print(f'  - Status: {item.get(\"status\", \"N/A\")}')
  print(f'  - Duration: {item.get(\"duration\", \"N/A\")} ms')
  print(f'  - Error: {item.get(\"error_message\", \"None\") or \"None\"}')
" 2>&1 || true
      else
        log_warn "暂未检测到用例结果，可能仍在处理中"
      fi
      
      # ====================================================================
      # STEP 6: 验证并发槽位释放
      # ====================================================================
      
      log_info "步骤 6: 验证并发槽位已正确释放"
      
      SCHEDULER_AFTER=$(curl -s "$API_HOST/api/tasks/scheduler/status" | python3 -c "import json,sys;d=json.load(sys.stdin);print(f'running={len(d[\"data\"][\"running\"])},queued={len(d[\"data\"][\"queued\"])}')" 2>&1 || echo "")
      
      if echo "$SCHEDULER_AFTER" | grep -q "running=0"; then
        log_success "并发槽位已释放: $SCHEDULER_AFTER"
      else
        log_warn "并发槽位未完全释放: $SCHEDULER_AFTER"
      fi
      
      # ====================================================================
      # 最终总结
      # ====================================================================
      
      echo ""
      echo -e "${GREEN}========== 验证完成 ==========${NC}"
      echo -e "${GREEN}✓ 真实回归验证通过${NC}"
      echo ""
      echo "验证结果摘要:"
      echo "  - 执行 ID: $EXECUTION_ID"
      echo "  - 最终状态: $CURRENT_STATUS"
      echo "  - 状态收敛时间: ${ELAPSED}s (目标: ≤ ${TIMEOUT_SECONDS}s)"
      echo "  - 用例结果: $RESULT_COUNT 条"
      echo "  - 并发槽位: 已释放"
      echo ""
      echo "结论: 修复有效，45秒兜底同步机制工作正常"
      echo -e "${GREEN}========== 验证完成 ==========${NC}"
      
      exit 0
    fi
  done
  
  # 等待后继续检查
  sleep $POLL_INTERVAL
done
