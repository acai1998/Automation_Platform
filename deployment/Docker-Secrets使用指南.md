# Docker Secrets 使用指南

## 🔐 什么是 Docker Secrets？

Docker Secrets 是 Docker 提供的一种安全管理敏感信息的机制，用于存储和管理密码、API 密钥、证书等敏感数据。

### 核心优势

- ✅ **安全性高** - Secret 以加密方式存储和传输
- ✅ **不会泄露** - 不会出现在镜像、容器日志或 `docker inspect` 中
- ✅ **权限控制** - 只有被授权的服务才能访问
- ✅ **集中管理** - 统一管理所有敏感信息
- ✅ **自动挂载** - Docker 自动将 Secret 挂载到 `/run/secrets/`

## 🎯 工作原理

```
┌─────────────────────────────────────────────────────┐
│  宿主机                                              │
│                                                      │
│  deployment/secrets/                                 │
│  ├── db_password.txt         ← 本地 Secret 文件    │
│  ├── jenkins_token.txt                              │
│  └── jwt_secret.txt                                 │
│                                                      │
│  docker-compose.yml:                                 │
│  secrets:                                            │
│    db_password:                                      │
│      file: ./secrets/db_password.txt                │
│                       ↓                              │
│  ┌──────────────────────────────────────────────┐  │
│  │  Docker 容器                                  │  │
│  │                                                │  │
│  │  /run/secrets/                                 │  │
│  │  ├── db_password    ← 自动挂载（只读）        │  │
│  │  ├── jenkins_token                            │  │
│  │  └── jwt_secret                               │  │
│  │              ↓                                  │  │
│  │  环境变量:                                     │  │
│  │  DB_PASSWORD_FILE=/run/secrets/db_password   │  │
│  │              ↓                                  │  │
│  │  应用代码:                                     │  │
│  │  getSecretOrEnv('DB_PASSWORD')               │  │
│  │  → 读取 /run/secrets/db_password 文件内容    │  │
│  │  → 返回: "Caijinwei2025"                     │  │
│  └──────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

## 🚀 快速开始

### 步骤 1: 设置 Secrets

从 `.env` 文件自动创建 Secret 文件：

```bash
cd deployment

# 运行设置脚本（会从 .env 提取敏感信息）
./scripts/setup-secrets.sh
```

这会创建以下文件：

```
deployment/secrets/
├── db_password.txt              # 数据库密码
├── jenkins_token.txt            # Jenkins Token
├── jenkins_api_key.txt          # Jenkins API Key
├── jenkins_jwt_secret.txt       # Jenkins JWT Secret
├── jenkins_signature_secret.txt # Jenkins Signature Secret
└── jwt_secret.txt               # JWT Secret
```

### 步骤 2: 启动服务

```bash
# 启动容器（自动挂载 Secrets）
docker-compose up -d

# 查看日志
docker-compose logs -f app
```

### 步骤 3: 验证 Secrets

```bash
# 运行验证脚本
./scripts/verify-secrets.sh

# 或手动验证
docker exec automation-platform ls -la /run/secrets
```

## 📋 配置说明

### 1. docker-compose.yml 配置

```yaml
services:
  app:
    # 挂载 Secrets
    secrets:
      - db_password
      - jenkins_token
      - jwt_secret
    
    environment:
      # 告诉应用从哪里读取 Secret
      - DB_PASSWORD_FILE=/run/secrets/db_password
      - JENKINS_TOKEN_FILE=/run/secrets/jenkins_token
      - JWT_SECRET_FILE=/run/secrets/jwt_secret

# 定义 Secrets 来源
secrets:
  db_password:
    file: ./secrets/db_password.txt
  jenkins_token:
    file: ./secrets/jenkins_token.txt
  jwt_secret:
    file: ./secrets/jwt_secret.txt
```

### 2. 应用代码中使用

我们已经创建了 `server/utils/secrets.ts` 工具类来自动处理 Secrets：

```typescript
import { getSecretOrEnv } from '../utils/secrets';

// 自动从 Secret 文件或环境变量读取
const dbPassword = getSecretOrEnv('DB_PASSWORD');
// 1. 如果 DB_PASSWORD_FILE 存在，读取文件内容
// 2. 否则读取 DB_PASSWORD 环境变量
// 3. 返回值

// 使用示例
const dbConfig = {
  host: getSecretOrEnv('DB_HOST', 'localhost'),
  port: parseInt(getSecretOrEnv('DB_PORT', '3306')),
  user: getSecretOrEnv('DB_USER', 'root'),
  password: getSecretOrEnv('DB_PASSWORD'),  // ← 支持 Secret
};
```

## 🔧 管理 Secrets

### 查看 Secrets

```bash
# 查看本地 Secret 文件
ls -la deployment/secrets/

# 查看容器内挂载的 Secrets
docker exec automation-platform ls -la /run/secrets

# 读取特定 Secret（调试用）
docker exec automation-platform cat /run/secrets/db_password
```

### 更新 Secrets

```bash
# 方式1: 修改 Secret 文件
echo "new_password" > deployment/secrets/db_password.txt

# 方式2: 重新从 .env 生成
vim .env  # 修改密码
./scripts/setup-secrets.sh

# 重启容器使更改生效
docker-compose restart app
```

### 删除 Secrets

```bash
# 删除本地 Secret 文件
rm -rf deployment/secrets/

# 或保留目录但清空文件
rm deployment/secrets/*.txt
```

## 🔄 开发环境 vs 生产环境

### 开发环境（使用 .env）

```bash
# 不使用 Secrets，直接用环境变量
docker-compose up -d

# 应用会从环境变量读取
DB_PASSWORD=Caijinwei2025
```

### 生产环境（使用 Secrets）

```bash
# 1. 设置 Secrets
./scripts/setup-secrets.sh

# 2. 启动服务
docker-compose up -d

# 应用会从 Secret 文件读取
# /run/secrets/db_password → "Caijinwei2025"
```

### 混合模式（兼容）

你的应用**同时支持两种方式**，优先级如下：

1. ✅ **优先**: 如果 `DB_PASSWORD_FILE` 存在，读取文件
2. ✅ **回退**: 如果文件不存在，读取 `DB_PASSWORD` 环境变量
3. ✅ **默认**: 如果都不存在，使用默认值

这样可以在开发环境用 `.env`，生产环境用 Secrets，无需修改代码！

## 🛡️ 安全最佳实践

### 1. 文件权限

```bash
# Secret 目录权限 700（只有所有者可访问）
chmod 700 deployment/secrets/

# Secret 文件权限 600（只有所有者可读写）
chmod 600 deployment/secrets/*.txt

# 验证权限
ls -la deployment/secrets/
```

### 2. 不提交到 Git

```bash
# 已在 .gitignore 中配置
deployment/secrets/
*.secret
*.key
*_password.txt
*_token.txt
*_secret.txt

# 验证未被跟踪
git status | grep secrets
# 应该没有输出
```

### 3. 定期轮换

```bash
# 定期更新敏感凭证
# 1. 在 .env 中更新密码
vim .env

# 2. 重新生成 Secret 文件
./scripts/setup-secrets.sh

# 3. 重启服务
docker-compose restart app
```

### 4. 备份 Secrets

```bash
# 备份 Secret 文件到安全位置（加密）
tar czf secrets-backup-$(date +%Y%m%d).tar.gz deployment/secrets/
gpg -c secrets-backup-$(date +%Y%m%d).tar.gz
rm secrets-backup-$(date +%Y%m%d).tar.gz

# 恢复
gpg secrets-backup-20260201.tar.gz.gpg
tar xzf secrets-backup-20260201.tar.gz
```

## 🔍 调试和排错

### 问题1: Secret 文件不存在

```bash
# 检查文件
ls -la deployment/secrets/

# 如果不存在，运行设置脚本
./scripts/setup-secrets.sh
```

### 问题2: 容器内看不到 Secrets

```bash
# 检查 docker-compose.yml 配置
grep -A 10 "secrets:" docker-compose.yml

# 检查容器挂载
docker exec automation-platform ls -la /run/secrets

# 重新创建容器
docker-compose up -d --force-recreate
```

### 问题3: 应用无法读取 Secret

```bash
# 查看环境变量
docker exec automation-platform env | grep _FILE

# 查看日志
docker logs automation-platform | grep -i secret

# 测试读取
docker exec automation-platform cat /run/secrets/db_password
```

### 问题4: 权限错误

```bash
# 修复权限
chmod 700 deployment/secrets
chmod 600 deployment/secrets/*.txt

# 重启容器
docker-compose restart app
```

## 📊 Secrets 对比表

| 特性 | 环境变量 (.env) | Docker Secrets | 外部服务 (Vault) |
|------|----------------|----------------|------------------|
| **安全性** | ⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **易用性** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ |
| **成本** | 免费 | 免费 | 付费 |
| **适用场景** | 开发/测试 | 生产环境 | 企业级 |
| **权限控制** | 无 | 有限 | 细粒度 |
| **审计日志** | 无 | 无 | 有 |
| **自动轮换** | 手动 | 手动 | 自动 |

## 🎯 推荐配置

### 小型项目/个人项目

```bash
# 使用 .env 文件即可
docker-compose up -d
```

### 中型项目/团队项目

```bash
# 使用 Docker Secrets（本方案）
./scripts/setup-secrets.sh
docker-compose up -d
```

### 大型项目/企业级

```bash
# 使用外部 Secret 管理服务
# - HashiCorp Vault
# - AWS Secrets Manager
# - Azure Key Vault
# - Google Secret Manager
```

## 📝 常用命令汇总

```bash
# 设置 Secrets
./scripts/setup-secrets.sh

# 验证 Secrets
./scripts/verify-secrets.sh

# 查看本地 Secret 文件
ls -la deployment/secrets/

# 查看容器内 Secrets
docker exec automation-platform ls -la /run/secrets

# 读取特定 Secret
docker exec automation-platform cat /run/secrets/db_password

# 查看环境变量
docker exec automation-platform env | grep _FILE

# 更新 Secret 并重启
echo "new_value" > deployment/secrets/db_password.txt
docker-compose restart app

# 查看日志
docker logs -f automation-platform
```

## 🎉 总结

### ✅ 你已经配置的功能

1. **Docker Compose 支持 Secrets** - `docker-compose.yml` 已配置
2. **工具类支持** - `server/utils/secrets.ts` 自动处理
3. **数据库配置使用 Secrets** - `server/config/database.ts` 已更新
4. **管理脚本** - `setup-secrets.sh` 和 `verify-secrets.sh`
5. **Git 保护** - `.gitignore` 已配置

### 🔑 核心优势

- **开发环境**: 继续使用 `.env`（简单）
- **生产环境**: 使用 Docker Secrets（安全）
- **自动兼容**: 代码自动处理两种方式
- **零成本**: 无需额外服务

### 📖 相关文档

- [快速开始.md](./快速开始.md)
- [部署指南-读取外部环境配置.md](./部署指南-读取外部环境配置.md)
- [Docker部署-外部数据库连接指南.md](../docs/Docker部署-外部数据库连接指南.md)

---

**下一步**: 运行 `./scripts/setup-secrets.sh` 开始使用 Docker Secrets！
