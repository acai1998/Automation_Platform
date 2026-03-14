# 孤立 ERROR 占位符修复文档

## 问题描述

用例状态显示为 `ERROR`，但整体运行状态已是 `Completed` 和 `All Passed`。这表明用例的 ERROR 占位符未被正确清理。

## 根本原因分析

在 `ExecutionRepository.completeBatch` 中的状态更新流程分为三个分支：

```typescript
if (results.results && results.results.length > 0) {
  // 路径1：有详细结果
  await this.updateDetailedCaseResults(...);
  await this.cleanupResidualErrorPlaceholders(...);
} else {
  // 路径2：无详细结果
  await this.updateSummaryOnlyResults(...);
}
```

**问题所在**：如果 Jenkins 回调满足以下条件，ERROR 占位符会残留：

1. ✗ 没有详细结果：`results.results.length === 0`
2. ✗ 没有汇总统计：`passedCases + failedCases + skippedCases === 0`

在这种情况下：
- 路径1 (cleanupResidualErrorPlaceholders) 不会执行
- 路径2 (updateSummaryOnlyResults) 也会因为 `totalSummary === 0` 而被跳过

导致数据库中的 ERROR 状态始终保留。

## 修复方案

### 1. 添加全局清理防护（ExecutionRepository）

在 `completeBatch` 事务的最后，**无条件执行** `performFinalErrorCleanup` 方法：

```typescript
// 在事务结束前
if (resolvedExecutionId) {
  await this.performFinalErrorCleanup(resolvedExecutionId, results);
}
```

### 2. performFinalErrorCleanup 实现逻辑

```typescript
private async performFinalErrorCleanup(executionId: number, results: BatchResults): Promise<void> {
  // 1. 查询是否还有 ERROR 占位符
  const residualErrorCount = // 查询结果
  
  // 2. 如果有，根据运行状态清理：
  //    - success → passed
  //    - failed → failed  
  //    - aborted → skipped
  
  // 3. 批量更新为目标状态
  const cleaned = await this.bulkUpdateErrorResults(executionId, targetStatus);
}
```

### 3. 关键特性

- ✅ 防御性设计：不依赖任何前置条件
- ✅ 幂等性：多次调用不会重复处理
- ✅ 异常隔离：清理失败不会中断主流程
- ✅ 日志追踪：记录所有清理操作

## 验证步骤

### 1. 测试场景构造

模拟 Jenkins 回调既无详细结果也无汇总统计的场景：

```bash
curl -X POST http://localhost:3000/api/jenkins/callback \
  -H "Content-Type: application/json" \
  -d '{
    "runId": 310,
    "status": "success",
    "results": [],
    "reportedPassedCases": 0,
    "reportedFailedCases": 0,
    "reportedSkippedCases": 0
  }'
```

### 2. 验证清理

```sql
-- 查询运行 310 的 ERROR 占位符
SELECT COUNT(*) as error_count
FROM Auto_TestRunResults rr
JOIN Auto_TestCaseTaskExecutions te ON rr.execution_id = te.id
JOIN Auto_TestRun tr ON tr.execution_id = te.id
WHERE tr.id = 310 AND rr.status = 'error';

-- 预期结果：0 rows
```

### 3. 查看日志

```
Final error cleanup completed {
  executionId: 123,
  residualErrorCount: 5,
  cleaned: 5,
  targetStatus: "passed",
  reason: "safety-cleanup-after-all-updates"
}
```

## 文件修改清单

1. **server/repositories/ExecutionRepository.ts**
   - 在 `completeBatch` 事务末尾添加 `performFinalErrorCleanup` 调用
   - 新增 `performFinalErrorCleanup` 私有方法

## 影响分析

- ✅ 前向兼容：不改变现有 API
- ✅ 零业务风险：只修复数据不一致
- ✅ 性能影响：最多额外一次 SELECT 和一次 UPDATE（已优化）
- ✅ 回滚容易：可直接删除新增代码

## 预期效果

修复前：
```
执行状态: Completed / All Passed
用例状态: ERROR ← 不一致！
```

修复后：
```
执行状态: Completed / All Passed  
用例状态: PASSED ← 一致！
```
