#!/bin/bash
# ============================================================
# 热部署脚本 - 自动化测试平台
# 用途：代码更新后零停机重新部署（前端重新构建 + 后端热重载）
# 用法：bash scripts/deploy.sh
# ============================================================

set -e  # 任何命令失败立即退出

# ─── 颜色输出 ───────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info()    { echo -e "${GREEN}[INFO]${NC}  $1"; }
log_warn()    { echo -e "${YELLOW}[WARN]${NC}  $1"; }
log_error()   { echo -e "${RED}[ERROR]${NC} $1"; }
log_step()    { echo -e "${BLUE}[STEP]${NC}  $1"; }

# ─── 配置 ──────────────────────────────────────────────────
APP_DIR="/www/wwwroot/autotest.wiac.xyz"
APP_NAME="autotest-platform"
LOG_DIR="${APP_DIR}/logs"
ENV_FILE="${APP_DIR}/.env"

# ─── 前置检查 ───────────────────────────────────────────────
log_step "=== 自动化测试平台 热部署 ==="
echo ""

# 检查是否在正确的目录
if [ ! -f "${APP_DIR}/package.json" ]; then
  log_error "找不到 package.json，请确认部署目录：${APP_DIR}"
  exit 1
fi

cd "${APP_DIR}"

# 检查 .env 文件
if [ ! -f "${ENV_FILE}" ]; then
  log_warn ".env 文件不存在，将使用 deployment/.env.production 作为默认配置"
  if [ -f "${APP_DIR}/deployment/.env.production" ]; then
    cp "${APP_DIR}/deployment/.env.production" "${ENV_FILE}"
    log_info "已从 deployment/.env.production 复制 .env 文件，请检查并修改配置"
  else
    log_error "找不到环境配置文件，请手动创建 .env"
    exit 1
  fi
fi

# 检查 PM2 是否安装
if ! command -v pm2 &> /dev/null; then
  log_error "PM2 未安装，请先运行：npm install -g pm2"
  exit 1
fi

# 创建日志目录
mkdir -p "${LOG_DIR}"

echo ""
log_step "步骤 1/4：安装/更新依赖"
npm install --production=false
log_info "依赖安装完成"

echo ""
log_step "步骤 2/4：构建后端（TypeScript 编译）"
npm run server:build
log_info "后端编译完成 → dist/server/server/"

echo ""
log_step "步骤 3/4：构建前端（Vite 打包）"
npm run build
log_info "前端构建完成 → dist/"

echo ""
log_step "步骤 4/4：热重载应用（零停机）"

# 检查 PM2 中是否已存在该应用
if pm2 list | grep -q "${APP_NAME}"; then
  log_info "检测到应用已在运行，执行热重载..."
  # reload 命令：逐个重启进程，保证零停机
  pm2 reload "${APP_NAME}" --update-env
  log_info "热重载完成！"
else
  log_info "应用未运行，首次启动..."
  pm2 start ecosystem.config.js --env production
  log_info "应用启动成功！"
fi

# 保存 PM2 进程列表（确保服务器重启后自动恢复）
pm2 save

echo ""
log_info "=== 部署完成 ==="
echo ""
pm2 status "${APP_NAME}"
echo ""
log_info "应用地址：http://$(hostname -I | awk '{print $1}'):3000"
log_info "查看日志：pm2 logs ${APP_NAME}"
log_info "查看状态：pm2 status"
