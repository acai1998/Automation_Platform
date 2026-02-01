# Docker Secrets 配置指南

## 问题说明

当你看到以下错误:
```
JENKINS_TOKEN environment variable is required for Jenkins authentication. Jenkins integration may not work.
```

这是因为 Docker secrets 没有被正确挂载到容器中。Docker secrets 只能在以下场景中使用:
- Docker Swarm mode
- docker-compose

**普通的 `docker run` 命令不支持 Docker secrets!**

---

## ✅ 方案 1: 使用 docker-compose (推荐用于生产环境)

### 步骤 1: 创建 secrets 文件目录

```bash
mkdir -p /root/Automation_Platform/deployment/secrets
cd /root/Automation_Platform/deployment/secrets
```

### 步骤 2: 创建 secret 文件 (每个 secret 一个文件)

```bash
# 数据库密码
echo "your_db_password_here" > db_password.txt

# Jenkins Token
echo "your_jenkins_token_here" > jenkins_token.txt

# Jenkins API Key
echo "your_jenkins_api_key_here" > jenkins_api_key.txt

# Jenkins JWT Secret
echo "your_jenkins_jwt_secret_here" > jenkins_jwt_secret.txt

# Jenkins Signature Secret
echo "your_jenkins_signature_secret_here" > jenkins_signature_secret.txt

# JWT Secret
echo "your_jwt_secret_here" > jwt_secret.txt
```

### 步骤 3: 设置文件权限

```bash
chmod 600 /root/Automation_Platform/deployment/secrets/*.txt
```

### 步骤 4: 创建 .env 文件 (非敏感配置)

```bash
cat > /root/Automation_Platform/.env << 'EOF'
# 应用配置
NODE_ENV=production
PORT=3000

# 数据库配置
DB_HOST=your_db_host
DB_PORT=3306
DB_USER=your_db_user
DB_NAME=automation_test

# Jenkins 配置
JENKINS_URL=http://your-jenkins-url:8080
JENKINS_USER=your_jenkins_user
JENKINS_JOB_NAME=automation-test-job

# JWT 配置
JWT_EXPIRES_IN=7d
EOF
```

### 步骤 5: 停止并删除旧容器

```bash
docker stop auto_test
docker rm auto_test
```

### 步骤 6: 使用 docker-compose 启动

```bash
cd /root/Automation_Platform
docker-compose -f deployment/docker-compose.yml up -d
```

### 步骤 7: 查看日志验证

```bash
docker logs -f automation-platform
```

---

## ✅ 方案 2: 使用环境变量直接运行 (简单快速)

这种方式不使用 Docker secrets,直接通过环境变量传递敏感信息。

### 步骤 1: 停止并删除旧容器

```bash
docker stop auto_test
docker rm auto_test
```

### 步骤 2: 使用环境变量启动容器

```bash
docker run -d \
  --name auto_test \
  -p 3000:3000 \
  -e NODE_ENV=production \
  -e PORT=3000 \
  -e DB_HOST=your_db_host \
  -e DB_PORT=3306 \
  -e DB_USER=your_db_user \
  -e DB_PASSWORD=your_db_password \
  -e DB_NAME=automation_test \
  -e JENKINS_URL=http://your-jenkins-url:8080 \
  -e JENKINS_USER=your_jenkins_user \
  -e JENKINS_TOKEN=your_jenkins_token \
  -e JENKINS_API_KEY=your_jenkins_api_key \
  -e JENKINS_JWT_SECRET=your_jenkins_jwt_secret \
  -e JENKINS_SIGNATURE_SECRET=your_jenkins_signature_secret \
  -e JENKINS_JOB_NAME=automation-test-job \
  -e JWT_SECRET=your_jwt_secret \
  -e JWT_EXPIRES_IN=7d \
  ghcr.io/acai1998/automation-platform:latest
```

### 步骤 3: 查看日志验证

```bash
docker logs -f auto_test
```

---

## ✅ 方案 3: 使用 .env 文件 + docker run (推荐开发环境)

### 步骤 1: 创建完整的 .env 文件

```bash
cat > /root/.env << 'EOF'
# 应用配置
NODE_ENV=production
PORT=3000

# 数据库配置
DB_HOST=your_db_host
DB_PORT=3306
DB_USER=your_db_user
DB_PASSWORD=your_db_password
DB_NAME=automation_test

# Jenkins 配置
JENKINS_URL=http://your-jenkins-url:8080
JENKINS_USER=your_jenkins_user
JENKINS_TOKEN=your_jenkins_token
JENKINS_API_KEY=your_jenkins_api_key
JENKINS_JWT_SECRET=your_jenkins_jwt_secret
JENKINS_SIGNATURE_SECRET=your_jenkins_signature_secret
JENKINS_JOB_NAME=automation-test-job

# JWT 配置
JWT_SECRET=your_jwt_secret
JWT_EXPIRES_IN=7d
EOF
```

### 步骤 2: 停止并删除旧容器

```bash
docker stop auto_test
docker rm auto_test
```

### 步骤 3: 使用 .env 文件启动容器

```bash
docker run -d \
  --name auto_test \
  -p 3000:3000 \
  --env-file /root/.env \
  ghcr.io/acai1998/automation-platform:latest
```

### 步骤 4: 查看日志验证

```bash
docker logs -f auto_test
```

---

## 🔍 验证配置是否成功

### 1. 检查容器是否正常运行

```bash
docker ps | grep auto_test
```

### 2. 检查应用日志

```bash
docker logs -f auto_test
```

如果配置成功,你应该看到:
- ✅ 没有 "JENKINS_TOKEN environment variable is required" 错误
- ✅ 应用正常启动
- ✅ 数据库连接成功

### 3. 测试健康检查端点

```bash
curl http://localhost:3000/api/health
```

### 4. 测试 Jenkins 认证

```bash
curl -X POST http://localhost:3000/api/jenkins/callback/test \
  -H "X-Api-Key: your_jenkins_api_key" \
  -H "Content-Type: application/json" \
  -d '{"testMessage": "hello"}'
```

---

## 🚨 清理之前创建的 Docker Secrets

你之前创建的 Docker secrets 不会被使用(除非使用 Docker Swarm),可以删除:

```bash
# 查看 secrets
docker secret ls

# 删除 secrets (如果不需要)
docker secret rm db_password
docker secret rm jenkins_token
docker secret rm jenkins_api_key
docker secret rm jenkins_jwt_secret
docker secret rm jenkins_signature_secret
```

---

## 📊 三种方案对比

| 方案 | 安全性 | 复杂度 | 适用场景 |
|-----|-------|--------|---------|
| docker-compose + secrets 文件 | 🔒🔒🔒 高 | ⭐⭐⭐ 复杂 | 生产环境 |
| docker run + 环境变量 | 🔒 低 | ⭐ 简单 | 快速测试 |
| docker run + .env 文件 | 🔒🔒 中 | ⭐⭐ 中等 | 开发环境 |

---

## 💡 推荐方案

- **生产环境**: 使用方案 1 (docker-compose + secrets)
- **开发/测试环境**: 使用方案 3 (docker run + .env 文件)
- **快速验证**: 使用方案 2 (docker run + 环境变量)

---

## 🆘 常见问题

### Q1: 为什么我创建的 Docker secrets 没有生效?

A: Docker secrets 只能在 Docker Swarm 模式或 docker-compose 中使用,普通的 `docker run` 命令不支持。

### Q2: 如何选择方案?

A: 
- 如果你需要高安全性和完整的编排功能 → 使用 docker-compose (方案 1)
- 如果你只是想快速启动测试 → 使用环境变量 (方案 2)
- 如果你想要便于管理又相对安全 → 使用 .env 文件 (方案 3)

### Q3: .env 文件放在哪里?

A: 
- 方案 1: `/root/Automation_Platform/.env` (项目根目录)
- 方案 3: 任意位置,在 `docker run` 命令中指定路径

### Q4: 如何更新配置?

A:
- 修改 .env 文件或 secrets 文件
- 重启容器: `docker restart auto_test`
- 或重新运行 `docker run` / `docker-compose up -d`
