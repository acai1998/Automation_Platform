# 外部系统集成规范

> **触发场景**：开发 Jenkins 集成、Git 仓库同步相关功能，或需要了解回调格式、认证方式时读取本文件。

---

## Jenkins 集成规范

### 执行流程

执行流程采用**异步非阻塞设计**：
```
前端立即返回 → 显示加载状态
后台 Jenkins 执行 → 前端轮询进度（3秒间隔）
执行完成 → 回调更新 → 前端自动刷新
```

### Jenkins 参数格式

Jenkins Job 必须支持以下参数：
- `SCRIPT_PATH` — pytest 格式的脚本路径（如 `test_case/test_login.py::TestLogin::test_user_login`）
- `CASE_ID` — 测试用例ID
- `CASE_TYPE` — 用例类型（api/ui/performance）
- `CALLBACK_URL` — 平台回调地址

### 脚本路径规范

脚本路径采用 **pytest 完整路径格式**：
- ✅ **正确**：`test_case/test_login.py::TestLogin::test_user_login`（推荐）
- ⚠️ **可接受**：`test_case/test_login.py::TestClass`（类级别）
- ⚠️ **可接受**：`test_case/test_file.py`（文件级别）

### Jenkins 回调数据格式

回调请求体应包含：
```json
{
  "runId": 123,
  "status": "success|failed|aborted",
  "passedCases": 5,
  "failedCases": 0,
  "skippedCases": 0,
  "durationMs": 120000,
  "results": [
    {
      "caseId": 1,
      "caseName": "test_case_1",
      "status": "passed|failed|skipped",
      "duration": 30000,
      "errorMessage": "可选的错误信息"
    }
  ]
}
```

- `CALLBACK_URL` 必须是 Jenkins 节点或测试容器可直接访问的地址；远端 Jenkins 场景不要使用 `localhost`。
- 平台执行状态以测试结果回调为准，`status` 和统计值应来自 pytest 报告或用例结果，而不是 Pipeline 总体状态。
- 如果 Jenkins 后置步骤、归档或清理失败，但测试结果已经完整，不要再补发空的 `failed` 回调覆盖已有结果。

### 回调认证方式

Jenkins 回调支持三种认证方式（任选其一）：
1. **API Key 认证**：`X-Api-Key: <jenkins_api_key>`
2. **JWT Token 认证**：`Authorization: Bearer <jenkins_jwt_token>`
3. **签名认证**：`X-Jenkins-Signature: <hmac_signature>` + `X-Jenkins-Timestamp: <unix_timestamp>`

### ExecutionService 关键方法

- `triggerTestExecution()` — 创建执行批次（同时创建 TestRun 和 TaskExecution，并关联）
- `getBatchExecution()` — 查询执行详情（通过 execution_id 直接关联查询）
- `completeBatchExecution()` — 完成执行并更新统计
- `updateBatchJenkinsInfo()` — 更新 Jenkins 构建信息
- `parseTestResults()` — 解析 pytest 测试结果（支持 passed/failed/skipped 统计）

### 前端轮询策略

- 执行状态为 `pending` 时：快速轮询（3秒间隔）
- 禁用缓存以获取最新数据
- 自动停止轮询当执行完成（status 为 success/failed/aborted）
- 参考实现：`src/hooks/useExecuteCase.ts` 中的 `useBatchExecution()` 方法

### 相关文档

- [Jenkins 集成指南](Jenkins/JENKINS_INTEGRATION.md)
- [Jenkins 快速设置](Jenkins/JENKINS_QUICK_SETUP.md)
- [Jenkins 配置指南](Jenkins/JENKINS_CONFIG_GUIDE.md)
- [Jenkins 故障排查](Jenkins/JENKINS_TROUBLESHOOTING.md)

---

## Git 仓库集成规范

### 仓库配置

平台支持集成 Git 仓库来同步测试脚本：
- 支持多种 Git 托管平台（GitHub、GitLab、Gitee 等）
- 支持 SSH 和 HTTPS 两种连接方式
- 支持多分支管理
- 支持定时同步和手动同步

### 同步策略

平台提供两种同步策略：
1. **全量同步**：扫描整个仓库，解析所有测试脚本
2. **增量同步**：仅同步有变更的文件

### 脚本解析

- 自动解析 Python 测试脚本（pytest 格式）
- 识别测试类和测试方法
- 提取测试用例的元数据
- 支持自定义标记和分组

### 脚本映射

通过 `Auto_RepositoryScriptMappings` 表维护脚本与用例的映射关系：
- 每个脚本可以映射到多个测试用例
- 支持一对一、一对多、多对一的映射关系
- 映射关系可以手动维护或自动生成

### 相关服务

- `RepositoryService` — 仓库配置管理
- `RepositorySyncService` — 仓库同步服务
- `HybridSyncService` — 混合同步策略
- `ScriptParserService` — 脚本解析服务
