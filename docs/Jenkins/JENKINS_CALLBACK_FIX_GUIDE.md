# Jenkins 回调数据更新修复指南

## 问题背景

在测试 Jenkins 回调连接时，发现回调接口返回成功，但执行记录的状态一直显示为 "running"，实际上 Jenkins Job 已经失败。根本原因是：

1. **测试回调接口 (`/api/jenkins/callback/test`) 不处理真实数据**：只验证连接和认证，不更新数据库
2. **缺少手动修复机制**：当回调失败或数据不同步时，无法手动修正

## 修复方案概览

本次修复包含三个主要改进：

### 1. 增强测试回调接口 ✅
- 支持传入真实回调数据（runId、status 等）
- 如果提供了这些参数，则真实处理并更新数据库
- 保留原有的连接测试功能

### 2. 添加手动同步接口 ✅
- 新增 `POST /api/jenkins/callback/manual-sync/:runId` 端点
- 用于手动修复卡住的执行记录
- 支持强制更新已完成的记录（使用 `force=true`）

### 3. 增强错误处理和日志 ✅
- `completeBatchExecution` 方法现在包含详细的处理日志
- 每一步操作都有记录，便于调试
- 失败时返回明确的错误信息

---

## 使用指南

### 场景 1：测试回调连接（基础测试）

这是原有的测试模式，不处理真实数据：

```bash
curl -X POST http://localhost:3000/api/jenkins/callback/test \
  -H "X-Api-Key: 3512fc38e1882a9ad2ab88c436277c129517e24a76daad1849ef419f90fd8a4f" \
  -H "Content-Type: application/json" \
  -d '{
    "testMessage": "connection test"
  }'
```

**响应示例：**
```json
{
  "success": true,
  "message": "Callback test successful - 回调连接测试通过",
  "mode": "CONNECTION_TEST",
  "details": {
    "receivedAt": "2026-01-18T13:30:00.000Z",
    "authenticationMethod": "apikey",
    "clientIP": "::1"
  }
}
```

---

### 场景 2：测试回调并处理真实数据（推荐用于测试）

现在可以在测试时传入真实的回调数据，系统会实际处理并更新数据库：

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
    "durationMs": 120000,
    "results": [
      {
        "caseId": 1,
        "caseName": "test_case_1",
        "status": "failed",
        "duration": 120000,
        "errorMessage": "Assertion failed"
      }
    ]
  }'
```

**响应示例：**
```json
{
  "success": true,
  "message": "Test callback processed successfully - 测试回调数据已处理",
  "mode": "REAL_DATA",
  "details": {
    "receivedAt": "2026-01-18T13:30:00.000Z",
    "processedData": {
      "runId": 58,
      "status": "failed",
      "passedCases": 0,
      "failedCases": 1,
      "skippedCases": 0,
      "durationMs": 120000,
      "resultsCount": 1
    }
  },
  "diagnostics": {
    "dataProcessing": "SUCCESS",
    "processingTimeMs": 156
  }
}
```

**然后验证数据更新：**
```bash
curl "http://localhost:5173/api/executions/test-runs?limit=1&offset=0"
```

查看响应中 runId=58 的记录，状态应该已更新为 "failed"。

---

### 场景 3：手动同步失败的执行记录

当 Jenkins Job 完成但回调失败时，使用此接口手动同步：

```bash
# 查看当前状态
curl "http://localhost:3000/api/jenkins/batch/58"

# 手动同步到失败状态
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

**响应示例：**
```json
{
  "success": true,
  "message": "Manual sync completed successfully",
  "previous": {
    "id": 58,
    "status": "running",
    "totalCases": 1,
    "passedCases": 0,
    "failedCases": 0,
    "skippedCases": 0
  },
  "updated": {
    "id": 58,
    "status": "failed",
    "totalCases": 1,
    "passedCases": 0,
    "failedCases": 1,
    "skippedCases": 0,
    "durationMs": 125000
  },
  "timing": {
    "processingTimeMs": 142,
    "timestamp": "2026-01-18T13:35:00.000Z"
  }
}
```

---

### 场景 4：强制更新已完成的记录

如果需要修正已完成的记录状态，使用 `force=true`：

```bash
curl -X POST http://localhost:3000/api/jenkins/callback/manual-sync/58 \
  -H "X-Api-Key: 3512fc38e1882a9ad2ab88c436277c129517e24a76daad1849ef419f90fd8a4f" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "success",
    "passedCases": 1,
    "failedCases": 0,
    "skippedCases": 0,
    "durationMs": 120000,
    "force": true
  }'
```

---

## 故障排查

### 问题 1：测试回调时收到 "Execution not found" 错误

**原因：** 提供的 `runId` 不存在于数据库

**解决方案：**
1. 确保已先创建执行记录（触发一个测试执行）
2. 使用正确的 `runId`
3. 查询 `/api/executions/test-runs` 查看有效的 runId

### 问题 2：手动同步返回 "Execution is already completed"

**原因：** 执行记录已完成，不能修改

**解决方案：**
1. 添加 `"force": true` 到请求体强制更新
2. 或检查执行状态是否确实需要修改

### 问题 3：回调处理失败

**原因：** 多种可能（数据库连接、SQL 错误等）

**解决方案：**
1. 查看后端日志，查找 `[BATCH-EXECUTION]` 或 `[CALLBACK-TEST]` 的错误信息
2. 检查 runId 是否存在于 `Auto_TestRun` 表
3. 检查数据库连接是否正常
4. 确保 `completeBatchExecution` 方法能访问数据库

---

## 后端日志示例

### 成功的回调处理日志

```
[CALLBACK-TEST] Received test callback from ::1
[CALLBACK-TEST] Processing real callback data: { runId: 58, status: 'failed', passedCases: 0, failedCases: 1, ... }
[BATCH-EXECUTION] ========== Processing runId: 58 ==========
[BATCH-EXECUTION] Found execution record: { id: 58, currentStatus: 'running' }
[BATCH-EXECUTION] Found executionId: 42 for runId: 58
[BATCH-EXECUTION] Auto_TestRun UPDATE affected 1 rows
[BATCH-EXECUTION] ========== Completed runId: 58 ========== { status: 'failed', processingTimeMs: 156, summary: { executionRecordUpdated: true } }
[CALLBACK-TEST] Successfully processed real callback for runId 58 in 158ms
```

### 失败的回调处理日志

```
[CALLBACK-TEST] Processing real callback data: { runId: 999, status: 'failed', ... }
[BATCH-EXECUTION] ========== Processing runId: 999 ==========
[BATCH-EXECUTION] ========== FAILED: runId=999 ==========
  error: "Execution not found in Auto_TestRun: runId=999"
```

---

## 集成到 Jenkins Pipeline

当 Jenkins 执行完成后，Jenkinsfile 调用回调接口：

```groovy
stage('回调平台') {
    steps {
        script {
            sh '''
                BUILD_DURATION_MS=$((BUILD_DURATION * 1000))
                
                curl -X POST "${CALLBACK_URL}" \
                    -H "Content-Type: application/json" \
                    -H "X-Api-Key: ${JENKINS_API_KEY}" \
                    -d "{
                        \"runId\": ${RUN_ID},
                        \"status\": \"$STATUS\",
                        \"passedCases\": $PASSED,
                        \"failedCases\": $FAILED,
                        \"skippedCases\": $SKIPPED,
                        \"durationMs\": $BUILD_DURATION_MS,
                        \"buildUrl\": \"${BUILD_URL}\"
                    }" || echo "Callback failed"
            '''
        }
    }
}
```

---

## API 参考

### POST /api/jenkins/callback/test

**功能：** 测试回调连接和认证，可选择处理真实数据

**认证：** 需要 API Key 或 JWT Token

**请求体（基础连接测试）：**
```json
{
  "testMessage": "test"
}
```

**请求体（真实数据处理）：**
```json
{
  "runId": 58,
  "status": "failed",
  "passedCases": 0,
  "failedCases": 1,
  "skippedCases": 0,
  "durationMs": 120000,
  "results": []
}
```

---

### POST /api/jenkins/callback/manual-sync/:runId

**功能：** 手动同步执行状态

**认证：** 需要 API Key 或 JWT Token

**URL 参数：**
- `runId` (number): 执行批次 ID

**请求体：**
```json
{
  "status": "failed",
  "passedCases": 0,
  "failedCases": 1,
  "skippedCases": 0,
  "durationMs": 125000,
  "results": [],
  "force": false
}
```

**响应（成功）：**
```json
{
  "success": true,
  "message": "Manual sync completed successfully",
  "previous": { ... },
  "updated": { ... },
  "timing": { ... }
}
```

---

## 总结

这次修复为用户提供了：

1. ✅ **测试工具**：可以在测试时真实验证回调处理流程
2. ✅ **手动修复**：当回调失败时，可以手动同步数据
3. ✅ **详细日志**：便于调试和问题排查
4. ✅ **强制更新**：在必要时可以覆盖已完成的记录

现在您可以放心地测试 Jenkins 集成，并在出现问题时迅速修复！
