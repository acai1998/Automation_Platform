#!/bin/bash

################################################################################
# CNB自动同步到GitHub脚本 - 用于.cnb.yml中的步骤执行
################################################################################

set -e

# ==================== 配置区域 ====================

CNB_REPO_URL="${CNB_REPO_URL:-https://cnb.cool/ImAcaiy/Automation_Platform.git}"
GITHUB_REPO_URL="${GITHUB_REPO_URL:-https://github.com/acai1998/Automation_Platform.git}"
GITHUB_TOKEN="${GITHUB_TOKEN}"

# ==================== 验证 ====================

if [ -z "$GITHUB_TOKEN" ]; then
    echo "错误: 未设置GITHUB_TOKEN环境变量"
    echo "请在CNB流水线设置中配置GitHub Token"
    exit 1
fi

# ==================== 主逻辑 ====================

echo "=========================================="
echo "  开始同步CNB仓库到GitHub"
echo "=========================================="
echo

echo "步骤1: 克隆CNB仓库..."
git clone "$CNB_REPO_URL" cnb_repo
cd cnb_repo
echo "✓ 克隆完成"
echo

echo "步骤2: 添加GitHub远程仓库..."
git remote add github "$GITHUB_REPO_URL"
echo "✓ 远程仓库已添加"
echo

echo "步骤3: 配置Git认证..."
# 使用GitHub Token进行认证
GITHUB_AUTH_URL=$(echo "$GITHUB_REPO_URL" | sed 's|https://github.com|https://oauth2:'"$GITHUB_TOKEN"'@github.com|')
git remote set-url github "$GITHUB_AUTH_URL"
echo "✓ Git认证已配置"
echo

echo "步骤4: 强制推送到GitHub..."
git push github master --force
echo "✓ 推送完成"
echo

echo "步骤5: 清理临时文件..."
cd ..
rm -rf cnb_repo
echo "✓ 清理完成"
echo

echo "=========================================="
echo "  同步完成!"
echo "=========================================="
