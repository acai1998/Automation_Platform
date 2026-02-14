# Jenkinsfile 快速修复指南

## 🚨 常见错误速查

### 错误 1: Missing required parameter: "label"

```
Missing required parameter: "label" @ line 259, column 13.
    node {
    ^
```

**原因**: 新版本 Jenkins 要求 `node` 必须指定 `label` 参数

**快速修复**:
```groovy
# ❌ 错误
node {
    script { ... }
}

# ✅ 修复
node('') {  # 空字符串 = 任意节点
    script { ... }
}
```

---

### 错误 2: Required context class hudson.FilePath is missing

```
Required context class hudson.FilePath is missing
Perhaps you forgot to surround the step with a step that provides this, such as: node
```

**原因**: `archiveArtifacts`, `junit`, `sh` 等步骤需要在 `node` 块中执行

**快速修复**:
```groovy
# ❌ 错误
post {
    always {
        script {
            archiveArtifacts artifacts: '*.json'
        }
    }
}

# ✅ 修复
post {
    always {
        node('') {
            script {
                archiveArtifacts artifacts: '*.json'
            }
        }
    }
}
```

---

### 错误 3: No such field found: durationMillis

```
No such field found: field org.jenkinsci.plugins.workflow.support.steps.build.RunWrapper durationMillis
```

**原因**: 属性名错误,应该是 `duration` 而不是 `durationMillis`

**快速修复**:
```groovy
# ❌ 错误
def duration = currentBuild.durationMillis

# ✅ 修复
def duration = currentBuild.duration
```

---

## 🔧 标准模板

### Post 块标准模板

```groovy
post {
    always {
        node('') {
            script {
                echo "清理环境..."

                // 归档报告
                try {
                    archiveArtifacts artifacts: 'test-cases/test-report.json',
                                   allowEmptyArchive: true,
                                   fingerprint: true
                } catch (Exception e) {
                    echo "归档失败: ${e.message}"
                }

                // JUnit 报告
                try {
                    junit allowEmptyResults: true,
                          testResults: '**/test-cases/junit.xml'
                } catch (Exception e) {
                    echo "JUnit报告失败: ${e.message}"
                }

                // 回调平台
                if (params.RUN_ID) {
                    def callbackUrl = params.CALLBACK_URL ?: "${env.PLATFORM_API_URL}/api/jenkins/callback"
                    def finalStatus = currentBuild.result == 'SUCCESS' ? 'success' : 'failed'
                    def duration = currentBuild.duration ?: 0

                    try {
                        sh """
                            curl -X POST '${callbackUrl}' \
                                -H 'Content-Type: application/json' \
                                -H 'X-Api-Key: ${env.JENKINS_API_KEY}' \
                                -d '{
                                    "runId": ${params.RUN_ID},
                                    "status": "${finalStatus}",
                                    "durationMs": ${duration}
                                }'
                        """
                    } catch (Exception e) {
                        echo "回调失败: ${e.message}"
                    }
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
        node('') {
            script {
                echo "❌ Pipeline执行失败"

                if (params.RUN_ID && params.CALLBACK_URL) {
                    def duration = currentBuild.duration ?: 0

                    sh """
                        curl -X POST "${params.CALLBACK_URL}" \
                            -H "Content-Type: application/json" \
                            -H "X-Api-Key: ${env.JENKINS_API_KEY}" \
                            -d '{
                                "runId": ${params.RUN_ID},
                                "status": "failed",
                                "durationMs": ${duration}
                            }'
                    """
                }
            }
        }
    }
}
```

---

## 📋 检查清单

修复 Jenkinsfile 时,请检查以下项目:

### 语法检查
- [ ] 所有 `node` 块都有 `label` 参数(即使是空字符串)
- [ ] `post` 块中需要文件系统访问的步骤都在 `node` 块中
- [ ] 使用 `currentBuild.duration` 而不是 `currentBuild.durationMillis`
- [ ] 字符串转义正确(建议使用双引号字符串)

### 功能检查
- [ ] 测试报告能正常归档
- [ ] JUnit 报告能正常发布
- [ ] 回调请求能成功发送
- [ ] 错误处理逻辑完善(使用 try-catch)

### 测试验证
- [ ] 语法验证通过
- [ ] 测试构建成功
- [ ] 构建日志无错误
- [ ] 平台状态同步正确

---

## 🚀 快速修复步骤

### 1. 备份当前文件
```bash
cp Jenkinsfile Jenkinsfile.backup.$(date +%Y%m%d_%H%M%S)
```

### 2. 应用修复
使用上面的标准模板替换 `post` 块

### 3. 验证语法
```bash
java -jar jenkins-cli.jar -s http://jenkins.example.com/ \
  declarative-linter < Jenkinsfile
```

### 4. 提交并推送
```bash
git add Jenkinsfile
git commit -m "fix: 修复 Jenkinsfile 的 node 和 FilePath 问题"
git push origin master
```

### 5. 测试构建
在 Jenkins 中触发一次测试构建,验证修复是否成功

---

## 💡 关键要点

### Node 块使用规则

| 场景 | 是否需要 node | Label 参数 |
|-----|-------------|-----------|
| stages 中的 steps | ❌ 否 | - |
| post 块中的 script | ✅ 是 | `''` (空字符串) |
| 需要访问文件系统 | ✅ 是 | `''` 或具体 label |
| 只是打印日志 | ❌ 否 | - |

### CurrentBuild 属性速查

| 属性 | 类型 | 说明 | 示例 |
|-----|------|------|------|
| `result` | String | 构建结果 | SUCCESS/FAILURE |
| `duration` | Long | 构建时长(毫秒) | 12345 |
| `number` | Integer | 构建编号 | 42 |
| `displayName` | String | 显示名称 | #42 |
| `startTimeInMillis` | Long | 开始时间戳 | 1234567890000 |

### 字符串处理技巧

```groovy
# 单引号字符串 - 不支持变量插值
sh '''
    echo "固定文本"
'''

# 双引号字符串 - 支持变量插值
sh """
    echo "变量值: ${params.RUN_ID}"
"""

# JSON 数据最佳实践
sh """
    curl -d '{
        "key": "${value}"
    }'
"""
```

---

## 🔍 故障排查

### 问题: 修复后还是报错

**检查项**:
1. 确认修改已提交并推送到 Git
2. Jenkins 是否从正确的分支读取 Jenkinsfile
3. 清除 Jenkins 工作空间缓存
4. 检查 Jenkins 版本是否支持语法

**解决步骤**:
```bash
# 1. 确认 Git 状态
git status
git log -1 --oneline

# 2. 检查远程分支
git ls-remote --heads origin

# 3. 强制 Jenkins 重新拉取
# 在 Jenkins Job 配置中勾选 "Clean before checkout"

# 4. 清除工作空间
# 在 Jenkins Job 页面点击 "Wipe Out Workspace"
```

### 问题: 回调失败

**检查项**:
1. 网络连接是否正常
2. API Key 是否正确
3. 回调 URL 是否可访问
4. JSON 格式是否正确

**测试命令**:
```bash
# 测试回调接口
curl -X POST "http://localhost:3000/api/jenkins/callback" \
  -H "Content-Type: application/json" \
  -H "X-Api-Key: YOUR_API_KEY" \
  -d '{
    "runId": 123,
    "status": "success",
    "durationMs": 1000
  }'
```

---

## 📚 相关文档

- [JENKINSFILE_NODE_FIX.md](./JENKINSFILE_NODE_FIX.md) - Node 块错误详细说明
- [JENKINSFILE_FILEPATH_FIX.md](./JENKINSFILE_FILEPATH_FIX.md) - FilePath 上下文错误详细说明
- [JENKINSFILE_OPTIMIZATION.md](./JENKINSFILE_OPTIMIZATION.md) - 完整的优化方案
- [JENKINSFILE_COMPARISON.md](./JENKINSFILE_COMPARISON.md) - 版本对比

---

**最后更新**: 2025-02-12
**适用版本**: Jenkins 2.x+
