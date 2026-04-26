#!/bin/bash

# 快速验证脚本 - 检查所有优化是否生效

echo "🔍 快速验证 WebSocket 优化..."
echo ""

# 颜色
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

check_pass() {
    echo -e "${GREEN}✓${NC} $1"
}

check_fail() {
    echo -e "${RED}✗${NC} $1"
}

check_warn() {
    echo -e "${YELLOW}⚠${NC} $1"
}

echo "1️⃣  检查后端服务..."
if curl -s http://localhost:3000/api/health > /dev/null 2>&1; then
    check_pass "后端服务运行正常"
else
    check_fail "后端服务未启动"
    echo "   请运行: npm run server"
    exit 1
fi

echo ""
echo "2️⃣  检查监控服务配置..."
CONFIG=$(curl -s http://localhost:3000/api/jenkins/monitor/status | jq -r '.data.config')

CHECK_INTERVAL=$(echo "$CONFIG" | jq -r '.checkInterval')
COMPILATION_WINDOW=$(echo "$CONFIG" | jq -r '.compilationCheckWindow')

if [ "$CHECK_INTERVAL" -eq 15000 ]; then
    check_pass "监控检查间隔: 15秒 (已优化)"
else
    check_fail "监控检查间隔: ${CHECK_INTERVAL}ms (应为 15000ms)"
fi

if [ "$COMPILATION_WINDOW" -eq 30000 ]; then
    check_pass "编译检查窗口: 30秒 (已优化)"
else
    check_fail "编译检查窗口: ${COMPILATION_WINDOW}ms (应为 30000ms)"
fi

echo ""
echo "3️⃣  检查环境变量配置..."
if grep -q "WEBSOCKET_ENABLED=true" .env 2>/dev/null; then
    check_pass "WebSocket 已启用"
elif grep -q "WEBSOCKET_ENABLED=false" .env 2>/dev/null; then
    check_warn "WebSocket 已禁用"
else
    check_warn "WebSocket 配置未找到（使用默认值 true）"
fi

if grep -q "CALLBACK_TIMEOUT=30000" .env 2>/dev/null; then
    check_pass "回调超时: 30秒 (已优化)"
else
    check_warn "回调超时配置未找到"
fi

if grep -q "POLL_INTERVAL=10000" .env 2>/dev/null; then
    check_pass "轮询间隔: 10秒 (已优化)"
else
    check_warn "轮询间隔配置未找到"
fi

echo ""
echo "4️⃣  检查前端服务..."
if curl -s http://localhost:5173 > /dev/null 2>&1; then
    check_pass "前端服务运行正常"
else
    check_warn "前端服务未启动"
    echo "   请运行: npm run dev"
fi

echo ""
echo "5️⃣  检查 WebSocket 依赖..."
if grep -q '"socket.io"' package.json; then
    check_pass "后端 socket.io 已安装"
else
    check_fail "后端 socket.io 未安装"
fi

if grep -q '"socket.io-client"' package.json; then
    check_pass "前端 socket.io-client 已安装"
else
    check_fail "前端 socket.io-client 未安装"
fi

echo ""
echo "6️⃣  检查关键文件..."
files=(
    "server/services/WebSocketService.ts"
    "src/services/websocket.ts"
    "test-websocket.sh"
    "WEBSOCKET_TEST_GUIDE.md"
)

for file in "${files[@]}"; do
    if [ -f "$file" ]; then
        check_pass "$file 存在"
    else
        check_fail "$file 不存在"
    fi
done

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "✨ 验证完成！"
echo ""
echo "下一步："
echo "  1. 运行完整测试: ./test-websocket.sh"
echo "  2. 查看测试指南: cat WEBSOCKET_TEST_GUIDE.md"
echo "  3. 打开浏览器测试: http://localhost:5173"
echo ""
