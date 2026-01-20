# 执行结果获取问题排查指南

## 问题描述
点击"运行"按钮后，执行记录已创建但 Jenkins 信息未被填充，导致无法获取测试结果。

## 快速诊断步骤

### 1. 验证 Jenkins 连接
```bash
# 检查 Jenkins 是否正常运行
curl http://localhost:3000/api/jenkins/health
```

预期响应：
```json
{
  "success": true,
  "data": {
    "connected": true,
    "jenkinsUrl": "http://jenkins.wiac.xyz:8080/",
    "version": "2.xxx",
    "timestamp": "2024-01-17T..."
  },
  "message": "Jenkins is healthy"
}
```

如果 Jenkins 无法连接：
- 检查 `.env` 中的 `JENKINS_URL`、`JENKINS_USER`、`JENKINS_TOKEN` 是否正确
- 确保 Jenkins 服务器可访问

### 2. 诊断执行问题
```bash
# 替换 runId 为实际的执行 ID（例如 35）
curl "http://localhost:3000/api/jenkins/diagnose?runId=35"
```

预期响应会显示：
```json
{
  "success": true,
  "data": {
    "executionId": 35,
    "status": "pending",
    "jenkinsJob": null,
    "jenkinsBuildId": null,
    "jenkinsUrl": null,
    "startTime": null,
    "diagnostics": {
      "jenkinsInfoMissing": true,
      "startTimeMissing": true,
      "stillPending": true,
      "noTestResults": true,
      "suggestions": [
        "Jenkins 信息未被填充。这通常表示 Jenkins 触发失败。请检查后端日志查找错误信息。",
        "执行开始时间为空。这表示 Jenkins 尚未开始构建。请等待几秒后重试。",
        "执行仍处于 pending 状态。这是正常的，系统正在等待 Jenkins 接收任务。前端应该继续轮询。",
        "测试结果为空。这可能表示 Jenkins 任务尚未完成或回调失败。请检查 Jenkins 的执行日志。"
      ]
    }
  }
}
```

### 3. 检查后端日志
查看后端服务的标准输出，寻找以下关键日志：

```
[/api/jenkins/run-batch] Starting batch case execution: {...}
[/api/jenkins/run-batch] Execution record created: {...}
[/api/jenkins/run-batch] Triggering Jenkins job...
[JenkinsService.triggerBatchJob] Starting: {...}
[JenkinsService.triggerBatchJob] Response status: {...}
```

常见的错误信息：

| 错误信息 | 原因 | 解决方案 |
|---------|------|--------|
| `Failed to trigger batch job: 401` | Jenkins 认证失败 | 检查 JENKINS_TOKEN 是否有效 |
| `Failed to trigger batch job: 404` | Jenkins Job 不存在 | 检查 JENKINS_JOB_API 配置 |
| `Error triggering batch job: ECONNREFUSED` | 无法连接 Jenkins | 检查 JENKINS_URL 和网络连接 |
| `Error triggering batch job: ENOTFOUND` | Jenkins URL 无效 | 验证 JENKINS_URL 拼写 |

## 问题排查树

### 问题：点击运行后仍然显示 Loading

**检查项：**
1. ✅ 后端是否返回了 runId？
   ```bash
   # 运行任何执行，查看是否返回了 runId
   ```

2. ✅ 前端是否在轮询？
   - 打开浏览器开发者工具 (F12)
   - 查看 Network 标签
   - 应该看到间隔 3-10 秒的 `/api/jenkins/batch/xx` 请求

3. ✅ Jenkins 信息是否被填充？
   - 使用诊断端点检查
   - 如果 `jenkinsJob`, `jenkinsBuildId`, `jenkinsUrl` 都是 null，说明触发失败

### 问题：Jenkins 信息为 null（触发失败）

**可能原因：**

1. **Jenkins 连接失败**
   ```bash
   curl http://localhost:3000/api/jenkins/health
   ```
   - 如果返回 `connected: false`，检查 Jenkins 配置

2. **Jenkins Job 名称错误**
   ```bash
   # 检查后端日志中的 jobName
   # 应该与 JENKINS_JOB_API 环境变量匹配
   ```

3. **Jenkins 认证失败**
   ```bash
   # 验证 Jenkins Token
   curl -u root:YOUR_TOKEN http://jenkins.url/api/json
   ```

4. **Jenkins 参数化配置缺失**
   - Jenkins Job 必须配置为接收参数
   - 必须参数：`RUN_ID`, `CASE_IDS`, `SCRIPT_PATHS`, `CALLBACK_URL`

### 问题：查询执行详情返回 404

**原因：** 前端使用了错误的 API 路由

**检查：**
- 前端应该调用 `/api/jenkins/batch/:runId`（GET 请求）
- 不是 `/api/jenkins/:runId` 或其他路由

```bash
# 正确的请求
curl "http://localhost:3000/api/jenkins/batch/35"

# 错误的请求
curl "http://localhost:3000/api/jenkins/35"  # 这会返回 404
```

## 后端日志分析

### 成功的执行日志示例

```
[/api/jenkins/run-batch] Starting batch case execution: {
  caseCount: 1,
  caseIds: [1],
  projectId: 1,
  triggeredBy: 1,
  timestamp: "2024-01-17T10:00:00Z"
}

[/api/jenkins/run-batch] Execution record created: {
  runId: 35,
  totalCases: 1
}

[/api/jenkins/run-batch] Triggering Jenkins job...

[JenkinsService.triggerBatchJob] Starting: {
  runId: 35,
  jobName: "SeleniumBaseCi-AutoTest",
  caseCount: 1,
  baseUrl: "http://jenkins.wiac.xyz:8080/",
  triggerUrl: "http://jenkins.wiac.xyz:8080/job/SeleniumBaseCi-AutoTest/buildWithParameters"
}

[JenkinsService.triggerBatchJob] Response status: {
  status: 201,
  statusText: "Created",
  location: "http://jenkins.wiac.xyz:8080/queue/item/12345/"
}

[JenkinsService.triggerBatchJob] Build info: {
  buildNumber: 45,
  buildUrl: "http://jenkins.wiac.xyz:8080/job/SeleniumBaseCi-AutoTest/45/"
}

[/api/jenkins/run-batch] Updating Jenkins info: {
  runId: 35,
  buildId: "45",
  buildUrl: "http://jenkins.wiac.xyz:8080/job/SeleniumBaseCi-AutoTest/45/"
}
```

### 失败的执行日志示例

```
[JenkinsService.triggerBatchJob] Response status: {
  status: 401,
  statusText: "Unauthorized",
  location: null
}

[JenkinsService.triggerBatchJob] Failed with status 401: Unauthorized

[/api/jenkins/run-batch] Jenkins trigger failed: Failed to trigger batch job: 401 Unauthorized
```

## 前端调试步骤

### 1. 检查网络请求
```javascript
// 打开浏览器控制台，检查 API 请求
// 应该看到：
// POST /api/jenkins/run-batch → 返回 { runId: 35, buildUrl: ... }
// GET /api/jenkins/batch/35 → (每 3-5 秒一次)
```

### 2. 查看轮询日志
```javascript
// 在浏览器控制台查找轮询日志
// [Polling] In pending state, fast polling (3 seconds)
// [Polling] Execution completed with status: success, stopping polling
```

### 3. 检查钩子状态
```javascript
// 在组件中添加调试
import { useBatchExecution } from '@/hooks/useExecuteCase';

const query = useBatchExecution(runId);
console.log('Query status:', query);
console.log('Is fetching:', query.isFetching);
console.log('Data:', query.data);
console.log('Error:', query.error);
```

## 数据库验证

### 检查执行记录是否正确创建
```bash
# 连接到数据库
mysql -h 117.72.182.23 -u root -p autotest

# 查询执行记录
SELECT * FROM Auto_TestRun WHERE id = 35;

# 预期结果：
# id=35, status='pending' (或 'running'), jenkins_job=NULL, jenkins_build_id=NULL
```

## 常见问题 FAQ

### Q: 为什么执行记录创建成功但 Jenkins 信息为 null？
**A:** Jenkins 触发请求失败。查看后端日志中 `JenkinsService.triggerBatchJob` 的错误信息。

### Q: 为什么前端一直显示 loading？
**A:** 检查浏览器开发者工具：
- Network 标签是否显示轮询请求？
- 轮询请求是否返回了正确的数据？
- 轮询是否按照预期的间隔进行？

### Q: 如何重新执行一个失败的任务？
**A:** 当前版本不支持直接重试。您需要：
1. 创建新的执行记录
2. 点击运行按钮

### Q: Jenkins 回调失败怎么办？
**A:** 执行可能会卡在 'running' 状态：
1. 检查 Jenkins 执行日志
2. 检查 Jenkins 回调 URL 是否正确
3. 检查后端 `/api/jenkins/callback` 是否正常工作

## 联系支持

如果问题无法解决，请收集以下信息并联系开发团队：

1. 执行 ID（runId）
2. 后端完整日志输出
3. `/api/jenkins/health` 的响应
4. `/api/jenkins/diagnose?runId=XX` 的响应
5. 浏览器网络请求日志（Network 标签截图）
