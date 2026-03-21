#!/bin/bash

################################################################################
# 停止现有部署服务脚本
# 用途: 停止 Jenkins 和 GitHub Actions 的自动部署,迁移到 CNB CICD
################################################################################

set -e

echo "================================================"
echo "  🛑 停止现有部署服务"
echo "================================================"
echo ""

# ==================== 步骤 1: 备份现有配置 ====================
echo "📦 步骤 1: 备份现有配置..."

# 备份 Jenkinsfile.deploy
if [ -f "Jenkinsfile.deploy" ]; then
    cp Jenkinsfile.deploy "Jenkinsfile.deploy.backup.$(date +%Y%m%d_%H%M%S)"
    echo "✅ 已备份 Jenkinsfile.deploy"
fi

# 备份 GitHub Actions 配置
if [ -d ".github/workflows" ]; then
    cp -r .github/workflows ".github/workflows.backup.$(date +%Y%m%d_%H%M%S)"
    echo "✅ 已备份 .github/workflows"
fi

echo ""

# ==================== 步骤 2: 禁用 Jenkins 定时构建 ====================
echo "⏰ 步骤 2: 禁用 Jenkins 定时构建..."

# 注释掉 Jenkinsfile.deploy 中的 triggers 部分
if [ -f "Jenkinsfile.deploy" ]; then
    # 创建临时文件
    temp_file=$(mktemp)

    # 注释掉 triggers 块
    awk '
    /triggers \{/ {in_triggers=1; print "    // 已禁用 Jenkins 定时构建 (迁移到 CNB)"}
    in_triggers && /\}/ {in_triggers=0; next}
    in_triggers {print "    // " $0; next}
    {print}
    ' Jenkinsfile.deploy > "$temp_file"

    mv "$temp_file" Jenkinsfile.deploy
    echo "✅ 已禁用 Jenkins 定时构建触发器"
fi

echo ""

# ==================== 步骤 3: 禁用 GitHub Actions ====================
echo "⚙️  步骤 3: 禁用 GitHub Actions 自动部署..."

# 重命名 deploy.yml 文件
if [ -f ".github/workflows/deploy.yml" ]; then
    mv .github/workflows/deploy.yml .github/workflows/deploy.yml.disabled
    echo "✅ 已禁用 GitHub Actions workflow"
fi

echo ""

# ==================== 步骤 4: 创建 PM2 停止命令 ====================
echo "🔧 步骤 4: 创建 PM2 停止命令..."

cat > stop-pm2-service.sh << 'EOF'
#!/bin/bash

echo "🛑 停止服务器上的 PM2 服务..."
echo ""
echo "请在服务器上执行以下命令:"
echo ""
echo "  # 停止服务"
echo "  pm2 stop autotest-platform"
echo "  pm2 save"
echo ""
echo "  # 或者完全删除进程"
echo "  pm2 delete autotest-platform"
echo "  pm2 save"
echo ""
echo "  # 查看状态"
echo "  pm2 status"
echo ""

EOF

chmod +x stop-pm2-service.sh
echo "✅ 已创建 stop-pm2-service.sh"
echo ""

# ==================== 步骤 5: 检查 CNB 配置 ====================
echo "🔍 步骤 5: 检查 CNB 配置..."

if [ -f ".catpaw/catpaw_deploy.yaml" ]; then
    echo "✅ CNB 配置文件已存在"

    # 检查 type 字段
    if grep -q "type: cloudnative" .catpaw/catpaw_deploy.yaml; then
        echo "✅ 项目类型配置正确 (cloudnative)"
    else
        echo "⚠️  警告: 项目类型可能配置错误,请检查 .catpaw/catpaw_deploy.yaml"
        echo "   确保 type 字段为: cloudnative"
    fi
else
    echo "❌ 错误: 未找到 .catpaw/catpaw_deploy.yaml"
    echo "   请先创建 CNB 配置文件"
fi

echo ""

# ==================== 完成 ====================
echo "================================================"
echo "  ✅ 停止现有部署服务完成!"
echo "================================================"
echo ""
echo "📋 后续步骤:"
echo ""
echo "1. 提交更改到 Git 仓库:"
echo "   git add ."
echo "   git commit -m 'Disable old deployment, migrate to CNB CICD'"
echo "   git push origin master"
echo ""
echo "2. (可选) 在服务器上停止 PM2 服务:"
echo "   bash stop-pm2-service.sh"
echo ""
echo "3. 在 CatPaw IDE 中部署:"
echo "   - 打开项目"
echo "   - 点击右上方的小火箭图标 🚀"
echo "   - 等待部署完成"
echo ""
echo "4. 部署成功后访问:"
echo "   https://plus-{projectID}.database.sankuai.com"
echo ""
echo "📖 详细文档: docs/CNB_CICD_DEPLOYMENT.md"
echo ""
