#!/bin/bash

# 自动化平台健康检查脚本
# 用途: 检查应用服务的健康状态
# 使用: ./health-check.sh <environment> [options]

set -euo pipefail

# 脚本配置
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_NAME="automation-platform"
LOG_FILE="/var/log/${APP_NAME}/health-check.log"

# 默认配置
DEFAULT_TIMEOUT=300
DEFAULT_RETRY_INTERVAL=10
DEFAULT_MAX_RETRIES=30

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 日志函数
log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1" | tee -a "$LOG_FILE"
}

log_success() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] ✅ $1${NC}" | tee -a "$LOG_FILE"
}

log_error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ❌ $1${NC}" | tee -a "$LOG_FILE"
}

log_warning() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] ⚠️ $1${NC}" | tee -a "$LOG_FILE"
}

# 错误处理
error_exit() {
    log_error "$1"
    exit 1
}

# 显示帮助信息
show_help() {
    cat << EOF
自动化平台健康检查脚本

用法:
    $0 <environment> [options]

参数:
    environment    部署环境 (dev|staging|production)

选项:
    -t, --timeout <seconds>        健康检查超时时间 (默认: 300)
    -i, --interval <seconds>       重试间隔时间 (默认: 10)
    -r, --retries <count>          最大重试次数 (默认: 30)
    -u, --url <url>                自定义应用URL
    -p, --port <port>              自定义端口 (默认: 3000)
    -s, --silent                   静默模式
    -v, --verbose                  详细输出
    -h, --help                     显示帮助信息

示例:
    $0 production
    $0 dev --timeout 600 --interval 5
    $0 staging --url http://staging.example.com

检查项目:
    - Docker 容器状态
    - 应用健康检查端点
    - 数据库连接
    - API 端点响应
    - 系统资源使用情况
    - 日志错误检查

EOF
}

# 参数解析
parse_arguments() {
    ENVIRONMENT=""
    TIMEOUT="$DEFAULT_TIMEOUT"
    RETRY_INTERVAL="$DEFAULT_RETRY_INTERVAL"
    MAX_RETRIES="$DEFAULT_MAX_RETRIES"
    CUSTOM_URL=""
    CUSTOM_PORT="3000"
    SILENT=false
    VERBOSE=false

    while [[ $# -gt 0 ]]; do
        case $1 in
            -t|--timeout)
                TIMEOUT="$2"
                shift 2
                ;;
            -i|--interval)
                RETRY_INTERVAL="$2"
                shift 2
                ;;
            -r|--retries)
                MAX_RETRIES="$2"
                shift 2
                ;;
            -u|--url)
                CUSTOM_URL="$2"
                shift 2
                ;;
            -p|--port)
                CUSTOM_PORT="$2"
                shift 2
                ;;
            -s|--silent)
                SILENT=true
                shift
                ;;
            -v|--verbose)
                VERBOSE=true
                shift
                ;;
            -h|--help)
                show_help
                exit 0
                ;;
            -*)
                error_exit "未知选项: $1"
                ;;
            *)
                if [[ -z "$ENVIRONMENT" ]]; then
                    ENVIRONMENT="$1"
                else
                    error_exit "多余的参数: $1"
                fi
                shift
                ;;
        esac
    done

    # 验证必需参数
    if [[ -z "$ENVIRONMENT" ]]; then
        show_help
        error_exit "缺少环境参数"
    fi

    # 验证环境
    if [[ ! "$ENVIRONMENT" =~ ^(dev|staging|production)$ ]]; then
        error_exit "无效的环境: $ENVIRONMENT"
    fi

    # 设置应用URL
    if [[ -n "$CUSTOM_URL" ]]; then
        APP_URL="$CUSTOM_URL"
    else
        case "$ENVIRONMENT" in
            "production")
                APP_URL="https://automation-platform.example.com"
                ;;
            "staging")
                APP_URL="https://staging-automation-platform.example.com"
                ;;
            "dev")
                APP_URL="http://localhost:${CUSTOM_PORT}"
                ;;
            *)
                APP_URL="http://localhost:${CUSTOM_PORT}"
                ;;
        esac
    fi
}

# 检查 Docker 容器状态
check_docker_containers() {
    log "检查 Docker 容器状态..."

    cd /opt/"$APP_NAME" 2>/dev/null || {
        log_warning "应用目录不存在，跳过 Docker 容器检查"
        return 0
    }

    if [[ ! -f "docker-compose.yml" ]]; then
        log_warning "docker-compose.yml 不存在，跳过容器检查 (使用 deployment/scripts/setup.sh 部署时正常)"
        return 0
    fi

    # 检查容器运行状态
    local unhealthy_containers
    unhealthy_containers=$(docker-compose ps --services --filter "status=running" | wc -l)

    if [[ $unhealthy_containers -eq 0 ]]; then
        log_error "没有运行中的容器"
        return 1
    fi

    # 显示容器详细状态
    if [[ "$VERBOSE" == "true" ]]; then
        log "容器状态详情:"
        docker-compose ps
    fi

    # 检查容器健康状态
    local containers
    containers=$(docker-compose ps --services)

    for container in $containers; do
        local status
        status=$(docker-compose ps "$container" | tail -n 1 | awk '{print $3}')

        if [[ "$status" == "Up" ]]; then
            log_success "容器 $container 运行正常"
        else
            log_error "容器 $container 状态异常: $status"
            return 1
        fi
    done

    log_success "Docker 容器状态检查通过"
    return 0
}

# 检查应用健康端点
check_health_endpoint() {
    log "检查应用健康端点..."

    local health_url="${APP_URL}/api/health"
    local attempt=1

    while [[ $attempt -le $MAX_RETRIES ]]; do
        if [[ "$SILENT" != "true" ]]; then
            log "健康检查尝试 $attempt/$MAX_RETRIES: $health_url"
        fi

        # 执行健康检查请求
        local response
        local http_code
        response=$(curl -s -w "%{http_code}" --max-time 30 "$health_url" 2>/dev/null || echo "000")
        http_code="${response: -3}"
        response="${response%???}"

        if [[ "$http_code" == "200" ]]; then
            log_success "健康检查端点响应正常"

            if [[ "$VERBOSE" == "true" ]]; then
                log "响应内容: $response"
            fi

            return 0
        else
            if [[ "$VERBOSE" == "true" ]]; then
                log_warning "健康检查失败 (HTTP $http_code): $response"
            fi
        fi

        if [[ $attempt -lt $MAX_RETRIES ]]; then
            sleep "$RETRY_INTERVAL"
        fi

        attempt=$((attempt + 1))
    done

    log_error "健康检查端点验证失败"
    return 1
}

# 检查数据库连接
check_database_connection() {
    log "检查数据库连接..."

    local db_check_url="${APP_URL}/api/health/db"

    # 尝试访问数据库健康检查端点
    local response
    local http_code
    response=$(curl -s -w "%{http_code}" --max-time 30 "$db_check_url" 2>/dev/null || echo "000")
    http_code="${response: -3}"

    if [[ "$http_code" == "200" ]]; then
        log_success "数据库连接正常"

        if [[ "$VERBOSE" == "true" ]]; then
            log "数据库响应: ${response%???}"
        fi

        return 0
    else
        log_warning "数据库健康检查端点不可用 (HTTP $http_code)"

        # 备用检查：尝试查询一个简单的 API 端点
        local api_response
        local api_http_code
        api_response=$(curl -s -w "%{http_code}" --max-time 30 "${APP_URL}/api/dashboard" 2>/dev/null || echo "000")
        api_http_code="${api_response: -3}"

        if [[ "$api_http_code" == "200" ]]; then
            log_success "API 端点响应正常，数据库连接可能正常"
            return 0
        else
            log_error "API 端点也无法访问，数据库连接可能有问题"
            return 1
        fi
    fi
}

# 检查关键 API 端点
check_api_endpoints() {
    log "检查关键 API 端点..."

    local endpoints=(
        "/api/dashboard"
        "/api/executions"
        "/api/cases"
        "/api/tasks"
    )

    local failed_count=0

    for endpoint in "${endpoints[@]}"; do
        local url="${APP_URL}${endpoint}"
        local response
        local http_code

        response=$(curl -s -w "%{http_code}" --max-time 30 "$url" 2>/dev/null || echo "000")
        http_code="${response: -3}"

        if [[ "$http_code" =~ ^(200|401|403)$ ]]; then
            # 200 OK, 401 Unauthorized, 403 Forbidden 都算正常（可能需要认证）
            log_success "端点 $endpoint 响应正常 (HTTP $http_code)"
        else
            log_error "端点 $endpoint 响应异常 (HTTP $http_code)"
            failed_count=$((failed_count + 1))
        fi

        if [[ "$VERBOSE" == "true" ]]; then
            log "端点 $endpoint 响应: ${response%???}"
        fi
    done

    if [[ $failed_count -gt 0 ]]; then
        log_error "$failed_count 个 API 端点检查失败"
        return 1
    else
        log_success "所有 API 端点检查通过"
        return 0
    fi
}

# 检查系统资源
check_system_resources() {
    log "检查系统资源使用情况..."

    # 检查磁盘空间
    local disk_usage
    disk_usage=$(df /opt/"$APP_NAME" 2>/dev/null | tail -1 | awk '{print $5}' | sed 's/%//' || echo "0")

    if [[ $disk_usage -gt 90 ]]; then
        log_error "磁盘空间不足: ${disk_usage}%"
        return 1
    elif [[ $disk_usage -gt 80 ]]; then
        log_warning "磁盘空间紧张: ${disk_usage}%"
    else
        log_success "磁盘空间充足: ${disk_usage}%"
    fi

    # 检查内存使用
    local memory_usage
    memory_usage=$(free | grep Mem | awk '{printf "%.0f", $3/$2 * 100.0}')

    if [[ $memory_usage -gt 90 ]]; then
        log_error "内存使用过高: ${memory_usage}%"
        return 1
    elif [[ $memory_usage -gt 80 ]]; then
        log_warning "内存使用较高: ${memory_usage}%"
    else
        log_success "内存使用正常: ${memory_usage}%"
    fi

    # 检查 Docker 资源
    if command -v docker >/dev/null 2>&1; then
        local docker_stats
        docker_stats=$(docker system df --format "table {{.Type}}\t{{.TotalCount}}\t{{.Size}}" 2>/dev/null || echo "")

        if [[ -n "$docker_stats" ]] && [[ "$VERBOSE" == "true" ]]; then
            log "Docker 资源统计:"
            echo "$docker_stats"
        fi
    fi

    log_success "系统资源检查完成"
    return 0
}

# 检查应用日志
check_application_logs() {
    log "检查应用日志..."

    local log_dirs=(
        "/opt/$APP_NAME/logs"
        "/var/log/$APP_NAME"
        "/opt/$APP_NAME/data/logs"
    )

    local error_count=0

    for log_dir in "${log_dirs[@]}"; do
        if [[ ! -d "$log_dir" ]]; then
            continue
        fi

        # 检查最近的错误日志
        local recent_errors
        recent_errors=$(find "$log_dir" -name "*.log" -mtime -1 -exec grep -i "error\|fatal\|exception" {} \; 2>/dev/null | wc -l)

        if [[ $recent_errors -gt 100 ]]; then
            log_error "在 $log_dir 中发现大量错误日志: $recent_errors 条"
            error_count=$((error_count + 1))
        elif [[ $recent_errors -gt 10 ]]; then
            log_warning "在 $log_dir 中发现一些错误日志: $recent_errors 条"
        else
            log_success "日志目录 $log_dir 错误数量正常: $recent_errors 条"
        fi

        # 显示最近的严重错误
        if [[ "$VERBOSE" == "true" ]] && [[ $recent_errors -gt 0 ]]; then
            log "最近的错误日志示例:"
            find "$log_dir" -name "*.log" -mtime -1 -exec grep -i "fatal\|exception" {} \; 2>/dev/null | head -5 || true
        fi
    done

    if [[ $error_count -gt 0 ]]; then
        log_error "应用日志检查发现问题"
        return 1
    else
        log_success "应用日志检查正常"
        return 0
    fi
}

# 生成健康检查报告
generate_health_report() {
    local overall_status="$1"
    local report_file="/tmp/health-check-report-$(date +%Y%m%d_%H%M%S).json"

    cat > "$report_file" << EOF
{
    "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
    "environment": "$ENVIRONMENT",
    "overall_status": "$overall_status",
    "app_url": "$APP_URL",
    "checks": {
        "docker_containers": ${docker_check_result:-false},
        "health_endpoint": ${health_check_result:-false},
        "database_connection": ${db_check_result:-false},
        "api_endpoints": ${api_check_result:-false},
        "system_resources": ${resource_check_result:-false},
        "application_logs": ${log_check_result:-false}
    },
    "system_info": {
        "hostname": "$(hostname)",
        "uptime": "$(uptime -p 2>/dev/null || echo 'unknown')",
        "load_average": "$(uptime | awk -F'load average:' '{print $2}' | xargs)"
    }
}
EOF

    if [[ "$VERBOSE" == "true" ]]; then
        log "健康检查报告已生成: $report_file"
        cat "$report_file"
    fi
}

# 主函数
main() {
    echo "========================================="
    echo "🏥 自动化平台健康检查"
    echo "========================================="

    # 解析参数
    parse_arguments "$@"

    # 创建日志目录
    mkdir -p "$(dirname "$LOG_FILE")"
    touch "$LOG_FILE"

    log "开始健康检查..."
    log "环境: $ENVIRONMENT"
    log "应用URL: $APP_URL"
    log "超时时间: $TIMEOUT 秒"

    local failed_checks=0
    local total_checks=6

    # 执行各项检查
    if check_docker_containers; then
        docker_check_result=true
    else
        docker_check_result=false
        failed_checks=$((failed_checks + 1))
    fi

    if check_health_endpoint; then
        health_check_result=true
    else
        health_check_result=false
        failed_checks=$((failed_checks + 1))
    fi

    if check_database_connection; then
        db_check_result=true
    else
        db_check_result=false
        failed_checks=$((failed_checks + 1))
    fi

    if check_api_endpoints; then
        api_check_result=true
    else
        api_check_result=false
        failed_checks=$((failed_checks + 1))
    fi

    if check_system_resources; then
        resource_check_result=true
    else
        resource_check_result=false
        failed_checks=$((failed_checks + 1))
    fi

    if check_application_logs; then
        log_check_result=true
    else
        log_check_result=false
        failed_checks=$((failed_checks + 1))
    fi

    # 生成报告
    local overall_status
    if [[ $failed_checks -eq 0 ]]; then
        overall_status="healthy"
        log_success "所有健康检查通过 ($total_checks/$total_checks)"
    else
        overall_status="unhealthy"
        log_error "健康检查失败 ($((total_checks - failed_checks))/$total_checks 通过)"
    fi

    generate_health_report "$overall_status"

    echo "========================================="
    if [[ $failed_checks -eq 0 ]]; then
        echo "✅ 健康检查完成 - 系统状态正常"
        exit 0
    else
        echo "❌ 健康检查完成 - 发现 $failed_checks 个问题"
        exit 1
    fi
}

# 脚本入口
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi