#!/bin/bash

# 环境变量配置验证脚本
# 用途: 检查 .env 配置是否正确，容器是否能读取到配置

set -e

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

print_info() { echo -e "${GREEN}[✓]${NC} $1"; }
print_error() { echo -e "${RED}[✗]${NC} $1"; }
print_warn() { echo -e "${YELLOW}[!]${NC} $1"; }

echo "======================================"
echo "环境变量配置验证"
echo "======================================"
echo ""

# 1. 检查 .env 文件是否存在
echo "1️⃣  检查 .env 文件..."
if [ -f "../.env" ]; then
    print_info ".env 文件存在"
    
    # 检查文件权限
    PERMS=$(stat -f "%Lp" ../.env 2>/dev/null || stat -c "%a" ../.env 2>/dev/null)
    if [ "$PERMS" = "600" ]; then
        print_info "文件权限正确 (600)"
    else
        print_warn "文件权限为 $PERMS，建议设置为 600"
        echo "    运行: chmod 600 ../.env"
    fi
else
    print_error ".env 文件不存在"
    echo "    请复制 .env.example 并填写配置"
    exit 1
fi

echo ""

# 2. 检查关键配置项
echo "2️⃣  检查关键配置项..."
source ../.env

# 数据库配置
if [ -n "$DB_HOST" ]; then
    print_info "数据库主机: $DB_HOST"
else
    print_error "DB_HOST 未配置"
fi

if [ -n "$DB_PORT" ]; then
    print_info "数据库端口: $DB_PORT"
else
    print_error "DB_PORT 未配置"
fi

if [ -n "$DB_NAME" ]; then
    print_info "数据库名称: $DB_NAME"
else
    print_error "DB_NAME 未配置"
fi

if [ -n "$DB_USER" ]; then
    print_info "数据库用户: $DB_USER"
else
    print_error "DB_USER 未配置"
fi

if [ -n "$DB_PASSWORD" ]; then
    print_info "数据库密码: ****** (已配置)"
else
    print_error "DB_PASSWORD 未配置"
fi

# Jenkins 配置
if [ -n "$JENKINS_URL" ]; then
    print_info "Jenkins URL: $JENKINS_URL"
else
    print_warn "JENKINS_URL 未配置"
fi

if [ -n "$JENKINS_TOKEN" ]; then
    print_info "Jenkins Token: ****** (已配置)"
else
    print_warn "JENKINS_TOKEN 未配置"
fi

echo ""

# 3. 测试数据库连接
echo "3️⃣  测试数据库连接..."
if command -v mysql &> /dev/null; then
    if mysql -h"$DB_HOST" -P"$DB_PORT" -u"$DB_USER" -p"$DB_PASSWORD" -e "SELECT 1;" &> /dev/null; then
        print_info "数据库连接成功"
    else
        print_error "数据库连接失败"
        echo "    请检查数据库配置和网络连接"
    fi
else
    print_warn "未安装 mysql 客户端，跳过数据库连接测试"
    echo "    安装: brew install mysql (Mac) 或 apt install mysql-client (Linux)"
fi

echo ""

# 4. 检查 Docker 环境
echo "4️⃣  检查 Docker 环境..."
if command -v docker &> /dev/null; then
    print_info "Docker 已安装: $(docker --version)"
else
    print_error "Docker 未安装"
    exit 1
fi

if command -v docker-compose &> /dev/null; then
    print_info "Docker Compose 已安装: $(docker-compose --version)"
else
    print_error "Docker Compose 未安装"
    exit 1
fi

echo ""

# 5. 检查容器是否运行
echo "5️⃣  检查容器状态..."
if docker ps | grep -q "automation-platform"; then
    print_info "容器正在运行"
    
    echo ""
    echo "6️⃣  验证容器内的环境变量..."
    
    # 检查容器内的环境变量
    CONTAINER_DB_HOST=$(docker exec automation-platform sh -c 'echo $DB_HOST' 2>/dev/null || echo "")
    if [ "$CONTAINER_DB_HOST" = "$DB_HOST" ]; then
        print_info "DB_HOST 注入成功: $CONTAINER_DB_HOST"
    else
        print_error "DB_HOST 注入失败 (期望: $DB_HOST, 实际: $CONTAINER_DB_HOST)"
    fi
    
    CONTAINER_DB_PORT=$(docker exec automation-platform sh -c 'echo $DB_PORT' 2>/dev/null || echo "")
    if [ "$CONTAINER_DB_PORT" = "$DB_PORT" ]; then
        print_info "DB_PORT 注入成功: $CONTAINER_DB_PORT"
    else
        print_error "DB_PORT 注入失败 (期望: $DB_PORT, 实际: $CONTAINER_DB_PORT)"
    fi
    
    CONTAINER_JENKINS_URL=$(docker exec automation-platform sh -c 'echo $JENKINS_URL' 2>/dev/null || echo "")
    if [ "$CONTAINER_JENKINS_URL" = "$JENKINS_URL" ]; then
        print_info "JENKINS_URL 注入成功: $CONTAINER_JENKINS_URL"
    else
        print_warn "JENKINS_URL 注入失败 (期望: $JENKINS_URL, 实际: $CONTAINER_JENKINS_URL)"
    fi
    
    echo ""
    echo "7️⃣  测试应用健康检查..."
    if curl -f http://localhost:3000/api/health &> /dev/null; then
        print_info "应用健康检查通过"
    else
        print_error "应用健康检查失败"
        echo "    请查看日志: docker logs automation-platform"
    fi
    
else
    print_warn "容器未运行"
    echo "    启动容器: cd deployment && docker-compose up -d"
fi

echo ""
echo "======================================"
echo "验证完成"
echo "======================================"
echo ""

# 总结
echo "📋 快速命令:"
echo "  查看容器日志: docker logs -f automation-platform"
echo "  进入容器:     docker exec -it automation-platform sh"
echo "  重启容器:     docker-compose restart app"
echo "  查看环境变量: docker exec automation-platform env"
echo ""
