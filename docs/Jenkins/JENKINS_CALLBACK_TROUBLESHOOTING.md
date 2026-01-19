# Jenkins 回调问题排查指南

## 问题现象
- Jenkins 执行已完成(成功/失败),但平台显示状态仍为 `running`
- 前端轮询一直看不到更新的状态
- 后端日志中没有任何 `[CALLBACK]` 相关的日志输出

## 根本原因
**Jenkins 没有成功回调到平台的回调接口**,导致执行结果无法同步到数据库。

---

## 快速修复 - 手动同步状态

如果执行记录已卡住,可以使用以下方法立即修复:

### 方法1:使用 API 手动同步(推荐)

```bash
# 替换 <runId> 为你的执行ID
curl -X POST http://localhost:3000/api/executions/<runId>/sync
```

示例:
```bash
curl -X POST http://localhost:3000/api/executions/64/sync
```

### 方法2:批量同步所有卡住的执行

```bash
curl -X POST http://localhost:3000/api/executions/sync-stuck \
  -H "Content-Type: application/json" \
  -d '{"timeoutMinutes": 10, "maxExecutions": 20}'
```

### 方法3:查询卡住的执行列表

```bash
curl http://localhost:3000/api/executions/stuck?timeout=10
```

---

## 根本解决 - 配置 Jenkins 回调

### 步骤1:确认平台配置

检查 `.env` 文件中的以下配置:

```bash
# Jenkins 基础配置
JENKINS_URL=http://jenkins.wiac.xyz:8080          # Jenkins 服务器地址
JENKINS_USER=your_username                        # Jenkins 用户名
JENKINS_TOKEN=your_api_token                      # Jenkins API Token

# 回调认证配置(至少配置一种)
JENKINS_API_KEY=your_api_key                      # API Key 认证
JENKINS_JWT_SECRET=your_jwt_secret                # JWT Token 认证
JENKINS_SIGNATURE_SECRET=your_signature_secret    # HMAC 签名认证

# 回调地址(Jenkins 能访问到的地址)
API_CALLBACK_URL=http://your-platform-host:3000   # 平台回调地址
```

**重要说明:**
- `API_CALLBACK_URL` 必须是 Jenkins **能够访问到**的地址
- 如果 Jenkins 和平台在同一服务器,可以使用 `http://localhost:3000`
- 如果在不同服务器,必须使用外网可访问的地址或内网IP

### 步骤2:测试回调接口可访问性

#### 2.1 从本地测试

```bash
# 测试 API Key 认证
curl -X POST http://localhost:3000/api/jenkins/callback/test \
  -H "X-Api-Key: your_api_key" \
  -H "Content-Type: application/json" \
  -d '{"testMessage": "connection test"}'
```

#### 2.2 测试真实回调处理

```bash
# 使用真实数据测试(会实际更新数据库)
curl -X POST http://localhost:3000/api/jenkins/callback/test \
  -H "X-Api-Key: your_api_key" \
  -H "Content-Type: application/json" \
  -d '{
    "runId": 64,
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
        "errorMessage": "Test failed"
      }
    ]
  }'
```

#### 2.3 从 Jenkins 服务器测试

```bash
# 登录到 Jenkins 服务器,执行以下命令
curl -X POST http://your-platform-host:3000/api/jenkins/callback/test \
  -H "X-Api-Key: your_api_key" \
  -H "Content-Type: application/json" \
  -d '{"testMessage": "test from jenkins server"}'
```

**如果无法访问**:
- 检查防火墙规则,确保 3000 端口开放
- 检查网络连通性(`ping`, `telnet`)
- 检查平台服务是否正在运行

### 步骤3:配置 Jenkins Job 回调

在 Jenkins Job 的构建后步骤中添加回调脚本:

#### 3.1 使用 HTTP Request Plugin(推荐)

安装 Jenkins 的 [HTTP Request Plugin](https://plugins.jenkins.io/http-request/)

在 Pipeline 脚本中添加:

```groovy
// 在 Jenkins Pipeline 最后添加
post {
    always {
        script {
            def callbackUrl = "http://your-platform-host:3000/api/jenkins/callback"
            def apiKey = "your_api_key"
            
            def callbackData = [
                runId: params.RUN_ID.toInteger(),
                status: currentBuild.result == 'SUCCESS' ? 'success' : 'failed',
                passedCases: env.PASSED_CASES ? env.PASSED_CASES.toInteger() : 0,
                failedCases: env.FAILED_CASES ? env.FAILED_CASES.toInteger() : 0,
                skippedCases: env.SKIPPED_CASES ? env.SKIPPED_CASES.toInteger() : 0,
                durationMs: currentBuild.duration,
                results: []  // 详细结果数组
            ]
            
            httpRequest(
                url: callbackUrl,
                httpMode: 'POST',
                contentType: 'APPLICATION_JSON',
                customHeaders: [[name: 'X-Api-Key', value: apiKey]],
                requestBody: groovy.json.JsonOutput.toJson(callbackData),
                validResponseCodes: '200:299',
                ignoreSslErrors: true
            )
        }
    }
}
```

#### 3.2 使用 curl 命令

在 Jenkins Job 的 "构建后操作" 中添加 "Execute shell":

```bash
#!/bin/bash

# 回调配置
CALLBACK_URL="http://your-platform-host:3000/api/jenkins/callback"
API_KEY="your_api_key"
RUN_ID=${RUN_ID}  # 由平台传入的参数

# 构造回调数据
CALLBACK_DATA=$(cat <<EOF
{
  "runId": ${RUN_ID},
  "status": "${BUILD_RESULT}",
  "passedCases": ${PASSED_CASES:-0},
  "failedCases": ${FAILED_CASES:-0},
  "skippedCases": ${SKIPPED_CASES:-0},
  "durationMs": ${BUILD_DURATION},
  "results": []
}
EOF
)

# 发送回调
curl -X POST "${CALLBACK_URL}" \
  -H "X-Api-Key: ${API_KEY}" \
  -H "Content-Type: application/json" \
  -d "${CALLBACK_DATA}" \
  --max-time 30 \
  --retry 3 \
  || echo "Failed to send callback"
```

---

## 常见问题排查

### 问题1: 回调接口返回 401 Unauthorized

**原因**: 认证失败

**解决方法**:
1. 检查 `.env` 中是否配置了认证密钥
2. 确认 Jenkins 回调时发送了正确的认证头
3. 使用测试接口验证认证配置

```bash
# 测试 API Key 认证
curl -X POST http://localhost:3000/api/jenkins/callback/test \
  -H "X-Api-Key: $(grep JENKINS_API_KEY .env | cut -d'=' -f2)" \
  -H "Content-Type: application/json" \
  -d '{"testMessage": "test"}'
```

### 问题2: 回调接口返回 404 Not Found

**原因**: 路由不存在或路径错误

**解决方法**:
1. 确认回调路径为 `/api/jenkins/callback`(而不是 `/api/executions/callback`)
2. 检查后端路由是否正确注册

### 问题3: 回调接口超时

**原因**: 网络连通性问题

**解决方法**:
1. 从 Jenkins 服务器 ping 平台服务器
2. 使用 telnet 测试端口连通性: `telnet your-platform-host 3000`
3. 检查防火墙规则

### 问题4: Jenkins 执行完成但没有回调

**原因**: Jenkins Job 配置中没有回调逻辑

**解决方法**:
1. 检查 Jenkins Job 配置
2. 在 Pipeline 的 `post` 块中添加回调逻辑
3. 查看 Jenkins 构建日志,确认回调脚本是否执行

---

## 诊断命令汇总

```bash
# 1. 检查执行状态
curl http://localhost:3000/api/jenkins/batch/<runId>

# 2. 手动同步状态
curl -X POST http://localhost:3000/api/executions/<runId>/sync

# 3. 测试回调接口(连接测试)
curl -X POST http://localhost:3000/api/jenkins/callback/test \
  -H "X-Api-Key: your_api_key" \
  -H "Content-Type: application/json" \
  -d '{"testMessage": "test"}'

# 4. 测试回调接口(真实数据)
curl -X POST http://localhost:3000/api/jenkins/callback/test \
  -H "X-Api-Key: your_api_key" \
  -H "Content-Type: application/json" \
  -d '{
    "runId": 64,
    "status": "failed",
    "passedCases": 0,
    "failedCases": 1,
    "durationMs": 120000
  }'

# 5. 查询卡住的执行
curl http://localhost:3000/api/executions/stuck?timeout=10

# 6. 批量同步卡住的执行
curl -X POST http://localhost:3000/api/executions/sync-stuck \
  -H "Content-Type: application/json" \
  -d '{"timeoutMinutes": 10}'

# 7. 诊断回调配置
curl -X POST http://localhost:3000/api/jenkins/callback/diagnose \
  -H "Content-Type: application/json" \
  -d '{}'
```

---

## 监控和预防

### 启用混合同步机制

平台已实现混合同步机制(回调 + 主动轮询):
- 正常情况下使用 Jenkins 回调
- 回调失败时自动降级为主动轮询
- 定期检测超时执行并自动同步

### 前端手动同步

在执行详情页面提供"手动同步"按钮,允许用户主动触发状态同步。

### 监控告警

建议设置监控告警:
- 执行时间超过预期时长(如10分钟)
- 状态为 `running` 但超过最大轮询时长
- 回调失败率超过阈值

---

## 参考文档

- [API 文档](../API_DOCUMENTATION.md) - 完整的 API 接口文档
- [Jenkins 集成指南](./JENKINS_INTEGRATION_GUIDE.md) - Jenkins 集成详细说明
- [ExecutionService](../../server/services/ExecutionService.ts) - 执行服务源码
- [Jenkins 路由](../../server/routes/jenkins.ts) - Jenkins 相关路由实现
