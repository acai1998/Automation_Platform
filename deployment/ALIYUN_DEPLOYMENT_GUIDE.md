# 阿里云镜像部署指南

## 📦 镜像信息

您的镜像已通过 GitHub Actions 成功推送到阿里云容器镜像服务：

- **镜像仓库**: `crpi-dytkl1o45qyeksph.cn-hangzhou.personal.cr.aliyuncs.com`
- **命名空间**: `caijinwei`
- **镜像名称**: `auto_test`
- **可用标签**:
  - `latest` - 最新版本
  - `master` - master 分支版本
  - `d42144a` - 特定提交版本

## 🚀 本地部署

### 1. 准备工作

确保已安装以下软件：
- Docker
- Docker Compose
- curl

### 2. 登录阿里云容器镜像服务

如果您的镜像是私有的，需要先登录：

```bash
docker login crpi-dytkl1o45qyeksph.cn-hangzhou.personal.cr.aliyuncs.com
```

输入您的阿里云容器镜像服务用户名和密码。

### 3. 使用部署脚本（推荐）

```bash
# 进入 scripts 目录
cd scripts

# 赋予执行权限（如果还没有）
chmod +x deploy-aliyun.sh

# 拉取镜像
./deploy-aliyun.sh pull latest

# 部署镜像
./deploy-aliyun.sh deploy latest

# 查看状态
./deploy-aliyun.sh status

# 查看日志
./deploy-aliyun.sh logs

# 停止服务
./deploy-aliyun.sh stop

# 重启服务
./deploy-aliyun.sh restart latest
```

### 4. 手动部署

#### 4.1 拉取镜像

```bash
# 拉取 latest 标签
docker pull crpi-dytkl1o45qyeksph.cn-hangzhou.personal.cr.aliyuncs.com/caijinwei/auto_test:latest

# 拉取其他标签
docker pull crpi-dytkl1o45qyeksph.cn-hangzhou.personal.cr.aliyuncs.com/caijinwei/auto_test:master
docker pull crpi-dytkl1o45qyeksph.cn-hangzhou.personal.cr.aliyuncs.com/caijinwei/auto_test:d42144a
```

#### 4.2 使用 Docker Compose 部署

```bash
# 进入 deployment 目录
cd deployment

# 复制环境变量文件
cp .env.aliyun.example .env

# 编辑 .env 文件，根据需要修改配置
vim .env

# 启动服务
docker-compose -f docker-compose.aliyun.yml up -d

# 查看服务状态
docker-compose -f docker-compose.aliyun.yml ps

# 查看日志
docker-compose -f docker-compose.aliyun.yml logs -f

# 停止服务
docker-compose -f docker-compose.aliyun.yml down
```

#### 4.3 直接使用 Docker 命令

```bash
# 运行容器
docker run -d \
  --name auto-test \
  -p 3000:3000 \
  -e NODE_ENV=production \
  -v /path/to/data:/app/server/db \
  crpi-dytkl1o45qyeksph.cn-hangzhou.personal.cr.aliyuncs.com/caijinwei/auto_test:latest

# 查看日志
docker logs -f auto-test

# 停止容器
docker stop auto-test
docker rm auto-test
```

## 🖥️ 服务器部署

### 1. 在服务器上准备环境

```bash
# 安装 Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# 安装 Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/download/v2.21.0/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# 创建部署目录
sudo mkdir -p /opt/auto-test
sudo chown -R $USER:$USER /opt/auto-test
```

### 2. 上传部署文件

```bash
# 从本地上传文件到服务器
scp deployment/docker-compose.aliyun.yml user@your-server:/opt/auto-test/
scp deployment/.env.aliyun.example user@your-server:/opt/auto-test/.env
scp scripts/deploy-aliyun.sh user@your-server:/opt/auto-test/
```

### 3. 在服务器上部署

```bash
# SSH 登录到服务器
ssh user@your-server

# 进入部署目录
cd /opt/auto-test

# 赋予脚本执行权限
chmod +x deploy-aliyun.sh

# 配置阿里云凭据（可选，如果镜像是私有的）
export ALIYUN_USERNAME=your_username
export ALIYUN_PASSWORD=your_password

# 部署服务
./deploy-aliyun.sh deploy latest
```

## 🤖 Jenkins 部署

### 1. 配置 Jenkins 凭据

在 Jenkins 中添加以下凭据：

| 凭据 ID | 类型 | 描述 |
|---------|------|------|
| `aliyun-docker-username` | Secret Text | 阿里云容器镜像服务用户名 |
| `aliyun-docker-password` | Secret Text | 阿里云容器镜像服务密码 |
| `deploy-ssh-key` | SSH Username with private key | SSH 私钥（用于连接服务器） |

### 2. 创建 Jenkins Pipeline

创建新的 Pipeline Job，使用以下配置：

```groovy
pipeline {
    agent any

    parameters {
        choice(
            name: 'IMAGE_TAG',
            choices: ['latest', 'master', 'd42144a'],
            description: '选择要部署的镜像标签'
        )
        string(
            name: 'DEPLOY_HOST',
            defaultValue: 'your-server-ip',
            description: '目标服务器地址'
        )
        string(
            name: 'DEPLOY_USER',
            defaultValue: 'root',
            description: '目标服务器用户名'
        )
    }

    environment {
        ALIYUN_REGISTRY = 'crpi-dytkl1o45qyeksph.cn-hangzhou.personal.cr.aliyuncs.com'
        NAMESPACE = 'caijinwei'
        IMAGE_NAME = 'auto_test'
        FULL_IMAGE = "${env.ALIYUN_REGISTRY}/${env.NAMESPACE}/${env.IMAGE_NAME}:${params.IMAGE_TAG}"
        DEPLOY_DIR = '/opt/auto-test'
    }

    stages {
        stage('准备') {
            steps {
                script {
                    echo """
                    ========================================
                    部署配置
                    ========================================
                    镜像: ${env.FULL_IMAGE}
                    标签: ${params.IMAGE_TAG}
                    服务器: ${params.DEPLOY_HOST}
                    用户: ${params.DEPLOY_USER}
                    ========================================
                    """
                }
            }
        }

        stage('登录阿里云') {
            steps {
                script {
                    echo '登录阿里云容器镜像服务...'
                    withCredentials([
                        usernamePassword(
                            credentialsId: 'aliyun-docker-credentials',
                            usernameVariable: 'DOCKER_USER',
                            passwordVariable: 'DOCKER_PASS'
                        )
                    ]) {
                        sh """
                            echo "\$DOCKER_PASS" | docker login ${env.ALIYUN_REGISTRY} \
                                --username="\$DOCKER_USER" --password-stdin
                        """
                    }
                    echo '✅ 登录成功'
                }
            }
        }

        stage('拉取镜像') {
            steps {
                script {
                    echo "拉取镜像: ${env.FULL_IMAGE}"
                    sh "docker pull ${env.FULL_IMAGE}"
                    sh "docker images | grep ${env.IMAGE_NAME}"
                    echo '✅ 镜像拉取成功'
                }
            }
        }

        stage('上传部署文件') {
            steps {
                script {
                    echo '上传部署文件到服务器...'
                    sshagent(['deploy-ssh-key']) {
                        sh """
                            # 创建部署目录
                            ssh -o StrictHostKeyChecking=no ${params.DEPLOY_USER}@${params.DEPLOY_HOST} \
                                'mkdir -p ${env.DEPLOY_DIR}'

                            # 上传 docker-compose 文件
                            scp -o StrictHostKeyChecking=no \
                                deployment/docker-compose.aliyun.yml \
                                ${params.DEPLOY_USER}@${params.DEPLOY_HOST}:${env.DEPLOY_DIR}/

                            # 上传部署脚本
                            scp -o StrictHostKeyChecking=no \
                                scripts/deploy-aliyun.sh \
                                ${params.DEPLOY_USER}@${params.DEPLOY_HOST}:${env.DEPLOY_DIR}/
                        """
                    }
                    echo '✅ 文件上传成功'
                }
            }
        }

        stage('部署到服务器') {
            steps {
                script {
                    echo "在服务器上部署..."
                    withCredentials([
                        usernamePassword(
                            credentialsId: 'aliyun-docker-credentials',
                            usernameVariable: 'DOCKER_USER',
                            passwordVariable: 'DOCKER_PASS'
                        )
                    ]) {
                        sshagent(['deploy-ssh-key']) {
                            sh """
                                ssh -o StrictHostKeyChecking=no ${params.DEPLOY_USER}@${params.DEPLOY_HOST} "
                                    cd ${env.DEPLOY_DIR}
                                    chmod +x deploy-aliyun.sh

                                    # 设置阿里云凭据环境变量
                                    export ALIYUN_USERNAME='${DOCKER_USER}'
                                    export ALIYUN_PASSWORD='${DOCKER_PASS}'

                                    # 执行部署
                                    ./deploy-aliyun.sh deploy ${params.IMAGE_TAG}
                                "
                            """
                        }
                    }
                    echo '✅ 部署成功'
                }
            }
        }

        stage('健康检查') {
            steps {
                script {
                    echo '执行健康检查...'
                    sh """
                        # 等待服务启动
                        sleep 30

                        # 检查健康端点
                        curl -f http://${params.DEPLOY_HOST}:3000/api/health || {
                            echo '❌ 健康检查失败'
                            exit 1
                        }
                    """
                    echo '✅ 健康检查通过'
                }
            }
        }
    }

    post {
        success {
            echo """
            ✅ 部署成功完成！

            访问地址: http://${params.DEPLOY_HOST}:3000
            镜像标签: ${params.IMAGE_TAG}
            """
        }
        failure {
            echo """
            ❌ 部署失败！

            请检查日志以获取更多信息。
            """
        }
    }
}
```

### 3. 运行 Jenkins Pipeline

1. 在 Jenkins 中打开该 Pipeline Job
2. 点击 "Build with Parameters"
3. 选择镜像标签（如：latest, master, d42144a）
4. 填写服务器地址和用户名
5. 点击 "Build" 开始部署

## 📊 监控和维护

### 查看服务状态

```bash
# 使用部署脚本
./deploy-aliyun.sh status

# 或使用 docker-compose
docker-compose -f docker-compose.aliyun.yml ps
```

### 查看日志

```bash
# 使用部署脚本
./deploy-aliyun.sh logs

# 或使用 docker-compose
docker-compose -f docker-compose.aliyun.yml logs -f app
```

### 更新到新版本

```bash
# 使用部署脚本
./deploy-aliyun.sh update d42144a

# 或手动操作
docker pull crpi-dytkl1o45qyeksph.cn-hangzhou.personal.cr.aliyuncs.com/caijinwei/auto_test:d42144a
cd /opt/auto-test
docker-compose -f docker-compose.aliyun.yml down
export IMAGE_TAG=d42144a
docker-compose -f docker-compose.aliyun.yml up -d
```

### 回滚操作

```bash
# 回滚到上一个版本
./deploy-aliyun.sh deploy latest

# 或手动回滚
./deploy-aliyun.sh stop
docker pull crpi-dytkl1o45qyeksph.cn-hangzhou.personal.cr.aliyuncs.com/caijinwei/auto_test:master
./deploy-aliyun.sh deploy master
```

## 🔐 安全配置

### 配置环境变量

编辑 `.env` 文件，设置必要的环境变量：

```bash
# 应用配置
NODE_ENV=production
PORT=3000

# 镜像标签
IMAGE_TAG=latest

# 数据库配置（如果需要）
DB_HOST=localhost
DB_PORT=3306
DB_NAME=auto_test
DB_USER=your_db_user
DB_PASSWORD=your_db_password

# Redis 配置
REDIS_HOST=redis
REDIS_PORT=6379

# 安全配置
JWT_SECRET=your_jwt_secret_key_here
SESSION_SECRET=your_session_secret_here
```

### 配置防火墙

```bash
# 开放必要端口
sudo ufw allow 22      # SSH
sudo ufw allow 80      # HTTP
sudo ufw allow 443     # HTTPS
sudo ufw allow 3000    # 应用端口（可选）
sudo ufw enable
```

## 🐛 故障排查

### 问题 1: 镜像拉取失败

```bash
# 检查 Docker 登录状态
docker login crpi-dytkl1o45qyeksph.cn-hangzhou.personal.cr.aliyuncs.com

# 检查网络连接
ping crpi-dytkl1o45qyeksph.cn-hangzhou.personal.cr.aliyuncs.com

# 检查镜像是否存在
docker pull crpi-dytkl1o45qyeksph.cn-hangzhou.personal.cr.aliyuncs.com/caijinwei/auto_test:latest
```

### 问题 2: 容器启动失败

```bash
# 查看容器日志
docker logs auto-test-app

# 检查容器状态
docker ps -a

# 检查端口占用
netstat -tlnp | grep 3000
```

### 问题 3: 健康检查失败

```bash
# 手动测试健康端点
curl http://localhost:3000/api/health

# 检查容器日志
docker logs auto-test-app

# 重启服务
./deploy-aliyun.sh restart latest
```

## 📚 参考文档

- [阿里云容器镜像服务文档](https://help.aliyun.com/product/60716.html)
- [Docker 官方文档](https://docs.docker.com/)
- [Docker Compose 文档](https://docs.docker.com/compose/)
- [Jenkins Pipeline 文档](https://www.jenkins.io/doc/book/pipeline/)

## 💡 常用命令速查

```bash
# 拉取镜像
docker pull crpi-dytkl1o45qyeksph.cn-hangzhou.personal.cr.aliyuncs.com/caijinwei/auto_test:latest

# 运行容器
docker run -d -p 3000:3000 --name auto-test \
  crpi-dytkl1o45qyeksph.cn-hangzhou.personal.cr.aliyuncs.com/caijinwei/auto_test:latest

# 查看日志
docker logs -f auto-test

# 停止容器
docker stop auto-test

# 删除容器
docker rm auto-test

# 删除镜像
docker rmi crpi-dytkl1o45qyeksph.cn-hangzhou.personal.cr.aliyuncs.com/caijinwei/auto_test:latest

# 查看 Docker Compose 状态
docker-compose -f docker-compose.aliyun.yml ps

# 启动服务
docker-compose -f docker-compose.aliyun.yml up -d

# 停止服务
docker-compose -f docker-compose.aliyun.yml down

# 查看服务日志
docker-compose -f docker-compose.aliyun.yml logs -f
```
