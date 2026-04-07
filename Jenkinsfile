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
        string(name: 'PARALLEL_WORKERS', description: '并发进程数（0=禁用串行执行，auto=按CPU核数，N=指定数量）', defaultValue: 'auto')
        booleanParam(name: 'FORCE_PULL_IMAGE', description: '强制重新拉取测试镜像（镜像有更新时勾选）', defaultValue: false)
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
        // 只保留最近 10 次构建记录，制品只保留 5 次，减少 JENKINS_HOME 磁盘占用
        buildDiscarder(logRotator(
            numToKeepStr:         '10',
            artifactNumToKeepStr: '5',
            daysToKeepStr:        '30',
            artifactDaysToKeepStr:'7'
        ))
        timeout(time: 60, unit: 'MINUTES')
        disableConcurrentBuilds()
        // 每次构建前清理 workspace，确保拉取最新 Jenkinsfile
        skipDefaultCheckout(false)
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
                // 清理旧 workspace，确保 checkout 到最新代码
                cleanWs()
                checkout scm
                script {
                    if (!params.RUN_ID && !params.SCRIPT_PATHS && !params.MARKER) {
                        echo "⚠️ 未传入执行参数（可能是定时触发），跳过执行测试"
                        return
                    }

                    def callbackUrl = params.CALLBACK_URL ?: "${env.PLATFORM_API_URL}/api/jenkins/callback"
                    def reportDir   = "${env.WORKSPACE}/reports"
                    sh "mkdir -p ${reportDir}"

                    // 登录制品库（拉取私有镜像）
                    // CNB_DOCKER_TOKEN：Jenkins → Manage Jenkins → Credentials → 添加 Secret text，ID 填 CNB_DOCKER_TOKEN
                    // 使用 binding plugin 检测凭据是否存在，避免 withCredentials 找不到凭据时直接终止 stage
                    def hasDockerToken = false
                    try {
                        // Jenkins 中判断凭据是否存在：尝试 lookup，失败则跳过
                        def cred = com.cloudbees.plugins.credentials.CredentialsProvider.lookupCredentials(
                            com.cloudbees.plugins.credentials.common.StandardCredentials,
                            Jenkins.instance, null, null
                        ).find { it.id == 'CNB_DOCKER_TOKEN' }
                        hasDockerToken = (cred != null)
                    } catch (Exception e) {
                        echo "⚠️ 凭据检测异常，跳过: ${e.message}"
                    }

                    if (hasDockerToken) {
                        withCredentials([string(credentialsId: 'CNB_DOCKER_TOKEN', variable: 'CNB_TOKEN')]) {
                            sh 'echo "$CNB_TOKEN" | docker login docker.cnb.cool -u cnb --password-stdin'
                        }
                    } else {
                        echo "⚠️ 凭据 CNB_DOCKER_TOKEN 未配置，跳过制品库登录（如镜像为私有请先添加凭据）"
                    }

                    // ── 镜像预热：本地已有则跳过 pull；FORCE_PULL_IMAGE=true 时强制更新 ──
                    def forcePull = params.FORCE_PULL_IMAGE == true
                    sh """
                        echo "docker-pull check: \$(date '+%H:%M:%S')  force=${forcePull}"
                        if [ "${forcePull}" = "true" ]; then
                            echo "强制拉取模式，开始 docker pull..."
                            docker pull ${TEST_RUNNER_IMAGE} || echo "WARNING: image pull failed"
                            echo "docker-pull done:  \$(date '+%H:%M:%S')"
                        elif docker image inspect ${TEST_RUNNER_IMAGE} > /dev/null 2>&1; then
                            echo "✅ 镜像已存在，跳过 pull（镜像有更新时请勾选 FORCE_PULL_IMAGE 参数）"
                        else
                            echo "镜像不存在，开始拉取..."
                            docker pull ${TEST_RUNNER_IMAGE} || echo "WARNING: image pull failed"
                            echo "docker-pull done:  \$(date '+%H:%M:%S')"
                        fi
                    """

                    // ── 将环境变量写入临时文件，再通过 --env-file 传给容器 ──────────────────
                    // 直接在 shell 命令字符串中嵌入参数值（GString 插值）会导致：
                    //   SCRIPT_PATHS / MARKER 等值含双引号 " 时破坏 shell 命令结构
                    //   值含换行符时导致 shell 解析错误
                    // --env-file 方式：每行 KEY=VALUE，docker 原生支持，完全规避 shell 展开
                    def envFile = "${reportDir}/.docker_env"
                    // writeFile 写入 Groovy 字符串，不经过 shell，值中的特殊字符不会被展开
                    writeFile file: envFile, text: [
                        "RUN_ID=${params.RUN_ID}",
                        "PLATFORM_URL=${env.PLATFORM_API_URL}",
                        "REPO_URL=${params.REPO_URL ?: ''}",
                        "REPO_BRANCH=${params.REPO_BRANCH ?: 'master'}",
                        "SCRIPT_PATHS=${params.SCRIPT_PATHS ?: ''}",
                        "MARKER=${params.MARKER ?: ''}",
                        "PARALLEL_WORKERS=${params.PARALLEL_WORKERS ?: 'auto'}",
                        "CALLBACK_URL=${callbackUrl}",
                    ].join('\n') + '\n'

                    echo "[${new Date().format('HH:mm:ss')}] docker-run start"
                    def testExitCode = 1
                    try {
                        testExitCode = sh(
                            script: """
                                docker run --rm \\
                                    --shm-size=2g \\
                                    --env-file "${envFile}" \\
                                    -v ${reportDir}:/workspace \\
                                    ${TEST_RUNNER_IMAGE}
                            """,
                            returnStatus: true
                        )
                    } finally {
                        // 无论成功失败都清理含凭据信息的临时文件
                        sh "rm -f '${envFile}' || true"
                    }
                    echo "[${new Date().format('HH:mm:ss')}] docker-run done, exitCode=${testExitCode}"

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

        // ── Stage 4: 清理工作空间 ───────────────────────────────────────────────
        stage('清理工作空间') {
            agent { label "${env.EXEC_NODE}" }
            steps {
                script {
                    // 清理 Docker 悬空资源，释放磁盘空间
                    sh '''
                        echo "🧹 清理 Docker 悬空镜像（dangling）..."
                        docker image prune -f || true

                        echo "🧹 清理已停止的容器..."
                        docker container prune -f || true

                        echo "🧹 清理未使用的 Docker 构建缓存..."
                        docker builder prune -f --filter until=24h || true

                        echo "📊 Docker 磁盘占用:"
                        docker system df || true
                    '''
                    // 清理 workspace，避免残留文件堆积
                    cleanWs()
                    echo "✅ 工作空间清理完成"
                }
            }
        }
    }

    post {
        always {
            script {
                // post.always 在 agent none 下没有默认 node，需显式指定节点才能执行 sh
                node(env.EXEC_NODE ?: 'master') {
                    sh 'docker logout docker.cnb.cool || true'
                    // 无论成功失败，都清理 workspace 避免磁盘堆积
                    cleanWs()
                }
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