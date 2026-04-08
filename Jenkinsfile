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
        string(name: 'PARALLEL_WORKERS', description: '并发进程数（N=指定数量，0或空=串行）headless2模式下每Chrome约250MB，建议master填3，Agent-node-2填4', defaultValue: '3')
        booleanParam(name: 'FORCE_PULL_IMAGE', description: '强制重新拉取测试镜像（镜像有更新时勾选）', defaultValue: false)
    }

    environment {
        PLATFORM_API_URL  = 'https://autotest.wiac.xyz'
        // 测试执行镜像：包含 Python + Chrome + ChromeDriver + 基础依赖
        // 测试代码在运行时 git clone，不打包进镜像
        TEST_RUNNER_IMAGE = 'docker.cnb.cool/imacaiy/seleniumbase-ci:latest'
        // 执行节点 label，Stage 1 中设置为 'test-runner'，Jenkins 自动负载均衡
        EXEC_NODE         = 'test-runner'
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
        // ❌ 移除 disableConcurrentBuilds()：
        // 该选项把同一 Job 的所有构建全局串行，导致任务全部堆积在队列里，
        // Agent-node-2 永远空闲。多构建并发由"项目配置 → 并发构建数"控制即可。
        skipDefaultCheckout(true)  // 优化：禁用默认 checkout，仅在执行节点按需 checkout
    }

    stages {

        // ── Stage 1: 选择执行节点 ─────────────────────────────────────────────
        // 新策略：不再手动抢占节点，使用 label 让 Jenkins 调度器自动分配空闲节点
        // 前提：在 Jenkins 节点管理中为 master 和 Agent-node-2 均添加标签 "test-runner"
        //   管理 Jenkins → 节点管理 → 对应节点 → 标签 (Labels) 填入: test-runner
        stage('选择执行节点') {
            agent none
            steps {
                script {
                    // 使用 label 表达式：任一拥有 test-runner 标签的节点即可承接
                    // Jenkins 调度器会自动分配空闲节点，实现真正的负载均衡
                    env.EXEC_NODE = 'test-runner'
                    echo "本次构建将被调度到任意可用的 test-runner 节点（master / Agent-node-2）"
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
                // skipDefaultCheckout(true) 后需手动 checkout
                // Git 增量更新：有变化才真正传输，没变化几乎零耗时
                checkout scm
                script {
                    if (!params.RUN_ID && !params.SCRIPT_PATHS && !params.MARKER) {
                        echo "⚠️ 未传入执行参数（可能是定时触发），跳过执行测试"
                        return
                    }

                    def callbackUrl = params.CALLBACK_URL ?: "${env.PLATFORM_API_URL}/api/jenkins/callback"
                    def reportDir   = "${env.WORKSPACE}/reports"
                    def repoDir     = "${env.WORKSPACE}/test-repo"
                    def repoBranch  = params.REPO_BRANCH ?: 'master'
                    def repoUrl     = params.REPO_URL ?: ''

                    sh "mkdir -p ${reportDir}"

                    // ── 宿主机增量同步测试仓库（替代容器内 git clone，节省 10~30s）──
                    // 首次：git clone；后续：git fetch + reset，秒级完成
                    if (repoUrl) {
                        sh """
                            if [ -d "${repoDir}/.git" ]; then
                                echo "📦 增量更新测试仓库..."
                                git -C "${repoDir}" fetch --depth=1 origin ${repoBranch}
                                git -C "${repoDir}" reset --hard origin/${repoBranch}
                            else
                                echo "📦 首次克隆测试仓库..."
                                git clone --depth=1 -b ${repoBranch} ${repoUrl} "${repoDir}"
                            fi
                        """
                    }

                    // 登录制品库（拉取私有镜像）
                    // CNB_DOCKER_TOKEN：Jenkins → Manage Jenkins → Credentials → 添加 Secret text，ID 填 CNB_DOCKER_TOKEN
                    // 使用 binding plugin 检测凭据是否存在，避免 withCredentials 找不到凭据时直接终止 stage
                    // 直接用 withCredentials + optional=true（Jenkins 2.359+）
                    // 凭据不存在时静默跳过，无需调用被沙箱拦截的 Jenkins.getInstance()
                    try {
                        withCredentials([string(credentialsId: 'CNB_DOCKER_TOKEN', variable: 'CNB_TOKEN', optional: true)]) {
                            if (env.CNB_TOKEN) {
                                sh 'echo "$CNB_TOKEN" | docker login docker.cnb.cool -u cnb --password-stdin'
                            } else {
                                echo "⚠️ 凭据 CNB_DOCKER_TOKEN 未配置，跳过制品库登录"
                            }
                        }
                    } catch (Exception e) {
                        echo "⚠️ Docker 登录跳过: ${e.message}"
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
                    // REPO_PRELOADED=true 时，entrypoint.sh 跳过 git clone，直接用 /repo 目录
                    def repoPreloaded = (repoUrl && new File(repoDir + "/.git").exists()) ? 'true' : 'false'
                    writeFile file: envFile, text: [
                        "RUN_ID=${params.RUN_ID}",
                        "PLATFORM_URL=${env.PLATFORM_API_URL}",
                        "REPO_URL=${repoUrl}",
                        "REPO_BRANCH=${repoBranch}",
                        "SCRIPT_PATHS=${params.SCRIPT_PATHS ?: ''}",
                        "MARKER=${params.MARKER ?: ''}",
                        "PARALLEL_WORKERS=${params.PARALLEL_WORKERS ?: 'auto'}",
                        "CALLBACK_URL=${callbackUrl}",
                        "REPO_PRELOADED=${repoPreloaded}",
                    ].join('\n') + '\n'

                    echo "[${new Date().format('HH:mm:ss')}] docker-run start"
                    def testExitCode = 1
                    // 若宿主机已预加载测试仓库，挂载 repoDir 到容器 /repo，entrypoint 可跳过 clone
                    def repoMount = (repoUrl) ? "-v ${repoDir}:/repo" : ''
                    try {
                        testExitCode = sh(
                            script: """
                                docker run --rm \\
                                    --shm-size=2g \\
                                    --env-file "${envFile}" \\
                                    -v ${reportDir}:/workspace \\
                                    ${repoMount} \\
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
                    // 保留 test-repo 目录（下次构建增量 git fetch，节省 clone 时间）
                    // 只清理 reports/、Automation_Platform 代码等本次构建产物
                    cleanWs(patterns: [
                        [pattern: 'test-repo/**', type: 'EXCLUDE'],
                        [pattern: 'test-repo',    type: 'EXCLUDE'],
                    ])
                    echo "✅ 工作空间清理完成（test-repo 已保留用于下次增量更新）"
                }
            }
        }
    }

    post {
        always {
            script {
                // post.always 必须显式指定 node；用 master 确保 docker 命令可用
                // Agent-node-2 可能未安装 docker，不在 post 里用 EXEC_NODE
                // 用 EXEC_NODE 或 built-in 兜底；Jenkins 2.307+ master 节点改名为 built-in
                node(env.EXEC_NODE ?: 'built-in') {
                    sh 'docker logout docker.cnb.cool || true'
                    // 保留 test-repo（增量更新缓存），清理其余产物
                    cleanWs(patterns: [
                        [pattern: 'test-repo/**', type: 'EXCLUDE'],
                        [pattern: 'test-repo',    type: 'EXCLUDE'],
                    ])
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