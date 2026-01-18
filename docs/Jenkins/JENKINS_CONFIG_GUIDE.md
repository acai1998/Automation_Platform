# Jenkins 配置和诊断完整指南

本文档提供 Jenkins 集成的完整配置步骤、诊断工具和最佳实践。

---

## 📋 目录

1. [快速开始](#快速开始)
2. [详细配置步骤](#详细配置步骤)
3. [环境变量说明](#环境变量说明)
4. [诊断和故障排查](#诊断和故障排查)
5. [安全最佳实践](#安全最佳实践)
6. [常见问题](#常见问题)

---

## 🚀 快速开始

### 第一步：准备配置文件

```bash
# 复制配置模板
cp .env.example .env

# 编辑配置文件
vi .env  # 或使用你喜欢的编辑器
```

### 第二步：配置必需的环境变量

编辑 `.env` 文件，找到以下部分并填入值：

```bash
# Jenkins 服务器配置
JENKINS_URL=http://jenkins.wiac.xyz:8080/
JENKINS_USER=your-jenkins-username
JENKINS_TOKEN=your-jenkins-api-token

# 认证密钥（生成强密钥）
JENKINS_API_KEY=your-secret-api-key-here-min-32-chars
JENKINS_JWT_SECRET=your-secret-jwt-key-here-min-32-chars
JENKINS_SIGNATURE_SECRET=your-secret-signature-key-here-min-32-chars

# IP 白名单（可选）
JENKINS_ALLOWED_IPS=your-jenkins-server-ip,localhost
```

### 第三步：验证配置

```bash
# 运行检查脚本
./scripts/check-env.sh

# 应该输出：✅ 所有配置检查通过！
```

### 第四步：启动应用

```bash
npm run start
```

应用启动时会输出：
```
✅ Jenkins 认证已初始化，IP 白名单已启用 (2 条规则)
```

### 第五步：测试连接

```bash
# 测试认证
curl -X POST http://localhost:3000/api/jenkins/callback/test \
  -H "X-Api-Key: your-api-key-from-env" \
  -H "Content-Type: application/json" \
  -d '{"testMessage": "hello"}'

# 应该收到 200 OK 响应：
# {
#   "success": true,
#   "message": "Callback test successful - 回调连接测试通过",
#   "recommendations": ["✅ 认证配置正确", "✅ 网络连接正常"]
# }
```

---

## 🔧 详细配置步骤

### 步骤 1：获取 Jenkins 凭证

#### 1.1 Jenkins 用户名和 Token

```
1. 登录 Jenkins（例如：http://jenkins.wiac.xyz:8080）
2. 点击右上角的用户名 → 配置
3. 左侧菜单找到 "API Token"
4. 点击 "生成" 或 "新增"
5. 复制生成的 Token
```

在 `.env` 文件中配置：
```bash
JENKINS_USER=your-jenkins-username
JENKINS_TOKEN=your-generated-token
```

#### 1.2 验证凭证

```bash
# 使用 curl 测试（替换 USERNAME 和 TOKEN）
curl -u USERNAME:TOKEN http://jenkins.wiac.xyz:8080/api/json

# 应该返回 JSON（200 OK）
# 如果返回 401，表示凭证不正确
```

### 步骤 2：生成认证密钥

#### 推荐方法：使用 Node.js 生成强密钥

```bash
# 生成 API Key
node -e "console.log('JENKINS_API_KEY=' + require('crypto').randomBytes(32).toString('hex'))"

# 生成 JWT Secret
node -e "console.log('JENKINS_JWT_SECRET=' + require('crypto').randomBytes(32).toString('hex'))"

# 生成 Signature Secret
node -e "console.log('JENKINS_SIGNATURE_SECRET=' + require('crypto').randomBytes(32).toString('hex'))"
```

将输出的值复制到 `.env` 文件。

#### 替代方法：使用 OpenSSL

```bash
# 生成 32 字符的十六进制字符串
openssl rand -hex 16

# 生成 64 字符的十六进制字符串
openssl rand -hex 32
```

#### 替代方法：使用在线密钥生成器

- [1Password Password Generator](https://1password.com/password-generator/)
- [Random.org](https://www.random.org/)
- [GRC Strong Password Generator](https://www.grc.com/passwords.htm)

### 步骤 3：配置 IP 白名单

#### 3.1 获取 Jenkins 服务器 IP

```bash
# 如果 Jenkins 是本地的
echo "localhost 或 127.0.0.1"

# 如果 Jenkins 在远程
ping jenkins.wiac.xyz

# 如果 Jenkins 在 Docker 中
docker inspect jenkins-container | grep IPAddress
```

#### 3.2 配置白名单

```bash
# 选项 1：仅允许 localhost（用于开发）
JENKINS_ALLOWED_IPS=localhost

# 选项 2：仅允许特定 IP
JENKINS_ALLOWED_IPS=192.168.1.100

# 选项 3：允许整个网段（推荐用于公司网络）
JENKINS_ALLOWED_IPS=192.168.1.0/24

# 选项 4：允许多个来源
JENKINS_ALLOWED_IPS=192.168.1.0/24,10.0.0.5,localhost

# 选项 5：允许所有（最宽松，不推荐生产使用）
JENKINS_ALLOWED_IPS=
```

#### 3.3 测试 IP 白名单

```bash
# 如果设置了白名单，测试时应该看到 "IP not allowed" 错误
# 对于设置的 IP：应该通过认证
# 对于未设置的 IP：应该收到 403 Forbidden

# 查看自己的 IP（用于调试）
curl ipinfo.io/ip
```

### 步骤 4：验证配置

```bash
# 运行完整的配置检查
./scripts/check-env.sh

# 可能的输出示例：
# ✅ .env 文件存在
# ✅ JENKINS_API_KEY：已配置 (长度: 64)
# ✅ JENKINS_JWT_SECRET：已配置 (长度: 64)
# ✅ JENKINS_SIGNATURE_SECRET：已配置 (长度: 64)
# ✅ 可以连接到 Jenkins 服务器
# ✅ Node.js 已安装 (v18.12.1)
```

---

## 📖 环境变量说明

| 变量 | 类型 | 必需 | 说明 |
|------|------|------|------|
| `JENKINS_URL` | string | 是 | Jenkins 服务器地址 |
| `JENKINS_USER` | string | 是 | Jenkins 用户名 |
| `JENKINS_TOKEN` | string | 是 | Jenkins API Token |
| `JENKINS_API_KEY` | string | 是 | 应用级 API Key（最少 8 字符，推荐 32+） |
| `JENKINS_JWT_SECRET` | string | 是 | JWT 签名密钥（最少 8 字符，推荐 32+） |
| `JENKINS_SIGNATURE_SECRET` | string | 是 | HMAC 签名密钥（最少 8 字符，推荐 32+） |
| `JENKINS_ALLOWED_IPS` | string | 否 | IP 白名单，逗号分隔，支持 CIDR |
| `JENKINS_JOB_API` | string | 否 | API 测试 Job 名称（默认：api-automation） |
| `JENKINS_JOB_UI` | string | 否 | UI 测试 Job 名称（默认：ui-automation） |
| `JENKINS_JOB_PERF` | string | 否 | 性能测试 Job 名称（默认：performance-automation） |
| `API_CALLBACK_URL` | string | 否 | Jenkins 回调 URL（默认：http://localhost:3000/api/jenkins/callback） |
| `JENKINS_DEBUG_IP` | string | 否 | 启用 IP 识别调试（仅开发环境） |
| `NODE_ENV` | string | 否 | 运行环境（development/staging/production） |

---

## 🔍 诊断和故障排查

### 诊断工具 1：环境变量诊断

```bash
# 运行诊断（无需认证）
curl -X POST http://localhost:3000/api/jenkins/callback/diagnose \
  -H "Content-Type: application/json" \
  -d '{}'

# 输出：显示哪些环境变量已配置，哪些缺失
```

### 诊断工具 2：认证测试

```bash
# 使用 API Key 测试
curl -X POST http://localhost:3000/api/jenkins/callback/test \
  -H "X-Api-Key: $(grep JENKINS_API_KEY .env | cut -d= -f2)" \
  -H "Content-Type: application/json" \
  -d '{"testMessage": "test"}'

# 输出：如果成功，会显示 "Callback test successful"
```

### 诊断工具 3：Jenkins 连接测试

```bash
# 检查 Jenkins 服务器连接
curl http://localhost:3000/api/jenkins/health

# 输出：显示 Jenkins 连接状态、版本和诊断信息
```

### 诊断工具 4：执行诊断

```bash
# 诊断特定执行的问题
curl http://localhost:3000/api/jenkins/diagnose?runId=123

# 输出：显示执行状态、Jenkins 连接状态和建议
```

### 诊断工具 5：监控统计

```bash
# 查看系统监控统计（包括卡住的任务）
curl http://localhost:3000/api/jenkins/monitoring/stats

# 输出：显示最近执行的统计和问题列表
```

### 启用详细日志

```bash
# 启用应用日志
NODE_ENV=development npm run start 2>&1 | tee app.log

# 启用 IP 识别调试
JENKINS_DEBUG_IP=true npm run start 2>&1 | tee app.log

# 查看日志中的认证信息
grep "\[AUTH\]\|\[CALLBACK\]\|\[IP-DETECTION\]" app.log
```

---

## 🔐 安全最佳实践

### 1. 密钥管理

✅ **推荐做法：**
- 使用强密钥（最少 32 字符，由字母、数字和特殊字符组成）
- 定期轮换密钥（每季度）
- 为不同的环境使用不同的密钥
- 使用密钥管理系统（如 HashiCorp Vault）

❌ **避免做法：**
- 使用简单或可预测的密钥
- 在代码中硬编码密钥
- 在多个环境中使用相同的密钥
- 在 Git 中提交 `.env` 文件

### 2. IP 白名单

✅ **推荐做法：**
- 仅允许 Jenkins 服务器 IP
- 使用 CIDR 网段而不是单个 IP
- 定期审计和更新白名单
- 记录访问日志

❌ **避免做法：**
- 允许所有 IP（生产环境）
- 使用过于宽松的 CIDR（如 0.0.0.0/0）

### 3. 认证方式选择

| 方式 | 安全性 | 易用性 | 推荐场景 |
|------|--------|--------|---------|
| API Key | 中等 | ⭐⭐⭐⭐⭐ | 开发、简单集成 |
| JWT | 高 | ⭐⭐⭐⭐ | 复杂系统、多方通信 |
| 签名 | 最高 | ⭐⭐⭐ | 生产环境、关键操作 |

### 4. 监控和审计

- 定期检查认证失败日志
- 监控来自异常 IP 的请求
- 设置告警（如超过 N 次失败）
- 定期备份配置

### 5. 网络安全

- 在生产环境使用 HTTPS
- 配置防火墙规则
- 使用 VPN 或专线连接
- 启用 Jenkins 的 CORS 配置（如需跨域）

---

## ❓ 常见问题

### Q1: "Missing required environment variable" 错误

**A:** 应用启动需要三个环境变量。解决方法：
1. 检查 .env 文件是否存在
2. 确保包含：JENKINS_API_KEY, JENKINS_JWT_SECRET, JENKINS_SIGNATURE_SECRET
3. 使用 check-env.sh 脚本验证

### Q2: "IP not allowed" 错误

**A:** 请求来自未授权的 IP。解决方法：
1. 检查 JENKINS_ALLOWED_IPS 配置
2. 添加你的 IP 到白名单
3. 或设置 JENKINS_ALLOWED_IPS= 禁用白名单（用于测试）

### Q3: "Authentication failed" 错误

**A:** 认证凭证无效。解决方法：
1. 运行诊断：POST /api/jenkins/callback/diagnose
2. 检查是否包含认证信息
3. 验证密钥是否正确

### Q4: "Jenkins is offline" 错误

**A:** 无法连接到 Jenkins。解决方法：
1. 验证 JENKINS_URL 是否正确
2. 检查 Jenkins 是否在线
3. 验证网络连接
4. 运行：curl http://localhost:3000/api/jenkins/health

### Q5: 如何更改密钥？

**A:** 密钥更改步骤：
1. 生成新密钥（见上面的生成方法）
2. 在 .env 中更新密钥
3. 保存文件
4. 重启应用
5. 旧密钥立即失效

### Q6: 多个应用实例如何共享配置？

**A:** 推荐做法：
1. 使用环境变量而不是 .env 文件
2. 使用密钥管理系统（Vault、Secrets Manager）
3. 确保所有实例使用相同的密钥
4. 使用相同的 IP 白名单规则

### Q7: 可以为不同的环境使用不同的配置吗？

**A:** 可以：
1. 创建多个 .env 文件（.env.dev, .env.prod）
2. 使用环境变量覆盖（`JENKINS_API_KEY=xxx npm run start`）
3. 使用 .env 文件链（`source .env && npm run start`）

---

## 📚 相关文档

| 文档 | 说明 |
|------|------|
| [JENKINS_AUTH_QUICK_START.md](./JENKINS_AUTH_QUICK_START.md) | 5 分钟快速开始 |
| [JENKINS_TROUBLESHOOTING.md](./JENKINS_TROUBLESHOOTING.md) | 详细故障排查 |
| [JENKINS_INTEGRATION.md](./JENKINS_INTEGRATION.md) | 集成指南 |
| [.env.example](../.env.example) | 配置文件模板 |

---

## 🚨 紧急恢复

如果应用无法启动：

```bash
# 1. 检查错误信息
npm run start 2>&1 | head -20

# 2. 验证环境变量
./scripts/check-env.sh

# 3. 使用最小配置启动（仅用于测试）
JENKINS_API_KEY=test123456 \
JENKINS_JWT_SECRET=test123456 \
JENKINS_SIGNATURE_SECRET=test123456 \
npm run start
```

---

## 📞 获取帮助

1. **运行诊断工具**：`./scripts/check-env.sh`
2. **查看应用日志**：`npm run start 2>&1 | grep ERROR`
3. **使用健康检查**：`curl http://localhost:3000/api/jenkins/health`
4. **参考故障排查指南**：[JENKINS_TROUBLESHOOTING.md](./JENKINS_TROUBLESHOOTING.md)

---

最后更新：2025年1月  
版本：2.0

