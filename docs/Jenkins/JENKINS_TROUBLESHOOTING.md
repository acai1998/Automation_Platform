# Jenkins 集成 - 快速故障排查指南

本文档提供解决 Jenkins 回调认证和网络连接问题的快速参考。

---

## 🔍 问题诊断流程

### 第一步：检查环境变量配置

```bash
# 验证 .env 文件是否存在
ls -la .env

# 检查必需的环境变量是否都已配置
grep "JENKINS_API_KEY\|JENKINS_JWT_SECRET\|JENKINS_SIGNATURE_SECRET" .env

# 应该看到类似的输出：
# JENKINS_API_KEY=your-secret-api-key-here-min-8-chars
# JENKINS_JWT_SECRET=your-secret-jwt-key-here-min-8-chars
# JENKINS_SIGNATURE_SECRET=your-secret-signature-key-here-min-8-chars
```

**如果缺失任何环境变量：**
1. 编辑 `.env` 文件
2. 添加缺失的配置
3. 重启应用：`npm run start`
4. 应用启动时会输出详细的配置提示

---

### 第二步：使用诊断工具

#### 快速诊断（无需认证）

```bash
# 检查环境变量配置状态
curl -X POST http://localhost:3000/api/jenkins/callback/diagnose \
  -H "Content-Type: application/json" \
  -d '{"test": "true"}'

# 输出示例：
# {
#   "success": true,
#   "data": {
#     "timestamp": "2025-01-21T10:00:00.000Z",
#     "clientIP": "127.0.0.1",
#     "environmentVariablesConfigured": {
#       "jenkins_api_key": true,        // ✅ 已配置
#       "jenkins_jwt_secret": true,     // ✅ 已配置
#       "jenkins_signature_secret": true, // ✅ 已配置
#       "jenkins_allowed_ips": false    // ⚠️ 未配置（可选）
#     },
#     "suggestions": ["✅ 所有必需的环境变量已配置", "✅ 请求包含认证信息"]
#   }
# }
```

#### 测试认证（需要认证）

```bash
# 使用 API Key 测试认证
curl -X POST http://localhost:3000/api/jenkins/callback/test \
  -H "X-Api-Key: your-secret-api-key-here" \
  -H "Content-Type: application/json" \
  -d '{"testMessage": "hello"}'

# 成功输出示例：
# {
#   "success": true,
#   "message": "Callback test successful - 回调连接测试通过",
#   "details": {
#     "receivedAt": "2025-01-21T10:00:00.000Z",
#     "authenticationMethod": "apikey",
#     "clientIP": "127.0.0.1"
#   },
#   "recommendations": ["✅ 认证配置正确", "✅ 网络连接正常"]
# }
```

#### Jenkins 连接检查

```bash
# 检查 Jenkins 服务器连接
curl http://localhost:3000/api/jenkins/health

# 成功输出示例：
# {
#   "success": true,
#   "data": {
#     "connected": true,
#     "jenkinsUrl": "http://jenkins.wiac.xyz",
#     "version": "2.419.1",
#     "details": {
#       "checks": {
#         "connectionTest": { "success": true, "duration": 245 },
#         "authenticationTest": { "success": true }
#       }
#     }
#   },
#   "message": "Jenkins is healthy"
# }
```

---

## ❌ 常见问题和解决方案

### 1️⃣ 应用启动失败：缺少环境变量

**症状：**
```
╔════════════════════════════════════════════════════════════════════════╗
║              Jenkins 认证配置 - 环境变量验证失败                       ║
╚════════════════════════════════════════════════════════════════════════╝

缺失的环境变量：JENKINS_API_KEY, JENKINS_JWT_SECRET, JENKINS_SIGNATURE_SECRET
```

**解决方案：**

```bash
# 1. 复制配置模板
cp .env.example .env

# 2. 编辑 .env 文件，填入必需的值
# 可以使用 Node.js 生成强密钥：
node -e "console.log('JENKINS_API_KEY=' + require('crypto').randomBytes(32).toString('hex'))"
node -e "console.log('JENKINS_JWT_SECRET=' + require('crypto').randomBytes(32).toString('hex'))"
node -e "console.log('JENKINS_SIGNATURE_SECRET=' + require('crypto').randomBytes(32).toString('hex'))"

# 3. 将输出的值填入 .env 文件
# 4. 重启应用
npm run start
```

---

### 2️⃣ 认证失败：401 Unauthorized

**症状：**
```json
{
  "error": "Authentication failed",
  "message": "Invalid or missing authentication credentials",
  "attempts": ["apikey-failed", "jwt-failed", "signature-failed"]
}
```

**诊断步骤：**

```bash
# 检查 API Key 是否正确
grep "JENKINS_API_KEY" .env
# 输出应该显示非空值

# 验证请求是否包含认证信息
curl -v -X POST http://localhost:3000/api/jenkins/callback/test \
  -H "X-Api-Key: your-secret-api-key-here" \
  -H "Content-Type: application/json" \
  -d '{"testMessage": "hello"}'
# 查看 "-H X-Api-Key:" 是否显示在请求头中

# 运行诊断工具
curl -X POST http://localhost:3000/api/jenkins/callback/diagnose \
  -H "Content-Type: application/json" \
  -d '{}'
```

**解决方案：**

- ✅ 确保 API Key、JWT Secret 或 Signature Secret 已正确配置
- ✅ 确保请求头中包含正确的认证信息
- ✅ 检查是否使用了错误的密钥（复制粘贴时注意空格）
- ✅ 如果更改了环境变量，重启应用使配置生效

---

### 3️⃣ IP 白名单拒绝：403 Forbidden

**症状：**
```json
{
  "error": "IP not allowed",
  "message": "Your IP address is not in the allowed list"
}
```

**解决方案：**

```bash
# 检查当前 IP
curl http://ipinfo.io/ip

# 查看 IP 白名单配置
grep "JENKINS_ALLOWED_IPS" .env

# 如果白名单已启用但不包含当前 IP，有两种选择：

# 选项 1：添加当前 IP 到白名单
# 编辑 .env 文件，添加你的 IP：
# JENKINS_ALLOWED_IPS=192.168.1.100,10.0.0.5,localhost

# 选项 2：暂时禁用 IP 白名单（用于测试）
# 编辑 .env 文件，将 JENKINS_ALLOWED_IPS 设为空
# JENKINS_ALLOWED_IPS=

# 重启应用
npm run start
```

**IP 白名单配置示例：**

```bash
# 精确 IP
JENKINS_ALLOWED_IPS=192.168.1.100

# CIDR 网段（推荐）
JENKINS_ALLOWED_IPS=192.168.1.0/24

# 多个规则
JENKINS_ALLOWED_IPS=192.168.1.0/24,10.0.0.5,localhost

# 允许本地调试 + Jenkins 服务器
JENKINS_ALLOWED_IPS=localhost,192.168.1.100

# 允许所有（测试时）- 留空或注释掉
# JENKINS_ALLOWED_IPS=
```

---

### 4️⃣ Jenkins 连接失败：ECONNREFUSED

**症状：**
```
Jenkins health check failed:
  "error": "connect ECONNREFUSED 192.168.1.100:8080"
```

**解决方案：**

```bash
# 1. 检查 Jenkins 是否在线
# 在浏览器中打开 Jenkins URL
# 例如：http://jenkins.wiac.xyz

# 2. 检查 JENKINS_URL 配置
grep "JENKINS_URL" .env
# 应该返回类似：JENKINS_URL=http://jenkins.wiac.xyz

# 3. 从应用服务器测试连接
curl http://jenkins.wiac.xyzapi/json -u root:TOKEN
# 如果超时或拒绝，Jenkins 可能未运行或防火墙阻止

# 4. 检查防火墙规则
# 某些公司网络可能阻止出站访问
# 联系网络管理员配置防火墙例外
```

---

### 5️⃣ Jenkins 认证失败：401/403 from Jenkins

**症状：**
```
Jenkins connection test failed:
  "error": "Authentication failed. Check Jenkins credentials."
```

**解决方案：**

```bash
# 1. 验证 Jenkins 用户名和 Token
grep "JENKINS_USER\|JENKINS_TOKEN" .env
# 输出示例：
# JENKINS_USER=root
# JENKINS_TOKEN=116fb13c3cc6cd3e33e688bacc26e18b60

# 2. 手动测试 Jenkins 认证
curl -u root:116fb13c3cc6cd3e33e688bacc26e18b60 \
  http://jenkins.wiac.xyzapi/json
# 应该返回 JSON 响应（200 OK）

# 3. 如果测试失败，重新生成 Token：
#    - 在 Jenkins 中登录
#    - 点击右上角用户 → 配置
#    - 左侧菜单 → API Token
#    - 点击 "生成" 或 "新增"
#    - 复制新的 Token 到 .env
```

---

### 6️⃣ DNS 解析失败：ENOTFOUND

**症状：**
```
Jenkins connection test failed:
  "error": "getaddrinfo ENOTFOUND jenkins.wiac.xyz"
```

**解决方案：**

```bash
# 1. 检查 DNS 解析
ping jenkins.wiac.xyz
# 应该看到 IP 地址

# 2. 检查 JENKINS_URL 配置
grep "JENKINS_URL" .env

# 3. 如果域名解析失败，尝试：
#    - 检查网络连接：ping 8.8.8.8
#    - 检查 DNS 配置：cat /etc/resolv.conf（Linux）
#    - 尝试使用 IP 地址而不是域名：JENKINS_URL=http://192.168.1.100:8080/

# 4. 如果在公司网络中：
#    - 联系 IT 部门配置 DNS 或代理
#    - 考虑使用 VPN 或内网 IP
```

---

### 7️⃣ 请求超时：Aborted (10s timeout)

**症状：**
```
Jenkins connection test failed:
  "error": "The operation was aborted"
```

**解决方案：**

```bash
# 1. 检查 Jenkins 响应时间
time curl http://jenkins.wiac.xyzapi/json -u root:TOKEN

# 2. 如果响应很慢（> 10秒）：
#    - 检查 Jenkins 服务器负载
#    - 检查网络延迟：ping jenkins.wiac.xyz
#    - 增加应用中的超时时间（编辑 server/routes/jenkins.ts）

# 3. 暂时解决方案：在 Jenkins 服务器上重启服务
#    - SSH 连接到 Jenkins
#    - systemctl restart jenkins
#    - 或使用 Jenkins 管理界面的"Restart safely"
```

---

### 8️⃣ 签名验证失败：Invalid signature

**症状：**
```json
{
  "error": "Authentication failed",
  "message": "Invalid or missing authentication credentials",
  "attempts": ["signature-failed"]
}
```

**解决方案：**

```bash
# 签名验证失败通常是因为：
# 1. Signature Secret 不匹配
# 2. 时间戳计算错误
# 3. 消息格式不正确

# 检查客户端和服务器的 Signature Secret
grep "JENKINS_SIGNATURE_SECRET" .env

# 验证签名格式（应该是 "timestamp.payload"）
# Node.js 示例：
node -e "
const crypto = require('crypto');
const payload = JSON.stringify({runId: 123, status: 'success'});
const timestamp = Date.now().toString();
const message = timestamp + '.' + payload;
const signature = crypto.createHmac('sha256', 'your-secret-key').update(message).digest('hex');
console.log('Timestamp:', timestamp);
console.log('Payload:', payload);
console.log('Message:', message);
console.log('Signature:', signature);
"

# 如果签名仍然无效，检查：
# - 时间戳格式（应该是毫秒级）
# - 消息中的 JSON 格式（空格会影响哈希）
# - Secret 密钥（确保没有前后空格）
```

---

## 📊 日志分析

### 查看认证日志

```bash
# 启动应用并查看认证日志
npm run start 2>&1 | grep "\[AUTH\]\|\[CALLBACK\]"

# 示例输出：
# [AUTH] ✅ Authentication success: apikey from 127.0.0.1
# [CALLBACK] Jenkins callback received for runId: 123
# [AUTH] ❌ Authentication failed for 192.168.1.50
```

### 启用调试日志

```bash
# 启用 IP 地址识别调试
JENKINS_DEBUG_IP=true npm run start

# 启用详细调试日志
DEBUG=* npm run start
```

### 查看完整应用日志

```bash
# 后台运行并保存日志
npm run start > app.log 2>&1 &

# 查看实时日志
tail -f app.log

# 搜索特定错误
grep "ERROR\|FAILED\|refused" app.log
```

---

## 🧪 测试场景

### 场景 1：测试 API Key 认证

```bash
# 从 .env 获取 API Key
API_KEY=$(grep JENKINS_API_KEY .env | cut -d= -f2)

# 测试
curl -X POST http://localhost:3000/api/jenkins/callback/test \
  -H "X-Api-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"testMessage": "API Key test"}'
```

### 场景 2：测试 JWT 认证

```bash
# JWT 需要通过认证端点生成
# 这需要应用的内部方法，通常用于测试

# Node.js 脚本生成 JWT
node -e "
const jwt = require('jsonwebtoken');
const token = jwt.sign({sub: 'jenkins'}, 'your-jwt-secret', {expiresIn: '1h'});
console.log('Bearer ' + token);
" > token.txt

# 使用生成的 Token
TOKEN=\$(cat token.txt)
curl -X POST http://localhost:3000/api/jenkins/callback/test \
  -H "Authorization: \$TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"testMessage": "JWT test"}'
```

### 场景 3：测试签名认证

```bash
# Python 示例
python3 << 'EOF'
import json, hmac, hashlib, time, requests

payload = {"runId": 123, "status": "success"}
timestamp = str(int(time.time() * 1000))
message = f"{timestamp}.{json.dumps(payload)}"
signature = hmac.new(
    b'your-signature-secret',
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

print(f"Status: {response.status_code}")
print(f"Response: {response.json()}")
EOF
```

---

## 📈 监控和健康检查

### 定期检查 Jenkins 连接

```bash
# 创建监控脚本
cat > check_jenkins.sh << 'EOF'
#!/bin/bash
echo "Jenkins Health Check - $(date)"
curl -s http://localhost:3000/api/jenkins/health | jq '.data.connected'
EOF

chmod +x check_jenkins.sh
./check_jenkins.sh
```

### 获取监控统计

```bash
# 查看执行监控统计（包括卡住的任务）
curl http://localhost:3000/api/jenkins/monitoring/stats | jq '.data'
```

---

## 🚀 快速恢复清单

| 问题 | 快速修复 |
|------|---------|
| ❌ 缺少环境变量 | `cp .env.example .env && 编辑 .env && npm run start` |
| ❌ 认证失败 | 运行诊断：`curl -X POST http://localhost:3000/api/jenkins/callback/diagnose` |
| ❌ IP 拒绝 | 更新 `.env` 中的 `JENKINS_ALLOWED_IPS` 或设为空 |
| ❌ Jenkins 离线 | 检查 `JENKINS_URL` 和 `JENKINS_USER/TOKEN` 配置 |
| ❌ DNS 失败 | 使用 IP 地址替代域名 |
| ❌ 请求超时 | 检查 Jenkins 服务器或网络延迟 |

---

## 📞 获取帮助

| 资源 | 位置 |
|------|------|
| 配置指南 | `docs/JENKINS_AUTH_QUICK_START.md` |
| 环境变量示例 | `.env.example` |
| API 文档 | `docs/JENKINS_INTEGRATION.md` |
| 认证细节 | `docs/JENKINS_AUTH_IMPROVEMENTS.md` |
| 应用日志 | 应用启动输出 |
| 诊断工具 | `POST /api/jenkins/callback/diagnose` |
| 健康检查 | `GET /api/jenkins/health` |

---

## 🔐 安全检查清单

- [ ] `JENKINS_API_KEY` 是强密钥（> 32 字符）
- [ ] `JENKINS_JWT_SECRET` 是强密钥
- [ ] `JENKINS_SIGNATURE_SECRET` 是强密钥
- [ ] `.env` 文件在 `.gitignore` 中
- [ ] 配置了 `JENKINS_ALLOWED_IPS` 限制访问
- [ ] 定期轮换密钥（每季度）
- [ ] 监控认证失败日志
- [ ] 只授予 Jenkins 必需的权限

---

最后更新：2025年1月  
版本：1.0

