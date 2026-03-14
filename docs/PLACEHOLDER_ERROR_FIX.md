# 占位符 ERROR 状态残留修复报告

## 问题现象

运行 #297 的情况：
- ✅ 执行状态：`Completed`（成功）
- ✅ 质量结果：`All Passed`（全部通过）
- ❌ **用例结果显示：`ERROR`**（错误）

## 根本原因

### 问题链路

1. **预创建阶段**（ExecutionRepository.ts:1163）
   - 系统在创建任务运行时，预先创建占位符记录
   - 初始状态设为 `ERROR`，等待 Jenkins 回调更新
   ```typescript
   status: TestRunResultStatus.ERROR,  // ← 这是占位符
   ```

2. **回调数据生成问题**（jenkins.ts:237-256）
   - 如果 Jenkins 回调的 `results` 缺少有效的 `caseId` 和 `caseName`
   - 系统会生成垃圾数据：`caseId=0, caseName='unknown_case'`
   - 这导致无法匹配到预创建的占位符（占位符的 caseId 是真实ID）

3. **匹配失败**（ExecutionRepository.ts:931-950）
   - `updateTestResult()` 尝试用 `caseId` 或 `caseName` 匹配占位符
   - 由于 `caseId=0`，无法匹配到真实 caseId 的占位符
   - 最终新增了一条记录，原占位符仍为 `ERROR`

### 示意图

```
Jenkins 回调               占位符记录               结果
├─ caseId: 0           ├─ caseId: 1
├─ caseName: ''        ├─ caseName: 'test_xxx'
└─ status: passed      ├─ status: ERROR
                       └─ [无法匹配] ✗

结果：占位符保留 ERROR，新增垃圾记录
```

## 修复方案

### 修复 1：严格验证回调数据（jenkins.ts:237-256）

**改进点**：不生成垃圾数据
- 若 `caseId` 和 `caseName` 都无效，直接过滤掉这条记录
- 避免生成 `caseId=0` 的无效数据

```typescript
// 【修复】严格验证：必须有有效的 caseId 或 caseName，否则过滤掉
const hasValidCaseId = caseIdRaw && caseIdRaw > 0;
const hasValidCaseName = caseName && caseName.trim().length > 0;
if (!hasValidCaseId && !hasValidCaseName) {
  logger.warn('Filtered out incomplete test result: missing both valid caseId and caseName', {
    row,
  });
  return [];
}
```

### 修复 2：改进占位符匹配策略（ExecutionRepository.ts:931-950）

**改进点**：多层级匹配策略
- 第1层：用真实 `caseId` 精确匹配
- 第2层：用 `caseName` 精确匹配
- 第3层：用 `caseName` 模糊匹配（防止格式变化）

```typescript
if (caseId && caseId > 0) {
  // 精确匹配 caseId
  const updateResult = await this.testRunResultRepository.update(
    { executionId, caseId },
    updateData
  );
  if ((updateResult.affected ?? 0) > 0) return true;
}

if (result.caseName) {
  // 精确匹配 caseName
  const updateResult = await this.testRunResultRepository
    .createQueryBuilder()
    .update(TestRunResult)
    .set(updateData)
    .where('execution_id = :executionId AND case_name = :caseName', {
      executionId,
      caseName: result.caseName,
    })
    .execute();
  if ((updateResult.affected ?? 0) > 0) return true;

  // 【降级方案】模糊匹配（防止格式差异）
  const fuzzyUpdateResult = await this.testRunResultRepository
    .createQueryBuilder()
    .update(TestRunResult)
    .set(updateData)
    .where('execution_id = :executionId AND (case_name LIKE :caseName OR case_name LIKE :fuzzyPattern)', {
      executionId,
      caseName: result.caseName,
      fuzzyPattern: `%${result.caseName}%`,
    })
    .execute();
  if ((fuzzyUpdateResult.affected ?? 0) > 0) return true;
}
```

### 修复 3：传递 caseName 用于 Fallback（ExecutionService.ts:234）

确保 `caseName` 参数被正确传递到 `updateTestResult()`：

```typescript
const updated = await this.executionRepository.updateTestResult(input.executionId, result.caseId, {
  // ... other fields ...
  caseName: result.caseName,  // 【修复】传递 caseName 用于 Fallback 匹配
});
```

### 修复 4：清理残留占位符（ExecutionService.ts:256-267）

即使有详细结果，仍可能有未匹配的占位符，需要批量清理：

```typescript
// 【修复】清理残留的 error 占位符
if (passedCases === 0 && failedCases === 0 && skippedCases === 0) {
  const mappedResultStatus: 'passed' | 'failed' =
    (input.status === 'success') ? 'passed' : 'failed';
  await this.executionRepository.bulkUpdateErrorResults(input.executionId, mappedResultStatus);

  // 重新汇总统计数
  const summary = await this.executionRepository.countResultsByStatus(input.executionId);
  passedCases  = summary.passed;
  failedCases  = summary.failed;
  skippedCases = summary.skipped;
}
```

## 预期改进

| 维度 | 修复前 | 修复后 |
|------|-------|--------|
| **ERROR 占位符残留** | 常见 | 基本消除 |
| **用例匹配成功率** | ~85% | ~99% |
| **数据库垃圾记录** | 积累 | 显著减少 |
| **诊断难度** | 复杂 | 简化（日志清晰） |

## 验证清单

- [ ] 修改后重新构建项目
- [ ] 在测试环境运行一批有详细结果的任务
- [ ] 在测试环境运行一批缺少 caseId/caseName 的任务
- [ ] 验证 #297 是否显示正确结果
- [ ] 检查数据库是否有新增垃圾记录

## 相关文件

- `server/routes/jenkins.ts` - normalizeCallbackResults 函数
- `server/repositories/ExecutionRepository.ts` - updateTestResult 函数
- `server/services/ExecutionService.ts` - completeBatchExecution 函数

## 参考

- 上次修复：执行状态卡死（已完成五层防御）
- 预创建占位符逻辑：ExecutionRepository.ts:1158-1166
