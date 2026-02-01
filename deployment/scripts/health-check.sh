#!/bin/bash

# ========================================
# Docker Swarm 健康检查脚本
# ========================================

set -e

# 脚本配置
STACK_NAME="automation-platform"
APP_URL="http://localhost:3000"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 日志函数
info() {
    echo -e "${BLUE}[INFO]${NC} $(date '+%Y-%m-%d %H:%M:%S') $*"
}

success() {
    echo -e "${GREEN}[SUCCESS]${NC} $(date '+%Y-%m-%d %H:%M:%S') $*"
}

warn() {
    echo -e "${YELLOW}[WARN]${NC} $(date '+%Y-%m-%d %H:%M:%S') $*"
}

error() {
    echo -e "${RED}[ERROR]${NC} $(date '+%Y-%m-%d %H:%M:%S') $*"
}

# 检查 Docker Swarm 状态
check_swarm_status() {
    info "检查 Docker Swarm 状态..."

    if ! docker info | grep -q "Swarm: active"; then
        error "Docker Swarm 未激活"
        return 1
    fi

    local node_count=$(docker node ls --format "{{.Status}}" | grep -c "Ready" || echo "0")
    success "Docker Swarm 正常运行 ($node_count 个节点)"
}

# 检查 Stack 状态
check_stack_status() {
    info "检查 Stack 状态..."

    if ! docker stack ls | grep -q "$STACK_NAME"; then
        error "Stack '$STACK_NAME' 不存在"
        return 1
    fi

    local services=$(docker stack services "$STACK_NAME" --format "{{.Name}} {{.Replicas}}")
    echo "$services" | while IFS= read -r line; do
        local service_name=$(echo "$line" | awk '{print $1}')
        local replicas=$(echo "$line" | awk '{print $2}')

        if [[ "$replicas" == *"/"* ]]; then
            local running=$(echo "$replicas" | cut -d'/' -f1)
            local desired=$(echo "$replicas" | cut -d'/' -f2)

            if [ "$running" -eq "$desired" ]; then
                success "服务 $service_name: $replicas"
            else
                warn "服务 $service_name: $replicas (部分副本未运行)"
            fi
        else
            warn "服务 $service_name: 状态异常"
        fi
    done
}

# 检查服务健康状态
check_service_health() {
    info "检查服务健康状态..."

    local unhealthy_tasks=$(docker service ps "$STACK_NAME"_app --filter "desired-state=running" --format "{{.CurrentState}}" | grep -v "Running" || echo "")

    if [ -n "$unhealthy_tasks" ]; then
        warn "发现异常任务:"
        echo "$unhealthy_tasks"
    else
        success "所有任务运行正常"
    fi
}

# 检查应用程序健康状态
check_app_health() {
    info "检查应用程序健康状态..."

    # 健康检查端点
    if curl -f -s "$APP_URL/api/health" >/dev/null 2>&1; then
        local health_response=$(curl -s "$APP_URL/api/health")
        success "应用健康检查通过"
        echo "响应: $health_response"
    else
        error "应用健康检查失败"
        return 1
    fi
}

# 检查数据库连接
check_database_connection() {
    info "检查数据库连接..."

    local db_response=$(curl -s "$APP_URL/api/dashboard" | head -c 100)
    if [ -n "$db_response" ] && [[ "$db_response" != *"error"* ]]; then
        success "数据库连接正常"
    else
        warn "数据库连接可能存在问题"
        echo "响应: $db_response"
    fi
}

# 检查 Jenkins 集成
check_jenkins_integration() {
    info "检查 Jenkins 集成..."

    local jenkins_response=$(curl -s "$APP_URL/api/jenkins/health")
    if [[ "$jenkins_response" == *"connected"* ]] || [[ "$jenkins_response" == *"true"* ]]; then
        success "Jenkins 集成正常"
    else
        warn "Jenkins 集成可能存在问题"
        echo "响应: $jenkins_response"
    fi
}

# 检查资源使用情况
check_resource_usage() {
    info "检查资源使用情况..."

    # 获取容器统计信息
    local container_ids=$(docker ps --filter "label=com.docker.stack.namespace=$STACK_NAME" --format "{{.ID}}")

    if [ -n "$container_ids" ]; then
        echo "容器资源使用情况:"
        docker stats --no-stream --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}" $container_ids
    else
        warn "未找到运行中的容器"
    fi
}

# 检查日志错误
check_logs_for_errors() {
    info "检查应用日志中的错误..."

    local recent_logs=$(docker service logs --tail 50 "${STACK_NAME}_app" 2>&1)
    local error_count=$(echo "$recent_logs" | grep -i "error\|exception\|fatal" | wc -l)

    if [ "$error_count" -eq 0 ]; then
        success "最近日志中没有发现错误"
    else
        warn "最近日志中发现 $error_count 个错误/异常"
        echo "最近的错误:"
        echo "$recent_logs" | grep -i "error\|exception\|fatal" | tail -5
    fi
}

# 检查网络连通性
check_network_connectivity() {
    info "检查网络连通性..."

    # 检查容器间网络
    local app_containers=$(docker ps --filter "label=com.docker.stack.namespace=$STACK_NAME" --filter "label=com.docker.swarm.service.name=${STACK_NAME}_app" --format "{{.ID}}")

    if [ -n "$app_containers" ]; then
        local first_container=$(echo "$app_containers" | head -1)

        # 测试容器内网络
        if docker exec "$first_container" sh -c "nc -z localhost 3000" >/dev/null 2>&1; then
            success "容器内网络连通正常"
        else
            warn "容器内网络连通存在问题"
        fi
    fi
}

# 生成健康报告
generate_health_report() {
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    local report_file="/tmp/health-check-report-$(date '+%Y%m%d-%H%M%S').txt"

    {
        echo "=========================================="
        echo "Docker Swarm 健康检查报告"
        echo "时间: $timestamp"
        echo "Stack: $STACK_NAME"
        echo "=========================================="
        echo

        echo "服务状态:"
        docker stack services "$STACK_NAME" 2>/dev/null || echo "Stack 不存在"
        echo

        echo "任务状态:"
        docker service ps "${STACK_NAME}_app" --no-trunc 2>/dev/null || echo "服务不存在"
        echo

        echo "最近日志 (最后 20 行):"
        docker service logs --tail 20 "${STACK_NAME}_app" 2>/dev/null || echo "无法获取日志"
        echo

    } > "$report_file"

    info "健康报告已生成: $report_file"
}

# 显示帮助信息
show_help() {
    echo "Docker Swarm 健康检查脚本"
    echo
    echo "用法: $0 [选项]"
    echo
    echo "选项:"
    echo "  --quick, -q         快速检查 (仅基础状态)"
    echo "  --full, -f          完整检查 (包括资源和日志)"
    echo "  --report, -r        生成详细报告"
    echo "  --app-only, -a      仅检查应用程序"
    echo "  --help, -h          显示此帮助信息"
    echo
    echo "示例:"
    echo "  $0                  # 标准健康检查"
    echo "  $0 --quick          # 快速检查"
    echo "  $0 --full           # 完整检查"
    echo "  $0 --report         # 生成报告"
}

# 主函数
main() {
    local mode="standard"

    # 解析命令行参数
    while [[ $# -gt 0 ]]; do
        case $1 in
            --quick|-q)
                mode="quick"
                shift
                ;;
            --full|-f)
                mode="full"
                shift
                ;;
            --report|-r)
                mode="report"
                shift
                ;;
            --app-only|-a)
                mode="app"
                shift
                ;;
            --help|-h)
                show_help
                exit 0
                ;;
            *)
                error "未知选项: $1"
                show_help
                exit 1
                ;;
        esac
    done

    echo "=========================================="
    info "Docker Swarm 健康检查 ($mode 模式)"
    echo "=========================================="
    echo

    case "$mode" in
        "quick")
            check_swarm_status
            check_stack_status
            check_app_health
            ;;
        "full")
            check_swarm_status
            check_stack_status
            check_service_health
            check_app_health
            check_database_connection
            check_jenkins_integration
            check_resource_usage
            check_logs_for_errors
            check_network_connectivity
            ;;
        "report")
            check_swarm_status
            check_stack_status
            check_service_health
            check_app_health
            generate_health_report
            ;;
        "app")
            check_app_health
            check_database_connection
            check_jenkins_integration
            ;;
        "standard")
            check_swarm_status
            check_stack_status
            check_service_health
            check_app_health
            check_database_connection
            check_jenkins_integration
            ;;
    esac

    echo
    success "健康检查完成"
}

# 执行主函数
main "$@"