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
        PLATFORM_API_URL  = 'https://autotest.wiac.xyz'  // 必须用 HTTPS，避免 nginx 301 导致 curl POST 回调丢失
        TEST_RUNNER_IMAGE = 'docker.cnb.cool/imacaiy/seleniumbase-ci:latest'
        EXEC_NODE         = 'test-runner'  // 拥有该标签的节点均可承接构建
    }

    options {
        buildDiscarder(logRotator(
            numToKeepStr:         '10',
            artifactNumToKeepStr: '5',
            daysToKeepStr:        '30',
            artifactDaysToKeepStr:'7'
        ))
        timeout(time: 60, unit: 'MINUTES')
        skipDefaultCheckout(true)  // 禁用默认 checkout，仅在执行节点按需 checkout
    }

    stages {

        // ── Stage 1: 执行测试 ─────────────────────────────────────────────────
        // EXEC_NODE = 'test-runner'，Jenkins 自动从拥有该标签的节点中分配空闲节点
        // 镜像内已包含：Python 3.11 + Google Chrome + ChromeDriver + pytest + seleniumbase
        stage('执行测试') {
            agent { label "${env.EXEC_NODE}" }
            steps {
                checkout scm  // skipDefaultCheckout 后需手动执行
                script {
                    if (!params.RUN_ID && !params.SCRIPT_PATHS && !params.MARKER) {
                        echo "⚠️ 未传入执行参数（可能是定时触发），跳过执行测试"
                        return
                    }

                    def callbackUrl = (params.CALLBACK_URL ?: "${env.PLATFORM_API_URL}/api/jenkins/callback").trim()
                    // 兼容历史配置：平台域名优先使用 HTTPS，避免回调走 301 或被策略拦截。
                    if (callbackUrl.startsWith('http://autotest.wiac.xyz')) {
                        callbackUrl = callbackUrl.replace('http://', 'https://')
                    }
                    def reportDir   = "${env.WORKSPACE}/reports"
                    def repoDir     = "${env.WORKSPACE}/test-repo"
                    def repoBranch  = params.REPO_BRANCH ?: 'master'
                    def repoUrl     = params.REPO_URL ?: ''

                    sh "mkdir -p ${reportDir}"

                    // 宿主机增量同步：首次 clone，后续 fetch + reset（节省 10~30s）
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

                    // 登录制品库（凭据 CNB_DOCKER_TOKEN 未配置时静默跳过）
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
                        if [ "${forcePull}" = "true" ] || ! docker image inspect ${TEST_RUNNER_IMAGE} > /dev/null 2>&1; then
                            echo "拉取镜像... \$(date '+%H:%M:%S')"
                            docker pull ${TEST_RUNNER_IMAGE} || echo "WARNING: image pull failed"
                        else
                            echo "镜像已存在，跳过 pull（镜像有更新时请勾选 FORCE_PULL_IMAGE 参数）"
                        fi
                    """

                    // 环境变量写入文件后通过 --env-file 传给容器，避免特殊字符破坏 shell 命令
                    def envFile = "${reportDir}/.docker_env"
                    // REPO_PRELOADED=true 时，entrypoint.sh 跳过 git clone，直接用已挂载的 /repo 目录
                    def repoPreloaded = repoUrl
                        ? sh(script: "test -d '${repoDir}/.git' && echo 'true' || echo 'false'", returnStdout: true).trim()
                        : 'false'
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

                    // 清理容器内 /workspace/repo 的宿主机映射路径（即 reportDir/repo）
                    // 避免 entrypoint.sh 在容器内 git clone /workspace/repo 时报 "already exists"
                    // 若目录被历史 root 容器污染，宿主机 rm 可能失败；此时回退到临时容器做 root 清理。
                    sh """
                        rm -rf "${reportDir}/repo" || true
                        if [ -d "${reportDir}/repo" ]; then
                            echo "⚠️ 宿主机清理 ${reportDir}/repo 失败，尝试容器内 root 清理"
                            docker run --rm -v "${reportDir}:/workspace" alpine:3.20 rm -rf /workspace/repo
                        fi
                    """

                    echo "[${new Date().format('HH:mm:ss')}] docker-run start"
                    def testExitCode = 1
                    def repoMount = repoUrl ? "-v ${repoDir}:/repo" : ''
                    try {
                        testExitCode = sh(
                            script: """
                                docker run --rm \\
                                    --shm-size=2g \\
                                    --user "\$(id -u):\$(id -g)" \\
                                    --env-file "${envFile}" \\
                                    -v ${reportDir}:/workspace \\
                                    ${repoMount} \\
                                    ${TEST_RUNNER_IMAGE}
                            """,
                            returnStatus: true
                        )
                    } finally {
                        sh "rm -f '${envFile}' || true"  // 清理含凭据信息的临时文件
                    }
                    echo "[${new Date().format('HH:mm:ss')}] docker-run done, exitCode=${testExitCode}"

                    writeFile file: "${env.WORKSPACE}/pytest_exit_code.txt", text: "${testExitCode}\n"

                    if (testExitCode != 0) {
                        currentBuild.result = 'FAILURE'
                        echo "❌ 测试执行失败，exitCode=${testExitCode}"
                        // 主动发送失败回调：Docker 级别失败（如 exitCode=128）时 entrypoint 无法执行，
                        // 不会自动回调，需要 Jenkinsfile 兜底通知平台更新执行状态，
                        // 防止占位记录永久卡在 error 状态、汇总统计错乱。
                        if (params.RUN_ID && callbackUrl) {
                            try {
                                // -L：跟随 301/302 重定向（HTTP → HTTPS），避免回调因 nginx 重定向而丢失
                                def callbackStatus = sh(
                                    script: """
                                        set +e
                                        http_code=\$(curl -sS -L --max-time 10 -o /tmp/callback_body.txt -w '%{http_code}' -X POST '${callbackUrl}' \\
                                            -H 'Content-Type: application/json' \\
                                            -d '{"runId":${params.RUN_ID},"status":"failed","passedCases":0,"failedCases":0,"skippedCases":0,"durationMs":0,"results":[]}')
                                        curl_exit=\$?
                                        echo "\${curl_exit}:\${http_code}"
                                        exit 0
                                    """,
                                    returnStdout: true
                                ).trim()
                                if (callbackStatus.startsWith('0:2')) {
                                    echo "📡 已向平台发送失败回调 (exitCode=${testExitCode})"
                                } else {
                                    echo "⚠️ 失败回调发送异常，status=${callbackStatus}，详见 /tmp/callback_body.txt（不影响 Pipeline）"
                                }
                            } catch (Exception cbErr) {
                                echo "⚠️ 发送失败回调时出错（忽略）: ${cbErr.message}"
                            }
                        }
                    } else {
                        echo "✅ 测试执行成功"
                    }
                }
            }
        }

        // ── Stage 2: 归档报告 ─────────────────────────────────────────────────
        // test-report.json / junit.xml 由 entrypoint.sh 写入 /workspace（挂载到 ${reportDir}）
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
                // post.always 需显式指定 node（Jenkins 2.307+ master 改名为 built-in）
                node(env.EXEC_NODE ?: 'built-in') {
                    sh 'docker logout docker.cnb.cool || true'
                    // 保留 test-repo（增量更新缓存），清理其余产物
                    cleanWs(patterns: [
                        [pattern: 'test-repo/**', type: 'EXCLUDE'],
                        [pattern: 'test-repo',    type: 'EXCLUDE'],
                    ])
                }
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