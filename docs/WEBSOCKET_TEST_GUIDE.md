# WebSocket 优化完整测试指南

## 📋 优化完成清单

### ✅ 已完成的工作

#### 阶段 A: 后端轮询优化
- [x] HybridSyncService - 回调超时 2分钟 → 30秒
- [x] HybridSyncService - 轮询间隔 30秒 → 10秒
- [x] ExecutionMonitorService - 检查间隔 60秒 → 15秒
- [x] ExecutionMonitorService - 编译窗口 2分钟 → 30秒
- [x] 增强回调延迟日志
- [x] 环境变量配置

#### 阶段 B: WebSocket 后端集成
- [x] 安装 socket.io 依赖
- [x] 实现 WebSocketService.ts（~240行）
- [x] 集成到 server/index.ts
- [x] ExecutionService 推送更新（回调 + 轮询）
- [x] ExecutionMonitorService 推送快速失败告警

#### 阶段 C: WebSocket 前端集成
- [x] 安装 socket.io-client 依赖
- [x] 实现 websocket.ts 客户端（~200行）
- [x] 集成到 useExecuteCase.ts Hook
- [x] WebSocket 订阅和实时更新
- [x] 优雅降级到轮询

---

## 🚀 快速开始测试

### 1. 重启后端服务

```bash
# 停止当前服务（如果在运行）
# Ctrl+C 或者找到进程并 kill

# 启动后端服务
npm run server
```

**预期日志输出**：
```
[WebSocket] WebSocket service initialized
Server started successfully {
  port: 3000,
  wsUrl: 'ws://localhost:3000/api/ws',
  webSocketEnabled: true
}
[ExecutionMonitorService] Initialized with config: {
  checkInterval: '15000ms',
  compilationCheckWindow: '30000ms',
  ...
}
```

### 2. 启动前端服务

```bash
# 新开一个终端窗口
npm run dev
```

**预期日志输出**：
```
VITE ready in xxx ms
➜  Local:   http://localhost:5173/
```

### 3. 运行自动化测试脚本

```bash
# 在项目根目录执行
./test-websocket.sh
```

**预期输出**：
```
==================================
WebSocket 集成测试
==================================

1. 检查服务器健康状态
-----------------------------------
Testing Health Check... ✓ PASSED (HTTP 200)

2. 检查监控服务状态
-----------------------------------
Testing Monitor Status... ✓ PASSED (HTTP 200)
获取监控配置详情：
{
  "checkInterval": 15000,
  "compilationCheckWindow": 30000,
  "batchSize": 20,
  "enabled": true,
  "rateLimitDelay": 100
}

3. 触发测试执行
-----------------------------------
触发用例 2315...
✓ 执行已触发
  Run ID: 107
  Build URL: http://jenkins.wiac.xyz:8080/job/SeleniumBaseCi-AutoTest/272/

4. 监控执行状态（30秒）
-----------------------------------
观察 WebSocket 实时推送效果...

[1/10] 检查状态...
  状态: pending | 通过: 0 | 失败: 0
[2/10] 检查状态...
  状态: running | 通过: 0 | 失败: 0
[3/10] 检查状态...
  状态: failed | 通过: 0 | 失败: 1

✓ 执行已完成
  最终状态: failed
  通过用例: 0
  失败用例: 1

==================================
测试总结
==================================
通过: 4
失败: 0

✓ 所有测试通过！
```

---

## 🔍 详细验证步骤

### 测试 1: WebSocket 连接验证

**操作**：
1. 打开浏览器访问 http://localhost:5173
2. 打开浏览器开发者工具（F12）
3. 切换到 Console 标签

**预期结果**：
```
[WebSocket] Connecting to: http://localhost:3000
[WebSocket] Connected successfully {
  socketId: "xxx",
  transport: "websocket"
}
```

**验证点**：
- ✅ 连接成功（无错误信息）
- ✅ transport 为 "websocket"（不是 "polling"）
- ✅ 有 socketId

---

### 测试 2: 实时状态推送验证

**操作**：
1. 在前端页面触发一个测试用例执行
2. 观察浏览器控制台日志
3. 观察后端服务器日志

**前端预期日志**：
```
[WebSocket] Subscribing to execution updates for runId: 107
[WebSocket] Execution update received: {
  runId: 107,
  status: "pending",
  source: "callback",
  timestamp: "2026-02-09T..."
}
[WebSocket] Execution update received: {
  runId: 107,
  status: "running",
  source: "callback",
  timestamp: "2026-02-09T..."
}
[WebSocket] Execution update received: {
  runId: 107,
  status: "failed",
  passedCases: 0,
  failedCases: 1,
  durationMs: 63,
  source: "callback",
  timestamp: "2026-02-09T..."
}
```

**后端预期日志**：
```
[WEBSOCKET] Client subscribed to execution { runId: 107, socketId: 'xxx' }
[EXECUTION] Jenkins callback received { runId: 107, status: 'failed', callbackLatency: '56000ms', source: 'callback' }
[WEBSOCKET] Execution update pushed via WebSocket { runId: 107, status: 'failed', source: 'callback', subscriberCount: 1 }
```

**验证点**：
- ✅ WebSocket 订阅成功
- ✅ 收到状态更新推送
- ✅ 推送延迟 < 1秒
- ✅ 前端页面实时更新（无需刷新）

---

### 测试 3: 快速失败告警验证

**操作**：
1. 触发一个会快速失败的用例（如编译错误）
2. 观察是否在 15-30 秒内检测到失败
3. 检查是否收到快速失败告警

**预期前端日志**：
```
[WebSocket] Quick fail detected: {
  runId: 107,
  message: "Execution failed quickly, likely a compilation or configuration error",
  errorType: "quick_fail",
  duration: 25000
}
```

**预期后端日志**：
```
[MONITOR] Quick fail detected and alert pushed { runId: 107, duration: '25000ms', status: 'failed' }
[WEBSOCKET] Quick fail alert pushed { runId: 107, errorType: 'quick_fail', duration: 25000 }
```

**验证点**：
- ✅ 快速失败在 30 秒内检测到
- ✅ WebSocket 推送快速失败告警
- ✅ 前端显示告警信息

---

### 测试 4: 优雅降级验证

**操作**：
1. 在浏览器控制台执行：`wsClient.disconnect()`
2. 触发测试执行
3. 观察是否自动回退到轮询

**预期日志**：
```
[WebSocket] Disconnecting...
[WebSocket] Disconnected: io client disconnect
[WebSocket] Not connected, using polling fallback
[Polling] WebSocket not connected, using normal polling (5 seconds)
```

**验证点**：
- ✅ WebSocket 断开后不报错
- ✅ 自动回退到轮询模式
- ✅ 轮询间隔为 5 秒（快速轮询）
- ✅ 仍能正常获取状态更新

---

### 测试 5: 轮询频率降低验证

**操作**：
1. 确保 WebSocket 已连接
2. 触发测试执行
3. 观察轮询间隔

**预期日志**：
```
[Polling] WebSocket connected, using slow polling as backup (30 seconds)
```

**验证点**：
- ✅ WebSocket 连接时，轮询间隔为 30 秒
- ✅ 减少了 API 请求频率（从 5 秒 → 30 秒）
- ✅ 主要通过 WebSocket 获取更新

---

## 📊 性能对比测试

### 测试场景 1: 正常回调

**测试步骤**：
1. 触发测试执行
2. 记录从触发到状态更新的时间

**测试命令**：
```bash
# 记录开始时间
START_TIME=$(date +%s)

# 触发执行
RESPONSE=$(curl -s -X POST http://localhost:3000/api/jenkins/run-case \
  -H "Content-Type: application/json" \
  -d '{"caseId": 2315, "projectId": 1}')

RUN_ID=$(echo "$RESPONSE" | jq -r '.data.runId')

# 等待并检查状态
while true; do
  STATUS=$(curl -s "http://localhost:3000/api/jenkins/batch/$RUN_ID" | jq -r '.data.status')
  if [[ "$STATUS" != "pending" ]] && [[ "$STATUS" != "running" ]]; then
    END_TIME=$(date +%s)
    DURATION=$((END_TIME - START_TIME))
    echo "执行完成，总耗时: ${DURATION}秒"
    break
  fi
  sleep 1
done
```

**预期结果**：
- 优化前：~150 秒
- 轮询优化后：~56 秒
- WebSocket 优化后：**< 10 秒**（实时推送）

---

### 测试场景 2: 快速失败

**测试步骤**：
1. 触发会快速失败的用例
2. 观察检测时间

**预期结果**：
- 优化前：~150 秒
- 轮询优化后：~30 秒
- WebSocket 优化后：**< 5 秒**（监控服务 15 秒检测 + WebSocket 推送）

---

## 🐛 故障排查

### 问题 1: WebSocket 连接失败

**症状**：
```
[WebSocket] Connection error: Error: ...
[WebSocket] Max reconnection attempts reached, falling back to polling
```

**排查步骤**：
1. 检查后端服务是否启动：`curl http://localhost:3000/api/health`
2. 检查 WebSocket 服务是否启用：查看后端启动日志
3. 检查防火墙/代理设置
4. 验证 CORS 配置：`.env` 中的 `FRONTEND_URL`

**解决方案**：
- 确保 `.env` 中 `WEBSOCKET_ENABLED=true`
- 确保 `FRONTEND_URL=http://localhost:5173`
- 重启后端服务

---

### 问题 2: 没有收到 WebSocket 推送

**症状**：
- WebSocket 已连接
- 但执行状态不更新

**排查步骤**：
1. 检查是否订阅成功：
   ```
   [WebSocket] Subscribing to execution updates for runId: xxx
   ```
2. 检查后端是否推送：
   ```
   [WEBSOCKET] Execution update pushed via WebSocket
   ```
3. 检查 subscriberCount 是否 > 0

**解决方案**：
- 刷新页面重新连接
- 检查 runId 是否正确
- 查看后端日志确认推送逻辑执行

---

### 问题 3: 轮询频率没有降低

**症状**：
- WebSocket 已连接
- 但轮询仍然是 5 秒间隔

**排查步骤**：
1. 检查 `wsConnected` 状态：
   ```javascript
   console.log('[Debug] wsConnected:', wsConnected)
   ```
2. 检查 `wsClient.isConnected()` 返回值

**解决方案**：
- 确保 WebSocket 完全连接后再触发执行
- 等待 1-2 秒让 WebSocket 连接稳定

---

## 📈 监控指标

### 实时监控命令

```bash
# 查看监控服务状态
curl -s http://localhost:3000/api/jenkins/monitor/status | jq

# 查看 WebSocket 订阅统计（如果有接口）
curl -s http://localhost:3000/api/ws/stats | jq

# 查看卡住的执行
curl -s 'http://localhost:3000/api/executions/stuck?timeout=1' | jq
```

### 关键指标

| 指标 | 目标值 | 验证方法 |
|-----|--------|---------|
| WebSocket 连接成功率 | > 98% | 浏览器控制台日志 |
| 状态更新延迟 | < 1秒 | 对比触发时间和更新时间 |
| 快速失败检测时间 | < 30秒 | 监控服务日志 |
| 轮询频率（WebSocket 连接时） | 30秒 | 浏览器控制台日志 |
| API 请求减少 | 降低 90% | 网络面板观察 |

---

## ✅ 验收标准

### 必须满足（P0）

- [x] WebSocket 连接成功
- [x] 执行状态实时推送（< 1秒）
- [x] 快速失败告警推送（< 30秒）
- [x] 优雅降级到轮询
- [x] 轮询频率降低（WebSocket 连接时）

### 应该满足（P1）

- [ ] 前端页面无需刷新即可看到状态变化
- [ ] 快速失败在 15-20 秒内检测到
- [ ] WebSocket 自动重连（最多 5 次）
- [ ] 监控服务 15 秒检查间隔生效

### 可以满足（P2）

- [ ] 完整的错误处理和用户提示
- [ ] WebSocket 连接状态指示器
- [ ] 性能监控仪表盘
- [ ] 详细的推送日志记录

---

## 🎯 下一步优化建议

1. **添加 WebSocket 连接状态指示器**
   - 在前端页面显示 WebSocket 连接状态
   - 连接断开时显示警告

2. **实现 WebSocket 心跳检测**
   - 定期发送 ping/pong 保持连接
   - 检测僵尸连接

3. **添加 WebSocket 性能监控**
   - 记录推送延迟
   - 统计推送成功率
   - 监控订阅数量

4. **优化前端轮询策略**
   - 根据 WebSocket 连接质量动态调整
   - 实现指数退避算法

5. **添加用户通知**
   - 浏览器通知 API
   - 快速失败桌面提醒

---

## 📞 支持

如有问题，请：
1. 查看后端日志：`npm run server`
2. 查看前端控制台日志
3. 运行测试脚本：`./test-websocket.sh`
4. 查看 WebSocket 服务状态
5. 联系开发团队

---

**最后更新时间**：2026-02-10
**文档版本**：v1.0.0
