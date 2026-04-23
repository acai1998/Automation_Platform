# Docker + CNB + Nginx 部署完整指南

## 📋 部署架构概述

```
开发者推送代码到 CNB
        ↓
.cnb.yml 触发：构建 Docker 镜像 → 推送到 CNB 制品库（docker.cnb.cool）
        ↓
Jenkins 检测到触发 → 运行 Jenkinsfile.deploy
        ↓
从服务器 /opt/automation-platform/.env 读取 CNB_DOCKER_TOKEN
        ↓
docker login docker.cnb.cool → 拉取新镜像
        ↓
docker-compose down → docker-compose up -d（使用新镜像）
        ↓
健康检查通过 → 部署完成 ✅
```

## 🔧 前置要求

- ✅ 服务器已安装 Docker
- ✅ 服务器已安装 Docker Compose
- ✅ 服务器已安装 Nginx
- ✅ 域名 DNS 已解析到服务器 IP
- ✅ CNB 仓库已配置（ImAcaiy/Automation_Platform）
- ✅ 拥有服务器 root/sudo 权限

---

## 📝 第一步：一次性初始化（首次部署）

### 1.1 运行自动化安装脚本

```bash
# 上传 deploy-setup.sh 到服务器后执行
sudo bash deploy-setup.sh
```

脚本会自动完成：
- 安装系统依赖（Docker、Docker Compose、Nginx、Certbot、Firewalld）
- 创建项目目录 `/opt/automation-platform/`
- 提示输入配置信息并生成 `.env` 文件
- 生成 `docker-compose.yml`
- 登录 CNB 制品库并启动容器

### 1.2 脚本交互输入说明

| 提示项 | 说明 | 示例 |
|--------|------|------|
| 域名 | 你的访问域名 | `autotest.wiac.xyz` |
| CNB Docker Token | 从 https://cnb.cool → 个人设置 → Access Tokens 获取 | `28h3170c4d...` |
| 数据库主机 | 外部数据库 IP | `1*7.*2.1*2.23` |
| 数据库密码 | MySQL 密码 | - |
| 数据库名称 | 默认 `automation_platform` | `autotest` |
| Jenkins URL | Jenkins 访问地址 | `http://jenkins.***.***:8080` |
| Jenkins 用户名 | Jenkins 登录用户 | `root` |
| Jenkins API Token | Jenkins → 用户 → 配置 → API Token | - |

### 1.3 手动配置 Nginx 反代

脚本启动完成后，手动创建 Nginx 反代配置：

```bash
cat > /etc/nginx/conf.d/autotest.conf << 'EOF'
server {
    listen 80;
    server_name autotest.wiac.xyz;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        client_max_body_size 50M;
    }
}
EOF

nginx -t && systemctl reload nginx
```

---

## 🐳 第二步：手动部署（跳过脚本）

如果不使用脚本，手动执行以下步骤：

### 2.1 创建目录和配置文件

```bash
mkdir -p /opt/automation-platform/{logs,data}
cd /opt/automation-platform
```

### 2.2 创建 .env 文件

```bash
cat > /opt/automation-platform/.env << 'EOF'
# 数据库配置
DB_HOST=117.72.182.23
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=autotest

# Jenkins 配置
JENKINS_URL=http://jenkins.****.***:8080
JENKINS_USER=root
JENKINS_TOKEN=your_jenkins_token
JENKINS_JOB_NAME=AutoTest
JENKINS_JOB_API=SeleniumBaseCi-AutoTest

# 应用配置
NODE_ENV=production
PORT=3000

# CNB 配置
CNB_DOCKER_TOKEN=your_cnb_token
DOMAIN=autotest.wiac.xyz
EOF
```

### 2.3 创建 docker-compose.yml

```yaml
services:
  automation-platform:
    image: docker.cnb.cool/imacaiy/automation_platform:latest
    container_name: automation-platform
    restart: unless-stopped
    ports:
      - "3000:3000"
    env_file:
      - .env
    volumes:
      - ./logs:/app/logs
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

### 2.4 登录 CNB 并启动容器

```bash
# 登录 CNB 制品库
source /opt/automation-platform/.env
echo "$CNB_DOCKER_TOKEN" | docker login docker.cnb.cool -u cnb --password-stdin

# 拉取镜像并启动
cd /opt/automation-platform
docker-compose pull
docker-compose up -d

# 验证状态
docker-compose ps
curl http://localhost:3000/api/health
```

---

## 🔄 第三步：配置 Jenkins 自动部署

### 3.1 在 Jenkins 中创建 Pipeline Job

1. 进入 Jenkins → 新建任务 → Pipeline
2. 任务名称：`automation-platform-deploy`
3. Pipeline → Definition 选择 **Pipeline script from SCM**
4. SCM 选择 Git，填入仓库地址
5. Script Path 填写：`Jenkinsfile.deploy`

### 3.2 Jenkinsfile.deploy 说明

项目根目录已有 `Jenkinsfile.deploy`，核心逻辑：

- **登录 CNB**：从服务器 `/opt/automation-platform/.env` 读取 `CNB_DOCKER_TOKEN`，无需在 Jenkins 中配置凭据
- **拉取镜像**：`docker pull docker.cnb.cool/imacaiy/automation_platform:latest`
- **滚动更新**：停止旧容器 → 启动新容器 → 健康检查
- **自动回滚**：部署失败时恢复 `docker-compose.yml.backup` 并重启

### 3.3 CNB 推送后自动触发 Jenkins（可选）

在 `.cnb.yml` 中追加触发步骤：

```yaml
- name: "触发 Jenkins 部署"
  script: |
    curl -X POST "http://jenkins.wiac.xyzjob/automation-platform-deploy/build" \
      --user "root:your_jenkins_token"
```

---

## 🌐 第四步：SSL 证书（可选）

服务已通过 HTTP 正常运行后，可按需配置 HTTPS：

```bash
# 申请证书（需确保域名已解析且 80 端口可访问）
certbot --nginx -d autotest.wiac.xyz

# 配置自动续期
systemctl enable certbot.timer
```

certbot 会自动修改 nginx 配置并添加 HTTPS。

---

## 📊 日常运维

### 查看状态

```bash
cd /opt/automation-platform

# 容器状态
docker-compose ps

# 实时日志
docker-compose logs -f

# 健康检查
curl http://localhost:3000/api/health
```

### 手动更新镜像

```bash
cd /opt/automation-platform

source .env
echo "$CNB_DOCKER_TOKEN" | docker login docker.cnb.cool -u cnb --password-stdin

docker-compose pull
docker-compose up -d

docker-compose ps
```

### 回滚到上一版本

```bash
cd /opt/automation-platform

# 查看备份镜像
docker images docker.cnb.cool/imacaiy/automation_platform

# 修改 docker-compose.yml 中的镜像 tag 为备份版本，然后重启
docker-compose up -d
```

---

## 🛠️ 故障排查

| 症状 | 排查命令 | 常见原因 |
|------|---------|---------|
| 容器无法启动 | `docker-compose logs` | .env 配置错误、数据库无法连接 |
| 镜像拉取失败 `invalid character '<'` | `echo "$CNB_DOCKER_TOKEN" \| docker login docker.cnb.cool -u cnb --password-stdin` | CNB Token 失效或未登录 |
| Nginx 502 | `docker-compose ps` | 容器未运行或 3000 端口未监听 |
| 域名无法访问 | `nginx -t && systemctl status nginx` | Nginx 配置错误或未 reload |
| 健康检查失败 | `curl http://localhost:3000/api/health` | 应用启动中或数据库连接失败 |

---

## 📁 服务器目录结构

```
/opt/automation-platform/
├── docker-compose.yml        # 容器编排配置
├── .env                      # 环境变量（含 CNB Token、数据库、Jenkins 配置）
├── logs/                     # 应用日志（容器挂载）
└── data/                     # 应用数据（容器挂载）

/etc/nginx/conf.d/
└── autotest.conf             # Nginx 反代配置（手动创建）
```

---

## ⚙️ 环境变量说明

| 变量名 | 说明 | 示例 |
|--------|------|------|
| `DB_HOST` | 数据库主机 IP | `***.72.***.23` |
| `DB_PORT` | 数据库端口 | `3306` |
| `DB_USER` | 数据库用户名 | `root` |
| `DB_PASSWORD` | 数据库密码 | - |
| `DB_NAME` | 数据库名称 | `***` |
| `JENKINS_URL` | Jenkins 访问地址 | `http://jenkins.wiac.xyz:8080` |
| `JENKINS_USER` | Jenkins 用户名 | `root` |
| `JENKINS_TOKEN` | Jenkins API Token | - |
| `JENKINS_JOB_API` | 自动化测试 Job 名 | `SeleniumBaseCi-AutoTest` |
| `CNB_DOCKER_TOKEN` | CNB Docker 登录 Token | - |
| `DOMAIN` | 服务域名 | `autotest.wiac.xyz` |
| `NODE_ENV` | 运行环境 | `production` |
| `PORT` | 应用监听端口 | `3000` |
