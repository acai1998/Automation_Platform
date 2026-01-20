# Jenkins Pipeline 配置指南

## 当前 Pipeline 问题

您的 Pipeline 目前运行整个 `test_case` 目录，需要修改为支持单个用例执行。

## 修改后的 Pipeline

```groovy
pipeline {
    agent any
    environment {
        REPORT_DIR = 'reports'
        ALLURE_DIR = 'allure-results'
        TEST_CASE_DIR = 'test_case'
    }
    
    // 添加参数定义
    parameters {
        string(name: 'SCRIPT_PATH', defaultValue: '', description: '测试脚本路径，格式: test_case/test_file.py 或 test_case/test_file.py::TestClass::test_method')
        string(name: 'CASE_ID', defaultValue: '', description: '用例ID')
        string(name: 'CASE_TYPE', defaultValue: 'ui', description: '用例类型: api/ui/performance')
        string(name: 'CALLBACK_URL', defaultValue: '', description: '执行完成后的回调URL')
    }
    
    stages {
        stage('Checkout') {
            steps {
                git branch: 'master', url: 'https://gitee.com/Ac1998/SeleniumBase-CI.git'
            }
        }
        
        stage('Setup') {
            steps {
                retry(3) {
                    sh 'python -m pip install --upgrade pip'
                    sh 'pip install allure-pytest seleniumbase pytest-html pytest-xdist'
                    sh 'rm -rf ${WORKSPACE}/${ALLURE_DIR}'
                    sh 'mkdir -p ${WORKSPACE}/${ALLURE_DIR}'
                }
            }
        }
        
        stage('Test') {
            steps {
                script {
                    def testCommand = ''
                    
                    if (params.SCRIPT_PATH && params.SCRIPT_PATH.trim() != '') {
                        // 运行单个用例
                        testCommand = """
                            python -m pytest ${params.SCRIPT_PATH} \
                              --browser=chrome \
                              --dashboard --rs \
                              --headless \
                              --alluredir=${ALLURE_DIR} \
                              --junitxml=${REPORT_DIR}/junit.xml \
                              --html=${REPORT_DIR}/report.html
                        """
                    } else {
                        // 如果没有指定路径，运行整个目录（兼容旧逻辑）
                        testCommand = """
                            python -m pytest ${TEST_CASE_DIR} \
                              --browser=chrome \
                              --dashboard --rs \
                              --headless \
                              --alluredir=${ALLURE_DIR} \
                              --junitxml=${REPORT_DIR}/junit.xml \
                              --html=${REPORT_DIR}/report.html \
                              -n auto
                        """
                    }
                    
                    retry(3) {
                        sh testCommand
                    }
                }
            }
        }
        
        stage('Callback') {
            steps {
                script {
                    if (params.CALLBACK_URL && params.CALLBACK_URL.trim() != '') {
                        def buildStatus = currentBuild.result ?: 'SUCCESS'
                        def status = (buildStatus == 'SUCCESS') ? 'idle' : 'idle' // 执行完成后都设为 idle
                        
                        sh """
                            curl -X PATCH '${params.CALLBACK_URL}' \
                              -H 'Content-Type: application/json' \
                              -d '{"running_status": "${status}"}'
                        """
                    }
                }
            }
        }
    }
    
    post {
        always {
            allure includeProperties: false,
                   jdk: '',
                   results: [[path: "${ALLURE_DIR}"]]
            archiveArtifacts artifacts: "${REPORT_DIR}/*.html,${ALLURE_DIR}/**"
        }
    }
}
```

## 关键修改点

### 1. 添加参数定义
```groovy
parameters {
    string(name: 'SCRIPT_PATH', defaultValue: '', description: '测试脚本路径')
    string(name: 'CASE_ID', defaultValue: '', description: '用例ID')
    string(name: 'CASE_TYPE', defaultValue: 'ui', description: '用例类型')
    string(name: 'CALLBACK_URL', defaultValue: '', description: '回调URL')
}
```

### 2. 条件执行
- 如果提供了 `SCRIPT_PATH`，运行单个用例
- 如果没有提供，运行整个目录（向后兼容）

### 3. 回调通知
- 执行完成后调用 `CALLBACK_URL` 通知平台
- 更新用例状态为 `idle`

## script_path 格式说明

### 支持的格式

1. **文件路径**：
   ```
   test_case/test_login.py
   ```

2. **类路径**：
   ```
   test_case/test_login.py::TestLogin
   ```

3. **方法路径**（推荐）：
   ```
   test_case/test_login.py::TestLogin::test_user_login
   ```

### 脚本解析服务生成的格式

脚本解析服务会生成以下格式的 `script_path`：
- 文件路径：`test_case/test_file.py`
- 完整路径：`test_case/test_file.py::TestClass::test_method`

## 配置步骤

1. **在 Jenkins 中配置 Job**：
   - 创建或编辑 Job
   - 勾选 "This project is parameterized"
   - 添加 String 参数：`SCRIPT_PATH`, `CASE_ID`, `CASE_TYPE`, `CALLBACK_URL`

2. **更新 Pipeline**：
   - 将上面的 Pipeline 代码复制到 Jenkins Job 配置中

3. **测试执行**：
   - 从平台点击"运行"按钮
   - 平台会调用 Jenkins API 传递参数
   - Jenkins 执行单个用例并回调结果

## 注意事项

1. **参数化 Job**：必须将 Job 配置为参数化，否则无法接收参数
2. **路径格式**：确保 `script_path` 使用相对路径（相对于仓库根目录）
3. **回调 URL**：确保 Jenkins 可以访问平台的回调 URL
4. **错误处理**：Pipeline 中的回调应该包含错误处理逻辑
