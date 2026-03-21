#!/bin/bash

################################################################################
# CNB仓库自动同步到GitHub镜像仓库的配置脚本
################################################################################

set -e

# ==================== 配置区域 ====================

# CNB配置
export CNB_API_ENDPOINT="${CNB_API_ENDPOINT:-https://api.cnb.cool}"
CNB_REPO="${CNB_REPO:-ImAcaiy/Automation_Platform}"
CNB_BRANCH="${CNB_BRANCH:-master}"

# GitHub配置
GITHUB_REPO="${GITHUB_REPO:-https://github.com/acai1998/Automation_Platform.git}"

# 定时任务调度 (Cron表达式,示例: 每5分钟执行一次)
CRON_SCHEDULE="${CRON_SCHEDULE:-*/5 * * * *}"

# ==================== 辅助函数 ====================

check_cnb_token() {
    if [ -z "$CNB_TOKEN" ]; then
        echo "错误: 未设置CNB_TOKEN环境变量"
        echo "请执行: export CNB_TOKEN=your_token_here"
        exit 1
    fi
}

enable_cnb_build() {
    echo "步骤1: 启用CNB云原生构建..."
    curl -X PUT "${CNB_API_ENDPOINT}/${CNB_REPO}/-/settings/cloud-native-build" \
        -H "Accept: application/vnd.cnb.api+json" \
        -H "Authorization: Bearer ${CNB_TOKEN}" \
        -H "Content-Type: application/json" \
        -d '{
            "auto_trigger": true,
            "forked_repo_auto_trigger": false
        }' 2>/dev/null
    echo "✓ 云原生构建已启用"
}

sync_crontab() {
    echo "步骤2: 同步定时任务配置..."
    curl -X POST "${CNB_API_ENDPOINT}/${CNB_REPO}/-/build/crontab/sync/${CNB_BRANCH}" \
        -H "Accept: application/vnd.cnb.api+json" \
        -H "Authorization: Bearer ${CNB_TOKEN}" \
        -X POST 2>/dev/null
    echo "✓ 定时任务配置已同步"
}

trigger_build() {
    echo "步骤3: 手动触发构建测试..."
    curl -X POST "${CNB_API_ENDPOINT}/${CNB_REPO}/-/build/start" \
        -H "Accept: application/vnd.cnb.api+json" \
        -H "Authorization: Bearer ${CNB_TOKEN}" \
        -H "Content-Type: application/json" \
        -d "{
            \"branch\": \"${CNB_BRANCH}\",
            \"event\": \"api_trigger_sync_to_github\",
            \"sync\": \"false\"
        }" 2>/dev/null
    echo "✓ 构建已触发"
}

check_build_logs() {
    echo "步骤4: 查看构建日志..."
    echo "访问以下链接查看构建详情:"
    echo "  https://cnb.cool/${CNB_REPO}/-/build/logs"
}

# ==================== 主函数 ====================

main() {
    echo "=========================================="
    echo "  CNB仓库自动同步配置工具"
    echo "=========================================="
    echo

    check_cnb_token

    echo "配置信息:"
    echo "  CNB仓库: ${CNB_REPO}"
    echo "  CNB分支: ${CNB_BRANCH}"
    echo "  GitHub镜像: ${GITHUB_REPO}"
    echo "  定时调度: ${CRON_SCHEDULE}"
    echo

    # 执行配置步骤
    enable_cnb_build
    sync_crontab
    trigger_build
    check_build_logs

    echo
    echo "=========================================="
    echo "  配置完成!"
    echo "=========================================="
    echo
    echo "后续操作:"
    echo "1. 确保 .cnb.yml 文件已提交到仓库"
    echo "2. 确保环境变量中配置了GitHub Token"
    echo "3. 访问构建日志查看同步状态"
    echo
}

# 执行主函数
main "$@"
