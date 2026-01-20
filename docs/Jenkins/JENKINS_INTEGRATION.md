# Jenkins 集成指南

本文档详细说明如何配置和使用 Jenkins Pipeline 与自动化测试平台的集成。

## 架构概述

```
前端用例页面 
    ↓ 点击"执行"
后端 API (/api/jenkins/run-case 或 /api/jenkins/run-batch)
    ↓ 创建Auto_TestRun记录，触发Jenkins
Jenkins Pipeline
    ↓ 检出代码、执行测试
    ↓ 解析结果
    ↓ 回调平台
后端 API (/api/jenkins/callback)
    ↓ 更新Auto_TestRun记录
前端实时刷新展示结果
```

## Jenkins 配置

### 1. 创建 Pipeline Job

1. Jenkins 主页 → "新建任务"
2. 选择 "Pipeline"
3. 设置基本信息：
   - 任务名称: `SeleniumBaseCi-AutoTest` (或您定义的名称)
   - 描述: "自动化测试平台 - 用例执行"

### 2. Pipeline 配置

在 Pipeline 部分，选择 "Pipeline script from SCM":
- SCM: Git
- Repository URL: 本项目地址 (含Jenkinsfile)
- Branch Specifier: `*/main` 或 `*/develop`
- Script Path: `Jenkinsfile`

或直接粘贴 Pipeline script 内容。

### 3. 参数化构建

配置以下参数（Jenkins 会自动从 Jenkinsfile 读取）:
- `RUN_ID`: 执行批次ID
- `CASE_IDS`: 用例ID列表(JSON数组)
- `SCRIPT_PATHS`: 脚本文件路径
- `CALLBACK_URL`: 结果回调地址
- `MARKER`: Pytest marker标记

### 4. 触发器配置

- **参数化触发**: 允许 API 调用时传递参数
- **远程触发**: 设置安全令牌 (可选)

## 测试用例仓库要求

您的 Git 测试用例仓库需要满足以下条件:

```
test-repo/
├── test_login.py
├── test_checkout.py
├── tests/
│   ├── test_payment.py
│   └── test_refund.py
├── requirements.txt
└── pytest.ini
```

### requirements.txt 示例

```
pytest==7.4.0
pytest-json-report==1.5.0
selenium==4.10.0
requests==2.31.0
```

### pytest.ini 示例

```ini
[pytest]
testpaths = .
python_files = test_*.py *_test.py
python_classes = Test*
python_functions = test_*
markers =
    smoke: 冒烟测试
    regression: 回归测试
    api: API测试
    ui: UI测试
```

## API 调用流程

### 单用例执行

```bash
curl -X POST 'http://localhost:3000/api/jenkins/run-case' \
  -H 'Content-Type: application/json' \
  -d '{
    "caseId": 1,
    "projectId": 1,
    "triggeredBy": 1
  }'
```

响应:
```json
{
  "success": true,
  "data": {
    "runId": 123,
    "buildUrl": "http://jenkins.wiac.xyz/job/SeleniumBaseCi-AutoTest/45/"
  },
  "message": "Batch job triggered successfully"
}
```

### 批量执行

```bash
curl -X POST 'http://localhost:3000/api/jenkins/run-batch' \
  -H 'Content-Type: application/json' \
  -d '{
    "caseIds": [1, 2, 3, 4],
    "projectId": 1,
    "triggeredBy": 1
  }'
```

### 查询执行进度

```bash
curl 'http://localhost:3000/api/jenkins/batch/123'
```

响应:
```json
{
  "success": true,
  "data": {
    "id": 123,
    "status": "running",
    "total_cases": 4,
    "passed_cases": 2,
    "failed_cases": 0,
    "skipped_cases": 0,
    "jenkins_build_url": "http://jenkins.wiac.xyz/job/.../45/",
    "start_time": "2024-01-08 10:00:00",
    "end_time": null,
    "duration_ms": null
  }
}
```

## Jenkins 回调说明

### 回调 URL 格式

```
POST /api/jenkins/callback
Content-Type: application/json

{
  "runId": 123,
  "status": "success|failed|aborted",
  "passedCases": 3,
  "failedCases": 1,
  "skippedCases": 0,
  "durationMs": 45000,
  "buildUrl": "http://jenkins.wiac.xyz/job/.../45/"
}
```

### 环境变量配置

在后端 `.env` 文件中配置:

```env
# Jenkins 配置
JENKINS_URL=https://jenkins.wiac.xyz
JENKINS_USER=root
JENKINS_TOKEN=your_api_token_here
JENKINS_JOB_API=SeleniumBaseCi-AutoTest
JENKINS_JOB_UI=ui-automation
JENKINS_JOB_PERF=performance-automation

# 回调配置
API_CALLBACK_URL=http://your-platform-api.com/api/jenkins/callback
```

## 故障排查

### 1. Jenkins 连接失败

检查:
- Jenkins URL 是否正确
- API Token 是否有效
- 网络连接是否正常

```bash
# 测试 Jenkins 连接
curl -u root:API_TOKEN https://jenkins.wiac.xyz/api/json
```

### 2. 用例执行失败

检查:
- 测试仓库克隆是否成功
- Python 环境和依赖是否安装正确
- 脚本路径是否正确

### 3. 结果回调失败

检查:
- 回调 URL 是否正确
- 平台 API 是否正常运行
- 防火墙/网络配置

## 高级用法

### 标记执行 (Marker)

使用 pytest markers 执行特定类型的用例:

```bash
curl -X POST 'http://localhost:3000/api/jenkins/run-batch' \
  -H 'Content-Type: application/json' \
  -d '{
    "caseIds": [],
    "projectId": 1,
    "marker": "smoke",
    "triggeredBy": 1
  }'
```

### 环境特定执行

在 run_config 中传递环境参数:

```json
{
  "caseIds": [1, 2, 3],
  "projectId": 1,
  "runConfig": {
    "environment": "test",
    "baseUrl": "https://test-api.example.com",
    "timeout": 30000
  }
}
```

### 定时任务

在 tasks 表中配置 cron 表达式，由调度服务触发执行。

## 最佳实践

1. **并发控制**: 限制 Jenkins 同时执行的任务数，防止资源耗尽
2. **超时设置**: 为 Pipeline 设置合理的超时时间
3. **日志记录**: 完整记录 Jenkins 执行日志，便于问题追踪
4. **错误恢复**: 执行失败时，自动更新 Auto_TestRun 状态，便于重试
5. **性能优化**: 
   - 使用仓库缓存，减少克隆时间
   - 并行执行不相关的测试
   - 使用分布式构建节点

## 参考资源

- [Jenkins 官方文档](https://www.jenkins.io/zh/doc/)
- [Jenkins Pipeline 指南](https://www.jenkins.io/zh/doc/book/pipeline/)
- [Pytest 官方文档](https://docs.pytest.org/)