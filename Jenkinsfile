pipeline {
    agent { label 'test-runner' }
    
    parameters {
        string(name: 'RUN_ID', description: '执行批次ID', defaultValue: '')
        string(name: 'CASE_IDS', description: '用例ID列表(JSON)', defaultValue: '[]')
        string(name: 'SCRIPT_PATHS', description: '脚本路径(逗号分隔)', defaultValue: '')
        string(name: 'CALLBACK_URL', description: '回调URL', defaultValue: '')
        string(name: 'MARKER', description: 'Pytest marker标记', defaultValue: '')
        string(name: 'REPO_URL', description: '测试用例仓库URL', defaultValue: '')
        string(name: 'REPO_BRANCH', description: '测试用例仓库分支', defaultValue: 'main')
    }
    
    environment {
        PLATFORM_API_URL = 'https://autotest.wiac.xyz'
        // 使用固定路径存放 venv，避免 Jenkins 并发分配 @2/@3 workspace 时重复创建
        PYTHON_ENV = "/home/jenkins/shared-venv/SeleniumBaseCi"
    }

    options {
        buildDiscarder(logRotator(numToKeepStr: '20'))
        timeout(time: 60, unit: 'MINUTES')
        disableConcurrentBuilds()
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
                    
                    // 标记执行开始
                    if (params.RUN_ID) {
                        sh """
                            curl -X POST "${PLATFORM_API_URL}/api/executions/${params.RUN_ID}/start" \\
                                -H 'Content-Type: application/json' \\
                                --connect-timeout 5 \\
                                --max-time 10 \\
                                -L -k || echo '⚠️ 标记执行开始失败，继续处理'
                        """
                    }
                }
            }
        }
        
        stage('检出代码') {
            steps {
                script {
                    echo "正在克隆/更新测试用例仓库..."
                    
                    if (params.REPO_URL) {
                        def branch = params.REPO_BRANCH ?: 'main'
                        if (fileExists('test-cases')) {
                            dir('test-cases') {
                                sh "git pull origin ${branch}"
                            }
                        } else {
                            // 使用 --single-branch 加快克隆速度
                            sh "git clone --single-branch --branch '${branch}' '${params.REPO_URL}' test-cases"
                        }
                    } else {
                        echo "⚠️ 警告：REPO_URL 未设置，跳过代码检出，使用当前 workspace 目录"
                    }
                }
            }
        }
        
        stage('准备环境') {
            steps {
                script {
                    echo "准备Python环境..."

                    // 定时触发且无参数时，跳过本阶段
                    if (!params.RUN_ID && !params.SCRIPT_PATHS && !params.MARKER) {
                        echo "⚠️ 未传入执行参数（可能是定时触发），跳过准备环境"
                        return
                    }

                    def testDir = params.REPO_URL ? 'test-cases' : '.'
                    sh """
                        set -e
                        if [ ! -d "${testDir}" ]; then
                            echo "❌ 测试目录 '${testDir}' 不存在，请确认 REPO_URL 或代码检出是否成功"
                            exit 1
                        fi

                        # 检查 python3 是否可用
                        if ! command -v python3 >/dev/null 2>&1; then
                            echo "❌ python3 未安装，请在 Agent 节点上安装 python3"
                            echo "   Ubuntu/Debian: apt-get install -y python3 python3-venv"
                            echo "   CentOS/RHEL:   yum install -y python3"
                            exit 1
                        fi

                        # 若 venv 不完整则删除重建
                        if [ ! -f "${PYTHON_ENV}/bin/activate" ]; then
                            echo "创建虚拟环境: ${PYTHON_ENV}"
                            rm -rf ${PYTHON_ENV}
                            python3 -m venv ${PYTHON_ENV} || {
                                echo "❌ 创建虚拟环境失败，可能缺少 python3-venv 模块"
                                echo "   Ubuntu/Debian: apt-get install -y python3-venv"
                                exit 1
                            }
                        fi

                        # 激活虚拟环境并安装依赖（用 . 代替 source，兼容 /bin/sh）
                        . ${PYTHON_ENV}/bin/activate
                        pip install -q pytest pytest-json-report

                        # 列出可用的测试文件（排除 venv 目录）
                        echo "可用的测试文件:"
                        find ${testDir} -path ${PYTHON_ENV} -prune -o -name "test_*.py" -print -o -name "*_test.py" -print | head -20
                    """
                }
            }
        }
        
        stage('执行测试') {
            steps {
                script {
                    // 无参数时跳过
                    if (!params.RUN_ID && !params.SCRIPT_PATHS && !params.MARKER) {
                        echo "⚠️ 未传入执行参数，跳过执行测试"
                        return
                    }

                    def testDir = params.REPO_URL ? 'test-cases' : '.'
                    def scriptPaths = params.SCRIPT_PATHS
                    def marker = params.MARKER
                    def testCommand = ". ${PYTHON_ENV}/bin/activate && "
                    
                    if (scriptPaths) {
                        def paths = scriptPaths.split(',').collect { it.trim() }
                        testCommand += "pytest ${paths.join(' ')}"
                    } else if (marker) {
                        testCommand += "pytest -m '${marker}'"
                    } else {
                        testCommand += "pytest"
                    }
                    testCommand += " --json-report --json-report-file=test-report.json --junitxml=junit.xml -v"
                    
                    sh """
                        cd ${testDir}
                        ${testCommand} || true
                    """
                }
            }
        }
        
        stage('收集结果') {
            steps {
                script {
                    echo "收集测试结果..."

                    if (!params.RUN_ID && !params.SCRIPT_PATHS && !params.MARKER) {
                        echo "⚠️ 未传入执行参数，跳过收集结果"
                        return
                    }

                    def testDir = params.REPO_URL ? 'test-cases' : '.'
                    sh """
                        cd ${testDir}
                        if [ -f "test-report.json" ]; then
                            cat test-report.json
                        else
                            echo "未生成详细报告"
                        fi
                    """
                }
            }
        }
    }
    
    post {
        always {
            script {
                echo "清理环境..."

                def testDir = params.REPO_URL ? 'test-cases' : '.'
                def reportArtifactPath = testDir == 'test-cases' ? 'test-cases/test-report.json' : 'test-report.json'
                def junitPattern = testDir == 'test-cases'
                    ? '**/test-cases/junit.xml,**/test-cases/.pytest_cache/**/junit.xml'
                    : '**/junit.xml,**/.pytest_cache/**/junit.xml'

                try {
                    archiveArtifacts artifacts: reportArtifactPath, allowEmptyArchive: true, fingerprint: true
                    echo "测试报告已归档"
                } catch (Exception e) {
                    echo "归档测试报告失败: ${e.message}"
                }

                try {
                    junit allowEmptyResults: true, testResults: junitPattern
                } catch (Throwable t) {
                    // 兼容未安装 JUnit 插件的 Jenkins 实例
                    echo "JUnit报告处理失败: ${t.message}"
                }

                // 最终回调 - 统一在 always 中处理，避免 failure 块重复回调
                if (params.RUN_ID) {
                    echo "========== 最终回调 =========="
                    def callbackUrl = params.CALLBACK_URL ?: "${env.PLATFORM_API_URL}/api/jenkins/callback"
                    // 使用 currentResult 而非 result，避免 always 执行时 result 为 null
                    def finalStatus = currentBuild.currentResult == 'SUCCESS' ? 'success' : 'failed'
                    def duration = currentBuild.duration ?: 0

                    echo "回调地址: ${callbackUrl}"
                    echo "运行ID: ${params.RUN_ID}"
                    echo "最终状态: ${finalStatus}"
                    echo "执行时长: ${duration}ms"

                    // 一次性读取 test-report.json，同时解析 summary 和 tests
                    def passedCount = 0
                    def failedCount = 0
                    def skippedCount = 0
                    def resultsJson = "[]"

                    try {
                        def reportFile = "${testDir}/test-report.json"
                        if (fileExists(reportFile)) {
                            def report = readJSON(file: reportFile)

                            // 解析 summary
                            def summary = report?.summary
                            if (summary) {
                                passedCount = (summary.passed ?: 0) as int
                                failedCount = ((summary.failed ?: 0) + (summary.error ?: 0)) as int
                                skippedCount = ((summary.skipped ?: 0) + (summary.deselected ?: 0)) as int
                                echo "test result: passed=${passedCount}, failed=${failedCount}, skipped=${skippedCount}"
                            } else {
                                failedCount = (finalStatus == 'failed') ? 1 : 0
                            }

                            // 解析每条用例详情
                            def tests = report?.tests
                            if (tests) {
                                def resultsList = []
                                tests.each { t ->
                                    def testStatus = t.outcome ?: 'failed'
                                    if (testStatus == 'error') testStatus = 'failed'
                                    def durationMs = t.call?.duration != null ? (t.call.duration * 1000).toLong() : 0
                                    def startSec = t.setup?.start ?: t.call?.start
                                    def stopSec  = t.teardown?.stop ?: t.call?.stop
                                    def startMs  = startSec != null ? (startSec * 1000).toLong() : 'null'
                                    def endMs    = stopSec  != null ? (stopSec  * 1000).toLong() : 'null'
                                    // 提取用例名（去掉模块路径，只保留函数名）
                                    def caseName = t.nodeid ?: 'unknown'
                                    if (caseName.contains('::')) {
                                        caseName = caseName.split('::').last()
                                    }
                                    // 安全转义错误信息，防止 JSON 注入
                                    def errMsg = ''
                                    if (t.call?.longrepr) {
                                        errMsg = t.call.longrepr.toString()
                                            .take(500)
                                            .replace('\\', '\\\\')
                                            .replace('"', '\\"')
                                            .replace('\n', '\\n')
                                            .replace('\r', '')
                                            .replace('\t', '\\t')
                                    }
                                    resultsList << """{"caseName":"${caseName}","status":"${testStatus}","duration":${durationMs},"startTime":${startMs},"endTime":${endMs},"errorMessage":"${errMsg}"}"""
                                }
                                if (resultsList) {
                                    resultsJson = "[${resultsList.join(',')}]"
                                }
                            }
                        } else {
                            failedCount = (finalStatus == 'failed') ? 1 : 0
                        }
                    } catch (Exception parseErr) {
                        echo "⚠️ Failed to parse test results: ${parseErr.message}"
                        failedCount = (finalStatus == 'failed') ? 1 : 0
                    }

                    // 发送回调（写入临时文件避免 shell 参数过长）
                    try {
                        def payloadFile = "${WORKSPACE}/callback_payload.json"
                        writeFile file: payloadFile, text: """{"runId":${params.RUN_ID},"status":"${finalStatus}","passedCases":${passedCount},"failedCases":${failedCount},"skippedCases":${skippedCount},"durationMs":${duration},"results":${resultsJson}}"""

                        def callbackExitCode = sh(
                            script: """
                                set +e
                                callback_ok=0
                                attempt=1
                                while [ "\$attempt" -le 3 ]; do
                                    response_file="${WORKSPACE}/callback_response_${BUILD_NUMBER}_\${attempt}.txt"
                                    http_code=\$(curl -sS -o "\${response_file}" -w '%{http_code}' -X POST '${callbackUrl}' \\
                                        -H 'Content-Type: application/json' \\
                                        --connect-timeout 10 \\
                                        --max-time 30 \\
                                        -L --post301 --post302 --post303 -k \\
                                        --data-binary @${payloadFile})
                                    curl_exit=\$?

                                    echo "[callback] attempt=\${attempt}, curl_exit=\${curl_exit}, http_code=\${http_code}"
                                    if [ -f "\${response_file}" ]; then
                                        echo "[callback] response body:"
                                        cat "\${response_file}"
                                        echo ""
                                    fi

                                    if [ "\${curl_exit}" -eq 0 ] && { [ "\${http_code}" = "202" ] || [ "\${http_code}" = "200" ]; }; then
                                        callback_ok=1
                                        break
                                    fi

                                    sleep \$((attempt * 2))
                                    attempt=\$((attempt + 1))
                                done

                                if [ "\${callback_ok}" -ne 1 ]; then
                                    echo "❌ callback request failed after retries"
                                    exit 1
                                fi
                            """,
                            returnStatus: true
                        )

                        if (callbackExitCode == 0) {
                            echo "✅ Callback sent (passed=${passedCount}, failed=${failedCount}, skipped=${skippedCount})"
                        } else {
                            echo "❌ Callback failed after retries, exitCode=${callbackExitCode}"
                        }
                    } catch (Exception e) {
                        echo "⚠️ Callback failed: ${e.message}"
                    } finally {
                        // 清理临时回调文件
                        sh "rm -f ${WORKSPACE}/callback_payload.json ${WORKSPACE}/callback_response_${BUILD_NUMBER}_*.txt || true"
                    }
                    echo "==============================="
                }
            }
        }

        success {
            script {
                echo "✅ Pipeline执行成功"
            }
        }

        failure {
            script {
                echo "❌ Pipeline执行失败"
                // 回调已由 post.always 统一处理，此处不重复发送
            }
        }
    }
}
