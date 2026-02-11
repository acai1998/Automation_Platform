# Jenkinsfile Node 块错误修复

## 问题描述

在运行 Jenkinsfile 时遇到以下错误:

```
org.codehaus.groovy.control.MultipleCompilationErrorsException: startup failed:
WorkflowScript: 259: Missing required parameter: "label" @ line 259, column 13.
               node {
               ^

WorkflowScript: 319: Missing required parameter: "label" @ line 319, column 13.
               node {
               ^

2 errors
```

## 根本原因

在 Jenkins Pipeline 的 `post` 块中使用了 `node {}` 而没有指定 `label` 参数。

### 为什么会出现这个错误?

1. **Jenkins 版本变化**: 新版本的 Jenkins 要求在使用 `node` 时必须指定 `label` 参数
2. **不必要的嵌套**: 由于 Pipeline 已经在顶层使用了 `agent any`,在 `post` 块中不需要再次分配节点
3. **Declarative Pipeline 限制**: 在 Declarative Pipeline 的 `post` 块中,不应该使用 `node` 块

## 解决方案

### 修复前

```groovy
post {
    always {
        node {  // ❌ 错误: 缺少 label 参数
            script {
                echo "清理环境..."
                // ...
            }
        }
    }

    failure {
        node {  // ❌ 错误: 缺少 label 参数
            script {
                echo "Pipeline执行失败"
                // ...
            }
        }
    }
}
```

### 修复后

```groovy
post {
    always {
        script {  // ✅ 正确: 直接使用 script 块
            echo "清理环境..."
            // ...
        }
    }

    failure {
        script {  // ✅ 正确: 直接使用 script 块
            echo "Pipeline执行失败"
            // ...
        }
    }
}
```

## 为什么这样修复?

### 1. Pipeline 已经有 Agent

```groovy
pipeline {
    agent any  // 已经在顶层分配了节点

    stages {
        // ...
    }

    post {
        // 这里可以直接使用分配的节点,不需要再次分配
        always {
            script {
                // 直接执行命令
            }
        }
    }
}
```

### 2. Declarative Pipeline 的设计

在 Declarative Pipeline 中:
- `agent` 在顶层定义,整个 Pipeline 共享
- `post` 块自动继承顶层的 agent
- 不需要(也不应该)在 `post` 块中再次使用 `node`

### 3. 如果确实需要不同的节点

如果确实需要在 `post` 块中使用不同的节点,应该指定 `label`:

```groovy
post {
    always {
        node('specific-label') {  // ✅ 指定 label
            script {
                // ...
            }
        }
    }
}
```

或者使用 `agent` 指令:

```groovy
pipeline {
    agent any

    stages {
        // ...
    }

    post {
        always {
            // 在特定节点上执行
            node('cleanup-node') {
                script {
                    // ...
                }
            }
        }
    }
}
```

## 完整的修复步骤

### 步骤 1: 备份当前文件

```bash
cp Jenkinsfile Jenkinsfile.backup.$(date +%Y%m%d_%H%M%S)
```

### 步骤 2: 应用修复

修改 Jenkinsfile,移除 `post` 块中的所有 `node` 包装:

```diff
  post {
      always {
-         node {
              script {
                  echo "清理环境..."
                  // ...
              }
-         }
      }

      failure {
-         node {
              script {
                  echo "Pipeline执行失败"
                  // ...
              }
-         }
      }
  }
```

### 步骤 3: 验证语法

在 Jenkins 中:
1. 打开 Pipeline Job
2. 点击 "Pipeline Syntax"
3. 粘贴修改后的 Jenkinsfile
4. 点击 "Validate Declarative Pipeline"

或使用命令行:

```bash
# 安装 Jenkins CLI
java -jar jenkins-cli.jar -s http://jenkins.example.com/ declarative-linter < Jenkinsfile
```

### 步骤 4: 测试运行

```bash
# 触发一次测试构建
curl -X POST "http://jenkins.example.com/job/test-automation/build" \
  --user "username:token" \
  --data-urlencode "RUN_ID=test-123" \
  --data-urlencode "SCRIPT_PATHS=test_case/test_sample.py"
```

## 其他常见的 Node 相关错误

### 错误 1: 在 steps 中使用 node

```groovy
// ❌ 错误
stage('测试') {
    steps {
        node {
            sh 'pytest'
        }
    }
}

// ✅ 正确
stage('测试') {
    steps {
        sh 'pytest'
    }
}
```

### 错误 2: 混用 Declarative 和 Scripted 语法

```groovy
// ❌ 错误
pipeline {
    agent any
    stages {
        stage('测试') {
            steps {
                node('test-node') {  // Scripted 语法
                    sh 'pytest'
                }
            }
        }
    }
}

// ✅ 正确 - 使用 Declarative 语法
pipeline {
    agent { label 'test-node' }
    stages {
        stage('测试') {
            steps {
                sh 'pytest'
            }
        }
    }
}

// ✅ 正确 - 或在特定 stage 中使用不同节点
pipeline {
    agent any
    stages {
        stage('测试') {
            agent { label 'test-node' }
            steps {
                sh 'pytest'
            }
        }
    }
}
```

### 错误 3: 在 parallel 中使用 node

```groovy
// ❌ 错误
stage('并行测试') {
    parallel {
        stage('API测试') {
            steps {
                node {
                    sh 'pytest test_api/'
                }
            }
        }
    }
}

// ✅ 正确
stage('并行测试') {
    parallel {
        stage('API测试') {
            agent { label 'test-node' }
            steps {
                sh 'pytest test_api/'
            }
        }
    }
}
```

## 最佳实践

### 1. 使用 Declarative Pipeline

优先使用 Declarative Pipeline 而不是 Scripted Pipeline:

```groovy
// ✅ 推荐: Declarative Pipeline
pipeline {
    agent any
    stages {
        stage('测试') {
            steps {
                sh 'pytest'
            }
        }
    }
}

// ⚠️ 不推荐: Scripted Pipeline (除非有特殊需求)
node {
    stage('测试') {
        sh 'pytest'
    }
}
```

### 2. 在顶层定义 Agent

```groovy
// ✅ 推荐
pipeline {
    agent any  // 顶层定义
    stages {
        // ...
    }
}

// ⚠️ 不推荐
pipeline {
    agent none
    stages {
        stage('测试') {
            agent any  // 每个 stage 都要定义
            steps {
                // ...
            }
        }
    }
}
```

### 3. 需要不同节点时使用 Agent

```groovy
// ✅ 推荐
pipeline {
    agent any
    stages {
        stage('构建') {
            agent { label 'build-node' }
            steps {
                sh 'make build'
            }
        }
        stage('测试') {
            agent { label 'test-node' }
            steps {
                sh 'pytest'
            }
        }
    }
}
```

### 4. Post 块中避免使用 Node

```groovy
// ✅ 推荐
post {
    always {
        script {
            // 清理操作
        }
    }
}

// ❌ 不推荐
post {
    always {
        node('cleanup-node') {
            // 清理操作
        }
    }
}
```

## 验证修复

### 检查清单

- [ ] 移除 `post` 块中的所有 `node` 包装
- [ ] 保留 `script` 块
- [ ] 验证 Pipeline 语法
- [ ] 测试运行成功
- [ ] 检查回调是否正常工作
- [ ] 查看构建日志确认无错误

### 测试命令

```bash
# 1. 语法验证
java -jar jenkins-cli.jar -s http://jenkins.example.com/ \
  declarative-linter < Jenkinsfile

# 2. 触发测试构建
curl -X POST "http://jenkins.example.com/job/test-automation/buildWithParameters" \
  --user "username:token" \
  --data-urlencode "RUN_ID=123" \
  --data-urlencode "SCRIPT_PATHS=test_case/test_sample.py"

# 3. 查看构建日志
curl "http://jenkins.example.com/job/test-automation/lastBuild/consoleText" \
  --user "username:token"
```

## 相关文档

- [Jenkins Declarative Pipeline Syntax](https://www.jenkins.io/doc/book/pipeline/syntax/)
- [Jenkins Pipeline Best Practices](https://www.jenkins.io/doc/book/pipeline/pipeline-best-practices/)
- [Jenkinsfile 优化指南](./JENKINSFILE_OPTIMIZATION.md)

## 总结

**问题**: `post` 块中使用 `node` 缺少 `label` 参数

**解决**: 移除 `node` 包装,直接使用 `script` 块

**原因**: Declarative Pipeline 的 `post` 块自动继承顶层 agent,不需要再次分配节点

**影响**: 修复后 Pipeline 可以正常运行,不影响功能

---

**修复日期**: 2025-02-12
**Jenkins 版本**: 2.x+
**状态**: ✅ 已修复
