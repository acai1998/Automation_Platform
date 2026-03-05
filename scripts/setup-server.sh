#!/bin/bash
# ============================================================
# 服务器首次初始化脚本 - 自动化测试平台
# 用途：在全新服务器上首次部署时运行
# 用法：bash scripts/setup-server.sh
# ============================================================

set -e

# ─── 颜色输出 ───────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info()    { echo -e "${GREEN}[INFO]${NC}  $1"; }
log_warn()    { echo -e "${YELLOW}[WARN]${NC}  $1"; }
log_error()   { echo -e "${RED}[ERROR]${NC} $1"; }
log_step()    { echo -e "${BLUE}[STEP]${NC}  $1"; }

# ─── 配置 ──────────────────────────────────────────────────
APP_DIR="/www/wwwroot/autotest.wiac.xyz"
APP_NAME="autotest-platform"
LOG_DIR="${APP_DIR}/logs"
ENV_FILE="${APP_DIR}/.env"

log_step "=== 自动化测试平台 首次初始化 ==="
echo ""

# ─── 检查 Node.js ──────────────────────────────────────────
log_step "步骤 1/6：检查运行环境"

if ! command -v node &> /dev/null; then
  log_error "Node.js 未安装！请先安装 Node.js 20+："
  echo "  curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -"
  echo "  sudo yum install -y nodejs"
  exit 1
fi

NODE_VERSION=$(node --version)
log_info "Node.js 版本：${NODE_VERSION}"

if ! command -v npm &> /dev/null; then
  log_error "npm 未安装"
  exit 1
fi

NPM_VERSION=$(npm --version)
log_info "npm 版本：${NPM_VERSION}"

# ─── 安装 PM2 ──────────────────────────────────────────────
log_step "步骤 2/6：安装/更新 PM2"

if command -v pm2 &> /dev/null; then
  PM2_VERSION=$(pm2 --version)
  log_info "PM2 已安装，版本：${PM2_VERSION}"
else
  log_info "正在安装 PM2..."
  npm install -g pm2
  log_info "PM2 安装完成"
fi

# 安装 PM2 日志轮转插件
log_info "安装 PM2 日志轮转插件..."
pm2 install pm2-logrotate 2>/dev/null || log_warn "pm2-logrotate 安装失败（非致命）"

# 配置开机自启
log_step "步骤 3/6：配置开机自启"
pm2 startup | tail -1 | bash 2>/dev/null || {
  log_warn "自动配置开机自启失败，请手动运行以下命令："
  pm2 startup
}
log_info "已配置 PM2 开机自启"

# ─── 切换到项目目录 ─────────────────────────────────────────
log_step "步骤 4/6：检查项目目录"

if [ ! -d "${APP_DIR}" ]; then
  log_error "项目目录不存在：${APP_DIR}"
  log_error "请先通过宝塔 Git 功能拉取代码到该目录"
  exit 1
fi

cd "${APP_DIR}"
log_info "项目目录：${APP_DIR}"

# ─── 配置环境变量 ──────────────────────────────────────────
log_step "步骤 5/6：配置环境变量"

if [ -f "${ENV_FILE}" ]; then
  log_info ".env 文件已存在，跳过创建"
else
  if [ -f "${APP_DIR}/deployment/.env.production" ]; then
    cp "${APP_DIR}/deployment/.env.production" "${ENV_FILE}"
    log_warn "已从模板创建 .env 文件：${ENV_FILE}"
    log_warn "请务必检查并修改以下配置项："
    echo "  - DB_HOST / DB_USER / DB_PASSWORD"
    echo "  - JWT_SECRET（请改为随机字符串）"
    echo "  - JENKINS_URL / JENKINS_TOKEN"
    echo "  - API_CALLBACK_URL（改为服务器公网 IP）"
    echo "  - CORS_ORIGIN（改为前端访问地址）"
    echo ""
    read -p "确认已了解需要修改 .env 后按 Enter 继续，或 Ctrl+C 退出先修改..."
  else
    log_error "找不到 .env 模板文件"
    log_error "请手动创建 ${ENV_FILE}"
    exit 1
  fi
fi

# ─── 创建日志目录 ──────────────────────────────────────────
mkdir -p "${LOG_DIR}"
log_info "日志目录：${LOG_DIR}"

# ─── 首次构建并启动 ─────────────────────────────────────────
log_step "步骤 6/6：首次构建并启动应用"

log_info "安装项目依赖..."
npm install --production=false

log_info "构建前端（先构建，避免被 vite 清空 dist/）..."
npm run build

log_info "编译后端 TypeScript..."
npm run server:build

log_info "启动应用..."
pm2 start ecosystem.config.js --env production

# 保存 PM2 进程列表（开机自启所需）
pm2 save

echo ""
log_info "=== 初始化完成！==="
echo ""
pm2 status "${APP_NAME}"
echo ""
log_info "应用地址：http://$(hostname -I | awk '{print $1}'):3000"
echo ""
log_info "常用命令："
echo "  pm2 status              # 查看进程状态"
echo "  pm2 logs ${APP_NAME}    # 查看实时日志"
echo "  pm2 restart ${APP_NAME} # 重启应用"
echo "  bash scripts/deploy.sh  # 代码更新后热部署"
