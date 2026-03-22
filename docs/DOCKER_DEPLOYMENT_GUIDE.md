# Docker + CNB + Nginx 部署完整指南

## 📋 部署架构概述

```
开发者推送到 CNB → CNB 构建 Docker 镜像 → 推送到 CNB 制品库 
→ Jenkins 从 CNB 拉取镜像 → Docker Compose 启动容器 → Nginx 反向代理 → 域名访问
```

## 🔧 前置要求

- ✅ 服务器已安装 Docker
- ✅ 服务器已安装 Jenkins
- ✅ 拥有一个域名（已完成 DNS 解析到服务器 IP）
- ✅ CNB 仓库配置完成
- ✅ 拥有服务器 sudo 权限

## 📝 第一步：服务器环境准备

### 1.1 安装 Docker Compose

```bash
# 检查 Docker 版本
docker --version

# 安装 Docker Compose（如果未安装）
sudo curl -L "https://github.com/docker/compose/releases/download/v2.24.0/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose
docker-compose --version
```

### 1.2 安装 Nginx

```bash
# 安装 Nginx
sudo apt update
sudo apt install nginx -y

# 启动 Nginx
sudo systemctl start nginx
sudo systemctl enable nginx

# 验证安装
nginx -v
```

### 1.3 配置防火墙

```bash
# 开放必要端口
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 3000/tcp  # 应用端口（可选，Nginx 代理后可以不开放）
sudo ufw allow 8080/tcp  # Jenkins 端口
sudo ufw reload
```

### 1.4 创建项目目录

```bash
# 创建项目目录
sudo mkdir -p /opt/automation-platform
cd /opt/automation-platform

# 创建子目录
sudo mkdir -p {logs,nginx/conf.d,data}

# 设置权限
sudo chown -R $USER:$USER /opt/automation-platform
```

## 🔐 第二步：配置 CNB Docker 登录

### 2.1 获取 CNB Token

1. 访问 CNB 控制台：https://cnb.cool
2. 进入你的项目：ImAcaiy/Automation_Platform
3. 点击"设置" → "访问令牌"
4. 创建新的访问令牌（选择"读取仓库"权限）
5. 复制生成的 Token

### 2.2 登录 CNB Docker 制品库

```bash
# 登录 CNB Docker 制品库
docker login cr.cnb.cool -u cnb -p YOUR_TOKEN_HERE

# 验证登录
docker info | grep cr.cnb.cool
```

### 2.3 测试拉取镜像

```bash
# 拉取最新镜像
docker pull cr.cnb.cool/imacaiy/automation-platform:latest

# 查看镜像列表
docker images | grep automation-platform
```

## 🐳 第三步：创建 Docker Compose 配置

### 3.1 创建 docker-compose.yml

在 `/opt/automation-platform/docker-compose.yml` 创建文件：

```yaml
version: '3.8'

services:
  # 自动化测试平台
  automation-platform:
    image: cr.cnb.cool/imacaiy/automation-platform:latest
    container_name: automation-platform
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      # 数据库配置（根据实际情况修改）
      - DB_HOST=host.docker.internal
      - DB_PORT=3306
      - DB_USER=your_db_user
      - DB_PASSWORD=your_db_password
      - DB_NAME=automation_platform
      # Jenkins 配置
      - JENKINS_URL=https://your-jenkins-domain.com
      - JENKINS_USER=your_jenkins_user
      - JENKINS_TOKEN=your_jenkins_token
    volumes:
      # 日志挂载
      - ./logs:/app/logs
      # 数据持久化（如果有需要）
      - ./data:/app/data
    networks:
      - app-network
    healthcheck:
      test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://localhost:3000/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s

networks:
  app-network:
    driver: bridge
```

### 3.2 创建环境变量文件

创建 `.env` 文件（注意：不要提交到版本控制）：

```bash
# 数据库配置
DB_HOST=host.docker.internal
DB_PORT=3306
DB_USER=your_db_user
DB_PASSWORD=your_db_password
DB_NAME=automation_platform

# Jenkins 配置
JENKINS_URL=https://your-jenkins-domain.com
JENKINS_USER=your_jenkins_user
JENKINS_TOKEN=your_jenkins_token
JENKINS_JOB_API=SeleniumBaseCi-AutoTest

# 应用配置
NODE_ENV=production
PORT=3000

# CNB 配置
CNB_DOCKER_REGISTRY=cr.cnb.cool
CNB_REPO_SLUG_LOWERCASE=imacaiy/automation-platform
```

### 3.3 启动容器

```bash
# 拉取并启动容器
cd /opt/automation-platform
docker-compose pull
docker-compose up -d

# 查看容器状态
docker-compose ps
docker-compose logs -f automation-platform
```

## 🌐 第四步：配置 Nginx 反向代理

### 4.1 创建 Nginx 配置文件

在 `/opt/automation-platform/nginx/conf.d/automation-platform.conf` 创建：

```nginx
# HTTP 重定向到 HTTPS
server {
    listen 80;
    listen [::]:80;
    server_name your-domain.com www.your-domain.com;

    # Let's Encrypt 验证路径
    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }

    # 其他请求重定向到 HTTPS
    location / {
        return 301 https://$server_name$request_uri;
    }
}

# HTTPS 配置
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name your-domain.com www.your-domain.com;

    # SSL 证书配置
    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;

    # 日志配置
    access_log /opt/automation-platform/logs/nginx-access.log;
    error_log /opt/automation-platform/logs/nginx-error.log;

    # Gzip 压缩
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css text/xml text/javascript 
               application/x-javascript application/xml+rss 
               application/javascript application/json;

    # 客户端上传大小限制
    client_max_body_size 50M;

    # 反向代理到应用容器
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # 超时配置
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # 静态资源缓存
    location ~* \.(jpg|jpeg|png|gif|ico|css|js|svg|woff|woff2|ttf|eot)$ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }

    # 健康检查端点（可选）
    location /health {
        proxy_pass http://127.0.0.1:3000/api/health;
        access_log off;
    }
}
```

### 4.2 软链接配置文件到 Nginx

```bash
# 创建软链接
sudo ln -sf /opt/automation-platform/nginx/conf.d/automation-platform.conf /etc/nginx/sites-available/automation-platform.conf
sudo ln -sf /etc/nginx/sites-available/automation-platform.conf /etc/nginx/sites-enabled/

# 删除默认配置（可选）
sudo rm -f /etc/nginx/sites-enabled/default

# 测试 Nginx 配置
sudo nginx -t
```

### 4.3 安装 SSL 证书（Let's Encrypt）

```bash
# 安装 Certbot
sudo apt install certbot python3-certbot-nginx -y

# 获取 SSL 证书
sudo certbot --nginx -d your-domain.com -d www.your-domain.com

# 配置自动续期
sudo certbot renew --dry-run
sudo systemctl enable certbot.timer
```

### 4.4 重启 Nginx

```bash
# 重新加载 Nginx 配置
sudo systemctl reload nginx

# 验证 Nginx 状态
sudo systemctl status nginx
```

## 🔧 第五步：配置 Jenkins Pipeline

### 5.1 安装 Jenkins 插件

在 Jenkins 中安装以下插件：
- Docker Pipeline
- Docker
- Git

### 5.2 创建 Jenkins 凭据

1. 进入 Jenkins → Manage Jenkins → Credentials
2. 添加以下凭据：
   - `CNB_DOCKER_TOKEN`: CNB Docker 登录 Token
   - `CNB_TOKEN`: CNB API Token（用于触发构建）
   - `SSH_SERVER_KEY`: 服务器 SSH 密钥（可选）

### 5.3 创建部署 Pipeline

创建新的 Pipeline Job，配置如下：

**Jenkinsfile 示例**：

```groovy
pipeline {
    agent any
    
    environment {
        IMAGE_NAME = "cr.cnb.cool/imacaiy/automation-platform"
        CNB_TOKEN = credentials('CNB_TOKEN')
        CNB_DOCKER_TOKEN = credentials('CNB_DOCKER_TOKEN')
    }
    
    parameters {
        choice(
            name: 'DEPLOY_ENV',
            choices: ['production', 'staging'],
            description: '部署环境'
        )
        string(
            name: 'IMAGE_TAG',
            defaultValue: 'latest',
            description: '镜像标签'
        )
        booleanParam(
            name: 'FORCE_PULL',
            defaultValue: true,
            description: '强制拉取最新镜像'
        )
    }
    
    stages {
        stage('准备') {
            steps {
                echo "部署环境: ${params.DEPLOY_ENV}"
                echo "镜像标签: ${params.IMAGE_TAG}"
                echo "强制拉取: ${params.FORCE_PULL}"
            }
        }
        
        stage('登录 CNB 制品库') {
            steps {
                script {
                    sh """
                        echo ${CNB_DOCKER_TOKEN} | docker login cr.cnb.cool -u cnb --password-stdin
                    """
                }
            }
        }
        
        stage('拉取镜像') {
            steps {
                script {
                    def pullCommand = params.FORCE_PULL ? 'docker pull ${IMAGE_NAME}:${params.IMAGE_TAG}' : 'docker pull ${IMAGE_NAME}:${params.IMAGE_TAG} || true'
                    sh """
                        ${pullCommand}
                    """
                }
            }
        }
        
        stage('停止旧容器') {
            steps {
                sh """
                    cd /opt/automation-platform
                    docker-compose down
                """
            }
        }
        
        stage('启动新容器') {
            steps {
                sh """
                    cd /opt/automation-platform
                    
                    # 更新镜像标签
                    if [ "${params.IMAGE_TAG}" != "latest" ]; then
                        sed -i "s|cr.cnb.cool/imacaiy/automation-platform:latest|cr.cnb.cool/imacaiy/automation-platform:${params.IMAGE_TAG}|g" docker-compose.yml
                    fi
                    
                    # 启动容器
                    docker-compose up -d
                    
                    # 等待服务启动
                    sleep 10
                """
            }
        }
        
        stage('健康检查') {
            steps {
                retry(5) {
                    sh """
                        curl -f http://localhost:3000/api/health || exit 1
                    """
                }
            }
        }
        
        stage('清理') {
            steps {
                sh """
                    # 清理未使用的镜像
                    docker image prune -f
                """
            }
        }
    }
    
    post {
        success {
            echo "✅ 部署成功！"
            echo "访问地址: https://your-domain.com"
        }
        
        failure {
            echo "❌ 部署失败，请检查日志"
            sh """
                cd /opt/automation-platform
                docker-compose logs --tail=100 automation-platform
            """
        }
    }
}
```

## 🔄 第六步：自动化部署流程

### 6.1 CNB 自动触发 Jenkins（可选）

如果需要在 CNB 构建完成后自动触发 Jenkins 部署，可以在 `.cnb.yml` 中添加 webhook：

```yaml
master:
  push:
    - name: "构建 Docker 镜像 & 推送到 CNB 制品库"
      services:
        - docker
      stages:
        - name: "构建镜像"
          script: |
            docker build \
              -t ${CNB_DOCKER_REGISTRY}/${CNB_REPO_SLUG_LOWERCASE}:${CNB_COMMIT_SHORT} \
              -t ${CNB_DOCKER_REGISTRY}/${CNB_REPO_SLUG_LOWERCASE}:latest \
              .

        - name: "推送镜像到 CNB 制品库"
          script: |
            docker push ${CNB_DOCKER_REGISTRY}/${CNB_REPO_SLUG_LOWERCASE}:${CNB_COMMIT_SHORT}
            docker push ${CNB_DOCKER_REGISTRY}/${CNB_REPO_SLUG_LOWERCASE}:latest

        - name: "触发 Jenkins 部署"
          script: |
            curl -X POST "https://your-jenkins-domain.com/job/deploy-automation-platform/buildWithParameters" \
              --user "JENKINS_USER:JENKINS_TOKEN" \
              --data-urlencode "IMAGE_TAG=${CNB_COMMIT_SHORT}" \
              --data-urlencode "DEPLOY_ENV=production" \
              --data-urlencode "FORCE_PULL=true"
```

### 6.2 手动部署

**方式一：通过 Jenkins UI**
1. 访问 Jenkins: https://your-jenkins-domain.com
2. 进入部署 Job
3. 点击"Build with Parameters"
4. 选择镜像标签和环境
5. 点击"Build"

**方式二：通过 Jenkins API**
```bash
curl -X POST "https://your-jenkins-domain.com/job/deploy-automation-platform/buildWithParameters" \
  --user "username:api_token" \
  --data-urlencode "IMAGE_TAG=latest" \
  --data-urlencode "DEPLOY_ENV=production"
```

**方式三：直接在服务器执行**
```bash
cd /opt/automation-platform

# 拉取最新镜像
docker pull cr.cnb.cool/imacaiy/automation-platform:latest

# 重启容器
docker-compose down
docker-compose up -d

# 查看日志
docker-compose logs -f
```

## 📊 第七步：监控和维护

### 7.1 查看应用日志

```bash
# Docker 容器日志
docker logs -f automation-platform

# 通过 docker-compose
cd /opt/automation-platform
docker-compose logs -f automation-platform

# Nginx 日志
sudo tail -f /opt/automation-platform/logs/nginx-access.log
sudo tail -f /opt/automation-platform/logs/nginx-error.log
```

### 7.2 监控容器状态

```bash
# 查看容器状态
docker ps -a

# 查看容器资源使用
docker stats

# 查看容器详细信息
docker inspect automation-platform
```

### 7.3 数据备份

```bash
# 备份应用数据
tar -czf automation-platform-backup-$(date +%Y%m%d).tar.gz \
  /opt/automation-platform/data \
  /opt/automation-platform/logs

# 备份数据库（根据实际数据库配置）
mysqldump -u username -p automation_platform > backup-$(date +%Y%m%d).sql
```

### 7.4 更新部署

```bash
cd /opt/automation-platform

# 1. 拉取新镜像
docker pull cr.cnb.cool/imacaiy/automation-platform:latest

# 2. 备份当前版本（可选）
docker tag cr.cnb.cool/imacaiy/automation-platform:latest \
  cr.cnb.cool/imacaiy/automation-platform:backup-$(date +%Y%m%d)

# 3. 重启容器
docker-compose down
docker-compose up -d

# 4. 健康检查
curl http://localhost:3000/api/health
```

## 🛠️ 第八步：故障排查

### 8.1 容器无法启动

```bash
# 查看容器日志
docker logs automation-platform

# 检查容器配置
docker-compose config

# 手动启动测试
docker run --rm -p 3000:3000 cr.cnb.cool/imacaiy/automation-platform:latest
```

### 8.2 Nginx 502 错误

```bash
# 检查应用容器是否运行
docker ps | grep automation-platform

# 检查端口是否正常监听
docker exec automation-platform netstat -tlnp

# 检查 Nginx 配置
sudo nginx -t

# 查看 Nginx 错误日志
sudo tail -f /opt/automation-platform/logs/nginx-error.log
```

### 8.3 域名无法访问

```bash
# 检查 DNS 解析
nslookup your-domain.com

# 检查防火墙
sudo ufw status

# 检查 Nginx 是否运行
sudo systemctl status nginx

# 检查 SSL 证书
sudo certbot certificates
```

### 8.4 镜像拉取失败

```bash
# 重新登录 CNB 制品库
docker logout cr.cnb.cool
docker login cr.cnb.cool -u cnb -p YOUR_TOKEN

# 检查网络连接
ping cr.cnb.cool

# 清理 Docker 缓存
docker system prune -a
```

## 📚 附录

### A. 完整的项目目录结构

```
/opt/automation-platform/
├── docker-compose.yml
├── .env
├── logs/
│   ├── nginx-access.log
│   ├── nginx-error.log
│   └── app.log
├── nginx/
│   └── conf.d/
│       └── automation-platform.conf
└── data/
    └── (应用数据)
```

### B. 常用命令速查

```bash
# 容器管理
docker-compose up -d          # 启动容器
docker-compose down          # 停止容器
docker-compose restart       # 重启容器
docker-compose logs -f       # 查看日志
docker-compose ps            # 查看状态

# 镜像管理
docker pull IMAGE:TAG        # 拉取镜像
docker images                # 查看镜像
docker rmi IMAGE:TAG         # 删除镜像

# Nginx 管理
sudo nginx -t                # 测试配置
sudo systemctl reload nginx  # 重新加载配置
sudo systemctl restart nginx # 重启 Nginx

# 日志查看
docker logs -f CONTAINER     # 容器日志
sudo tail -f LOG_FILE        # 文件日志
```

### C. 环境变量说明

| 变量名 | 说明 | 示例 |
|--------|------|------|
| `NODE_ENV` | 运行环境 | `production` |
| `DB_HOST` | 数据库主机 | `localhost` |
| `DB_PORT` | 数据库端口 | `3306` |
| `DB_USER` | 数据库用户名 | `root` |
| `DB_PASSWORD` | 数据库密码 | `password` |
| `DB_NAME` | 数据库名称 | `automation_platform` |
| `JENKINS_URL` | Jenkins 地址 | `https://jenkins.example.com` |
| `JENKINS_USER` | Jenkins 用户名 | `admin` |
| `JENKINS_TOKEN` | Jenkins Token | `xxx` |

## ✅ 部署检查清单

完成部署后，请检查以下项目：

- [ ] Docker 容器正常运行
- [ ] 应用可以通过 http://localhost:3000 访问
- [ ] Nginx 配置已生效
- [ ] SSL 证书已安装且有效
- [ ] 域名可以正常访问（HTTPS）
- [ ] Jenkins 可以触发部署
- [ ] 日志正常记录
- [ ] 数据库连接正常
- [ ] 健康检查端点正常
- [ ] 备份策略已配置

## 🆘 获取帮助

如遇到问题，请：
1. 查看相关日志文件
2. 检查 Docker 容器状态
3. 验证 Nginx 配置
4. 测试网络连接
5. 参考 CNB 文档：https://cnb.cool/docs
