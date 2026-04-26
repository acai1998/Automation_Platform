# Executions 路由接口文档

## 1. 文档说明
- 路由文件：`server/routes/executions.ts`
- 路由前缀：`/api/executions`
- 鉴权中间件：
  - `authenticate`：需要登录态（通常为 `Authorization: Bearer <token>`）
  - `requireTester`：需要测试角色权限

## 2. 接口总览

| 接口名称 | 方法 | 路径 | 鉴权要求 | 说明 |
| --- | --- | --- | --- | --- |
| Jenkins 回调 | POST | `/api/executions/callback` | 否 | Jenkins 回传执行结果 |
| 标记执行开始 | POST | `/api/executions/:id/start` | 否 | 将执行状态置为 running |
| 运行记录列表（TestRun） | GET | `/api/executions/test-runs` | 否 | 分页+筛选查询 Auto_TestRun |
| 历史卡住汇总 | GET | `/api/executions/stale-summary` | `authenticate` | 查询卡住执行统计 |
| 清理历史卡住执行 | POST | `/api/executions/cleanup-stale` | `authenticate` + `requireTester` | 将历史卡住记录置为 aborted |
| 按 runId 查结果 | GET | `/api/executions/test-runs/:runId/results` | 否 | 查询某批次用例结果 |
| 调度追踪日志 | GET | `/api/executions/test-runs/:runId/scheduler-logs` | 否 | 查询调度/审计日志时间线 |
| 按 id 查结果（分页） | GET | `/api/executions/:id/results` | 否 | 查询某批次用例结果（支持分页筛选） |
| TestRun 详情 | GET | `/api/executions/:id` | 否 | 查询某次运行详情 |
| 最近执行列表 | GET | `/api/executions` | 否 | 查询 TaskExecution 最近记录 |
| 手动同步 Jenkins 状态 | POST | `/api/executions/:id/sync` | 否 | 主动拉取 Jenkins 状态并同步 |
| 批量同步卡住执行 | POST | `/api/executions/sync-stuck` | 否 | 批量检查并处理超时执行 |
| 卡住执行列表 | GET | `/api/executions/stuck` | 否 | 查询 pending/running 且超时记录 |
| 取消执行 | POST | `/api/executions/:id/cancel` | 否 | 取消指定执行 |

## 3. 通用返回结构

### 3.1 成功返回（通用）
| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `success` | `boolean` | 是否成功，成功时固定为 `true` |
| `message` | `string` | 部分接口返回的人类可读描述 |
| `data` | `object/array` | 业务数据，具体结构见各接口 |
| `total` | `number` | 列表总数（分页接口） |
| `page` | `number` | 当前页码（分页接口） |
| `pageSize` | `number` | 每页条数（分页接口） |

### 3.2 失败返回（通用）
| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `success` | `boolean` | 是否成功，失败时固定为 `false` |
| `message` | `string` | 错误描述 |

---

## 4. 详细接口定义

## 4.1 POST `/api/executions/callback`
### 请求头
| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `Content-Type` | `string` | 是 | 推荐 `application/json` |

### 请求体参数
| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `executionId` | `number` | 是 | 执行 ID（TaskExecution 主键） |
| `status` | `string` | 是 | 执行状态，枚举：`success`/`failed`/`cancelled`/`aborted` |
| `results` | `array<object>` | 是 | 用例结果列表 |
| `results[].caseId` | `number` | 否 | 用例 ID；某些框架可不传（走 `caseName` 匹配） |
| `results[].caseName` | `string` | 是 | 用例名称 |
| `results[].status` | `string` | 是 | 用例状态，枚举：`passed`/`failed`/`skipped`/`error` |
| `results[].duration` | `number` | 是 | 用例耗时（毫秒） |
| `results[].errorMessage` | `string` | 否 | 失败错误信息 |
| `results[].stackTrace` | `string` | 否 | 错误堆栈 |
| `results[].screenshotPath` | `string` | 否 | 失败截图路径 |
| `results[].logPath` | `string` | 否 | 执行日志路径 |
| `results[].assertionsTotal` | `number` | 否 | 断言总数 |
| `results[].assertionsPassed` | `number` | 否 | 断言通过数 |
| `results[].responseData` | `string` | 否 | 接口响应数据（通常是 JSON 字符串） |
| `results[].startTime` | `string/number` | 否 | 用例开始时间（ISO 字符串或时间戳） |
| `results[].endTime` | `string/number` | 否 | 用例结束时间（ISO 字符串或时间戳） |
| `duration` | `number` | 否 | 本次执行总耗时；未传时后端按 `0` 处理 |
| `reportUrl` | `string` | 否 | 报告 URL |

### 成功响应（200）
| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `success` | `boolean` | 固定为 `true` |
| `message` | `string` | 固定为 `Callback processed successfully` |

### 失败响应
- `400`：`executionId/status/results` 缺失或 `results` 非数组
- `500`：服务端处理异常

---

## 4.2 POST `/api/executions/:id/start`
### 路径参数
| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `id` | `number` | 是 | 执行 ID |

### 成功响应（200）
| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `success` | `boolean` | 固定为 `true` |
| `message` | `string` | 固定为 `Execution marked as running` |

### 失败响应
- `500`：更新执行状态失败

---

## 4.3 GET `/api/executions/test-runs`
### 查询参数
| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `limit` | `number` | 否 | 每页数量，默认 `50`，范围 `[1,100]` |
| `offset` | `number` | 否 | 偏移量，默认 `0` |
| `triggerType` | `string` | 否 | 触发类型，逗号分隔多值（如 `manual,schedule`） |
| `status` | `string` | 否 | 运行状态，逗号分隔多值 |
| `startDate` | `string` | 否 | 开始日期，格式 `YYYY-MM-DD` |
| `endDate` | `string` | 否 | 结束日期，格式 `YYYY-MM-DD` |

### 成功响应（200）
| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `success` | `boolean` | 固定为 `true` |
| `data` | `array<object>` | 运行记录列表 |
| `data[].id` | `number` | TestRun ID |
| `data[].project_id` | `number/null` | 项目 ID |
| `data[].project_name` | `string` | 项目名，后端按 `project_id` 映射（如 `项目 #12`/`未分类`） |
| `data[].status` | `string` | 运行状态 |
| `data[].trigger_type` | `string` | 触发方式（manual/jenkins/schedule） |
| `data[].trigger_by` | `number` | 触发人用户 ID |
| `data[].trigger_by_name` | `string` | 触发人名称（display_name/username/系统） |
| `data[].jenkins_job` | `string/null` | Jenkins Job 名称 |
| `data[].jenkins_build_id` | `string/null` | Jenkins Build ID |
| `data[].jenkins_url` | `string/null` | Jenkins 构建链接 |
| `data[].abort_reason` | `string/null` | 中止原因（从 run_config 提取） |
| `data[].total_cases` | `number` | 用例总数 |
| `data[].passed_cases` | `number` | 通过数 |
| `data[].failed_cases` | `number` | 失败数 |
| `data[].skipped_cases` | `number` | 跳过数 |
| `data[].duration_ms` | `number` | 执行时长（毫秒） |
| `data[].start_time` | `string/null` | 开始时间 |
| `data[].end_time` | `string/null` | 结束时间 |
| `total` | `number` | 满足筛选条件的总记录数 |

### 失败响应
- `500`：查询失败

---

## 4.4 GET `/api/executions/stale-summary`
### 鉴权
- 需要 `authenticate`

### 查询参数
| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `maxAgeHours` | `number` | 否 | 已启动执行的最大允许时长（小时），默认 `24`，范围 `[1,168]` |
| `stalePendingMinutes` | `number` | 否 | `pending` 且未启动记录的超时分钟数，默认 `10`，范围 `[1,1440]` |

### 成功响应（200）
| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `success` | `boolean` | 固定为 `true` |
| `data` | `object` | 汇总数据 |
| `data.stalePendingNoStartCount` | `number` | `pending + start_time 为空` 的超时数量 |
| `data.staleStartedCount` | `number` | `pending/running + start_time 非空` 且超时数量 |
| `data.totalStaleCount` | `number` | 历史卡住总数（前两项求和） |
| `data.latestStalePendingCreatedAt` | `string/null` | 最晚的“未启动 pending 超时”创建时间 |
| `data.maxAgeHours` | `number` | 本次统计使用的 `maxAgeHours` |
| `data.stalePendingMinutes` | `number` | 本次统计使用的 `stalePendingMinutes` |

### 失败响应
- `500`：查询失败

---

## 4.5 POST `/api/executions/cleanup-stale`
### 鉴权
- 需要 `authenticate` + `requireTester`

### 请求体参数
| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `dryRun` | `boolean` | 否 | 是否只预览不实际更新，默认 `false` |
| `maxAgeHours` | `number` | 否 | 已启动执行的最大允许时长（小时），默认 `24`，范围 `[1,168]` |
| `stalePendingMinutes` | `number` | 否 | `pending` 未启动记录超时分钟数，默认 `10`，范围 `[1,1440]` |

### 成功响应（200）
| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `success` | `boolean` | 固定为 `true` |
| `data` | `object` | 清理结果 |
| `data.dryRun` | `boolean` | 是否为演练模式 |
| `data.affectedCount` | `number` | 实际更新数量；`dryRun=true` 时固定 `0` |
| `data.stalePendingNoStartCount` | `number` | 汇总：未启动 pending 超时数量 |
| `data.staleStartedCount` | `number` | 汇总：已启动但超时数量 |
| `data.totalStaleCount` | `number` | 汇总总数 |
| `data.latestStalePendingCreatedAt` | `string/null` | 最晚 pending 超时创建时间 |
| `data.maxAgeHours` | `number` | 本次清理参数回显 |
| `data.stalePendingMinutes` | `number` | 本次清理参数回显 |

### 失败响应
- `500`：清理失败

---

## 4.6 GET `/api/executions/test-runs/:runId/results`
### 路径参数
| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `runId` | `number` | 是 | TestRun ID |

### 成功响应（200）
| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `success` | `boolean` | 固定为 `true` |
| `data` | `array<object>` | 用例结果列表 |
| `data[].id` | `number` | 结果记录 ID |
| `data[].execution_id` | `number` | 执行 ID |
| `data[].case_id` | `number` | 用例 ID |
| `data[].case_name` | `string` | 用例名称 |
| `data[].module` | `string` | 用例模块 |
| `data[].priority` | `string` | 用例优先级 |
| `data[].type` | `string` | 用例类型 |
| `data[].status` | `string` | 执行状态（passed/failed/skipped/error 等） |
| `data[].start_time` | `string/null` | 用例开始时间 |
| `data[].end_time` | `string/null` | 用例结束时间 |
| `data[].duration` | `number/null` | 用例耗时 |
| `data[].error_message` | `string/null` | 错误信息 |
| `data[].error_stack` | `string/null` | 错误堆栈 |
| `data[].screenshot_path` | `string/null` | 截图路径 |
| `data[].log_path` | `string/null` | 日志路径 |
| `data[].assertions_total` | `number/null` | 断言总数 |
| `data[].assertions_passed` | `number/null` | 断言通过数 |
| `data[].response_data` | `string/null` | 响应原始数据 |
| `data[].created_at` | `string` | 记录创建时间 |
| `total` | `number` | 结果总数 |

### 失败响应
- `500`：查询失败

---

## 4.7 GET `/api/executions/test-runs/:runId/scheduler-logs`
### 路径参数
| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `runId` | `number` | 是 | TestRun ID，必须大于 0 |

### 成功响应（200）
| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `success` | `boolean` | 固定为 `true` |
| `data` | `array<object>` | 调度时间线日志 |
| `data[].id` | `string` | 时间线事件 ID（如 `run-created-1`/`audit-23`） |
| `data[].source` | `string` | 事件来源：`run` 或 `audit` |
| `data[].action` | `string` | 动作标识（如 `run_created`、`triggered`） |
| `data[].createdAt` | `string/null` | 事件时间 |
| `data[].operatorId` | `number/null` | 操作人 ID（系统事件可能为空） |
| `data[].operatorName` | `string/null` | 操作人名称 |
| `data[].message` | `string` | 展示文案 |
| `data[].metadata` | `object` | 附加上下文信息（runId/executionId/taskId/status 等） |

### 失败响应
- `400`：`runId` 非法
- `404`：运行记录不存在
- `500`：查询失败

---

## 4.8 GET `/api/executions/:id/results`
### 路径参数
| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `id` | `number` | 是 | TestRun ID |

### 查询参数
| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `page` | `number` | 否 | 页码，默认 `1` |
| `pageSize` | `number` | 否 | 每页条数，默认 `20`，最大 `100` |
| `status` | `string` | 否 | 状态过滤；当传 `failed` 时会包含 `error` |
| `keyword` | `string` | 否 | 关键字过滤（匹配 `case_name`/`module`） |

### 成功响应（200）
- `data[]` 字段结构与 `4.6` 相同。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `success` | `boolean` | 固定为 `true` |
| `data` | `array<object>` | 当前页结果列表 |
| `total` | `number` | 满足筛选条件总数 |
| `page` | `number` | 当前页码 |
| `pageSize` | `number` | 当前每页条数 |

### 失败响应
- `500`：查询失败

---

## 4.9 GET `/api/executions/:id`
### 路径参数
| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `id` | `number` | 是 | TestRun ID |

### 成功响应（200）
| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `success` | `boolean` | 固定为 `true` |
| `data` | `object` | TestRun 详情 |
| `data.id` | `number` | TestRun ID |
| `data.project_id` | `number/null` | 项目 ID |
| `data.project_name` | `string` | 项目名称 |
| `data.status` | `string` | 运行状态 |
| `data.trigger_type` | `string` | 触发方式 |
| `data.trigger_by` | `number` | 触发人 ID |
| `data.trigger_by_name` | `string` | 触发人名称 |
| `data.jenkins_job` | `string/null` | Jenkins Job |
| `data.jenkins_build_id` | `string/null` | Jenkins Build ID |
| `data.jenkins_url` | `string/null` | Jenkins 地址 |
| `data.abort_reason` | `string/null` | 中止原因 |
| `data.total_cases` | `number` | 总用例数 |
| `data.passed_cases` | `number` | 通过数 |
| `data.failed_cases` | `number` | 失败数 |
| `data.skipped_cases` | `number` | 跳过数 |
| `data.duration_ms` | `number` | 执行时长（毫秒） |
| `data.start_time` | `string/null` | 开始时间 |
| `data.end_time` | `string/null` | 结束时间 |
| `data.created_at` | `string/null` | 创建时间 |

### 失败响应
- `404`：记录不存在
- `500`：查询失败

---

## 4.10 GET `/api/executions`
### 查询参数
| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `limit` | `number` | 否 | 返回条数，默认 `20`，范围 `[1,100]` |

### 成功响应（200）
| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `success` | `boolean` | 固定为 `true` |
| `data` | `array<object>` | 最近执行记录 |
| `data[].id` | `number` | 执行 ID |
| `data[].taskId` | `number` | 任务 ID |
| `data[].taskName` | `string` | 任务名称 |
| `data[].status` | `string` | 执行状态 |
| `data[].totalCases` | `number` | 总用例数 |
| `data[].passedCases` | `number` | 通过数 |
| `data[].failedCases` | `number` | 失败数 |
| `data[].skippedCases` | `number` | 跳过数 |
| `data[].duration` | `number` | 总耗时 |
| `data[].executedBy` | `number` | 执行人 ID |
| `data[].executedByName` | `string` | 执行人名称 |
| `data[].startTime` | `string/null` | 开始时间 |
| `data[].endTime` | `string/null` | 结束时间 |

### 失败响应
- `500`：查询失败

---

## 4.11 POST `/api/executions/:id/sync`
### 路径参数
| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `id` | `number` | 是 | TestRun ID |

### 成功响应（200）
| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `success` | `boolean` | 同步是否成功（透传服务层结果） |
| `data` | `object` | 同步结果 |
| `data.updated` | `boolean` | 是否发生状态更新 |
| `data.message` | `string` | 同步说明 |
| `data.currentStatus` | `string` | 同步前/当前状态（可能为空） |
| `data.jenkinsStatus` | `string` | Jenkins 状态（可能为空） |
| `data.executionId` | `number` | 本次同步的执行 ID（即路径参数） |

### 失败响应
- `400`：`id` 非法
- `500`：同步失败

---

## 4.12 POST `/api/executions/sync-stuck`
### 请求体参数
| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `timeoutMinutes` | `number` | 否 | 超时阈值（分钟），默认 `10` |
| `maxExecutions` | `number` | 否 | 预期最大处理数量，默认 `20`（当前实现仅回显，不参与实际查询限制） |

### 成功响应（200）
| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `success` | `boolean` | 固定为 `true` |
| `data` | `object` | 批量同步结果 |
| `data.checked` | `number` | 检查的执行数 |
| `data.timedOut` | `number` | 被标记超时的执行数 |
| `data.updated` | `number` | 从 Jenkins 同步并更新状态的执行数 |
| `data.timeoutMinutes` | `number` | 本次使用的超时阈值 |
| `data.message` | `string` | 汇总说明文本 |

### 失败响应
- `500`：批量同步失败

---

## 4.13 GET `/api/executions/stuck`
### 查询参数
| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `timeout` | `number` | 否 | 超时阈值（分钟），默认 `10` |

### 成功响应（200）
| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `success` | `boolean` | 固定为 `true` |
| `data` | `object` | 卡住执行信息 |
| `data.executions` | `array<object>` | 卡住执行列表（最多 50 条） |
| `data.executions[].id` | `number` | 执行 ID |
| `data.executions[].status` | `string` | 执行状态（pending/running） |
| `data.executions[].jenkins_job` | `string/null` | Jenkins Job |
| `data.executions[].jenkins_build_id` | `string/null` | Jenkins Build ID |
| `data.executions[].jenkins_url` | `string/null` | Jenkins URL |
| `data.executions[].start_time` | `string` | 开始时间 |
| `data.executions[].duration_minutes` | `number` | 已运行分钟数 |
| `data.executions[].trigger_by_name` | `string/null` | 触发人名称 |
| `data.timeoutMinutes` | `number` | 本次阈值（分钟） |
| `data.count` | `number` | 卡住记录数 |

### 失败响应
- `500`：查询失败

---

## 4.14 POST `/api/executions/:id/cancel`
### 路径参数
| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `id` | `number` | 是 | 执行 ID |

### 成功响应（200）
| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `success` | `boolean` | 固定为 `true` |
| `message` | `string` | 固定为 `Execution cancelled` |

### 失败响应
- `500`：取消失败

---

## 5. 状态码汇总
| 状态码 | 场景 |
| --- | --- |
| `200` | 请求成功 |
| `400` | 参数非法或必填缺失 |
| `401` | 未认证（鉴权接口） |
| `403` | 权限不足（`requireTester`） |
| `404` | 资源不存在 |
| `500` | 服务端异常 |
