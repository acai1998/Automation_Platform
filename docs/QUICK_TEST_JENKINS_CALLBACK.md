# Jenkins 回调快速测试指南

## 你遇到的问题

✅ 测试回调接口成功
❌ 但执行记录状态一直显示 "running"
❌ 实际 Jenkins Job 已经失败

## 快速解决步骤

### 步骤 1：验证当前问题

查看 runId=58 的执行记录：

```bash
curl "http://localhost:5173/api/executions/test-runs?limit=1&offset=0"
```

你会看到类似这样的返回：
```json
{
  "id": 58,
  "status": "running",  // ← 还是 running
  "jenkins_build_id": "110",
  "jenkins_url": "http://jenkins.wiac.xyz:8080/job/SeleniumBaseCi-AutoTest/110/",
  "total_cases": 1,
  "passed_cases": 0,
  "failed_cases": 0
}
```

### 步骤 2：使用新的测试接口验证真实处理

现在可以直接在测试中更新数据：

```bash
curl -X POST http://localhost:3000/api/jenkins/callback/test \
  -H "X-Api-Key: 3512fc38e1882a9ad2ab88c436277c129517e24a76daad1849ef419f90fd8a4f" \
  -H "Content-Type: application/json" \
  -d '{
    "runId": 58,
    "status": "failed",
    "passedCases": 0,
    "failedCases": 1,
    "skippedCases": 0,
    "durationMs": 125000
  }'
```

**期望响应：**
```json
{
  "success": true,
  "message": "Test callback processed successfully - 测试回调数据已处理",
  "mode": "REAL_DATA",
  "diagnostics": {
    "dataProcessing": "SUCCESS",
    "processingTimeMs": 156
  }
}
```

### 步骤 3：验证数据是否已更新

再次查询执行记录：

```bash
curl "http://localhost:5173/api/executions/test-runs?limit=1&offset=0"
```

现在应该看到：
```json
{
  "id": 58,
  "status": "failed",  // ← 已更新！
  "jenkins_build_id": "110",
  "passed_cases": 0,
  "failed_cases": 1,
  "end_time": "2026-01-18T13:35:00.000Z",
  "duration_ms": 125000
}
```

---

## 如果测试失败了？

### 错误：`Execution not found in Auto_TestRun`

**原因：** runId 不存在

**解决方案：**
1. 先执行一个测试来创建记录
2. 从响应中获取正确的 runId
3. 再使用该 runId 进行测试

### 错误：`Failed to update Auto_TestRun`

**原因：** 数据库操作失败

**解决方案：**
1. 检查后端日志，查看详细错误信息
2. 确保数据库连接正常
3. 查看 `[BATCH-EXECUTION]` 的日志输出

### 状态没有更新

**原因：** 可能是缓存或查询问题

**解决方案：**
1. 稍等 1-2 秒，确保数据库事务完成
2. 直接查询数据库：
   ```sql
   SELECT id, status, passed_cases, failed_cases FROM Auto_TestRun WHERE id = 58;
   ```

---

## 步骤 4：修复真实的 Jenkins 回调问题

现在你已经验证了系统可以正确处理回调数据，可以用新的手动同步接口来修复卡住的执行记录：

```bash
# 手动同步 runId=58 为失败状态
curl -X POST http://localhost:3000/api/jenkins/callback/manual-sync/58 \
  -H "X-Api-Key: 3512fc38e1882a9ad2ab88c436277c129517e24a76daad1849ef419f90fd8a4f" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "failed",
    "passedCases": 0,
    "failedCases": 1,
    "skippedCases": 0,
    "durationMs": 125000
  }'
```

---

## 下一步

### 1. 验证实际 Jenkins 回调

当下次 Jenkins Job 完成时，检查是否正确回调：

1. 访问 Jenkins 构建页面查看日志
2. 搜索 `curl` 命令的输出
3. 查看是否有 `"success": true` 的响应

### 2. 查看后端日志

启动后端时查看日志：

```bash
npm run server 2>&1 | tee server.log
```

搜索 `[CALLBACK-TEST]` 或 `[BATCH-EXECUTION]` 查看处理过程

### 3. 监控重要记录

当有长时间处于 "running" 的执行时，可以：

```bash
# 查询所有运行中的执行
curl "http://localhost:3000/api/executions/test-runs" | grep -i running

# 然后手动同步修复它们
curl -X POST http://localhost:3000/api/jenkins/callback/manual-sync/[runId] \
  -H "X-Api-Key: ..." \
  -H "Content-Type: application/json" \
  -d '{"status": "failed", "passedCases": 0, "failedCases": 1, "skippedCases": 0, "durationMs": 0}'
```

---

## 功能总结

| 需求 | 解决方案 | API 端点 |
|------|---------|---------|
| 测试回调连接 | 不传 runId，仅测试连接 | `POST /api/jenkins/callback/test` |
| 测试回调处理 | 传入真实数据，真实处理 | `POST /api/jenkins/callback/test` |
| 手动修复失败的执行 | 手动提供正确状态 | `POST /api/jenkins/callback/manual-sync/:runId` |
| 强制更新已完成记录 | 添加 `force=true` | `POST /api/jenkins/callback/manual-sync/:runId` |

---

## 完成检查清单

- [ ] 运行步骤 1，确认问题存在
- [ ] 运行步骤 2，验证新接口可以处理数据
- [ ] 运行步骤 3，确认数据已更新到数据库
- [ ] 查看后端日志，理解处理过程
- [ ] 对实际 Jenkins Job 执行同样的修复
- [ ] 验证前端 UI 显示正确的状态

完成后，你的 Jenkins 集成就能正常工作了！🎉
