pipeline {
    agent none

    parameters {
        string(name: 'RUN_ID',       description: '执行批次ID',        defaultValue: '')
        string(name: 'CASE_IDS',     description: '用例ID列表(JSON)',   defaultValue: '[]')
        string(name: 'SCRIPT_PATHS', description: '脚本路径(逗号分隔)', defaultValue: '')
        string(name: 'CALLBACK_URL', description: '回调URL',            defaultValue: '')
        string(name: 'MARKER',       description: 'Pytest marker标记',  defaultValue: '')
        string(name: 'REPO_URL',     description: '测试用例仓库URL',    defaultValue: '')
        string(name: 'REPO_BRANCH',  description: '测试用例仓库分支',   defaultValue: 'master')
    }

    environment {
        PLATFORM_API_URL  = 'https://autotest.wiac.xyz'
        // 测试执行镜像：包含 Python + Chrome + ChromeDriver + 基础依赖
        // 测试代码在运行时 git clone，不打包进镜像
        TEST_RUNNER_IMAGE = 'docker.cnb.cool/imacaiy/seleniumbase-ci:latest'
        // 运行时动态选择的执行节点（默认 master）
        EXEC_NODE         = 'master'
        // master 等待超时时间（秒），超时后自动切换到 Agent-node-2
        NODE_SWITCH_TIMEOUT_SECONDS = '20'
    }

    options {
        buildDiscarder(logRotator(numToKeepStr: '20'))
        timeout(time: 60, unit: 'MINUTES')
        disableConcurrentBuilds()
    }

    stages {

        // ── Stage 1: 选择执行节点 ─────────────────────────────────────────────
        stage('选择执行节点') {
            agent none
            steps {
                script {
                    def preferredNode = 'master'
                    def fallbackNode  = 'Agent-node-2'
                    def timeoutSec    = (env.NODE_SWITCH_TIMEOUT_SECONDS ?: '20') as Integer

                    env.EXEC_NODE = preferredNode
                    try {
                        timeout(time: timeoutSec, unit: 'SECONDS') {
                            node(preferredNode) {
                                echo "✅ master 节点可用，将优先在 master 执行"
                            }
                        }
                    } catch (Throwable t) {
                        echo "⚠️ master 在 ${timeoutSec}s 内不可用，切换到 ${fallbackNode}: ${t.message}"
                        env.EXEC_NODE = fallbackNode
                    }
                    echo "本次流水线执行节点: ${env.EXEC_NODE}"
                }
            }
        }

        // ── Stage 2: 执行测试 ─────────────────────────────────────────────────
        //
        // 使用预构建的 test-runner 镜像替代原有的：
        //   - '安装 ChromeDriver' stage（140 行 shell）
        //   - '准备环境' stage（建 venv / pip install / 同步 driver）
        //   - '检出代码' stage（git clone）
        //
        // 镜像内已包含：Python 3.11 + Google Chrome + ChromeDriver + pytest + seleniumbase
        // 镜像在启动时负责：git clone 测试仓库 → 安装仓库依赖 → 执行 pytest → 回调平台
        // ─────────────────────────────────────────────────────────────────────
        stage('执行测试') {
            agent { label "${env.EXEC_NODE}" }
            steps {
                script {
                    if (!params.RUN_ID && !params.SCRIPT_PATHS && !params.MARKER) {
                        echo "⚠️ 未传入执行参数（可能是定时触发），跳过执行测试"
                        return
                    }

                    def callbackUrl = params.CALLBACK_URL ?: "${env.PLATFORM_API_URL}/api/jenkins/callback"
                    def reportDir   = "${env.WORKSPACE}/reports"
                    sh "mkdir -p ${reportDir}"

                    // 登录制品库（拉取私有镜像）
                    withCredentials([string(credentialsId: 'CNB_DOCKER_TOKEN', variable: 'CNB_TOKEN')]) {
                        sh 'echo "$CNB_TOKEN" | docker login docker.cnb.cool -u cnb --password-stdin'
                    }

                    def testExitCode = sh(
                        script: """
                            docker run --rm \\
                                --shm-size=2g \\
                                -e RUN_ID="${params.RUN_ID}" \\
                                -e PLATFORM_URL="${env.PLATFORM_API_URL}" \\
                                -e REPO_URL="${params.REPO_URL}" \\
                                -e REPO_BRANCH="${params.REPO_BRANCH ?: 'master'}" \\
                                -e SCRIPT_PATHS="${params.SCRIPT_PATHS}" \\
                                -e MARKER="${params.MARKER}" \\
                                -e CALLBACK_URL="${callbackUrl}" \\
                                -v ${reportDir}:/workspace \\
                                ${TEST_RUNNER_IMAGE}
                        """,
                        returnStatus: true
                    )

                    writeFile file: "${env.WORKSPACE}/pytest_exit_code.txt", text: "${testExitCode}\n"

                    if (testExitCode != 0) {
                        currentBuild.result = 'FAILURE'
                        echo "❌ 测试执行失败，exitCode=${testExitCode}"
                    } else {
                        echo "✅ 测试执行成功"
                    }
                }
            }
        }

        // ── Stage 3: 归档报告 ─────────────────────────────────────────────────
        //
        // test-report.json / junit.xml 由 entrypoint.sh 写入 /workspace（挂载到 ${reportDir}）
        // 此处直接归档，无需再从测试目录拷贝
        // ─────────────────────────────────────────────────────────────────────
        stage('归档报告') {
            agent { label "${env.EXEC_NODE}" }
            steps {
                script {
                    if (!params.RUN_ID && !params.SCRIPT_PATHS && !params.MARKER) {
                        echo "⚠️ 无测试产物需要归档"
                        return
                    }

                    try {
                        archiveArtifacts artifacts: 'reports/test-report.json',
                            allowEmptyArchive: true, fingerprint: true
                        echo "✅ 测试报告已归档"
                    } catch (Exception e) {
                        echo "⚠️ 归档测试报告失败（非致命）: ${e.message}"
                    }

                    try {
                        junit allowEmptyResults: true, testResults: 'reports/junit.xml'
                    } catch (Throwable t) {
                        echo "⚠️ JUnit 报告处理失败（非致命）: ${t.message}"
                    }
                }
            }
        }
    }

    post {
        always {
            script {
                // 登出制品库，清理凭据
                sh 'docker logout docker.cnb.cool || true'

                // entrypoint.sh 已在容器内完成平台回调
                // 若容器异常崩溃导致回调丢失，平台侧的 ExecutionMonitorService + fallback sync 会兜底
                echo "Pipeline 执行完成，最终状态: ${currentBuild.currentResult}"
            }
        }
        success {
            echo "✅ Pipeline 执行成功"
        }
        failure {
            echo "❌ Pipeline 执行失败"
        }
    }
}
