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
        // ─── ChromeDriver 下载源（国内镜像，优先级由高到低）────────────────
        // 华为云镜像（速度最稳定，推荐首选）
        CHROMEDRIVER_MIRROR_HUAWEI = 'https://mirrors.huaweicloud.com/chromedriver'
        // npmmirror 阿里云镜像（备用）
        CHROMEDRIVER_MIRROR_NPM    = 'https://registry.npmmirror.com/-/binary/chromedriver'
        // 原始 Google 源（最后兜底，国内可能超时）
        CHROMEDRIVER_MIRROR_GOOGLE = 'https://storage.googleapis.com/chrome-for-testing-public'
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

        // ──────────────────────────────────────────────────────────────────────
        // 安装 ChromeDriver（国内镜像一条龙）
        //
        // 执行逻辑：
        //   1. 若缓存目录已有 chromedriver 且版本匹配当前 Chrome，直接跳过
        //   2. 读取本机 Chrome 主版本号
        //   3. 依次尝试国内镜像（华为云 → npmmirror → Google 原站），任一成功即停止
        //   4. 解压、移动到缓存目录、赋可执行权限
        //   5. 打印版本确认安装成功
        // ──────────────────────────────────────────────────────────────────────
        stage('安装 ChromeDriver') {
            agent { label "${env.EXEC_NODE}" }
            steps {
                sh '''
                    set -e
                    mkdir -p "${DRIVER_CACHE}"

                    # ── 1. 获取本机 Chrome 主版本 ─────────────────────────────
                    CHROME_BIN=""
                    for candidate in google-chrome google-chrome-stable chromium-browser chromium; do
                        if command -v "$candidate" >/dev/null 2>&1; then
                            CHROME_BIN="$candidate"
                            break
                        fi
                    done

                    if [ -z "$CHROME_BIN" ]; then
                        echo "⚠️  未找到 Chrome/Chromium，跳过 chromedriver 安装"
                        exit 0
                    fi

                    CHROME_FULL_VER=$("$CHROME_BIN" --version 2>/dev/null | grep -oE '[0-9]+\\.[0-9]+\\.[0-9]+\\.[0-9]+' | head -1 || echo "")
                    CHROME_MAJOR=$(echo "$CHROME_FULL_VER" | cut -d. -f1)
                    echo "🔍 Chrome 版本: ${CHROME_FULL_VER:-未知}  主版本: ${CHROME_MAJOR:-未知}"

                    # ── 2. 检查缓存是否命中（版本号前缀匹配）──────────────────
                    if [ -f "${DRIVER_CACHE}/chromedriver" ]; then
                        CACHED_VER=$("${DRIVER_CACHE}/chromedriver" --version 2>/dev/null | grep -oE '[0-9]+\\.[0-9]+\\.[0-9]+\\.[0-9]+' | head -1 || echo "")
                        CACHED_MAJOR=$(echo "$CACHED_VER" | cut -d. -f1)
                        if [ -n "$CHROME_MAJOR" ] && [ "$CACHED_MAJOR" = "$CHROME_MAJOR" ]; then
                            echo "✅ chromedriver 缓存命中（${CACHED_VER}），跳过下载"
                            exit 0
                        else
                            echo "♻️  chromedriver 版本不匹配（缓存: ${CACHED_VER}，Chrome: ${CHROME_FULL_VER}），重新下载"
                            rm -f "${DRIVER_CACHE}/chromedriver"
                        fi
                    fi

                    # ── 3. 确定需要下载的 chromedriver 版本号 ─────────────────
                    # Chrome 115+ 使用 chrome-for-testing，旧版用 LATEST_RELEASE 接口
                    DRIVER_VER=""

                    if [ -n "$CHROME_MAJOR" ] && [ "$CHROME_MAJOR" -ge 115 ] 2>/dev/null; then
                        # 新版：先用华为云 JSON API 查询精确版本，再用 npmmirror 备用
                        echo "📡 查询 Chrome ${CHROME_MAJOR} 对应的 chromedriver 版本..."

                        # 华为云不提供版本 API，直接用 Chrome 完整版本号作为 driver 版本（Chrome for Testing 规则）
                        # 尝试从 npmmirror 获取版本列表
                        DRIVER_VER=$(curl -fsSL --connect-timeout 8 --max-time 15 \
                            "https://registry.npmmirror.com/-/binary/chromedriver/index.json" 2>/dev/null \
                            | grep -oE '"[0-9]+\\.'"$CHROME_MAJOR"'\\.[0-9]+\\.[0-9]+"' \
                            | tr -d '"' | sort -V | tail -1 || echo "")

                        if [ -z "$DRIVER_VER" ] && [ -n "$CHROME_FULL_VER" ]; then
                            # 直接用 Chrome 完整版本（Chrome for Testing 版本一一对应）
                            DRIVER_VER="$CHROME_FULL_VER"
                        fi
                    else
                        # 旧版（<115）：从 npmmirror LATEST_RELEASE 接口获取
                        if [ -n "$CHROME_MAJOR" ]; then
                            DRIVER_VER=$(curl -fsSL --connect-timeout 8 --max-time 15 \
                                "https://registry.npmmirror.com/-/binary/chromedriver/LATEST_RELEASE_${CHROME_MAJOR}" \
                                2>/dev/null || echo "")
                        fi
                    fi

                    # 最终兜底：使用 Chrome 完整版本号，或硬编码已知稳定版
                    if [ -z "$DRIVER_VER" ]; then
                        DRIVER_VER="${CHROME_FULL_VER:-147.0.7727.24}"
                        echo "⚠️  无法查询版本，使用兜底版本: ${DRIVER_VER}"
                    fi
                    echo "📦 目标 chromedriver 版本: ${DRIVER_VER}"

                    # ── 4. 依次尝试各镜像源下载 ──────────────────────────────
                    DOWNLOAD_OK=0
                    TMP_ZIP="/tmp/chromedriver_${DRIVER_VER}.zip"
                    rm -f "$TMP_ZIP"

                    # 构建各镜像的下载 URL
                    # 华为云：https://mirrors.huaweicloud.com/chromedriver/<ver>/chromedriver_linux64.zip
                    # npmmirror：https://registry.npmmirror.com/-/binary/chromedriver/<ver>/chromedriver_linux64.zip
                    # Google（115+）：https://storage.googleapis.com/chrome-for-testing-public/<ver>/linux64/chromedriver-linux64.zip
                    # Google（<115）：https://chromedriver.storage.googleapis.com/<ver>/chromedriver_linux64.zip

                    CHROME_MAJOR_NUM=$(echo "$CHROME_MAJOR" | tr -d '[:space:]')
                    if [ -n "$CHROME_MAJOR_NUM" ] && [ "$CHROME_MAJOR_NUM" -ge 115 ] 2>/dev/null; then
                        URL_HUAWEI="https://mirrors.huaweicloud.com/chromedriver/${DRIVER_VER}/chromedriver-linux64.zip"
                        URL_NPM="https://registry.npmmirror.com/-/binary/chromedriver/${DRIVER_VER}/chromedriver-linux64.zip"
                        URL_GOOGLE="https://storage.googleapis.com/chrome-for-testing-public/${DRIVER_VER}/linux64/chromedriver-linux64.zip"
                        INNER_DIR="chromedriver-linux64"
                        INNER_BIN="chromedriver-linux64/chromedriver"
                    else
                        URL_HUAWEI="https://mirrors.huaweicloud.com/chromedriver/${DRIVER_VER}/chromedriver_linux64.zip"
                        URL_NPM="https://registry.npmmirror.com/-/binary/chromedriver/${DRIVER_VER}/chromedriver_linux64.zip"
                        URL_GOOGLE="https://chromedriver.storage.googleapis.com/${DRIVER_VER}/chromedriver_linux64.zip"
                        INNER_DIR=""
                        INNER_BIN="chromedriver"
                    fi

                    for MIRROR_NAME in "华为云" "npmmirror(阿里)" "Google原站"; do
                        case "$MIRROR_NAME" in
                            "华为云")       DL_URL="$URL_HUAWEI" ;;
                            "npmmirror(阿里)") DL_URL="$URL_NPM" ;;
                            "Google原站")   DL_URL="$URL_GOOGLE" ;;
                        esac

                        echo "⬇️  尝试 [${MIRROR_NAME}]: ${DL_URL}"
                        curl -fL --retry 2 --retry-delay 2 \
                             --connect-timeout 15 --max-time 90 \
                             "$DL_URL" -o "$TMP_ZIP" 2>&1 && \
                        [ -f "$TMP_ZIP" ] && [ -s "$TMP_ZIP" ] && {
                            DOWNLOAD_OK=1
                            echo "✅ 下载成功 [${MIRROR_NAME}]"
                            break
                        }
                        echo "⚠️  [${MIRROR_NAME}] 下载失败，尝试下一个..."
                        rm -f "$TMP_ZIP"
                    done

                    if [ "$DOWNLOAD_OK" -ne 1 ]; then
                        echo "❌ 所有镜像源均下载失败，chromedriver 将由 SeleniumBase 运行时自动处理"
                        exit 0
                    fi

                    # ── 5. 解压、安装到缓存目录 ───────────────────────────────
                    cd /tmp
                    unzip -o "$TMP_ZIP" -d chromedriver_extract_$$ >/dev/null 2>&1
                    if [ -n "$INNER_DIR" ]; then
                        cp "chromedriver_extract_$$/${INNER_BIN}" "${DRIVER_CACHE}/chromedriver"
                    else
                        cp "chromedriver_extract_$$/${INNER_BIN}" "${DRIVER_CACHE}/chromedriver"
                    fi
                    chmod +x "${DRIVER_CACHE}/chromedriver"
                    rm -rf "$TMP_ZIP" "chromedriver_extract_$$"

                    # ── 6. 验证安装 ───────────────────────────────────────────
                    INSTALLED_VER=$("${DRIVER_CACHE}/chromedriver" --version 2>/dev/null || echo "unknown")
                    echo "🎉 chromedriver 安装完成: ${INSTALLED_VER}"
                    echo "   缓存路径: ${DRIVER_CACHE}/chromedriver"
                '''
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
                        # 使用国内 pip 镜像（阿里云）加速依赖安装
                        pip install -q -i https://mirrors.aliyun.com/pypi/simple/ \
                            --trusted-host mirrors.aliyun.com \
                            pytest pytest-json-report

                        # 安装测试仓库自身的依赖（requirements.txt 在仓库根目录）
                        if [ -f "${repoDir}/requirements.txt" ]; then
                            echo "安装测试仓库依赖: ${repoDir}/requirements.txt"
                            pip install -q -i https://mirrors.aliyun.com/pypi/simple/ \
                                --trusted-host mirrors.aliyun.com \
                                -r ${repoDir}/requirements.txt
                        fi

                        # 将缓存的 chromedriver 同步到 SeleniumBase 默认驱动目录，避免运行时再走外网下载
                        if [ -x "${DRIVER_CACHE}/chromedriver" ]; then
                            if python -c "import seleniumbase" >/dev/null 2>&1; then
                                SB_DRIVER_DIR=\$(python - <<'PY'
import os
import seleniumbase
print(os.path.join(os.path.dirname(seleniumbase.__file__), 'drivers'))
PY
)
                                mkdir -p "${SB_DRIVER_DIR}"
                                cp -f "${DRIVER_CACHE}/chromedriver" "${SB_DRIVER_DIR}/chromedriver"
                                chmod +x "${SB_DRIVER_DIR}/chromedriver"
                                echo "✅ 已同步 chromedriver 到 SeleniumBase: ${SB_DRIVER_DIR}/chromedriver"
                            else
                                echo "ℹ️ 未检测到 seleniumbase 包，跳过驱动同步"
                            fi
                        else
                            echo "⚠️ 缓存目录未发现 chromedriver: ${DRIVER_CACHE}/chromedriver"
                        fi

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

                    def testExitCode = sh(
                        script: """
                            # 将缓存的 chromedriver 加入 PATH，避免测试时重新下载
                            export PATH="${DRIVER_CACHE}:\${PATH}"
                            export SB_DRIVER_CACHE_PATH=${DRIVER_CACHE}
                            export CHROMEDRIVER="${DRIVER_CACHE}/chromedriver"

                            # 缺少 Chrome/Chromium 时直接失败，避免 pytest 被外部终止后误判成功
                            CHROME_BIN=""
                            for candidate in google-chrome google-chrome-stable chromium-browser chromium; do
                                if command -v "$candidate" >/dev/null 2>&1; then
                                    CHROME_BIN="$candidate"
                                    break
                                fi
                            done
                            if [ -z "$CHROME_BIN" ]; then
                                echo "❌ 未检测到 Chrome/Chromium，请先在执行节点安装浏览器"
                                exit 2
                            fi

                            cd ${testDir}
                            ${testCommand}
                        """,
                        returnStatus: true
                    )

                    writeFile file: "${env.WORKSPACE}/pytest_exit_code.txt", text: "${testExitCode}\n"
                    if (testExitCode != 0) {
                        currentBuild.result = 'FAILURE'
                        echo "❌ pytest 执行失败，exitCode=${testExitCode}"
                    }
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

                // 使用通配符兼容 pytest 根目录自动回退（例如回退到 examples/）
                def reportArtifactPath = '**/test-report.json'
                def junitPattern = '**/junit.xml,**/.pytest_cache/**/junit.xml'

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

                                    # 4xx（除 429）通常为配置错误（如 IP 白名单），无需重试
                                    if [ "\${curl_exit}" -eq 0 ] && echo "\${http_code}" | grep -q '^4' && [ "\${http_code}" != "429" ]; then
                                        echo "[callback] non-retriable client error: \${http_code}"
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
