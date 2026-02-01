# Docker Swarm 部署指南

## 概述

本指南将帮助您将自动化测试平台从基于 `.env` 文件的开发环境迁移到使用 Docker Swarm Secrets 的生产环境。

## 架构特点

- **3副本高可用部署**: 确保服务的高可用性和负载分担
- **Docker Secrets 安全管理**: 敏感配置加密存储，不暴露在环境变量中
- **Nginx 负载均衡**: 自动分发请求到多个应用实例
- **滚动更新**: 零停机部署和更新
- **健康检查**: 自动故障检测和恢复

## 前置条件

### 系统要求
- Linux 服务器 (推荐 Ubuntu 20.04+)
- Docker 20.10+
- 至少 2GB RAM, 20GB 磁盘空间
- 网络端口 80, 443, 3000 可用

### 软件依赖
```bash
# 安装 Docker (如果未安装)
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# 将用户添加到 docker 组
sudo usermod -aG docker $USER

# 重新登录或执行
newgrp docker
```

## 部署步骤

### 1. 环境准备

#### 初始化 Docker Swarm
```bash
# 初始化 Swarm 集群
docker swarm init

# 查看 Swarm 状态
docker info | grep Swarm
```

#### 创建必要目录
```bash
sudo mkdir -p /opt/automation-platform/{data,logs,configs}
sudo chown -R $USER:$USER /opt/automation-platform
```

### 2. 代码部署

#### 克隆代码 (如果在新服务器)
```bash
git clone <your-repo-url> /opt/automation-platform/app
cd /opt/automation-platform/app
```

#### 验证代码修复
确保以下文件已使用 `getSecretOrEnv()`:
- [x] `server/middleware/JenkinsAuthMiddleware.ts`
- [x] `server/services/JenkinsService.ts`
- [x] `server/services/AuthService.ts`

### 3. 创建 Docker Secrets

#### 手动创建 Secrets
根据您的选择，手动执行以下命令：

```bash
# 1. 创建数据库密码 secret
echo "Caijinwei2025" | docker secret create db_password -

# 2. 创建 Jenkins API 令牌 secret
echo "116fb13c3cc6cd3e33e688bacc26e18b60" | docker secret create jenkins_token -

# 3. 创建 Jenkins 回调认证密钥 secret
echo "3512fc38e1882a9ad2ab88c436277c129517e24a76daad1849ef419f90fd8a4f" | docker secret create jenkins_api_key -

# 4. 创建 Jenkins JWT 签名密钥 secret
echo "911902ea2bb02ad4584ab983f32be08c4a4c513b05d3faeb0f1af292b2031c45d9d7476ee44d88c868af22bbdab20cd8e2661b6f11e26e85bc82ac7ef9dd4fc9" | docker secret create jenkins_jwt_secret -

# 5. 创建 Jenkins 签名验证密钥 secret
echo "ae1f90328c75eb3b5eb5955890033bfa7f81e9713c6f54292bb46ca3a033946d" | docker secret create jenkins_signature_secret -

# 6. 创建应用 JWT 签名密钥 secret
echo "your-super-secret-jwt-key-change-this-in-production" | docker secret create jwt_secret -
```

#### 验证 Secrets 创建
```bash
# 验证所有 secrets
docker secret ls

# 使用管理脚本验证
./deployment/scripts/manage-secrets.sh verify
```

### 4. 构建和部署

#### 一键部署
```bash
cd /opt/automation-platform/app
./deployment/scripts/deploy-swarm.sh
```

#### 手动部署步骤
如果需要分步执行：

```bash
# 1. 构建镜像
docker build -f deployment/Dockerfile.prod -t automation-platform:latest .

# 2. 部署 Stack
docker stack deploy -c deployment/docker-stack.yml automation-platform

# 3. 查看部署状态
docker stack services automation-platform
```

### 5. 验证部署

#### 检查服务状态
```bash
# 查看所有服务
docker stack services automation-platform

# 查看应用副本 (应该显示 3/3)
docker service ps automation-platform_app

# 查看服务日志
docker service logs automation-platform_app
```

#### 健康检查
```bash
# 运行健康检查脚本
./deployment/scripts/health-check.sh

# 手动检查
curl http://localhost:3000/api/health
curl http://localhost:3000/api/dashboard
curl http://localhost:3000/api/jenkins/health
```

## 运维操作

### 日常管理

#### 查看服务状态
```bash
# 查看 Stack 概览
docker stack ls

# 查看服务详情
docker stack services automation-platform

# 查看任务分布
docker service ps automation-platform_app --format "table {{.Name}}\t{{.Node}}\t{{.CurrentState}}"
```

#### 查看日志
```bash
# 查看所有副本日志
docker service logs -f automation-platform_app

# 查看特定副本日志
docker service logs automation-platform_app.1
docker service logs automation-platform_app.2
docker service logs automation-platform_app.3

# 查看最近 100 行日志
docker service logs --tail 100 automation-platform_app
```

### 扩缩容操作

#### 扩容 (高负载时)
```bash
# 扩容到 5 个副本
docker service scale automation-platform_app=5

# 验证扩容结果
docker service ps automation-platform_app
```

#### 缩容 (正常负载)
```bash
# 缩容回 3 个副本
docker service scale automation-platform_app=3
```

### 更新部署

#### 滚动更新
```bash
# 更新到新镜像版本
docker service update --image automation-platform:v2.0 automation-platform_app

# 更新环境变量
docker service update --env-add NEW_VAR=value automation-platform_app

# 回滚到上一版本
docker service rollback automation-platform_app
```

#### 重新部署
```bash
# 重新部署整个 Stack
docker stack deploy -c deployment/docker-stack.yml automation-platform
```

### Secrets 管理

#### 轮换 Secrets
```bash
# 轮换数据库密码
./deployment/scripts/manage-secrets.sh rotate db_password

# 轮换 JWT 密钥
./deployment/scripts/manage-secrets.sh rotate jwt_secret
```

#### 查看 Secrets
```bash
# 列出所有相关 secrets
./deployment/scripts/manage-secrets.sh list

# 验证 secrets 存在
./deployment/scripts/manage-secrets.sh verify
```

## 故障排查

### 常见问题

#### 服务无法启动
```bash
# 检查服务状态
docker service ps automation-platform_app --no-trunc

# 查看详细错误信息
docker service logs automation-platform_app

# 检查 secrets 是否存在
docker secret ls
```

#### 数据库连接失败
```bash
# 检查数据库密码 secret
docker secret inspect db_password

# 测试数据库连接
docker run --rm -it --network automation-platform_automation-network \
  mysql:8 mysql -h 117.72.182.23 -u root -p autotest
```

#### Jenkins 集成问题
```bash
# 检查 Jenkins secrets
docker secret inspect jenkins_token
docker secret inspect jenkins_api_key

# 测试 Jenkins 连接
curl -v http://jenkins.wiac.xyz:8080/api/json
```

#### 健康检查失败
```bash
# 手动健康检查
curl -v http://localhost:3000/api/health

# 检查容器内部
docker exec -it $(docker ps -q --filter "label=com.docker.swarm.service.name=automation-platform_app") sh

# 在容器内测试
curl localhost:3000/api/health
```

### 性能监控

#### 资源使用
```bash
# 查看容器资源使用
docker stats $(docker ps --filter "label=com.docker.stack.namespace=automation-platform" --format "{{.ID}}")

# 查看系统资源
htop
df -h
free -h
```

#### 网络监控
```bash
# 查看网络连接
netstat -tlnp | grep 3000

# 查看 Docker 网络
docker network ls
docker network inspect automation-platform_automation-network
```

## 安全考虑

### Secrets 安全
- 定期轮换敏感密钥
- 监控 secrets 访问日志
- 使用强密码策略

### 网络安全
- 配置防火墙规则
- 使用 HTTPS (生产环境)
- 限制管理端口访问

### 容器安全
- 定期更新基础镜像
- 扫描镜像漏洞
- 使用非 root 用户运行

## 备份和恢复

### 数据备份
```bash
# 备份配置文件
tar -czf config-backup-$(date +%Y%m%d).tar.gz deployment/

# 备份 Docker secrets (注意：无法直接导出内容)
docker secret ls > secrets-list-$(date +%Y%m%d).txt
```

### 灾难恢复
```bash
# 重新创建 secrets
./deployment/scripts/manage-secrets.sh create

# 重新部署服务
./deployment/scripts/deploy-swarm.sh
```

## 监控和告警

### 基础监控
```bash
# 定期健康检查
crontab -e
# 添加: */5 * * * * /opt/automation-platform/app/deployment/scripts/health-check.sh --quick > /dev/null

# 日志监控
tail -f /var/log/docker.log | grep automation-platform
```

### 告警设置
- 服务下线告警
- 资源使用率告警
- 错误日志告警

## 升级路径

### 版本升级
1. 备份当前配置
2. 构建新版本镜像
3. 执行滚动更新
4. 验证新版本功能
5. 如有问题立即回滚

### 架构升级
- 单节点 → 多节点集群
- 添加外部负载均衡
- 集成服务网格 (Istio)

## 支持和维护

### 日志位置
- 应用日志: `docker service logs automation-platform_app`
- 系统日志: `/var/log/docker.log`
- Nginx 日志: `docker service logs automation-platform_nginx`

### 配置文件
- Stack 配置: `deployment/docker-stack.yml`
- 环境变量: `deployment/.env.swarm`
- Nginx 配置: `deployment/configs/nginx.swarm.conf`

### 脚本工具
- 部署脚本: `deployment/scripts/deploy-swarm.sh`
- Secrets 管理: `deployment/scripts/manage-secrets.sh`
- 健康检查: `deployment/scripts/health-check.sh`