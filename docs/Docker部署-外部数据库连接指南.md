# Docker 镜像连接外部数据库指南

## 问题说明

Docker 镜像构建时**不应该**也**不能**将数据库打包到镜像中。数据库应该作为独立的服务运行，容器通过网络连接到数据库。

## 解决方案概览

有三种主要方式让 Docker 容器连接外部数据库：

### 方式 1: 连接到远程 MariaDB 服务器（生产环境推荐）
### 方式 2: 使用 Docker Compose 同时运行应用和数据库
### 方式 3: 连接到宿主机上的数据库

---

## 方式 1: 连接远程数据库（推荐）

### 1.1 配置环境变量

编辑 `deployment/.env.production` 文件：

```bash
# 数据库配置 - 填写你的真实数据库信息
DB_HOST=your-database-host.com        # 数据库服务器地址
DB_PORT=3306                          # 数据库端口
DB_NAME=autotest                      # 数据库名称
DB_USER=your_db_user                  # 数据库用户名
DB_PASSWORD=your_secure_password      # 数据库密码
```

### 1.2 使用 Docker Compose 启动

```bash
cd deployment

# 使用简化版配置启动
docker-compose -f docker-compose.simple.yml up -d

# 或使用完整版配置启动（包含 Redis、Nginx 等）
docker-compose -f docker-compose.prod.yml up -d
```

### 1.3 验证连接

```bash
# 查看容器日志
docker logs automation-platform-app

# 测试健康检查
curl http://localhost:3000/api/health
```

---

## 方式 2: Docker Compose 管理数据库（开发/测试环境）

如果你希望通过 Docker Compose 同时管理应用和数据库：

### 2.1 创建完整的 docker-compose 配置

```yaml
version: '3.8'

services:
  # MariaDB 数据库
  mariadb:
    image: mariadb:10.11
    container_name: automation-mariadb
    restart: unless-stopped
    
    environment:
      - MYSQL_ROOT_PASSWORD=root_password
      - MYSQL_DATABASE=autotest
      - MYSQL_USER=automation_user
      - MYSQL_PASSWORD=automation_password
    
    volumes:
      - mariadb-data:/var/lib/mysql
    
    ports:
      - "3306:3306"
    
    networks:
      - automation-network
    
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "localhost"]
      interval: 30s
      timeout: 10s
      retries: 3

  # 应用服务
  app:
    build:
      context: ..
      dockerfile: deployment/Dockerfile
    container_name: automation-platform-app
    restart: unless-stopped
    
    environment:
      - NODE_ENV=production
      - PORT=3000
      # 连接到 Docker 网络中的 mariadb 服务
      - DB_HOST=mariadb
      - DB_PORT=3306
      - DB_NAME=autotest
      - DB_USER=automation_user
      - DB_PASSWORD=automation_password
    
    ports:
      - "3000:3000"
    
    depends_on:
      mariadb:
        condition: service_healthy
    
    networks:
      - automation-network

volumes:
  mariadb-data:
    driver: local

networks:
  automation-network:
    driver: bridge
```

### 2.2 启动所有服务

```bash
docker-compose up -d

# 查看所有服务状态
docker-compose ps

# 查看日志
docker-compose logs -f app
```

---

## 方式 3: 连接宿主机数据库

如果你的 MariaDB 运行在宿主机（而不是容器中），需要让容器访问宿主机：

### 3.1 配置数据库允许远程连接

编辑 MariaDB 配置文件（通常在 `/etc/mysql/mariadb.conf.d/50-server.cnf`）：

```ini
[mysqld]
# 允许远程连接
bind-address = 0.0.0.0
```

重启 MariaDB：

```bash
sudo systemctl restart mariadb
```

### 3.2 创建数据库用户并授权

```sql
-- 登录 MariaDB
mysql -u root -p

-- 创建数据库
CREATE DATABASE IF NOT EXISTS autotest CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 创建用户（允许从 Docker 网络访问）
CREATE USER 'automation_user'@'%' IDENTIFIED BY 'your_password';

-- 授权
GRANT ALL PRIVILEGES ON autotest.* TO 'automation_user'@'%';

-- 刷新权限
FLUSH PRIVILEGES;
```

### 3.3 配置 Docker 使用宿主机网络

**Linux 系统：**

```bash
# 方式 A: 使用特殊 DNS 名称 host.docker.internal（Docker 18.03+）
docker run -d \
  -e DB_HOST=host.docker.internal \
  -e DB_PORT=3306 \
  -e DB_NAME=autotest \
  -e DB_USER=automation_user \
  -e DB_PASSWORD=your_password \
  -p 3000:3000 \
  automation-platform:latest

# 方式 B: 使用宿主机 IP（需要替换为实际 IP）
docker run -d \
  -e DB_HOST=192.168.1.100 \
  -e DB_PORT=3306 \
  -e DB_NAME=autotest \
  -e DB_USER=automation_user \
  -e DB_PASSWORD=your_password \
  -p 3000:3000 \
  automation-platform:latest

# 方式 C: 使用 --add-host 参数（推荐）
docker run -d \
  --add-host=host.docker.internal:host-gateway \
  -e DB_HOST=host.docker.internal \
  -e DB_PORT=3306 \
  -e DB_NAME=autotest \
  -e DB_USER=automation_user \
  -e DB_PASSWORD=your_password \
  -p 3000:3000 \
  automation-platform:latest
```

**Docker Compose 配置：**

```yaml
version: '3.8'

services:
  app:
    image: automation-platform:latest
    
    environment:
      - DB_HOST=host.docker.internal  # 或使用宿主机 IP
      - DB_PORT=3306
      - DB_NAME=autotest
      - DB_USER=automation_user
      - DB_PASSWORD=your_password
    
    ports:
      - "3000:3000"
    
    # Linux 系统需要添加这个配置
    extra_hosts:
      - "host.docker.internal:host-gateway"
```

---

## 常见问题排查

### 1. 容器无法连接数据库

**检查网络连通性：**

```bash
# 进入容器
docker exec -it automation-platform-app sh

# 测试数据库连接
apk add --no-cache mysql-client
mysql -h your-database-host.com -u automation_user -p

# 测试网络连通
apk add --no-cache curl
curl -v telnet://your-database-host.com:3306
```

### 2. 数据库拒绝连接

**检查防火墙：**

```bash
# 检查端口是否开放
sudo ufw allow 3306/tcp

# 或
sudo firewall-cmd --add-port=3306/tcp --permanent
sudo firewall-cmd --reload
```

**检查 MariaDB 用户权限：**

```sql
-- 查看用户权限
SELECT user, host FROM mysql.user WHERE user = 'automation_user';

-- 如果 host 不是 '%'，需要更新
UPDATE mysql.user SET host = '%' WHERE user = 'automation_user';
FLUSH PRIVILEGES;
```

### 3. 连接超时

**增加超时时间：**

编辑 `.env.production`：

```bash
DB_CONNECTION_TIMEOUT=30000  # 增加到 30 秒
DB_IDLE_TIMEOUT=120000       # 增加空闲超时
```

### 4. 查看详细日志

```bash
# 实时查看日志
docker logs -f automation-platform-app

# 查看最近 100 行日志
docker logs --tail 100 automation-platform-app

# 查看包含特定关键词的日志
docker logs automation-platform-app 2>&1 | grep -i "database\|mariadb\|mysql"
```

---

## 安全建议

### 1. 使用 Docker Secrets（生产环境推荐）

```bash
# 创建密钥
echo "your_db_password" | docker secret create db_password -

# 在 docker-compose.yml 中使用
version: '3.8'

services:
  app:
    image: automation-platform:latest
    secrets:
      - db_password
    environment:
      - DB_PASSWORD_FILE=/run/secrets/db_password

secrets:
  db_password:
    external: true
```

### 2. 使用环境变量文件（避免明文密码）

```bash
# 设置文件权限
chmod 600 .env.production

# 确保不被提交到 Git
echo ".env.production" >> .gitignore
```

### 3. 使用 SSL/TLS 连接数据库

```bash
# 在 .env.production 中添加
DB_SSL_ENABLED=true
DB_SSL_CA=/path/to/ca-cert.pem
DB_SSL_CERT=/path/to/client-cert.pem
DB_SSL_KEY=/path/to/client-key.pem
```

---

## 快速启动命令汇总

### 构建镜像

```bash
cd /Users/wb_caijinwei/Automation_Platform
docker build -t automation-platform:latest -f deployment/Dockerfile .
```

### 启动应用（方式 1：直接运行）

```bash
docker run -d \
  --name automation-platform-app \
  -e DB_HOST=your-database-host.com \
  -e DB_PORT=3306 \
  -e DB_NAME=autotest \
  -e DB_USER=your_user \
  -e DB_PASSWORD=your_password \
  -p 3000:3000 \
  --restart unless-stopped \
  automation-platform:latest
```

### 启动应用（方式 2：使用 Docker Compose）

```bash
cd deployment

# 编辑 .env.production 配置数据库信息
vim .env.production

# 启动服务
docker-compose -f docker-compose.simple.yml up -d

# 查看日志
docker-compose logs -f
```

### 停止和清理

```bash
# 停止容器
docker stop automation-platform-app

# 删除容器
docker rm automation-platform-app

# 或使用 docker-compose
docker-compose -f docker-compose.simple.yml down

# 清理未使用的镜像
docker image prune -a
```

---

## 总结

✅ **推荐做法：**
- 生产环境：使用方式 1（远程数据库）
- 开发/测试环境：使用方式 2（Docker Compose 管理数据库）

❌ **不推荐：**
- 将数据库打包到镜像中
- 在容器内直接安装和运行数据库
- 使用本地文件数据库（SQLite）在容器化环境中

🔐 **安全要点：**
- 不要在代码中硬编码数据库密码
- 使用环境变量或 Docker Secrets
- 限制数据库用户权限
- 使用 SSL/TLS 加密连接

📝 **维护要点：**
- 定期备份数据库
- 监控数据库连接池状态
- 配置合理的超时时间
- 启用健康检查
