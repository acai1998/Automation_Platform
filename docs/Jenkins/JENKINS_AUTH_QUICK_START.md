# Jenkins 认证 - 快速开始指南

## 5 分钟快速配置

### 第1步：配置环境变量

编辑 `.env` 文件，添加以下必需配置：

```bash
# Jenkins 认证配置（必需）
JENKINS_API_KEY=your-secret-api-key-here
JENKINS_JWT_SECRET=your-secret-jwt-key-here
JENKINS_SIGNATURE_SECRET=your-secret-signature-key-here

# 可选：IP 白名单（留空表示允许所有 IP）
JENKINS_ALLOWED_IPS=192.168.1.0/24,10.0.0.5,localhost
```

### 第2步：启动应用

```bash
npm run start
```

如果环境变量缺失，应用会立即报错并停止，这是安全的！

### 第3步：验证配置

```bash
# 检查认证是否正常工作
curl -X POST http://localhost:3000/api/jenkins/callback \
  -H "X-Api-Key: your-secret-api-key-here" \
  -H "Content-Type: application/json" \
  -d '{"runId": 1, "status": "success"}'
```

---

## 三种认证方式

### 方式 1：API Key（最简单）

```bash
curl -X POST http://localhost:3000/api/jenkins/callback \
  -H "X-Api-Key: your-secret-api-key-here" \
  -H "Content-Type: application/json" \
  -d '{
    "runId": 123,
    "status": "success",
    "passedCases": 10
  }'
```

### 方式 2：JWT Token（最灵活）

```bash
# 1. 生成 Token（调用应用的 API）
TOKEN=$(curl -s http://localhost:3000/api/auth/login \
  -d 'email=jenkins@example.com&password=password' \
  | jq -r '.token')

# 2. 使用 Token 调用回调接口
curl -X POST http://localhost:3000/api/jenkins/callback \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "runId": 123,
    "status": "success"
  }'
```

### 方式 3：签名认证（最安全）

```bash
# Node.js 示例
const crypto = require('crypto');

const payload = {
  runId: 123,
  status: 'success',
  passedCases: 10
};

const timestamp = Date.now().toString();
const message = `${timestamp}.${JSON.stringify(payload)}`;
const signature = crypto
  .createHmac('sha256', 'your-secret-signature-key-here')
  .update(message)
  .digest('hex');

// 发送请求
curl -X POST http://localhost:3000/api/jenkins/callback \
  -H "X-Jenkins-Signature: $signature" \
  -H "X-Jenkins-Timestamp: $timestamp" \
  -H "Content-Type: application/json" \
  -d "$(echo $payload | jq -c .)"
```

Python 示例：
```python
import json
import hmac
import hashlib
import time
import requests

payload = {
    'runId': 123,
    'status': 'success',
    'passedCases': 10
}

timestamp = str(int(time.time() * 1000))
message = f"{timestamp}.{json.dumps(payload)}"
signature = hmac.new(
    b'your-secret-signature-key-here',
    message.encode(),
    hashlib.sha256
).hexdigest()

headers = {
    'X-Jenkins-Signature': signature,
    'X-Jenkins-Timestamp': timestamp,
    'Content-Type': 'application/json'
}

response = requests.post(
    'http://localhost:3000/api/jenkins/callback',
    json=payload,
    headers=headers
)

print(response.json())
```

---

## IP 白名单配置示例

### 精确 IP
```bash
JENKINS_ALLOWED_IPS=192.168.1.100,10.0.0.5
```

### CIDR 网段
```bash
# 192.168.1.0 - 192.168.1.255
JENKINS_ALLOWED_IPS=192.168.1.0/24

# 整个 192 网段（不推荐）
JENKINS_ALLOWED_IPS=192.0.0.0/8
```

### 混合配置
```bash
JENKINS_ALLOWED_IPS=192.168.1.0/24,10.0.0.5,localhost
```

### 关闭 IP 限制
```bash
# 留空或不配置
JENKINS_ALLOWED_IPS=
```

---

## 常见问题

### Q: 收到 "IP not allowed" 错误

**A:** 检查 IP 白名单配置
```bash
# 查看你的 IP
curl ipinfo.io

# 添加到白名单
JENKINS_ALLOWED_IPS=your.ip.here
```

### Q: 收到 "Authentication failed" 错误

**A:** 检查认证凭证
```bash
# 1. 验证 API Key
JENKINS_API_KEY=correct-value

# 2. 验证签名（检查时间戳和消息格式）
# 时间戳格式：毫秒级 Unix 时间戳
# 消息格式："{timestamp}.{json_payload}"
```

### Q: 收到 "Rate limit exceeded" 错误

**A:** 请求过于频繁，等待后重试
```bash
# 默认限制：100 次请求 / 60 秒

# 检查 Retry-After 头
curl -i http://localhost:3000/api/jenkins/callback
```

### Q: 缺失环境变量时应用无法启动

**A:** 这是故意的！为了安全，必须配置所有环境变量

```bash
# 检查缺失的变量
echo $JENKINS_API_KEY
echo $JENKINS_JWT_SECRET
echo $JENKINS_SIGNATURE_SECRET

# 都必须有值！
```

---

## 集成到 Jenkins Pipeline

```groovy
pipeline {
    agent any
    
    stages {
        stage('Run Tests') {
            steps {
                // 执行测试...
                sh 'pytest tests/ --json-report'
            }
        }
        
        stage('Report Results') {
            steps {
                script {
                    // 方式1：使用 API Key（最简单）
                    def payload = [
                        runId: env.BUILD_ID,
                        status: currentBuild.result,
                        passedCases: 50,
                        failedCases: 5
                    ]
                    
                    sh '''
                        curl -X POST http://platform.example.com/api/jenkins/callback \\
                            -H "X-Api-Key: ${JENKINS_API_KEY}" \\
                            -H "Content-Type: application/json" \\
                            -d '${payload}'
                    '''
                }
            }
        }
    }
}
```

---

## 监控和日志

### 查看认证日志

```bash
# 成功的认证
Jenkins auth success: apikey from 192.168.1.100

# 失败的尝试
Jenkins auth: IP 192.168.99.99 not in allowed list
JWT verification failed: invalid signature
Signature replay detected: abc123-timestamp
```

### 常见日志模式

| 日志 | 含义 | 解决方案 |
|------|------|---------|
| `IP not allowed` | IP 不在白名单 | 检查 JENKINS_ALLOWED_IPS |
| `Authentication failed` | 认证凭证无效 | 检查 API Key/JWT/签名 |
| `Signature replay detected` | 重复的签名 | 不要重复发送相同请求 |
| `Rate limit exceeded` | 请求过于频繁 | 等待或降低请求频率 |
| `Missing env var` | 环境变量缺失 | 配置 .env 文件 |

---

## 安全最佳实践

✅ **推荐做法**
```bash
# 1. 使用强密钥
JENKINS_API_KEY=generated-secure-random-string-64-chars

# 2. 定期轮换密钥
# 每季度更新一次

# 3. 限制 IP 访问
JENKINS_ALLOWED_IPS=jenkins-server-ip-only

# 4. 使用签名认证（最安全）
# 对关键操作使用签名，而不是 API Key
```

❌ **避免做法**
```bash
# 1. 不要使用简单密钥
JENKINS_API_KEY=password123

# 2. 不要在代码中提交 .env
# git add -u && git add .env.example 只

# 3. 不要完全信任任何 IP
# 即使内网也应该验证

# 4. 不要重用签名
# 每个请求生成新的签名
```

---

## 性能考虑

| 操作 | 平均耗时 |
|------|--------|
| API Key 验证 | < 1ms |
| JWT 验证 | 1-2ms |
| 签名验证 | 2-3ms |
| IP 白名单检查 | < 1ms |
| 速率限制检查 | < 1ms |

**对于内部平台，性能影响可忽略不计。**

---

## 下一步

1. **配置环境变量** → `.env` 文件
2. **选择认证方式** → API Key 最简单
3. **测试连接** → 使用 curl 命令
4. **集成 Jenkins** → 更新 Pipeline 脚本
5. **监控日志** → 观察认证日志

---

## 获取帮助

- 详细文档：`docs/JENKINS_AUTH_IMPROVEMENTS.md`
- 代码审查：`docs/CODE_REVIEW_SUMMARY.md`
- 问题排查：查看应用日志
- 更多示例：见本文件的各个部分

---

**更新时间**：2025年  
**最后修改**：现在
