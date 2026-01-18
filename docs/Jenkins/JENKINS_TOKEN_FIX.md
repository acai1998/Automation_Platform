# Jenkins Token 认证修复指南

## 当前问题

健康检查返回 `401 Unauthorized`，说明 Jenkins Token 不正确或无效。

## 🔧 解决步骤

### 1. 验证 Jenkins 连接信息

```bash
# 当前配置
cat .env | grep JENKINS
```

您应该看到：
```
JENKINS_URL=https://jenkins.wiac.xyz
JENKINS_USER=root
JENKINS_TOKEN=111f01ba5415  # ← 这个可能不正确
```

### 2. 检查 Jenkins 用户和 Token

在 Jenkins 中操作：

1. **登录 Jenkins**
   - 访问 https://jenkins.wiac.xyz
   - 用用户名 `root` 登录

2. **生成新的 API Token**
   - 点击右上角用户头像 → "Configure"
   - 左侧菜单 → "API Token"
   - 点击 "Add new Token"
   - 给它起个名字（比如 "automation-platform"）
   - 点击 "Generate"
   - **复制生成的 Token**（这是您需要的）

3. **更新 .env 文件**
   ```bash
   nano .env
   ```
   
   找到这一行：
   ```
   JENKINS_TOKEN=111f01ba5415
   ```
   
   替换为新的 Token：
   ```
   JENKINS_TOKEN=<your-new-token-here>
   ```

### 3. 重新启动服务器

```bash
# 杀死旧进程
pkill -f "npm run server"

# 重启服务器
npm run server
```

### 4. 验证连接

```bash
curl http://localhost:3000/api/jenkins/health
```

**成功响应应该是：**
```json
{
  "success": true,
  "data": {
    "connected": true,
    "jenkinsUrl": "https://jenkins.wiac.xyz",
    "version": "2.426.3",
    "timestamp": "2024-01-17T..."
  },
  "message": "Jenkins is healthy"
}
```

## 🔍 常见问题排查

### 问题 1：还是返回 401

**原因：** Token 仍然不正确

**解决：**
1. 在 Jenkins 中重新生成 Token
2. 确保复制的是完整的 Token（不要多余的空格）
3. 重启服务器

### 问题 2：返回 "fetch failed"

**原因：** Jenkins 服务不可达

**解决：**
```bash
# 测试 Jenkins 连接
curl -I https://jenkins.wiac.xyz

# 如果返回 200，说明 Jenkins 可访问
# 如果返回错误，检查网络和 Jenkins 服务
```

### 问题 3：返回 403 Forbidden

**原因：** 用户没有 API 访问权限

**解决：**
1. 在 Jenkins 中检查用户角色权限
2. 确保用户有 "Overall/Read" 权限

## 📝 正确的环境变量

更新后的 `.env` 应该包含：

```env
# Jenkins 配置
JENKINS_URL=https://jenkins.wiac.xyz
JENKINS_USER=root
JENKINS_TOKEN=<your-new-api-token>
JENKINS_JOB_API=SeleniumBaseCi-AutoTest
JENKINS_JOB_UI=ui-automation
JENKINS_JOB_PERF=performance-automation
API_CALLBACK_URL=http://localhost:3000
```

## 🚀 验证修复成功

完成后，请按顺序运行以下测试：

1. **检查 Jenkins 连接**
   ```bash
   curl http://localhost:3000/api/jenkins/health
   # 应返回 connected: true
   ```

2. **执行一个测试**
   ```bash
   curl -X POST http://localhost:3000/api/jenkins/run-batch \
     -H 'Content-Type: application/json' \
     -d '{"caseIds": [1], "projectId": 1}'
   # 应返回 runId
   ```

3. **诊断执行**
   ```bash
   curl "http://localhost:3000/api/jenkins/diagnose?runId=35"
   # 应返回执行状态和诊断信息
   ```

## 💡 参考资源

- [Jenkins API Token 文档](https://jenkins.io/redirect/using-credentials)
- [Jenkins 认证配置](https://jenkins.io/doc/book/system-administration/security/)

如仍有问题，请收集以下信息联系技术支持：
- `curl http://localhost:3000/api/jenkins/health` 的完整响应
- 后端日志中 `[/api/jenkins/health]` 的输出
- Jenkins URL 和用户名（不要包含 Token）
