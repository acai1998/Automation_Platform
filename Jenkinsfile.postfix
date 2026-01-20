pipeline {
    agent any
    
    parameters {
        string(name: 'RUN_ID', description: '执行批次ID', defaultValue: '')
        string(name: 'CASE_IDS', description: '用例ID列表(JSON)', defaultValue: '[]')
        string(name: 'SCRIPT_PATHS', description: '脚本路径(逗号分隔)', defaultValue: '')
        string(name: 'CALLBACK_URL', description: '回调URL', defaultValue: '')
        string(name: 'MARKER', description: 'Pytest marker标记', defaultValue: '')
    }
    
    environment {
        REPO_URL = credentials('test-repo-url')
        GIT_CREDENTIALS = credentials('git-credentials')
        PLATFORM_API_URL = 'http://localhost:3000'
        PYTHON_ENV = "${WORKSPACE}/venv"
    }
    
    stages {
        stage('准备') {
            steps {
                script {
                    echo "========== 执行信息 =========="
                    echo "运行ID: ${params.RUN_ID}"
                    echo "用例IDs: ${params.CASE_IDS}"
                    echo "脚本路径: ${params.SCRIPT_PATHS}"
                    echo "回调地址: ${params.CALLBACK_URL}"
                    echo "==============================="
                    
                    // 标记执行开始（可选）
                    if (params.RUN_ID) {
                        sh '''
                            curl -X POST "${PLATFORM_API_URL}/api/executions/${RUN_ID}/start" \
                                -H "Content-Type: application/json"
                        '''
                    }
                }
            }
        }
        
        stage('检出代码') {
            steps {
                script {
                    echo "正在克隆/更新测试用例仓库..."
                    
                    if (fileExists('test-cases')) {
                        dir('test-cases') {
                            sh 'git pull origin main'
                        }
                    } else {
                        sh 'git clone ${REPO_URL} test-cases'
                    }
                }
            }
        }
        
        stage('准备环境') {
            steps {
                script {
                    echo "准备Python环境..."
                    
                    sh '''
                        cd test-cases
                        
                        # 创建虚拟环境（如果不存在）
                        if [ ! -d "${PYTHON_ENV}" ]; then
                            python3 -m venv ${PYTHON_ENV}
                        fi
                        
                        # 激活虚拟环境并安装依赖
                        source ${PYTHON_ENV}/bin/activate
                        pip install -q pytest pytest-json-report
                        
                        # 列出可用的用例
                        echo "可用的测试文件:"
                        find . -name "test_*.py" -o -name "*_test.py" | head -20
                    '''
                }
            }
        }
        
        stage('执行测试') {
            steps {
                script {
                    def scriptPaths = params.SCRIPT_PATHS
                    def marker = params.MARKER
                    def testCommand = "source ${PYTHON_ENV}/bin/activate && "
                    
                    if (scriptPaths) {
                        // 执行指定的脚本路径
                        def paths = scriptPaths.split(',')
                        testCommand += "pytest ${paths.join(' ')}"
                    } else if (marker) {
                        // 使用marker标记执行
                        testCommand += "pytest -m ${marker}"
                    } else {
                        // 执行所有测试
                        testCommand += "pytest"
                    }
                    
                    // 添加报告输出参数
                    testCommand += " --json-report --json-report-file=test-report.json -v"
                    
                    sh '''
                        cd test-cases
                        ''' + testCommand + ''' || true
                    '''
                }
            }
        }
        
        stage('收集结果') {
            steps {
                script {
                    echo "收集测试结果..."
                    
                    sh '''
                        cd test-cases
                        
                        # 如果生成了报告文件，解析结果
                        if [ -f "test-report.json" ]; then
                            cat test-report.json
                        else
                            # 生成默认的结果
                            echo "未生成详细报告，生成默认结果"
                        fi
                    '''
                }
            }
        }
        
        stage('回调平台') {
            steps {
                script {
                    echo "回调测试结果到平台..."
                    
                    sh '''
                        cd test-cases
                        
                        # 解析测试结果（示例）
                        if [ -f "test-report.json" ]; then
                            TOTAL=$(jq '.summary.total' test-report.json || echo "0")
                            PASSED=$(jq '.summary.passed' test-report.json || echo "0")
                            FAILED=$(jq '.summary.failed' test-report.json || echo "0")
                            SKIPPED=$(jq '.summary.skipped' test-report.json || echo "0")
                        else
                            TOTAL=0
                            PASSED=0
                            FAILED=0
                            SKIPPED=0
                        fi
                        
                        # 计算执行时长
                        BUILD_DURATION_MS=$((BUILD_DURATION * 1000))
                        
                        # 确定状态
                        if [ $FAILED -eq 0 ]; then
                            STATUS="success"
                        else
                            STATUS="failed"
                        fi
                        
                        echo "测试结果汇总:"
                        echo "  总数: $TOTAL"
                        echo "  通过: $PASSED"
                        echo "  失败: $FAILED"
                        echo "  跳过: $SKIPPED"
                        echo "  状态: $STATUS"
                        echo "  耗时: ${BUILD_DURATION_MS}ms"
                        
                        # 回调到平台
                        if [ ! -z "${CALLBACK_URL}" ]; then
                            curl -X POST "${CALLBACK_URL}" \
                                -H "Content-Type: application/json" \
                                -d "{
                                    \"runId\": ${RUN_ID},
                                    \"status\": \"$STATUS\",
                                    \"passedCases\": $PASSED,
                                    \"failedCases\": $FAILED,
                                    \"skippedCases\": $SKIPPED,
                                    \"durationMs\": $BUILD_DURATION_MS,
                                    \"buildUrl\": \"${BUILD_URL}\"
                                }" \
                                || echo "回调请求失败，但继续处理"
                        fi
                    '''
                }
            }
        }
    }
    
    post {
        always {
            script {
                echo "清理环境..."
                
                // 保存测试报告
                sh '''
                    cd test-cases
                    if [ -f "test-report.json" ]; then
                        mkdir -p ../test-reports
                        cp test-report.json ../test-reports/report-${BUILD_ID}.json
                    fi
                '''
                
                // 保存JUnit XML报告（如果存在）
                junit allowEmptyResults: true, testResults: '**/test-cases/junit.xml,**/test-cases/.pytest_cache/**/junit.xml'
            }
        }
        
        success {
            echo "✅ Pipeline执行成功"
        }
        
        failure {
            echo "❌ Pipeline执行失败"
        }
    }
}