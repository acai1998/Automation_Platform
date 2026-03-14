pipeline {
    agent { label 'test-runner' }
    
    parameters {
        string(name: 'RUN_ID', description: '执行批次ID', defaultValue: '')
        string(name: 'CASE_IDS', description: '用例ID列表(JSON)', defaultValue: '[]')
        string(name: 'SCRIPT_PATHS', description: '脚本路径(逗号分隔)', defaultValue: '')
        string(name: 'CALLBACK_URL', description: '回调URL', defaultValue: '')
        string(name: 'MARKER', description: 'Pytest marker标记', defaultValue: '')
        string(name: 'REPO_URL', description: '测试用例仓库URL', defaultValue: '')
    }
    
    environment {
        PLATFORM_API_URL = 'https://autotest.wiac.xyz'
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
                        if (fileExists('test-cases')) {
                            dir('test-cases') {
                                sh 'git pull origin main'
                            }
                        } else {
                            sh "git clone ${params.REPO_URL} test-cases"
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

                    // 定时触发且无参数时，跳过本阶段
                    if (!params.RUN_ID && !params.SCRIPT_PATHS && !params.MARKER) {
                        echo "⚠️ 未传入执行参数（可能是定时触发），跳过准备环境"
                        return
                    }

                    def testDir = params.REPO_URL ? 'test-cases' : '.'
                    sh """
                        if [ ! -d "${testDir}" ]; then
                            echo "❌ 测试目录 '${testDir}' 不存在，请确认 REPO_URL 或代码检出是否成功"
                            exit 1
                        fi
                        cd ${testDir}

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
                    def testCommand = "source ${PYTHON_ENV}/bin/activate && "
                    
                    if (scriptPaths) {
                        def paths = scriptPaths.split(',')
                        testCommand += "pytest ${paths.join(' ')}"
                    } else if (marker) {
                        testCommand += "pytest -m ${marker}"
                    } else {
                        testCommand += "pytest"
                    }
                    testCommand += " --json-report --json-report-file=test-report.json -v"
                    
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
        
        stage('回调平台') {
            steps {
                script {
                    // 回调由 post { always } 统一处理，此阶段仅做日志记录
                    echo "✅ 测试执行完成，回调将在 post 阶段统一处理"
                }
            }
        }

        stage('构建镜像') {
            when {
                expression { return currentBuild.result == 'SUCCESS' }
            }
            steps {
                script {
                    echo "构建Docker镜像并推送到阿里云容器镜像服务..."

                    def dockerRegistry = "crpi-dytkl1o45qyeksph.cn-hangzhou.personal.cr.aliyuncs.com"
                    def imageRepo = "caijinwei/auto_test"
                    def imageTag = "${BUILD_NUMBER}"
                    def fullImageName = "${dockerRegistry}/${imageRepo}:${imageTag}"

                    try {
                        // 1. 登录阿里云容器镜像服务
                        withCredentials([usernamePassword(credentialsId: 'aliyun-docker', usernameVariable: 'DOCKER_USERNAME', passwordVariable: 'DOCKER_PASSWORD')]) {
                            sh """
                                echo "登录阿里云容器镜像服务..."
                                docker login --username=${DOCKER_USERNAME} --password=${DOCKER_PASSWORD} ${dockerRegistry}
                            """
                        }

                        // 2. 构建Docker镜像
                        echo "构建Docker镜像..."
                        sh """
                            docker build -t ${imageRepo}:${imageTag} .
                        """

                        // 3. 标签镜像
                        echo "为阿里云仓库标签镜像..."
                        sh """
                            docker tag ${imageRepo}:${imageTag} ${fullImageName}
                        """

                        // 4. 推送镜像到阿里云
                        echo "推送镜像到阿里云容器镜像服务..."
                        sh """
                            docker push ${fullImageName}
                        """

                        echo "✅ 镜像构建和推送成功: ${fullImageName}"

                        // 5. 推送到GitHub（强制推送）
                        echo "推送代码到GitHub..."
                        withCredentials([usernamePassword(credentialsId: 'git-credentials', usernameVariable: 'GIT_USER', passwordVariable: 'GIT_PASS')]) {
                            sh """
                                git push https://${GIT_USER}:${GIT_PASS}@github.com/ImAcaiy/Automation_Platform.git HEAD:master --force
                                echo "✅ GitHub推送成功"
                            """
                        }
                    } catch (Exception e) {
                        echo "❌ 镜像构建或推送失败: ${e.message}"
                        currentBuild.result = 'FAILURE'
                        throw e
                    }
                }
            }
        }

    }
    
    post {
        always {
            script {
                    echo "清理环境..."

                    def testDir = params.REPO_URL ? 'test-cases' : '.'
                    def reportArtifactPath = "${testDir}/test-report.json"
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
                    } catch (Exception e) {
                        echo "JUnit报告处理失败: ${e.message}"
                    }

                    // 最终回调 - 确保状态同步
                    if (params.RUN_ID) {
                        echo "========== 最终回调 =========="
                        // CALLBACK_URL 由服务端构造，已包含完整路径（含 /api/jenkins/callback）
                        // 若未传入则使用平台默认回调地址
                        def callbackUrl = params.CALLBACK_URL ?: "${env.PLATFORM_API_URL}/api/jenkins/callback"
                        def finalStatus = currentBuild.result == 'SUCCESS' ? 'success' : 'failed'
                        def duration = currentBuild.duration ?: 0

                        echo "回调地址: ${callbackUrl}"
                        echo "运行ID: ${params.RUN_ID}"
                        echo "最终状态: ${finalStatus}"
                        echo "执行时长: ${duration}ms"

                        // 解析 test-report.json 获取真实的通过/失败/跳过数量
                        def passedCount = 0
                        def failedCount = 0
                        def skippedCount = 0

                        try {
                            def reportFile = "${testDir}/test-report.json"
                            if (fileExists(reportFile)) {
                                def reportText = readFile(file: reportFile)
                                def report = new groovy.json.JsonSlurperClassic().parseText(reportText)
                                def summary = report?.summary
                                if (summary) {
                                    passedCount = (summary.passed ?: 0) as int
                                    failedCount = ((summary.failed ?: 0) + (summary.error ?: 0)) as int
                                    skippedCount = ((summary.skipped ?: 0) + (summary.deselected ?: 0)) as int
                                    echo "test result: passed=${passedCount}, failed=${failedCount}, skipped=${skippedCount}"
                                } else {
                                    failedCount = (currentBuild.result == 'SUCCESS') ? 0 : 1
                                }
                            } else {
                                failedCount = (currentBuild.result == 'SUCCESS') ? 0 : 1
                            }
                        } catch (Exception parseErr) {
                            failedCount = (currentBuild.result == 'SUCCESS') ? 0 : 1
                        }

                        // 构建每条用例的详细结果列表（从 test-report.json 解析）
                        def resultsJson = "[]"
                        try {
                            def reportFile = "${testDir}/test-report.json"
                            if (fileExists(reportFile)) {
                                def reportText = readFile(file: reportFile)
                                def report = new groovy.json.JsonSlurperClassic().parseText(reportText)
                                def tests = report?.tests
                                if (tests) {
                                    def resultsList = []
                                    tests.each { t ->
                                        def testStatus = t.outcome ?: 'failed'
                                        // pytest outcome: passed/failed/error/skipped
                                        if (testStatus == 'error') testStatus = 'failed'
                                        def durationMs = t.call?.duration != null ? (t.call.duration * 1000).toLong() : 0
                                        // pytest-json-report 时间字段为 Unix 秒（浮点），乘以 1000 得毫秒
                                        def startSec = t.setup?.start ?: t.call?.start
                                        def stopSec  = t.teardown?.stop ?: t.call?.stop
                                        def startMs  = startSec != null ? (startSec * 1000).toLong() : null
                                        def endMs    = stopSec  != null ? (stopSec  * 1000).toLong() : null
                                        // 提取 case_name（去掉模块路径，只保留函数名）
                                        def caseName = t.nodeid ?: 'unknown'
                                        if (caseName.contains('::')) {
                                            caseName = caseName.split('::').last()
                                        }
                                        // 提取错误信息
                                        def errMsg = ''
                                        if (t.call?.longrepr) {
                                            errMsg = t.call.longrepr.toString().take(500).replace('"', '\\"').replace('\n', '\\n').replace('\r', '')
                                        }
                                        resultsList << """{
                                            "caseName": "${caseName}",
                                            "status": "${testStatus}",
                                            "duration": ${durationMs},
                                            "startTime": ${startMs},
                                            "endTime": ${endMs},
                                            "errorMessage": "${errMsg}"
                                        }"""
                                    }
                                    if (resultsList) {
                                        resultsJson = "[${resultsList.join(',')}]"
                                    }
                                }
                            }
                        } catch (Exception parseErr) {
                            echo "⚠️ Failed to parse test results: ${parseErr.message}"
                        }

                        // use curl to send callback（含每条用例详情）
                        try {
                            // 写入临时文件避免 shell 参数过长
                            def payloadFile = "${WORKSPACE}/callback_payload.json"
                            writeFile file: payloadFile, text: """{"runId": ${params.RUN_ID}, "status": "${finalStatus}", "passedCases": ${passedCount}, "failedCases": ${failedCount}, "skippedCases": ${skippedCount}, "durationMs": ${duration}, "results": ${resultsJson}}"""
                            sh """
                                curl -X POST '${callbackUrl}' \\
                                    -H 'Content-Type: application/json' \\
                                    --connect-timeout 10 \\
                                    --max-time 30 \\
                                    -L \\
                                    -k \\
                                    -d @${payloadFile} \\
                                    || echo '❌ curl callback failed'
                            """
                            echo "✅ Callback sent (passed=${passedCount}, failed=${failedCount}, skipped=${skippedCount}, results=${resultsJson.size()}chars)"
                        } catch (Exception e) {
                            echo "⚠️ Callback failed: ${e.message}"
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

                // 回调平台，标记为失败
                if (params.RUN_ID && params.CALLBACK_URL) {
                    def duration = currentBuild.duration ?: 0
                    // CALLBACK_URL 由服务端构造，已包含完整路径（含 /api/jenkins/callback）
                    sh """
                        echo "正在回调失败状态到平台..."
                        curl -X POST '${params.CALLBACK_URL}' \\
                            -H 'Content-Type: application/json' \\
                            --connect-timeout 10 \\
                            --max-time 30 \\
                            -L \\
                            -k \\
                            -d '{"runId": ${params.RUN_ID}, "status": "failed", "passedCases": 0, "failedCases": 0, "skippedCases": 0, "durationMs": ${duration}, "buildUrl": "${BUILD_URL}"}' \\
                            || echo "失败回调请求失败，但继续处理"
                    """
                }
            }
        }
    }
}
