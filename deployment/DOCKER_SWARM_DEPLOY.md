# Docker Swarm 部署指南

使用 Docker Swarm 和 Docker Secrets 安全地部署自动化测试平台。

---

## 📋 前提条件

你已经创建了以下 Docker Secrets:
```bash
docker secret ls
# 应该看到:
# - db_password
# - jenkins_token
# - jenkins_api_key
# - jenkins_jwt_secret
# - jenkins_signature_secret
```

---

## 🚀 快速部署步骤

### 步骤 1: 初始化 Docker Swarm（如果还没有初始化）

```bash
# 检查是否已经是 Swarm 节点
docker info | grep "Swarm: active"

# 如果不是，初始化 Swarm
docker swarm init
```

### 步骤 2: 验证 Secrets 是否存在

```bash
docker secret ls
```

确保以下 secrets 已创建:
- `db_password`
- `jenkins_token`
- `jenkins_api_key`
- `jenkins_jwt_secret`
- `jenkins_signature_secret`

### 步骤 3: 上传 docker-stack.yml 到服务器

将 `deployment/docker-stack.yml` 文件上传到你的服务器:

```bash
# 在本地（假设服务器 IP 是 192.168.1.100）
scp deployment/docker-stack.yml root@192.168.1.100:/root/
```

### 步骤 4: 部署 Stack

```bash
# 在服务器上执行
cd /root
docker stack deploy -c docker-stack.yml automation
```

### 步骤 5: 查看部署状态

```bash
# 查看 stack 列表
docker stack ls

# 查看服务状态
docker stack services automation

# 查看服务日志
docker service logs -f automation_app
```

### 步骤 6: 验证部署

```bash
# 等待服务启动（通常需要 30-60 秒）
sleep 60

# 测试健康检查
curl http://localhost:3000/api/health

# 测试 Jenkins 认证（使用你的实际 API Key）
curl -X POST http://localhost:3000/api/jenkins/callback/test \
  -H "X-Api-Key: 3512fc38e1882a9ad2ab88c436277c129517e24a76daad1849ef419f90fd8a4f" \
  -H "Content-Type: application/json" \
  -d '{"testMessage": "hello"}'
```

---

## 🔄 更新部署

### 更新镜像版本

```bash
# 拉取最新镜像
docker pull ghcr.io/acai1998/automation-platform:latest

# 更新服务（滚动更新）
docker service update --image ghcr.io/acai1998/automation-platform:latest automation_app
```

### 更新配置

```bash
# 修改 docker-stack.yml 后重新部署
docker stack deploy -c docker-stack.yml automation
```

---

## 🛑 停止和删除

### 停止服务

```bash
# 删除整个 stack
docker stack rm automation

# 等待清理完成
docker stack ls
```

### 清理资源

```bash
# 删除 secrets（如果需要）
docker secret rm db_password jenkins_token jenkins_api_key jenkins_jwt_secret jenkins_signature_secret

# 清理未使用的镜像
docker image prune -a
```

---

## 🔍 故障排查

### 查看服务详情

```bash
# 查看服务详细信息
docker service ps automation_app

# 查看服务配置
docker service inspect automation_app
```

### 查看日志

```bash
# 实时查看日志
docker service logs -f automation_app

# 查看最近 100 行日志
docker service logs --tail 100 automation_app

# 查看带时间戳的日志
docker service logs -t automation_app
```

### 常见问题

#### 1. 服务一直在重启

```bash
# 查看具体错误
docker service ps automation_app --no-trunc

# 检查日志中的错误信息
docker service logs automation_app | grep -i error
```

可能原因:
- ❌ Secrets 未正确挂载 → 检查 `docker secret ls`
- ❌ 数据库连接失败 → 检查 DB_HOST 和 db_password
- ❌ 镜像拉取失败 → 检查网络连接

#### 2. 无法访问服务

```bash
# 检查端口映射
docker service inspect automation_app | grep -A 5 Ports

# 检查防火墙
firewall-cmd --list-ports
firewall-cmd --add-port=3000/tcp --permanent
firewall-cmd --reload
```

#### 3. Secrets 读取失败

```bash
# 进入运行中的容器检查
docker exec -it $(docker ps -q -f name=automation_app) sh

# 在容器内检查 secrets 文件
ls -la /run/secrets/
cat /run/secrets/jenkins_token
```

---

## 📊 监控和维护

### 查看资源使用情况

```bash
# 查看服务资源使用
docker stats $(docker ps -q -f name=automation_app)

# 查看详细资源信息
docker service ps automation_app --format "table {{.Name}}\t{{.Node}}\t{{.CurrentState}}"
```

### 扩容服务

```bash
# 增加副本数量（不推荐，因为有数据库状态）
docker service scale automation_app=2

# 减少副本数量
docker service scale automation_app=1
```

### 健康检查

Stack 配置中已经包含健康检查:
```yaml
healthcheck:
  test: ["CMD", "wget", "--quiet", "--tries=1", "--spider", "http://localhost:3000/api/health"]
  interval: 30s
  timeout: 10s
  retries: 3
  start_period: 40s
```

---

## 🔐 安全最佳实践

1. **使用 Docker Secrets**: ✅ 已配置
2. **限制网络访问**: 使用防火墙规则
3. **定期更新镜像**: 及时更新到最新版本
4. **监控日志**: 定期检查异常日志
5. **备份数据**: 定期备份数据库

---

## 📝 配置说明

### 环境变量（在 docker-stack.yml 中）

| 变量名 | 说明 | 示例值 |
|--------|------|--------|
| `NODE_ENV` | 运行环境 | `production` |
| `PORT` | 服务端口 | `3000` |
| `DB_HOST` | 数据库地址 | `117.72.182.23` |
| `DB_PORT` | 数据库端口 | `3306` |
| `DB_USER` | 数据库用户 | `root` |
| `DB_NAME` | 数据库名称 | `autotest` |
| `JENKINS_URL` | Jenkins 地址 | `http://jenkins.wiac.xyz:8080` |
| `JENKINS_USER` | Jenkins 用户 | `root` |

### Docker Secrets（敏感信息）

| Secret 名称 | 说明 | 环境变量 |
|------------|------|----------|
| `db_password` | 数据库密码 | `DB_PASSWORD` |
| `jenkins_token` | Jenkins Token | `JENKINS_TOKEN` |
| `jenkins_api_key` | Jenkins API Key | `JENKINS_API_KEY` |
| `jenkins_jwt_secret` | JWT 密钥 | `JENKINS_JWT_SECRET` |
| `jenkins_signature_secret` | 签名密钥 | `JENKINS_SIGNATURE_SECRET` |

---

## 🎯 与 docker run 对比

| 特性 | docker run | Docker Swarm |
|------|-----------|--------------|
| Secrets 支持 | ❌ | ✅ |
| 自动重启 | 手动配置 | 内置支持 |
| 滚动更新 | ❌ | ✅ |
| 负载均衡 | ❌ | ✅ |
| 多节点部署 | ❌ | ✅ |
| 资源限制 | 手动配置 | 配置文件管理 |

---

## 💡 提示

1. **首次部署**: 服务启动需要 30-60 秒，请耐心等待
2. **日志查看**: 使用 `docker service logs` 而不是 `docker logs`
3. **配置更新**: 修改 stack 文件后重新运行 deploy 命令即可
4. **密钥更新**: 更新 secret 需要先删除旧 secret，创建新 secret，然后重新部署

---

## 📚 相关文档

- [Docker Secrets 官方文档](https://docs.docker.com/engine/swarm/secrets/)
- [Docker Stack 部署指南](https://docs.docker.com/engine/swarm/stack-deploy/)
- 项目文档: `deployment/DOCKER_SECRET_GUIDE.md`
