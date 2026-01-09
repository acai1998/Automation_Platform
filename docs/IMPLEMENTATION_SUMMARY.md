# 用例执行功能实现总结

## 概述

本次实现完成了从前端点击"执行"到Jenkins运行测试、结果回调的完整流程。系统采用异步非阻塞设计，支持单用例和批量执行，实时展示执行进度。

## 技术架构

```
┌─────────────┐
│   前端UI    │ ExecutionModal + ExecutionProgress
├─────────────┤
│  Hooks      │ useExecuteCase, useBatchExecution
├─────────────┤
│  API Route  │ /api/jenkins/run-case, /api/jenkins/run-batch
├─────────────┤
│ Services    │ ExecutionService, JenkinsService
├─────────────┤
│  Database   │ Auto_TestRun 表 (MariaDB)
├─────────────┤
│  Jenkins    │ Pipeline 脚本执行测试
└─────────────┘
```

## 核心实现

### 1. 后端数据库 (Auto_TestRun)

**表结构** (`server/db/schema.mariadb.sql`):
- `id`: 执行批次ID
- `project_id`: 项目ID
- `status`: 执行状态 (pending/running/success/failed/aborted)
- `case_ids`: 用例ID列表(JSON)
- `jenkins_build_id`: Jenkins构建ID
- `passed_cases/failed_cases/skipped_cases`: 执行结果统计
- `duration_ms`: 执行耗时
- 其他字段用于记录触发方式、触发人等

### 2. 后端 Services

#### ExecutionService (`server/services/ExecutionService.ts`)

新增方法:
- `triggerTestExecution()`: 创建执行批次，验证用例有效性
- `getBatchExecution()`: 查询执行批次详情
- `updateBatchJenkinsInfo()`: 更新Jenkins构建信息
- `completeBatchExecution()`: 完成执行，记录最终结果

#### JenkinsService (`server/services/JenkinsService.ts`)

新增方法:
- `triggerBatchJob()`: 批量触发Jenkins Job
- `getLatestBuildInfo()`: 获取最新构建信息

### 3. 后端 API 路由

#### Jenkins 路由 (`server/routes/jenkins.ts`)

**新增端点:**

| 方法 | 路由 | 说明 |
|------|------|------|
| POST | `/api/jenkins/run-case` | 执行单个用例 |
| POST | `/api/jenkins/run-batch` | 执行多个用例 |
| POST | `/api/jenkins/callback` | Jenkins回调结果 |
| GET | `/api/jenkins/batch/:runId` | 查询执行批次详情 |

### 4. Jenkins Pipeline

**文件**: `Jenkinsfile`

执行流程:
1. **准备**: 标记执行开始
2. **检出代码**: 克隆/更新测试仓库
3. **准备环境**: 创建Python虚拟环境，安装依赖
4. **执行测试**: 运行pytest
5. **收集结果**: 解析JSON报告
6. **回调平台**: 向API发送结果

支持参数:
- `RUN_ID`: 执行批次ID
- `CASE_IDS`: 用例ID列表
- `SCRIPT_PATHS`: 脚本路径
- `CALLBACK_URL`: 回调地址
- `MARKER`: Pytest marker

### 5. 前端实现

#### Hooks (`src/hooks/useExecuteCase.ts`)

- `useExecuteCase()`: 执行单个用例
- `useExecuteBatch()`: 批量执行
- `useBatchExecution()`: 实时轮询执行进度
- `useTestExecution()`: 完整执行管理

#### 组件

**ExecutionModal** (`src/components/cases/ExecutionModal.tsx`)
- 执行前确认对话框
- 显示用例数量和警告信息
- 错误提示

**ExecutionProgress** (`src/components/cases/ExecutionProgress.tsx`)
- 实时显示执行进度
- 统计数据展示(总数/通过/失败/跳过)
- 成功率进度条
- Jenkins链接

## 数据流转

### 执行流程

```
1. 用户点击"执行按钮"
   └─> 前端弹出 ExecutionModal

2. 用户确认执行
   └─> 调用 useExecuteCase/useExecuteBatch hook
   └─> POST /api/jenkins/run-case 或 /api/jenkins/run-batch

3. 后端接收请求
   └─> ExecutionService.triggerTestExecution()
   └─> 验证用例、创建 Auto_TestRun 记录
   └─> JenkinsService.triggerBatchJob()
   └─> 触发 Jenkins Job
   └─> 返回 runId 和 buildUrl

4. 前端获得 runId
   └─> useBatchExecution 开始轮询
   └─> 显示 ExecutionProgress 组件
   └─> 每3秒查询 /api/jenkins/batch/:runId

5. Jenkins 执行测试
   └─> Jenkinsfile 运行 pytest
   └─> 收集测试结果
   └─> POST /api/jenkins/callback

6. 后端处理回调
   └─> ExecutionService.completeBatchExecution()
   └─> 更新 Auto_TestRun 记录状态

7. 前端检测到执行完成
   └─> 停止轮询
   └─> 展示最终结果
```

## API 请求/响应示例

### 执行单个用例

```bash
POST /api/jenkins/run-case
{
  "caseId": 1,
  "projectId": 1,
  "triggeredBy": 1
}

Response:
{
  "success": true,
  "data": {
    "runId": 123,
    "buildUrl": "http://jenkins.wiac.xyz/job/.../45/"
  },
  "message": "Batch job triggered successfully"
}
```

### 批量执行用例

```bash
POST /api/jenkins/run-batch
{
  "caseIds": [1, 2, 3, 4],
  "projectId": 1,
  "triggeredBy": 1
}

Response:
{
  "success": true,
  "data": {
    "runId": 123,
    "totalCases": 4,
    "buildUrl": "http://jenkins.wiac.xyz/job/.../45/"
  }
}
```

### 查询执行进度

```bash
GET /api/jenkins/batch/123

Response:
{
  "success": true,
  "data": {
    "id": 123,
    "status": "running",
    "total_cases": 4,
    "passed_cases": 2,
    "failed_cases": 0,
    "skipped_cases": 0,
    "jenkins_build_url": "http://jenkins.wiac.xyz/...",
    "start_time": "2024-01-08 10:00:00",
    "duration_ms": null
  }
}
```

## 环境配置

### 后端 .env

```env
# Jenkins 配置
JENKINS_URL=https://jenkins.wiac.xyz
JENKINS_USER=root
JENKINS_TOKEN=your_api_token
JENKINS_JOB_API=SeleniumBaseCi-AutoTest

# 回调 URL
API_CALLBACK_URL=http://your-platform:3000/api/jenkins/callback
```

## 异常处理

### 场景1: 用例验证失败
```
触发执行 → 后端查询用例 → 用例不存在或已禁用
→ 返回错误消息 → 前端显示错误提示
```

### 场景2: Jenkins 触发失败
```
Jenkins API 请求失败 → 返回 success: false
→ 前端捕获错误 → 显示错误提示
```

### 场景3: 回调超时
```
Jenkins 执行完成 → 回调请求超时
→ 手动查询 /api/jenkins/batch/:runId
→ 获取最终状态
```

## 性能优化

1. **轮询间隔**: 3秒查询一次，平衡实时性和服务器负载
2. **查询缓存**: TanStack Query 自动缓存，避免重复请求
3. **异步处理**: Jenkins 执行为后台任务，不阻塞前端
4. **批量执行**: 支持单次执行多个用例，提高效率

## 安全考虑

1. **权限验证**: API 调用应增加认证(JWT token)
2. **速率限制**: 限制单位时间内的执行次数，防止滥用
3. **输入验证**: 严格验证 caseId、projectId 等参数
4. **日志记录**: 记录所有执行操作便于审计

## 后续改进方向

1. **WebSocket 推送**: 替代轮询，实时推送执行进度
2. **执行队列**: 支持任务优先级和队列管理
3. **分布式执行**: Jenkins 分布式构建节点支持
4. **报告详情**: 存储详细的用例执行日志和截图
5. **邮件通知**: 执行完成后发送邮件通知
6. **重试机制**: 失败用例自动重试
7. **性能分析**: 记录执行时间趋势，分析性能变化

## 测试清单

- [ ] 单用例执行成功
- [ ] 批量执行成功
- [ ] 实时进度显示正确
- [ ] 执行完成后结果准确
- [ ] 网络断连时的恢复
- [ ] 高并发情况下的稳定性
- [ ] Jenkins 连接失败时的处理
- [ ] 用例不存在时的错误提示

## 参考文档

- [Jenkins 集成指南](./JENKINS_INTEGRATION.md)
- [API 文档](../README.md)
- [项目架构](../CLAUDE.md)