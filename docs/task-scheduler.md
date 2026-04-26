# 任务调度规范

> **触发场景**：开发或调试定时任务、修改调度逻辑、排查任务执行问题时读取本文件，涉及 `server/services/TaskSchedulerService.ts`。

---

## 任务类型

1. **定时任务**：基于 Cron 表达式的定时执行
2. **一次性任务**：手动触发立即执行
3. **周期性任务**：按固定间隔重复执行

---

## TaskSchedulerService 核心能力（v1.3.0）

### 调度引擎

- **Cron 解析（croner 库）**：零依赖、原生 TS，支持 5 段标准 cron，`* / , -` 语法完整覆盖
- **服务重启恢复**：启动时遍历 DB 中所有 `trigger_type='scheduled'` 的 active 任务并自动注册
- **漏触发补偿**：基于 `lastRunAt` 检测 24h 窗口内的漏触发，自动补偿执行
- **每分钟 DB 轮询**：自动同步任务增删改（cron 变更、状态变更、新任务注册）

### 执行控制

- **并发上限**：默认 3，可通过环境变量 `TASK_CONCURRENCY_LIMIT` 配置
- **FIFO 内存等待队列**：超出并发上限的任务进入队列，有空闲时自动 drain
- **失败重试**：指数退避策略，由 `max_retries`（默认 1）和 `retry_delay_ms`（默认 30s）字段控制
- **取消执行**：支持取消 `pending/running` 状态的任务执行

### 审计日志

- 10 种操作行为全链路追踪，写入 `Auto_TaskAuditLogs`
- `operator_id = NULL` 表示系统自动操作，非 NULL 表示真实用户操作
- 审计写入失败不影响主流程（静默处理）

---

## 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `TASK_CONCURRENCY_LIMIT` | `3` | 最大并发任务数 |

---

## 相关 API 端点

- `GET /api/tasks/scheduler/status` — 调度器实时状态
- `POST /api/tasks/:id/execute` — 立即执行任务
- `POST /api/tasks/:id/executions/:execId/cancel` — 取消运行中的执行
- `GET /api/tasks/:id/stats` — 任务维度统计（成功率趋势、失败原因聚合 Top 10）
- `GET /api/tasks/:id/audit` — 任务审计日志
