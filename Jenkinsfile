pipeline {
    agent any
    
    parameters {
        string(name: 'RUN_ID', description: '执行批次ID', defaultValue: '')
        string(name: 'CASE_IDS', description: '用例ID列表(JSON)', defaultValue: '[]')
        string(name: 'SCRIPT_PATHS', description: '脚本路径(逗号分隔)', defaultValue: '')
        string(name: 'CALLBACK_URL', description: '回调URL', defaultValue: '')
        string(name: 'MARKER', description: 'Pytest marker标记', defaultValue: '')
        string(name: 'REPO_URL', description: '测试用例仓库URL', defaultValue: '')
    }
    
    environment {
        GIT_CREDENTIALS = credentials('git-credentials')
        PLATFORM_API_URL = 'http://localhost:3000'
        JENKINS_API_KEY = '3512fc38e1882a9ad2ab88c436277c129517e24a76daad1849ef419f90fd8a4f'
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
                    
                    if (params.REPO_URL) {
                        if (fileExists('test-cases')) {
                            dir('test-cases') {
                                sh 'git pull origin main'
                            }
                        } else {
                            sh 'git clone ${params.REPO_URL} test-cases'
                        }
                    } else {
                        echo "⚠️ 警告：REPO_URL 未设置，跳过代码检出"
                        echo "使用默认的测试用例目录"
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
                                -H "X-Api-Key: ${JENKINS_API_KEY}" \
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
            node {
                script {
                    echo "清理环境..."
                    
                    try {
                        archiveArtifacts artifacts: 'test-cases/test-report.json', allowEmptyArchive: true, fingerprint: true
                        echo "测试报告已归档"
                    } catch (Exception e) {
                        echo "归档测试报告失败: ${e.message}"
                    }
                    
                    try {
                        junit allowEmptyResults: true, testResults: '**/test-cases/junit.xml,**/test-cases/.pytest_cache/**/junit.xml'
                    } catch (Exception e) {
                        echo "JUnit报告处理失败: ${e.message}"
                    }
                    
                    // 最终回调 - 确保状态同步
                    if (params.RUN_ID) {
                        echo "========== 最终回调 =========="
                        def callbackUrl = params.CALLBACK_URL ?: "${env.PLATFORM_API_URL}/api/jenkins/callback"
                        def finalStatus = currentBuild.result == 'SUCCESS' ? 'success' : 'failed'
                        
                        echo "回调地址: ${callbackUrl}"
                        echo "运行ID: ${params.RUN_ID}"
                        echo "最终状态: ${finalStatus}"
                        
                        // 尝试使用 httpRequest 插件(如果可用)
                        try {
                            def callbackData = [
                                runId: params.RUN_ID.toInteger(),
                                status: finalStatus,
                                passedCases: 0,
                                failedCases: currentBuild.result == 'SUCCESS' ? 0 : 1,
                                skippedCases: 0,
                                durationMs: currentBuild.durationMillis ?: 0
                            ]
                            
                            httpRequest(
                                url: callbackUrl,
                                httpMode: 'POST',
                                contentType: 'APPLICATION_JSON',
                                customHeaders: [[name: 'X-Api-Key', value: env.JENKINS_API_KEY]],
                                requestBody: groovy.json.JsonOutput.toJson(callbackData),
                                validResponseCodes: '200:299',
                                ignoreSslErrors: true
                            )
                            echo "✅ httpRequest 回调成功"
                        } catch (Exception e) {
                            echo "⚠️ httpRequest 插件不可用或失败: ${e.message}"
                            echo "使用 curl 进行回调..."
                            
                            // 回退到 curl
                            sh """
                                curl -X POST '${callbackUrl}' \
                                    -H 'Content-Type: application/json' \
                                    -H 'X-Api-Key: ${env.JENKINS_API_KEY}' \
                                    -d '{
                                        "runId": ${params.RUN_ID},
                                        "status": "${finalStatus}",
                                        "passedCases": 0,
                                        "failedCases": ${currentBuild.result == 'SUCCESS' ? 0 : 1},
                                        "skippedCases": 0,
                                        "durationMs": ${currentBuild.durationMillis ?: 0}
                                    }' \
                                    || echo '❌ curl 回调失败'
                            """
                        }
                        echo "==============================="
                    }
                }
            }
        }
        
        success {
            node {
                script {
                    echo "✅ Pipeline执行成功"
                }
            }
        }
        
        failure {
            node {
                script {
                    echo "❌ Pipeline执行失败"
                    
                    // 回调平台，标记为失败
                    if (params.RUN_ID && params.CALLBACK_URL) {
                        sh '''
                            BUILD_DURATION_MS=$((BUILD_DURATION * 1000))
                            
                            echo "正在回调失败状态到平台..."
                            curl -X POST "${CALLBACK_URL}" \
                                -H "Content-Type: application/json" \
                                -H "X-Api-Key: ${JENKINS_API_KEY}" \
                                -d "{
                                    \"runId\": ${RUN_ID},
                                    \"status\": \"failed\",
                                    \"passedCases\": 0,
                                    \"failedCases\": 0,
                                    \"skippedCases\": 0,
                                    \"durationMs\": $BUILD_DURATION_MS,
                                    \"buildUrl\": \"${BUILD_URL}\"
                                }" \
                                || echo "失败回调请求失败，但继续处理"
                        '''
                    }
                }
            }
        }
    }
}
