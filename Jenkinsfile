pipeline {
    agent none
    
    parameters {

        string(name: 'RUN_ID', description: '执行批次ID', defaultValue: '')
        string(name: 'CASE_IDS', description: '用例ID列表(JSON)', defaultValue: '[]')
        string(name: 'SCRIPT_PATHS', description: '脚本路径(逗号分隔)', defaultValue: '')
        string(name: 'CALLBACK_URL', description: '回调URL', defaultValue: '')
        string(name: 'MARKER', description: 'Pytest marker标记', defaultValue: '')
        string(name: 'REPO_URL', description: '测试用例仓库URL', defaultValue: '')
        string(name: 'REPO_BRANCH', description: '测试用例仓库分支', defaultValue: 'master')
    }
    
    environment {
        PLATFORM_API_URL = 'https://autotest.wiac.xyz'
        // 使用固定路径存放 venv，避免 Jenkins 并发分配 @2/@3 workspace 时重复创建
        PYTHON_ENV = "/home/jenkins/shared-venv/SeleniumBaseCi"
        // chromedriver 固定缓存目录，避免每次重复下载
        DRIVER_CACHE = "/home/jenkins/shared-drivers"
        // 运行时动态选择的执行节点（默认 master）
        EXEC_NODE = 'master'
        // master 等待超时时间（秒），超时后自动切换到 Agent-node-2
        NODE_SWITCH_TIMEOUT_SECONDS = '20'
    }

    options {
        buildDiscarder(logRotator(numToKeepStr: '20'))
        timeout(time: 60, unit: 'MINUTES')
        disableConcurrentBuilds()
    }
    
    stages {
        stage('选择执行节点') {
            steps {
                script {
                    def preferredNode = 'master'
                    def fallbackNode = 'Agent-node-2'
                    def timeoutSeconds = (env.NODE_SWITCH_TIMEOUT_SECONDS ?: '20') as Integer

                    env.EXEC_NODE = preferredNode
                    try {
                        timeout(time: timeoutSeconds, unit: 'SECONDS') {
                            node(preferredNode) {
                                echo "✅ master 节点可用，将优先在 master 执行"
                            }
                        }
                    } catch (Throwable t) {
                        echo "⚠️ master 在 ${timeoutSeconds}s 内不可用，切换到 ${fallbackNode}: ${t.message}"
                        env.EXEC_NODE = fallbackNode
                    }

                    echo "本次流水线执行节点: ${env.EXEC_NODE}"
                }
            }
        }

        stage('准备') {
            agent { label "${env.EXEC_NODE}" }
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
            agent { label "${env.EXEC_NODE}" }
            steps {
                script {
                    echo "正在克隆/更新测试用例仓库..."
                    
                    if (params.REPO_URL) {
                        def branch = params.REPO_BRANCH ?: 'master'
                        if (fileExists('examples')) {
                            dir('examples') {
                                sh "git pull origin ${branch}"
                            }
                        } else {
                            // clone 到 examples/，仓库根目录即测试用例目录
                            sh "git clone --single-branch --branch '${branch}' '${params.REPO_URL}' examples"
                        }
                    } else {
                        echo "⚠️ 警告：REPO_URL 未设置，跳过代码检出，使用当前 workspace 目录"
                    }
                }
            }
        }
        
        stage('准备环境') {
            agent { label "${env.EXEC_NODE}" }
            steps {
                script {
                    echo "准备Python环境..."

                    // 定时触发且无参数时，跳过本阶段
                    if (!params.RUN_ID && !params.SCRIPT_PATHS && !params.MARKER) {
                        echo "⚠️ 未传入执行参数（可能是定时触发），跳过准备环境"
                        return
                    }

                    // repoDir：仓库根目录（requirements.txt 在此）
                    // testFilesDir：实际测试文件目录（examples/examples/）
                    def repoDir = params.REPO_URL ? 'examples' : '.'
                    def testFilesDir = params.REPO_URL ? 'examples/examples' : '.'
                    sh """
                        set -e
                        if [ ! -d "${repoDir}" ]; then
                            echo "❌ 仓库目录 '${repoDir}' 不存在，请确认 REPO_URL 或代码检出是否成功"
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

                        # 安装测试仓库自身的依赖（requirements.txt 在仓库根目录）
                        if [ -f "${repoDir}/requirements.txt" ]; then
                            echo "安装测试仓库依赖: ${repoDir}/requirements.txt"
                            pip install -q -r ${repoDir}/requirements.txt
                        fi

                        # ─── 预缓存 chromedriver，避免每次测试时临时下载 ───
                        mkdir -p ${DRIVER_CACHE}
                        export SB_DRIVER_CACHE_PATH=${DRIVER_CACHE}
                        if [ ! -f "${DRIVER_CACHE}/chromedriver" ]; then
                            echo "📥 下载 chromedriver 到缓存目录: ${DRIVER_CACHE}"
                            # 获取本机 Chrome 版本号（主版本）
                            CHROME_VER=\$(google-chrome --version 2>/dev/null | grep -oP '[0-9]+' | head -1 || echo "146")
                            echo "Chrome 主版本: \$CHROME_VER"
                            # 查询对应的 chromedriver 版本
                            DRIVER_VER=\$(curl -s "https://googlechromelabs.github.io/chrome-for-testing/LATEST_RELEASE_\${CHROME_VER}" 2>/dev/null || echo "")
                            if [ -z "\$DRIVER_VER" ]; then
                                # 国内备用：直接使用已知版本
                                DRIVER_VER="146.0.7680.153"
                            fi
                            echo "下载 chromedriver 版本: \$DRIVER_VER"
                            # 下载并解压到缓存目录
                            cd /tmp
                            curl -fL --retry 3 --retry-delay 2 --connect-timeout 30 --max-time 120 "https://storage.googleapis.com/chrome-for-testing-public/\${DRIVER_VER}/linux64/chromedriver-linux64.zip" -o chromedriver.zip || true
                            if [ -f chromedriver.zip ]; then
                                unzip -o chromedriver.zip
                                cp chromedriver-linux64/chromedriver ${DRIVER_CACHE}/chromedriver
                                chmod +x ${DRIVER_CACHE}/chromedriver
                                rm -rf chromedriver.zip chromedriver-linux64
                                echo "✅ chromedriver 下载并缓存成功"
                            else
                                echo "⚠️ chromedriver 下载失败，将由 SeleniumBase 运行时自动处理"
                            fi
                            cd -
                        else
                            echo "✅ chromedriver 已缓存，跳过下载: \$(${DRIVER_CACHE}/chromedriver --version 2>/dev/null || echo '版本未知')"
                        fi
                        # 将缓存目录加入 PATH，让 selenium 直接找到
                        export PATH="${DRIVER_CACHE}:\${PATH}"

                        # 列出可用的测试文件
                        echo "可用的测试文件:"
                        find ${testFilesDir} -name "test_*.py" -o -name "*_test.py" | head -20
                    """
                }
            }
        }
        
        stage('执行测试') {
            agent { label "${env.EXEC_NODE}" }
            steps {
                script {
                    // 无参数时跳过
                    if (!params.RUN_ID && !params.SCRIPT_PATHS && !params.MARKER) {
                        echo "⚠️ 未传入执行参数，跳过执行测试"
                        return
                    }

                    // 仓库结构： git clone 到 examples/ （仓库根），实际测试文件在 examples/examples/
                    // 数据库 scriptPath 格式：examples/E/test_xxx.py（相对于仓库内 examples/ 子目录）
                    // 最终路径：workspace/examples/examples/E/test_xxx.py
                    // 正确做法：进入 examples/examples/（即实际测试目录），传去掉 examples/ 前缀的路径
                    def repoDir = params.REPO_URL ? 'examples' : '.'       // 仓库根目录
                    def testDir = params.REPO_URL ? 'examples/examples' : '.'  // 实际测试文件目录
                    def scriptPaths = params.SCRIPT_PATHS
                    def marker = params.MARKER
                    def testCommand = ". ${PYTHON_ENV}/bin/activate && "

                    if (scriptPaths) {
                        // scriptPath 格式：examples/E/test_xxx.py
                        // cd 到 examples/examples/ 后，去掉 examples/ 前缀就是实际相对路径 E/test_xxx.py
                        def paths = scriptPaths.split(',').collect {
                            it.trim().replaceFirst(/^examples\//, '')
                        }
                        testCommand += "pytest ${paths.join(' ')}"
                    } else if (marker) {
                        testCommand += "pytest -m '${marker}'"
                    } else {
                        testCommand += "pytest"
                    }
                    testCommand += " --json-report --json-report-file=test-report.json --junitxml=junit.xml -v"

                    sh """
                        # 将缓存的 chromedriver 加入 PATH，避免测试时重新下载
                        export PATH="${DRIVER_CACHE}:\${PATH}"
                        export SB_DRIVER_CACHE_PATH=${DRIVER_CACHE}
                        cd ${testDir}
                        ${testCommand} || true
                    """
                }
            }
        }
        
        stage('收集结果') {
            agent { label "${env.EXEC_NODE}" }
            steps {
                script {
                    echo "收集测试结果..."

                    if (!params.RUN_ID && !params.SCRIPT_PATHS && !params.MARKER) {
                        echo "⚠️ 未传入执行参数，跳过收集结果"
                        return
                    }

                    // test-report.json 在实际测试目录 examples/examples/ 下生成
                    def testDir = params.REPO_URL ? 'examples/examples' : '.'
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
                node(env.EXEC_NODE ?: 'master') {
                    echo "清理环境..."

                // test-report.json 和 junit.xml 在 examples/examples/ 下生成
                def testDir = params.REPO_URL ? 'examples/examples' : '.'
                def reportArtifactPath = params.REPO_URL ? 'examples/examples/test-report.json' : 'test-report.json'
                def junitPattern = params.REPO_URL
                    ? '**/examples/examples/junit.xml,**/examples/examples/.pytest_cache/**/junit.xml'
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

                // ────────────────────────────────────────────────────────────────────
                // 轻量化回调：仅发送 runId + buildNumber，服务端主动解析结果
                // 移除了 Groovy 解析 test-report.json 的复杂逻辑（约 80 行）
                // ────────────────────────────────────────────────────────────────────
                if (params.RUN_ID) {
                    echo "========== 轻量化回调 =========="
                    def callbackUrl = params.CALLBACK_URL ?: "${env.PLATFORM_API_URL}/api/jenkins/callback"
                    def buildNumber = currentBuild.number ?: env.BUILD_NUMBER
                    def duration = currentBuild.duration ?: 0

                    // 仅发送基础信息，服务端会根据 buildNumber 主动抓取解析结果
                    def buildStatus = (currentBuild.currentResult == 'SUCCESS') ? 'success' : 'failed'

                    echo "回调地址: ${callbackUrl}"
                    echo "运行ID: ${params.RUN_ID}"
                    echo "构建号: ${buildNumber}"
                    echo "构建状态: ${buildStatus}"
                    echo "执行时长: ${duration}ms"

                    try {
                        def payload = """{"runId":${params.RUN_ID},"buildNumber":${buildNumber},"status":"${buildStatus}","durationMs":${duration}}"""
                        def payloadFile = "${WORKSPACE}/callback_payload.json"
                        writeFile file: payloadFile, text: payload

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
                            echo "✅ 轻量化回调已发送，服务端将主动解析结果"
                        } else {
                            echo "❌ 回调发送失败，exitCode=${callbackExitCode}"
                        }
                    } catch (Exception e) {
                        echo "⚠️ 回调发送异常: ${e.message}"
                    } finally {
                        // 清理临时回调文件
                        sh "rm -f ${WORKSPACE}/callback_payload.json ${WORKSPACE}/callback_response_${BUILD_NUMBER}_*.txt || true"
                    }
                    echo "==============================="
                }
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
