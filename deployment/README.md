# Docker 部署指南

本目录包含自动化测试平台的 Docker 部署配置文件。

## 📁 文件说明

```
deployment/
├── Dockerfile                        # 应用镜像构建文件
├── docker-compose.yml                # 基础部署配置
├── docker-compose.prod.yml           # 生产环境部署（包含 Redis + Nginx + 监控）
├── deploy.sh                         # 一键部署脚本 ⭐
├── nginx.conf                        # Nginx 配置文件
├── scripts/                          # 部署相关脚本
└── README.md                         # 本文件
```

## 🚀 快速开始

### 方式 1: 使用一键部署脚本（推荐）

```bash
cd deployment

# 1. 复制配置文件模板（从根目录）
cp ../.env.example ../.env

# 2. 编辑配置文件，填写你的数据库信息
vim ../.env

# 3. 【可选】设置 Docker Secrets（生产环境推荐）
./scripts/setup-secrets.sh

# 4. 运行部署脚本（基础模式）
./deploy.sh -m simple -b

# 或者生产模式（包含 Redis + Nginx + 监控）
./deploy.sh -m prod -b
```

### 方式 2: 手动使用 Docker Compose

```bash
cd deployment

# 1. 准备配置文件
cp ../.env.example ../.env
vim ../.env  # 填写数据库信息

# 2. 构建镜像
cd ..
docker build -t automation-platform:latest -f deployment/Dockerfile .

# 3. 启动服务
cd deployment
docker-compose -f docker-compose.yml up -d
```

## 🔧 配置说明

### 连接外部数据库（推荐用于生产环境）

编辑 `.env` 文件（在项目根目录）：

```bash
# Jenkins 配置（必需）
JENKINS_URL=http://jenkins.wiac.xyz:8080/
JENKINS_USER=root
JENKINS_TOKEN=your_jenkins_token
JENKINS_API_KEY=your-secret-api-key-here
JENKINS_JWT_SECRET=your-secret-jwt-key-here
JENKINS_SIGNATURE_SECRET=your-secret-signature-key-here

# 其他配置项请参考 .env.example
```

### 环境变量说明

项目根目录的 `.env.example` 文件包含了完整的配置说明，包括 Jenkins 集成、认证配置等。

## 📋 部署模式对比

| 模式 | 配置文件 | 包含服务 | 适用场景 |
|------|---------|---------|---------|
| **basic** | `docker-compose.yml` | 仅应用 + Nginx | 基础部署 |
| **prod** | `docker-compose.prod.yml` | 应用 + Redis + Nginx + 监控 | 生产环境（外部数据库） |

## 🛠️ 常用命令

### 使用部署脚本

```bash
# 查看帮助
./deploy.sh --help

# 构建并启动（基础模式）
./deploy.sh -m basic -b

# 构建并启动（生产模式）
./deploy.sh -m prod -b

# 查看日志
./deploy.sh -l

# 检查状态
./deploy.sh --check

# 停止服务
./deploy.sh -d

# 备份数据（如果需要）
./deploy.sh --backup
```

### 使用 Docker Compose

```bash
# 启动服务
docker-compose -f docker-compose.yml up -d

# 查看日志
docker-compose -f docker-compose.yml logs -f

# 停止服务
docker-compose -f docker-compose.yml down

# 重启服务
docker-compose -f docker-compose.yml restart

# 查看服务状态
docker-compose -f docker-compose.yml ps
```

### 使用 Docker 命令

```bash
# 查看容器状态
docker ps -a | grep automation

# 查看应用日志
docker logs -f automation-platform-app

# 进入容器
docker exec -it automation-platform-app sh

# 重启容器
docker restart automation-platform-app

# 停止并删除容器
docker stop automation-platform-app
docker rm automation-platform-app
```

## 🔍 故障排查

### 1. 容器无法启动

```bash
# 查看详细日志
docker logs automation-platform-app

# 检查配置文件
cat .env.production

# 验证镜像是否存在
docker images | grep automation-platform
```

### 2. 无法连接数据库

```bash
# 进入容器测试连接
docker exec -it automation-platform-app sh

# 安装 mysql 客户端
apk add --no-cache mysql-client

# 测试数据库连接
mysql -h your-database-host.com -u automation_user -p

# 测试网络连通性
ping your-database-host.com
```

### 3. 检查健康状态

```bash
# 健康检查
curl http://localhost:3000/api/health

# 查看容器健康状态
docker inspect --format='{{.State.Health.Status}}' automation-platform-app
```

## 🔐 安全建议

### 使用 Docker Secrets（生产环境推荐）

```bash
# 1. 设置 Secrets
./scripts/setup-secrets.sh

# 2. 验证 Secrets
./scripts/verify-secrets.sh

# 3. 查看完整指南
cat Docker-Secrets使用指南.md
```

### 基本安全措施

1. **不要在代码中硬编码密码**
   - 开发环境: 使用 `.env` 文件
   - 生产环境: 使用 Docker Secrets

2. **保护配置文件**
   ```bash
   chmod 600 ../.env
   chmod 700 deployment/secrets/
   chmod 600 deployment/secrets/*.txt
   ```

3. **不要提交敏感信息到 Git**
   ```bash
   # 已在 .gitignore 配置:
   # .env
   # deployment/secrets/
   # *_password.txt
   # *_token.txt
   # *_secret.txt
   ```

4. **使用强密码**
   - 数据库密码至少 16 位
   - JWT Secret 至少 32 位
   - 包含大小写字母、数字和特殊字符

5. **限制数据库访问**
   - 只允许应用 IP 访问数据库
   - 使用防火墙规则限制端口

6. **定期轮换密钥**
   ```bash
   # 更新 .env 中的密码
   vim ../.env
   
   # 重新生成 Secrets
   ./scripts/setup-secrets.sh
   
   # 重启服务
   docker-compose restart app
   ```

## 📊 监控和维护

### 查看资源使用情况

```bash
# 查看容器资源使用
docker stats automation-platform-app

# 查看容器详细信息
docker inspect automation-platform-app
```

### 日志管理

```bash
# 查看日志文件位置
docker inspect -f '{{.LogPath}}' automation-platform-app

# 清理日志（谨慎操作）
truncate -s 0 $(docker inspect -f '{{.LogPath}}' automation-platform-app)
```

### 备份数据

```bash
# 备份数据（如果需要）
./deploy.sh --backup

# 手动备份应用数据
docker exec automation-platform tar czf - /app/data > backup_$(date +%Y%m%d_%H%M%S).tar.gz
```

## 🌐 访问地址

服务启动后，可以通过以下地址访问：

- **应用主页**: http://localhost:3000
- **健康检查**: http://localhost:3000/api/health
- **Redis** (生产模式): localhost:6379

## 📚 更多文档

详细的部署指南请参考：

- [Docker部署-外部数据库连接指南.md](../docs/Docker部署-外部数据库连接指南.md)
- [项目主 README](../README.md)

## ❓ 常见问题

**Q: 如何更新应用？**

```bash
# 1. 拉取最新代码
git pull

# 2. 重新构建镜像
./deploy.sh -m basic -b

# 3. 重启服务
docker-compose -f docker-compose.yml restart
```

**Q: 如何切换数据库？**

编辑 `.env.production` 文件，修改 `DB_HOST`、`DB_NAME` 等配置，然后重启服务。

**Q: 如何扩展服务？**

```bash
# 使用 Docker Compose 扩展
docker-compose -f docker-compose.yml up -d --scale app=3
```

**Q: 如何查看数据库中的数据？**

```bash
# 查看应用内部数据（如果有）
docker exec -it automation-platform-app ls -la /app/data

# 如果使用外部数据库，请直接连接到您的 MariaDB 服务器
```

## 📞 获取帮助

如果遇到问题，请：

1. 查看日志: `./deploy.sh -l`
2. 检查状态: `./deploy.sh --check`
3. 参考详细文档: [Docker部署指南](../docs/Docker部署-外部数据库连接指南.md)
