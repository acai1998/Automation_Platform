# 技术实现细节 - 数据规范化与幂等性处理

## 1. 数据规范化 - normalizeCallbackResults()

### 位置
`server/routes/jenkins.ts` 第 117-179 行

### 核心函数签名
```typescript
function normalizeCallbackResults(results: unknown[]): Array<Record<string, unknown>>
```

### 实现原理

#### 1.1 字段名映射（处理 camelCase vs snake_case）

| 输入字段 | 输出字段 | 说明 |
|--------|--------|------|
| caseId / case_id | caseId | 用例ID（必需） |
| caseName / case_name | caseName | 用例名称（必需，缺失时用ID替代） |
| status | status | 状态（规范化） |
| duration / durationMs / duration_ms | duration | 执行时长（毫秒） |
| startTime / start_time | startTime | 开始时间 |
| endTime / end_time | endTime | 结束时间 |
| errorMessage / error_message | errorMessage | 错误信息 |
| stackTrace / errorStack / error_stack | stackTrace | 堆栈跟踪 |
| screenshotPath / screenshot_path | screenshotPath | 截图路径 |
| logPath / log_path | logPath | 日志路径 |
| assertionsTotal / assertions_total | assertionsTotal | 断言总数 |
| assertionsPassed / assertions_passed | assertionsPassed | 通过断言数 |
| responseData / response_data | responseData | 响应数据 |

#### 1.2 状态规范化逻辑

```typescript
const rawStatus = String(row['status'] ?? '').trim().toLowerCase();
const normalizedStatus = 
  rawStatus === 'success' || rawStatus === 'pass'
    ? 'passed'
    : rawStatus === 'fail'
      ? 'failed'
      : rawStatus || 'error';
```

**映射规则**
```
输入状态 → 输出状态
'success' → 'passed'
'pass' → 'passed'
'fail' → 'failed'
'error' → 'error'
'failed' → 'failed'
其他 → 原值或 'error'
```

#### 1.3 类型转换

```typescript
// 数字转换
const toNumber = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
};

// 字符串转换
const toOptionalString = (value: unknown): string | undefined => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  return undefined;
};
```

**类型处理**
- 字符串数字 "123" 转换为数字 123
- 无限大或 NaN 返回 undefined
- 空字符串 "" 返回 undefined
- 尾部空格被 trim()

#### 1.4 有效性检查

```typescript
// 过滤条件：caseId 或 caseName 至少有一个有效
const caseId = toNumber(row['caseId'] ?? row['case_id']);
const caseName = toOptionalString(row['caseName'] ?? row['case_name']);
if ((!caseId || caseId <= 0) && !caseName) {
  return null;  // 此记录被过滤
}
```

**关键检查**
- caseId > 0 或 caseName 非空
- 无效记录被过滤掉
- 缺失 caseName 时自动生成 `case_${caseId}`

#### 1.5 使用场景

```typescript
// 在 /api/jenkins/callback 中
const normalizedResults = normalizeCallbackResults(rawResults);

// 在 /api/jenkins/callback/test 中
const normalizedInputResults = Array.isArray(results) 
  ? normalizeCallbackResults(results) 
  : [];
```

## 2. 幂等性处理 - completeBatchExecution()

### 位置
`server/services/ExecutionService.ts` 第 513-661 行

### 幂等性检查逻辑

#### 2.1 三重状态检查

```typescript
// 1. 检查 TestRun 是否已完成
const finalStatuses = ['success', 'failed', 'cancelled', 'aborted'];
if (finalStatuses.includes(execution.status)) {
  // 2. 检查当前回调是否有实际数据
  const hasDetailedResults = Array.isArray(results.results) && results.results.length > 0;
  const hasSummaryCounts = (results.passedCases + results.failedCases + results.skippedCases) > 0;
  
  // 3. 根据数据情况决策
  if (!hasDetailedResults && !hasSummaryCounts) {
    // 空重复回调 - 跳过
    logger.warn('Execution already completed, skipping empty duplicate callback', {...});
    return;
  }
  // 否则继续处理（含数据重复回调）
  logger.warn('Execution already completed, but callback carries result payload; continuing reconciliation', {...});
}
```

#### 2.2 决策流程图

```
回调到达
  ↓
TestRun 是否已完成?
  ├─ 否 → 继续处理 ✓
  └─ 是 → 检查回调数据
      ├─ 有用例明细? ✓ → 继续处理（更新用例）
      ├─ 有汇总数据? ✓ → 继续处理（更新统计）
      └─ 都没有? → 跳过处理 ✗
```

### 2.3 工作流场景

**场景 A: 正常回调（首次）**
```
状态: TestRun = pending → success
数据: 用例明细 + 汇总数据
处理: 完整保存所有数据 ✓
```

**场景 B: Jenkins 轮询同步**
```
状态: Jenkins 先通过轮询标记完成 → TestRun = success
数据: 轮询返回空结果
处理: 跳过空回调 ✓

后续:
状态: TestRun = success
数据: Jenkins 回调到达，携带用例明细
处理: 继续处理，更新用例表 ✓ (防止数据丢失)
```

**场景 C: 网络重试（重复回调）**
```
状态: TestRun 已更新为 success
数据: 完全相同的用例明细数组
处理: 识别为重复，但检测到有实际数据，继续处理
结果: 用例数据被重写（幂等）✓
```

**场景 D: 占位符更新**
```
初始:
- TestRun = running
- Auto_TestRunResults 有预创建的 error 占位记录

回调:
- status = 'success'
- results[] = [{caseName, status: 'passed', ...}]

处理:
1. 检查到 TestRun = running（未完成），不触发幂等性检查
2. 调用 completeBatch() 更新 TestRun.status
3. 更新 Auto_TestRunResults，将 error 占位符替换为 passed

结果: 用例状态从 error → passed ✓
```

## 3. 数据流完整路径

### 3.1 从 Jenkins 到前端的数据转换

```
Jenkins Job
  ↓
test-report.json (格式多样)
  例如: {caseName, status: 'success', duration: 5000, ...}
  或:   {case_id, status: 'pass', durationMs: 5000, ...}
  ↓
POST /api/jenkins/callback (原始 JSON)
  ↓
normalizeCallbackResults()
  {
    caseId: 2228,
    caseName: 'test_name',
    status: 'passed',        // 已规范化
    duration: 5000,          // 已转换
    ...
  }
  ↓
CallbackQueue.enqueue()
  ↓
CallbackQueue Worker (异步)
  ↓
executionService.completeBatchExecution()
  ├─ 幂等性检查
  ├─ AUTO_TESTRUNRESULTS 表更新
  └─ TestRun 统计数据更新
  ↓
GET /api/executions/:id/results
  SQL Query 返回:
  {
    case_name,           // snake_case
    status: 'passed',    // 已规范化
    duration: 5000,
    ...
  }
  ↓
前端 useTestRunResults hook
  ↓
ReportDetail 组件渲染
  ├─ formatDuration(5000) → "5.0s"
  ├─ formatTime(date) → "10:30:45"
  └─ getStatusLabel('passed') → "PASSED"
```

### 3.2 关键转换点

| 点位 | 操作 | 输出 |
|------|------|------|
| Jenkins | 生成 test-report.json | 多种格式 |
| Jenkins 回调 | normalizeCallbackResults | 统一格式 |
| 数据库写入 | completeBatchExecution | 规范化存储 |
| API 查询 | getExecutionResults | snake_case JSON |
| 前端格式化 | ReportDetail 组件 | 用户可读文本 |

## 4. 性能分析

### 4.1 normalizeCallbackResults()

```
时间复杂度: O(n * m)
- n = results 数组长度
- m = 每条记录的字段数（固定≈15）
实际: O(n)，因为 m 固定

空间复杂度: O(n)
- 创建新数组和对象副本

性能特性:
- 无外部 I/O
- 无数据库查询
- 纯内存操作
- 建议处理 <10000 条记录/次
```

### 4.2 幂等性检查

```
时间复杂度: O(1)
- 固定数量的字段检查
- 无循环

空间复杂度: O(1)
- 仅检查标志位

性能特性:
- 极小开销
- 不阻塞主流程
```

### 4.3 优化建议

1. **批处理**
```typescript
// 如果 results 过大，分批处理
const batchSize = 5000;
for (let i = 0; i < results.length; i += batchSize) {
  const batch = results.slice(i, i + batchSize);
  const normalized = normalizeCallbackResults(batch);
  // 处理
}
```

2. **缓存**
```typescript
// 如果有重复的状态映射，可以缓存
const statusCache = new Map();
```

3. **异步处理**
```typescript
// 已实现！通过 CallbackQueue
callbackQueue.enqueue(normalizedPayload);
```

## 5. 监控和调试

### 5.1 关键日志点

```typescript
// 1. 规范化输入
logger.info(`Processing raw callback data`, {
  resultsCount: results?.length || 0,
  // 检查原始数据
});

// 2. 规范化后
logger.info(`Processing real callback data`, {
  resultsCount: normalizedResults.length,
  // 验证规范化成功
});

// 3. 幂等性检查
logger.warn('Execution already completed, skipping empty duplicate callback', {
  hasDetailedResults: false,
  hasSummaryCounts: false,
  // 确认幂等性触发
});
```

### 5.2 调试技巧

**检查原始 Jenkins 回调数据**
```bash
# 在 jenkins.ts 的 /api/jenkins/callback 路由添加
console.log('Raw callback:', JSON.stringify(req.body, null, 2));
```

**验证规范化结果**
```typescript
const normalized = normalizeCallbackResults(results);
console.log('Normalized:', JSON.stringify(normalized, null, 2));
```

**跟踪幂等性处理**
```bash
grep "Execution already completed" /var/log/app.log
```

## 6. 常见问题与解决

### Q: 为什么还是显示错误？

**调查步骤**
1. 检查 normalizeCallbackResults 的输出
2. 验证 status 是否成功规范化
3. 检查数据库中的实际值
```sql
SELECT id, status, case_name FROM Auto_TestRunResults 
WHERE execution_id = ? LIMIT 5;
```

### Q: 如何处理新的状态值？

**修改 normalizeCallbackResults**
```typescript
const normalizedStatus = 
  rawStatus === 'success' || rawStatus === 'pass'
    ? 'passed'
    : rawStatus === 'fail'
      ? 'failed'
    : rawStatus === 'NEW_STATUS'  // 添加新映射
      ? 'error'
    : rawStatus || 'error';
```

### Q: 占位符何时删除？

**答**: 不删除，被覆盖
- 初始: error（占位符）
- 更新: passed/failed/skipped（真实状态）
- 前端: 自动识别并显示"执行中"（如运行中）

## 7. 未来优化方向

1. **Schema 验证**
```typescript
// 使用 Zod 或 Joi 验证回调数据
import { z } from 'zod';
const callbackSchema = z.object({
  caseId: z.number().positive(),
  caseName: z.string(),
  status: z.enum(['passed', 'failed', 'error']),
});
```

2. **类型强化**
```typescript
// 定义清晰的 CallbackResult 接口
interface NormalizedCallbackResult {
  caseId: number;
  caseName: string;
  status: 'passed' | 'failed' | 'error' | 'pending' | 'skipped';
  // ...
}
```

3. **元数据追踪**
```typescript
// 记录原始格式以供审计
{
  normalized: {...},
  original: {...},
  transformations: ['camelCase→snake_case', 'pass→passed'],
}
```

---

**文档版本**: 1.0  
**最后更新**: 2025-03-14  
**作者**: 自动化测试平台团队
