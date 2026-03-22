#!/bin/bash

# Docker + CNB 自动化部署快速安装脚本
# 使用方法: sudo bash deploy-setup.sh

set -e

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 打印带颜色的消息
print_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 检查是否以 root 权限运行
check_root() {
    if [ "$EUID" -ne 0 ]; then
        print_error "请使用 sudo 运行此脚本"
        exit 1
    fi
}

# 安装依赖
install_dependencies() {
    print_info "安装系统依赖..."

    # 检测包管理器
    if command -v apt &> /dev/null; then
        # Debian/Ubuntu
        apt update
        apt install -y curl wget git nginx certbot python3-certbot-nginx ufw
    elif command -v yum &> /dev/null; then
        # CentOS/RHEL 7/8/9（yum 在 RHEL 8+ 是 dnf 的别名）
        yum install -y curl wget git certbot python3-certbot-nginx firewalld || true
        # nginx 单独处理，避免因已安装或源过滤导致脚本中止
        if ! command -v nginx &> /dev/null; then
            cat > /etc/yum.repos.d/nginx.repo << 'NGINXREPO'
[nginx-stable]
name=nginx stable repo
baseurl=http://nginx.org/packages/centos/$releasever/$basearch/
gpgcheck=1
enabled=1
gpgkey=https://nginx.org/keys/nginx_signing.key
module_hotfixes=true
NGINXREPO
            yum install -y nginx
        else
            print_info "nginx 已安装: $(nginx -v 2>&1)"
        fi
    elif command -v dnf &> /dev/null; then
        # CentOS/RHEL 8+
        # 添加 nginx 官方仓库（解决 RHEL 9 默认源中 nginx 被过滤的问题）
        if ! rpm -q nginx &> /dev/null; then
            cat > /etc/yum.repos.d/nginx.repo << 'NGINXREPO'
[nginx-stable]
name=nginx stable repo
baseurl=http://nginx.org/packages/centos/$releasever/$basearch/
gpgcheck=1
enabled=1
gpgkey=https://nginx.org/keys/nginx_signing.key
module_hotfixes=true
NGINXREPO
        fi
        dnf install -y curl wget git nginx certbot python3-certbot-nginx firewalld
    else
        print_error "无法识别包管理器，请手动安装依赖: curl, wget, git, nginx, certbot"
        exit 1
    fi

    print_info "系统依赖安装完成"
}

# 安装 Docker
install_docker() {
    print_info "检查 Docker 安装状态..."
    
    if command -v docker &> /dev/null; then
        print_info "Docker 已安装: $(docker --version)"
    else
        print_info "安装 Docker..."
        
        # 安装 Docker
        curl -fsSL https://get.docker.com -o get-docker.sh
        sh get-docker.sh
        
        # 启动 Docker
        systemctl start docker
        systemctl enable docker
        
        # 添加当前用户到 docker 组
        usermod -aG docker $SUDO_USER
        
        print_info "Docker 安装完成"
    fi
}

# 安装 Docker Compose
install_docker_compose() {
    print_info "检查 Docker Compose 安装状态..."
    
    if command -v docker-compose &> /dev/null; then
        print_info "Docker Compose 已安装: $(docker-compose --version)"
    else
        print_info "安装 Docker Compose..."
        
        # 下载 Docker Compose
        curl -L "https://github.com/docker/compose/releases/download/v2.24.0/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
        chmod +x /usr/local/bin/docker-compose
        
        print_info "Docker Compose 安装完成"
    fi
}

# 创建项目目录
create_project_structure() {
    print_info "创建项目目录结构..."
    
    PROJECT_DIR="/opt/automation-platform"
    
    # 创建主目录
    mkdir -p $PROJECT_DIR
    
    # 创建子目录
    mkdir -p $PROJECT_DIR/{logs,nginx/conf.d,data}
    
    # 设置权限
    chown -R $SUDO_USER:$SUDO_USER $PROJECT_DIR
    
    print_info "项目目录创建完成: $PROJECT_DIR"
}

# 配置防火墙
configure_firewall() {
    print_info "配置防火墙..."

    if command -v ufw &> /dev/null; then
        # 使用 ufw (Debian/Ubuntu)
        ufw allow 80/tcp
        ufw allow 443/tcp
        ufw allow 3000/tcp
        ufw allow 8080/tcp

        if ! ufw status | grep -q "Status: active"; then
            print_warn "请手动运行: sudo ufw enable"
        fi
    elif command -v firewall-cmd &> /dev/null; then
        # 使用 firewalld (CentOS/RHEL)
        firewall-cmd --permanent --add-port=80/tcp
        firewall-cmd --permanent --add-port=443/tcp
        firewall-cmd --permanent --add-port=3000/tcp
        firewall-cmd --permanent --add-port=8080/tcp
        firewall-cmd --reload

        print_info "Firewalld 配置完成"
    else
        print_warn "未找到防火墙配置工具，请手动开放端口: 80, 443, 3000, 8080"
    fi

    print_info "防火墙配置完成"
}

# 配置 Nginx（HTTP only，不含 SSL）
configure_nginx() {
    print_info "配置 Nginx（HTTP 模式）..."

    # 启动 Nginx
    systemctl start nginx
    systemctl enable nginx

    # 写入 HTTP-only 反代配置（不含 SSL，部署后可正常访问 http://域名）
    mkdir -p /opt/automation-platform/nginx/conf.d
    cat > /opt/automation-platform/nginx/conf.d/automation-platform-http.conf << 'NGINXHTTP'
server {
    listen 80;
    listen [::]:80;
    server_name _;

    # Let's Encrypt ACME 验证（后续申请 SSL 用）
    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }

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
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
}
NGINXHTTP

    mkdir -p /var/www/html

    # 部署 HTTP 配置
    if [ -d /etc/nginx/conf.d ]; then
        ln -sf /opt/automation-platform/nginx/conf.d/automation-platform-http.conf /etc/nginx/conf.d/automation-platform.conf
        rm -f /etc/nginx/conf.d/default.conf
    elif [ -d /etc/nginx/sites-available ]; then
        ln -sf /opt/automation-platform/nginx/conf.d/automation-platform-http.conf /etc/nginx/sites-available/automation-platform.conf
        ln -sf /etc/nginx/sites-available/automation-platform.conf /etc/nginx/sites-enabled/
        rm -f /etc/nginx/sites-enabled/default
    fi

    nginx -t && systemctl reload nginx
    print_info "Nginx HTTP 配置完成"
}

# 提示用户输入信息
prompt_user_info() {
    echo ""
    print_info "请输入以下信息进行配置:"
    echo ""
    
    # 域名
    read -p "域名 (例如: example.com): " DOMAIN
    echo "DOMAIN=$DOMAIN" >> /opt/automation-platform/.env
    
    # CNB Token
    read -sp "CNB Docker Token (从 https://cnb.cool 获取): " CNB_TOKEN
    echo ""
    echo "CNB_DOCKER_TOKEN=$CNB_TOKEN" >> /opt/automation-platform/.env
    
    # 数据库配置
    read -p "数据库主机 (默认: localhost): " DB_HOST
    DB_HOST=${DB_HOST:-localhost}
    echo "DB_HOST=$DB_HOST" >> /opt/automation-platform/.env
    
    read -sp "数据库密码: " DB_PASSWORD
    echo ""
    echo "DB_PASSWORD=$DB_PASSWORD" >> /opt/automation-platform/.env
    
    read -p "数据库名称 (默认: automation_platform): " DB_NAME
    DB_NAME=${DB_NAME:-automation_platform}
    echo "DB_NAME=$DB_NAME" >> /opt/automation-platform/.env
    
    # Jenkins 配置
    read -p "Jenkins URL (例如: https://jenkins.example.com): " JENKINS_URL
    echo "JENKINS_URL=$JENKINS_URL" >> /opt/automation-platform/.env
    
    read -p "Jenkins 用户名: " JENKINS_USER
    echo "JENKINS_USER=$JENKINS_USER" >> /opt/automation-platform/.env
    
    read -sp "Jenkins API Token: " JENKINS_TOKEN
    echo ""
    echo "JENKINS_TOKEN=$JENKINS_TOKEN" >> /opt/automation-platform/.env
    
    print_info "配置信息已保存到 /opt/automation-platform/.env"
}

# 创建 docker-compose.yml
create_docker_compose() {
    print_info "创建 docker-compose.yml..."
    
    cat > /opt/automation-platform/docker-compose.yml << 'EOF'
services:
  automation-platform:
    image: cr.cnb.cool/imacaiy/automation-platform:latest
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
EOF
    
    print_info "docker-compose.yml 创建完成"
}

# 登录 CNB Docker 制品库
login_cnb_registry() {
    print_info "登录 CNB Docker 制品库..."
    
    source /opt/automation-platform/.env
    
    echo "$CNB_DOCKER_TOKEN" | docker login cr.cnb.cool -u cnb --password-stdin
    
    print_info "CNB Docker 制品库登录成功"
}

# 创建 Nginx 配置模板
create_nginx_config() {
    print_info "创建 Nginx 配置模板..."
    
    cat > /opt/automation-platform/nginx/conf.d/automation-platform.conf << 'EOF'
# HTTP 重定向到 HTTPS
server {
    listen 80;
    listen [::]:80;
    server_name DOMAIN_PLACEHOLDER www.DOMAIN_PLACEHOLDER;

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
    server_name DOMAIN_PLACEHOLDER www.DOMAIN_PLACEHOLDER;

    # SSL 证书配置
    ssl_certificate /etc/letsencrypt/live/DOMAIN_PLACEHOLDER/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/DOMAIN_PLACEHOLDER/privkey.pem;
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

    # 健康检查端点
    location /health {
        proxy_pass http://127.0.0.1:3000/api/health;
        access_log off;
    }
}
EOF
    
    print_info "Nginx 配置模板创建完成"
}

# 生成 .env 文件
generate_env_file() {
    print_info "生成环境变量文件..."
    
    cat > /opt/automation-platform/.env << EOF
# 数据库配置
DB_HOST=host.docker.internal
DB_PORT=3306
DB_USER=root
DB_PASSWORD=$DB_PASSWORD
DB_NAME=$DB_NAME

# Jenkins 配置
JENKINS_URL=$JENKINS_URL
JENKINS_USER=$JENKINS_USER
JENKINS_TOKEN=$JENKINS_TOKEN
JENKINS_JOB_API=SeleniumBaseCi-AutoTest

# 应用配置
NODE_ENV=production
PORT=3000

# CNB 配置
CNB_DOCKER_REGISTRY=cr.cnb.cool
CNB_REPO_SLUG_LOWERCASE=imacaiy/automation-platform
CNB_DOCKER_TOKEN=$CNB_TOKEN
EOF
    
    print_info "环境变量文件生成完成"
}

# 安装 SSL 证书（可选，部署成功后再执行）
install_ssl_certificate() {
    print_info "准备安装 SSL 证书..."

    source /opt/automation-platform/.env

    print_info "开始申请 SSL 证书（域名: $DOMAIN）..."
    print_info "请确保域名已解析到本机 IP，且 80 端口可访问"

    # 更新 HTTP 配置中的 server_name（从 _ 改为实际域名）
    sed -i "s/server_name _;/server_name $DOMAIN www.$DOMAIN;/g" \
        /opt/automation-platform/nginx/conf.d/automation-platform-http.conf
    nginx -t && systemctl reload nginx

    # 申请证书
    certbot certonly --webroot -w /var/www/html \
        -d $DOMAIN -d www.$DOMAIN \
        --non-interactive --agree-tos \
        --register-unsafely-without-email || {
        print_warn "certbot 申请失败，请手动运行:"
        echo "  certbot --nginx -d $DOMAIN -d www.$DOMAIN"
        return 0
    }

    # 证书申请成功后，替换域名占位符并切换为完整 HTTPS 配置
    print_info "SSL 证书申请成功，切换为 HTTPS 配置..."
    sed -i "s/DOMAIN_PLACEHOLDER/$DOMAIN/g" \
        /opt/automation-platform/nginx/conf.d/automation-platform.conf

    if [ -d /etc/nginx/conf.d ]; then
        ln -sf /opt/automation-platform/nginx/conf.d/automation-platform.conf /etc/nginx/conf.d/automation-platform.conf
    elif [ -d /etc/nginx/sites-available ]; then
        ln -sf /opt/automation-platform/nginx/conf.d/automation-platform.conf /etc/nginx/sites-available/automation-platform.conf
    fi

    nginx -t && systemctl reload nginx
    print_info "HTTPS 配置完成，访问: https://$DOMAIN"
}

# 部署应用
deploy_application() {
    print_info "准备部署应用..."
    
    cd /opt/automation-platform
    
    # 拉取镜像
    print_info "拉取 Docker 镜像..."
    docker pull cr.cnb.cool/imacaiy/automation-platform:latest
    
    # 启动容器
    print_info "启动容器..."
    docker-compose up -d
    
    print_info "应用部署完成"
}

# 显示完成信息
show_completion_info() {
    source /opt/automation-platform/.env
    echo ""
    print_info "=================================="
    print_info "  部署完成！"
    print_info "=================================="
    echo ""
    print_info "当前访问地址（HTTP）:"
    echo "   http://$DOMAIN"
    echo "   http://$(curl -s ifconfig.me 2>/dev/null || echo '<服务器IP>'):3000"
    echo ""
    print_info "常用命令:"
    echo "   查看容器状态: docker ps | grep automation-platform"
    echo "   查看应用日志: cd /opt/automation-platform && docker-compose logs -f"
    echo "   重启应用:     cd /opt/automation-platform && docker-compose restart"
    echo ""
    print_info "后续申请 SSL（可选）:"
    echo "   certbot --nginx -d $DOMAIN -d www.$DOMAIN"
    echo ""
}

# 主函数
main() {
    print_info "开始 Docker + CNB 自动化部署安装..."
    echo ""
    
    check_root
    install_dependencies
    install_docker
    install_docker_compose
    create_project_structure
    configure_firewall
    configure_nginx
    prompt_user_info
    generate_env_file
    create_docker_compose
    create_nginx_config
    login_cnb_registry

    # 直接部署应用（跳过 SSL，先让服务跑起来）
    deploy_application

    show_completion_info

    # SSL 证书：可选，部署成功后再执行
    echo ""
    read -p "是否现在申请 SSL 证书? (y/n，可跳过后续手动操作): " setup_ssl
    if [ "$setup_ssl" = "y" ] || [ "$setup_ssl" = "Y" ]; then
        install_ssl_certificate
    else
        print_warn "已跳过 SSL 配置"
        print_info "后续手动申请 SSL 证书请运行:"
        echo "  source /opt/automation-platform/.env"
        echo "  certbot --nginx -d \$DOMAIN -d www.\$DOMAIN"
    fi
}

# 运行主函数
main
