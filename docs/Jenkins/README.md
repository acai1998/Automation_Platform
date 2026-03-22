# Jenkins 集成文档

## 📚 文档目录

### 快速参考
- **[快速配置指南](./JENKINS_QUICK_SETUP.md)** - 5分钟内完成 Jenkins 集成
- **[故障排查指南](./JENKINS_TROUBLESHOOTING.md)** - 完整的诊断和配置指南

### 配置与集成
- [完整 API 文档](../API_DOCUMENTATION.md)
- [部署指南](../DOCKER_DEPLOYMENT_GUIDE.md)

---

## 🚀 快速开始

### 问题:执行完成但状态显示"运行中"

#### 立即修复

```bash
# 测试回调接口
curl -X POST http://localhost:3000/api/jenkins/callback/test \
  -H "Content-Type: application/json" \
  -d '{
    "runId": <runId>,
    "status": "failed",
    "passedCases": 0,
    "failedCases": 1,
    "durationMs": 120000
  }'
```

#### 批量修复

```bash
# 查询所有卡住的执行
curl http://localhost:3000/api/executions/stuck?timeout=10

# 批量同步
curl -X POST http://localhost:3000/api/executions/sync-stuck \
  -H "Content-Type: application/json" \
  -d '{"timeoutMinutes": 10}'
```

---

## 🔧 配置检查

### 1. 检查 .env 配置

```bash
# 查看 Jenkins 相关配置
grep -E "JENKINS_URL|JENKINS_ALLOWED_IPS|JENKINS_TOKEN" .env

# 应该包含:
# JENKINS_URL=http://jenkins.example.com:8080
# JENKINS_USER=your-jenkins-user
# JENKINS_TOKEN=your-jenkins-api-token
# JENKINS_ALLOWED_IPS=192.168.1.0/24,jenkins.example.com
```

### 2. 测试回调接口

```bash
# 测试回调连接
curl -X POST http://localhost:3000/api/jenkins/callback/test \
  -H "Content-Type: application/json" \
  -d '{"testMessage": "test"}'

# 应该返回: "success": true
```

---

## 📖 详细文档

### 故障排查流程

1. **确认问题**
   - 执行状态显示 `running`
   - Jenkins 实际已完成(成功/失败)
   - 后端日志无 `[CALLBACK]` 输出

2. **快速修复**
   - 使用 `./scripts/test_jenkins_callback.sh --run-id <runId>`
   - 或使用手动回调命令

3. **诊断原因**
   - 检查 Jenkins Job 是否配置了回调
   - 测试回调接口可访问性
   - 验证认证配置

4. **长期解决**
   - 配置 Jenkins Pipeline 回调逻辑
   - 启用混合同步机制
   - 设置监控告警

详细步骤请参考:
- [故障排查指南](./JENKINS_TROUBLESHOOTING.md)

---

## 🛠️ 工具和脚本

### 测试脚本

位置:`scripts/test_jenkins_callback.sh`

功能:
- 测试平台服务连接
- 验证认证配置
- 模拟 Jenkins 回调
- 更新执行状态

用法:
```bash
# 显示帮助
./scripts/test_jenkins_callback.sh --help

# 仅测试连接和认证
./scripts/test_jenkins_callback.sh --test-only

# 更新指定执行的状态
./scripts/test_jenkins_callback.sh --run-id 64

# 自定义平台地址和 API Key
./scripts/test_jenkins_callback.sh \
  --url http://your-host:3000 \
  --api-key your_api_key \
  --run-id 64
```

---

## 📊 API 接口

### 回调接口

```
POST /api/jenkins/callback
```

用于接收 Jenkins 执行完成后的回调。

**认证方式**(任选其一):
- API Key: `X-Api-Key` header
- JWT Token: `Authorization: Bearer <token>` header
- HMAC 签名: `X-Jenkins-Signature` + `X-Jenkins-Timestamp` headers

**请求体**:
```json
{
  "runId": 64,
  "status": "success|failed|aborted",
  "passedCases": 10,
  "failedCases": 2,
  "skippedCases": 1,
  "durationMs": 120000,
  "results": [
    {
      "caseId": 1,
      "caseName": "test_case_1",
      "status": "passed",
      "duration": 5000,
      "errorMessage": null
    }
  ]
}
```

### 测试接口

```
POST /api/jenkins/callback/test
```

用于测试回调接口的连接和认证。

支持两种模式:
1. 连接测试:不提供 `runId`,仅测试连接和认证
2. 真实回调:提供 `runId`,实际更新数据库

### 手动同步接口

```
POST /api/executions/:id/sync
```

从 Jenkins API 查询构建状态并更新数据库。

### 批量同步接口

```
POST /api/executions/sync-stuck
```

批量同步长时间未更新的运行记录。

### 查询卡住的执行

```
GET /api/executions/stuck?timeout=10
```

查询可能卡住的执行列表(超过指定分钟数)。

---

## 📝 最佳实践

### 1. 配置 Jenkins Pipeline 回调

在 Jenkins Pipeline 的 `post` 块中添加:

```groovy
post {
    always {
        script {
            // 回调平台
            def callbackUrl = env.CALLBACK_URL ?: "http://localhost:3000/api/jenkins/callback"
            def apiKey = env.JENKINS_API_KEY
            
            httpRequest(
                url: callbackUrl,
                httpMode: 'POST',
                contentType: 'APPLICATION_JSON',
                customHeaders: [[name: 'X-Api-Key', value: apiKey]],
                requestBody: groovy.json.JsonOutput.toJson([
                    runId: params.RUN_ID.toInteger(),
                    status: currentBuild.result == 'SUCCESS' ? 'success' : 'failed',
                    durationMs: currentBuild.duration
                ])
            )
        }
    }
}
```

### 2. 定期测试

```bash
# 每天测试一次回调接口
./scripts/test_jenkins_callback.sh --test-only

# 或设置 cron 任务
0 9 * * * cd /path/to/Automation_Platform && ./scripts/test_jenkins_callback.sh --test-only
```

### 3. 监控告警

- 执行时间超过10分钟时提醒用户手动同步
- 每小时检查一次卡住的执行
- 回调失败率超过阈值时告警

---

## 🆘 常见问题

### Q: 为什么执行完成了但状态还是"运行中"?

**A:** Jenkins 没有成功回调到平台。可能原因:
1. Jenkins Job 未配置回调逻辑
2. 回调地址配置错误
3. 网络连通性问题
4. 认证配置错误

快速修复:使用 `./scripts/test_jenkins_callback.sh --run-id <runId>`

### Q: 如何配置 Jenkins 回调?

**A:** 参考 [故障排查指南](./JENKINS_TROUBLESHOOTING.md) 中的"配置 Jenkins Job 回调"章节。

### Q: 如何批量修复多个卡住的执行?

**A:** 使用批量同步接口:
```bash
curl -X POST http://localhost:3000/api/executions/sync-stuck \
  -H "Content-Type: application/json" \
  -d '{"timeoutMinutes": 10}'
```

### Q: 如何验证回调配置是否正确?

**A:** 运行测试脚本:
```bash
./scripts/test_jenkins_callback.sh --test-only
```

---

## 📧 联系支持

如果遇到问题无法解决,请:

1. 收集日志和错误信息
2. 运行诊断命令
3. 查看详细文档
4. 联系开发团队

---

**文档更新日期**: 2026-01-19
**版本**: 1.0.0
