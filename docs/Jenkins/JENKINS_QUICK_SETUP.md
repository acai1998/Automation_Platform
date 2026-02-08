# Jenkins 集成 - 快速配置指南

## 简介

本平台通过 **IP 白名单** 验证 Jenkins 回调请求，无需额外的 API Key 或签名认证。只需配置 Jenkins 服务器的 IP 地址和基本的 Jenkins 连接参数即可。

---

## 5 分钟快速配置

### 第1步：配置环境变量

编辑 `.env` 文件，添加以下必需配置：

```bash
# Jenkins 服务器配置（必需）
JENKINS_URL=http://jenkins.example.com:8080
JENKINS_USER=your-jenkins-user
JENKINS_TOKEN=your-jenkins-api-token

# IP 白名单 - 仅允许指定 IP 的 Jenkins 服务器回调（推荐）
JENKINS_ALLOWED_IPS=192.168.1.100,10.0.0.5,jenkins.example.com

# 可选：调试模式
JENKINS_DEBUG_IP=false
```

### 第2步：启动应用

```bash
npm run start
```

### 第3步：验证配置

测试回调连接：

```bash
curl -X POST http://localhost:3000/api/jenkins/callback/test \
  -H "Content-Type: application/json" \
  -d '{"testMessage": "hello"}'
```

如果收到成功响应 (`"success": true`)，说明配置正确！

---

## IP 白名单配置详解

### 精确 IP

```bash
JENKINS_ALLOWED_IPS=192.168.1.100,10.0.0.5
```

### CIDR 网段（推荐用于多个 Jenkins 节点）

```bash
# 192.168.1.0 - 192.168.1.255
JENKINS_ALLOWED_IPS=192.168.1.0/24

# 10.0.0.0 - 10.0.0.255
JENKINS_ALLOWED_IPS=10.0.0.0/24
```

### 域名（自动解析为 IP）

```bash
JENKINS_ALLOWED_IPS=jenkins.example.com,jenkins-ci.internal.local
```

### 混合配置

```bash
JENKINS_ALLOWED_IPS=192.168.1.0/24,10.0.0.5,jenkins.example.com,localhost
```

---

## 回调流程

### 1. Jenkins 执行完成

当 Jenkins Job 完成执行时，触发回调：

```bash
curl -X POST http://platform-server:3000/api/jenkins/callback \
  -H "Content-Type: application/json" \
  -d '{
    "runId": 123,
    "status": "success",
    "passedCases": 10,
    "failedCases": 0,
    "skippedCases": 0,
    "durationMs": 120000,
    "results": [
      {
        "caseId": 1,
        "caseName": "test_login",
        "status": "passed",
        "duration": 5000
      }
    ]
  }'
```

### 2. 平台验证 IP

平台自动验证请求来源 IP 是否在 `JENKINS_ALLOWED_IPS` 白名单中。

### 3. 回调处理

验证通过后，平台处理回调数据并更新执行状态。

---

## Jenkins 配置示例

### Pipeline Job 中的回调脚本

```groovy
pipeline {
    agent any
    
    environment {
        JENKINS_TOKEN = credentials('jenkins-api-token')
        PLATFORM_URL = 'http://platform-server:3000'
    }
    
    stages {
        stage('Run Tests') {
            steps {
                sh '''
                    # 执行测试
                    pytest tests/ -v
                '''
            }
        }
    }
    
    post {
        always {
            script {
                def status = currentBuild.result == 'SUCCESS' ? 'success' : 'failed'
                
                sh '''
                    curl -X POST ${PLATFORM_URL}/api/jenkins/callback \
                      -H "Content-Type: application/json" \
                      -d "{
                        \"runId\": ${RUN_ID},
                        \"status\": \"${status}\",
                        \"passedCases\": ${PASSED},
                        \"failedCases\": ${FAILED},
                        \"durationMs\": ${BUILD_DURATION_MS}
                      }"
                '''
            }
        }
    }
}
```

---

## 故障排查

### 1. 测试连接

```bash
curl -X POST http://localhost:3000/api/jenkins/callback/test \
  -H "Content-Type: application/json" \
  -d '{"testMessage": "hello"}'
```

**预期结果**：
```json
{
  "success": true,
  "message": "Callback test successful - 回调连接测试通过",
  "mode": "CONNECTION_TEST"
}
```

### 2. 诊断回调配置

```bash
curl -X POST http://localhost:3000/api/jenkins/callback/diagnose \
  -H "Content-Type: application/json"
```

**返回信息包括**：
- 已配置的环境变量
- 是否启用 IP 白名单
- 配置步骤

### 3. 常见问题

**问题**：回调显示 "IP not allowed"

**解决**：
1. 检查 Jenkins 服务器的真实 IP：`curl http://platform-server:3000/api/jenkins/callback/test`
2. 更新 `JENKINS_ALLOWED_IPS` 包含该 IP
3. 如果通过代理，需要确保代理正确传递 `X-Forwarded-For` 头

**问题**：`502 Bad Gateway`

**解决**：
1. 确认平台服务已启动：`curl http://platform-server:3000/api/health`
2. 检查防火墙规则
3. 查看服务日志

---

## 配置检查清单

- [ ] 配置了 `JENKINS_URL`
- [ ] 配置了 `JENKINS_USER` 和 `JENKINS_TOKEN`
- [ ] 配置了 `JENKINS_ALLOWED_IPS`
- [ ] 测试回调连接成功
- [ ] Jenkins Job 中配置了回调脚本
- [ ] 验证执行后回调正确更新了状态

---

## 安全建议

1. **始终配置 IP 白名单** - 不要留空 `JENKINS_ALLOWED_IPS`
2. **使用 HTTPS** - 在生产环境中使用 HTTPS 传输回调数据
3. **限制网络访问** - 使用防火墙限制只有 Jenkins 能访问回调接口
4. **定期审计** - 监控日志检查异常回调请求

---

## 更多帮助

- [完整 API 文档](./API_DOCUMENTATION.md)
- [故障排查指南](./JENKINS_TROUBLESHOOTING.md)
- [部署指南](../QUICK_START.md)
