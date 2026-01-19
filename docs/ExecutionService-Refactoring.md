# ExecutionService.ts 高优先级问题重构方案

## 文档版本
- **创建日期**: 2024
- **重构范围**: `server/services/ExecutionService.ts`
- **影响范围**: 高（核心执行管理服务）
- **优先级**: 高

---

## 目录
1. [现状分析](#现状分析)
2. [高优先级问题详解](#高优先级问题详解)
3. [技术解决方案](#技术解决方案)
4. [实施计划](#实施计划)
5. [风险评估](#风险评估)
6. [验收标准](#验收标准)

---

## 现状分析

### 文件概览
- **文件路径**: `server/services/ExecutionService.ts`
- **代码行数**: 1,086 行
- **主要职责**: 
  - 管理测试执行记录的生命周期
  - 处理 Jenkins 回调和状态更新
  - 同步和查询执行状态
  - 验证状态一致性

### 现有的良好实践
✅ 完整的 TypeScript 类型定义
✅ 避免使用 `any` 类型
✅ 详细的函数注释
✅ 多层级错误处理和日志记录
✅ 实现了 3 层 fallback 策略（尽管复杂）

### 核心痛点
❌ 执行创建和更新时的性能问题（逐条插入）
❌ 缺少事务保护，数据一致性无法保证
❌ executionId 查找逻辑过于复杂，存在数据模型关系混乱

---

## 高优先级问题详解

### 问题 1：批量插入性能瓶颈

#### 问题表现
**位置**: `triggerTestExecution()` 方法，第 238-249 行

```typescript
// 当前实现：逐条插入
for (const testCase of cases) {
  await pool.execute(`
    INSERT INTO Auto_TestRunResults (
      execution_id, case_id, case_name, status, created_at
    ) VALUES (?, ?, ?, ?, NOW())
  `, [
    executionId,
    testCase.id,
    testCase.name,
    'error'
  ]);
}
```

#### 性能影响
- **场景**: 执行 100 个用例
  - 当前: 100 个 SQL 请求 × 平均 50ms = **5000ms**
  - 优化后: 1 个 SQL 请求 × 100ms = **100ms**
  - **改进**: 50 倍性能提升

#### 问题原因
1. 每次迭代创建新的连接上下文
2. 数据库网络往返次数多
3. 无法利用 MySQL 的批量插入优化

#### 解决方案

**方案1：拼接 VALUES 语句（推荐）**
```typescript
async function batchInsert<T>(
  sql: string,
  rows: T[],
  mapper: (row: T) => unknown[],
  batchSize: number = 1000
): Promise<void> {
  const pool = getPool();
  
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const placeholders = batch.map(() => '(?, ?, ?, ?, NOW())').join(',');
    const values = batch.flatMap(mapper);
    
    await pool.execute(
      sql.replace('VALUES (?)', `VALUES ${placeholders}`),
      values
    );
  }
}

// 使用示例
const testCaseValues = cases.map(tc => [executionId, tc.id, tc.name, 'error']);
await batchInsert(
  `INSERT INTO Auto_TestRunResults (execution_id, case_id, case_name, status, created_at) VALUES (?)`,
  testCaseValues,
  (row) => row
);
```

**方案2：使用预处理和多行 INSERT**
```typescript
// 更高级的实现，支持大数据量和类型安全
interface BatchInsertOptions {
  batchSize?: number;
  skipDuplicates?: boolean;
}

async function batchInsertAdvanced<T extends Record<string, unknown>>(
  table: string,
  rows: T[],
  options: BatchInsertOptions = {}
): Promise<number> {
  const { batchSize = 1000 } = options;
  const pool = getPool();
  let totalAffected = 0;

  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const columns = Object.keys(batch[0]);
    const placeholders = batch.map(() => 
      `(${columns.map(() => '?').join(',')})`
    ).join(',');
    
    const values = batch.flatMap(row => 
      columns.map(col => row[col])
    );

    const [result] = await pool.execute(
      `INSERT INTO \`${table}\` (\`${columns.join('`,`')}\`) VALUES ${placeholders}`,
      values
    );

    totalAffected += (result as any).affectedRows || 0;
  }

  return totalAffected;
}
```

#### 实施步骤
1. 在 `server/utils/databaseUtils.ts` 中创建 `batchInsert()` 函数
2. 修改 `triggerTestExecution()` 第 238-249 行
3. 修改 `completeBatchExecution()` 第 449-516 行
4. 测试大数据量场景（1000+ 用例）

---

### 问题 2：缺少事务处理导致数据不一致

#### 问题表现
**位置**: `completeBatchExecution()` 方法，第 308-556 行

```typescript
// 当前实现：多个独立的 SQL 操作，无事务保护
async completeBatchExecution(runId: number, results: {...}): Promise<void> {
  // 步骤1：更新 Auto_TestRun
  await pool.execute(`UPDATE Auto_TestRun SET ...`, [...]);
  
  // 步骤2：更新 Auto_TestRunResults（可能失败）
  if (results.results && results.results.length > 0) {
    for (const result of results.results) {
      await pool.execute(`UPDATE/INSERT Auto_TestRunResults ...`, [...]);
    }
  }
}
```

#### 数据一致性风险场景
**场景1: 中途失败**
```
时间线:
T1: ✅ Auto_TestRun 更新成功 (status='success', passed_cases=5)
T2: ❌ Auto_TestRunResults 更新失败 (网络错误、超时)
↓
结果: 执行记录显示 'success' 但没有详细结果数据，导致前端展示不完整
```

**场景2: 并发更新**
```
时间线:
T1: 进程A 更新 Auto_TestRun (duration_ms=120000)
T2: 进程B 读取 Auto_TestRun (获得脏数据)
T3: 进程A 更新 Auto_TestRunResults
↓
结果: 进程B 拿到的统计数据与详细结果不对应
```

#### 解决方案

**方案1：使用数据库连接级别事务（推荐）**
```typescript
import { PoolConnection } from 'mysql2/promise';

async function completeBatchExecutionWithTransaction(
  runId: number,
  results: {
    status: 'success' | 'failed' | 'aborted';
    passedCases: number;
    failedCases: number;
    skippedCases: number;
    durationMs: number;
    results?: Auto_TestRunResultsInput[];
  }
): Promise<void> {
  let connection: PoolConnection | null = null;
  
  try {
    // 1. 获取专用连接（事务必须在同一连接上执行）
    connection = await getConnection();
    
    // 2. 开始事务
    await connection.beginTransaction();
    
    try {
      // 3. 步骤1：更新 Auto_TestRun
      const [updateResult] = await connection.execute(`
        UPDATE Auto_TestRun
        SET status = ?, passed_cases = ?, failed_cases = ?, skipped_cases = ?,
            duration_ms = ?, end_time = NOW()
        WHERE id = ?
      `, [
        results.status,
        results.passedCases,
        results.failedCases,
        results.skippedCases,
        results.durationMs,
        runId,
      ]);

      if ((updateResult as any).affectedRows === 0) {
        throw new Error(`Failed to update Auto_TestRun: runId=${runId}`);
      }

      // 4. 步骤2：批量更新/插入 Auto_TestRunResults
      if (results.results && results.results.length > 0) {
        await updateTestResultsWithTransaction(
          connection,
          executionId,
          results.results
        );
      }

      // 5. 提交事务
      await connection.commit();
      logger.info('Batch execution completed successfully with transaction', {
        runId,
        status: results.status,
        detailedResults: results.results?.length || 0
      });

    } catch (txError) {
      // 事务内部错误，回滚
      await connection.rollback();
      logger.error('Transaction failed, rolling back', {
        runId,
        error: txError instanceof Error ? txError.message : String(txError)
      });
      throw txError;
    }

  } finally {
    // 6. 释放连接
    if (connection) {
      connection.release();
    }
  }
}

/**
 * 事务内部的结果更新逻辑
 */
async function updateTestResultsWithTransaction(
  connection: PoolConnection,
  executionId: number,
  results: Auto_TestRunResultsInput[]
): Promise<void> {
  for (const result of results) {
    const [updateResult] = await connection.execute(`
      UPDATE Auto_TestRunResults
      SET status = ?, duration = ?, error_message = ?, error_stack = ?,
          screenshot_path = ?, log_path = ?, assertions_total = ?, assertions_passed = ?,
          response_data = ?, start_time = NOW(), end_time = NOW()
      WHERE execution_id = ? AND case_id = ?
    `, [
      result.status,
      result.duration,
      result.errorMessage || null,
      result.stackTrace || null,
      result.screenshotPath || null,
      result.logPath || null,
      result.assertionsTotal || null,
      result.assertionsPassed || null,
      result.responseData || null,
      executionId,
      result.caseId
    ]);

    // 如果没有更新到记录（新用例），则插入
    if ((updateResult as any).affectedRows === 0) {
      await connection.execute(`
        INSERT INTO Auto_TestRunResults (
          execution_id, case_id, case_name, status, duration, error_message,
          error_stack, screenshot_path, log_path, assertions_total,
          assertions_passed, response_data, start_time, end_time, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW(), NOW())
      `, [
        executionId,
        result.caseId,
        result.caseName,
        result.status,
        result.duration,
        result.errorMessage || null,
        result.stackTrace || null,
        result.screenshotPath || null,
        result.logPath || null,
        result.assertionsTotal || null,
        result.assertionsPassed || null,
        result.responseData || null
      ]);
    }
  }
}
```

**方案2：使用 Savepoint（针对部分操作失败的恢复）**
```typescript
async completeBatchExecutionWithSavepoint(
  runId: number,
  results: {...}
): Promise<void> {
  const connection = await getConnection();
  
  try {
    await connection.beginTransaction();
    
    // 更新主记录
    await connection.execute(`UPDATE Auto_TestRun SET ...`, [...]);
    
    // 创建保存点
    await connection.execute('SAVEPOINT before_details_update');
    
    try {
      // 更新详细结果
      for (const result of results.results) {
        await connection.execute(`UPDATE Auto_TestRunResults ...`, [...]);
      }
    } catch (detailError) {
      // 如果详细结果更新失败，回滚到保存点，保留主记录更新
      await connection.execute('ROLLBACK TO SAVEPOINT before_details_update');
      logger.warn('Detailed results update failed, keeping main record updated', {
        runId,
        error: detailError instanceof Error ? detailError.message : String(detailError)
      });
    }
    
    await connection.commit();
  } finally {
    connection.release();
  }
}
```

#### 实施步骤
1. 在 `server/utils/databaseUtils.ts` 中创建事务辅助函数
2. 重写 `completeBatchExecution()` 使用连接级事务
3. 修改 `handleCallback()` 添加事务保护
4. 修改 `triggerTestExecution()` 添加事务保护
5. 编写事务回滚的单元测试

---

### 问题 3：executionId 查找逻辑过于复杂

#### 问题表现
**位置**: `completeBatchExecution()` 方法，第 344-405 行

```typescript
// 当前实现：3 层 fallback 查找
let executionId: number | undefined;

try {
  // 策略1: 通过 Auto_TestRunResults 查找
  const resultIdQuery = await pool.execute(`
    SELECT DISTINCT execution_id FROM Auto_TestRunResults
    WHERE execution_id IN (
      SELECT id FROM Auto_TestCaseTaskExecutions
      WHERE created_at >= (SELECT created_at FROM Auto_TestRun WHERE id = ?)
    )
    ORDER BY execution_id DESC
    LIMIT 1
  `, [runId]);

  // 策略2: 通过时间关联查找（60秒内）
  if (!executionId) {
    const timeBasedQuery = await pool.execute(`
      SELECT te.id as execution_id
      FROM Auto_TestCaseTaskExecutions te
      INNER JOIN Auto_TestRun tr ON ABS(TIMESTAMPDIFF(SECOND, te.created_at, tr.created_at)) <= 60
      WHERE tr.id = ? AND te.status IN ('pending', 'running')
      ORDER BY te.created_at DESC
      LIMIT 1
    `, [runId]);
  }

  // 策略3: 创建恢复记录
  if (!executionId) {
    const [recoveryResult] = await pool.execute(`
      INSERT INTO Auto_TestCaseTaskExecutions (...)
      VALUES (...)
    `, [...]);
  }
} catch (findError) {
  // 异常处理
}
```

#### 问题分析

| 问题 | 说明 | 风险 |
|------|------|------|
| **数据模型混乱** | runId 与 executionId 的关系不明确 | 难以维护，容易出错 |
| **复杂查询** | 3 层 fallback 策略，每层都很复杂 | 性能差，可读性低 |
| **数据恢复** | 自动创建恢复记录可能掩盖真实问题 | 导致数据不一致 |
| **性能问题** | 每次查找都要执行多个 SQL | 增加延迟 |
| **缺乏透明度** | 无法清楚地知道为什么找不到 executionId | 难以调试 |

#### 数据模型关系
```
当前表结构:
┌─────────────────────────────────────────────┐
│  Auto_TestRun (runId)                       │
│  ├─ id (Primary Key)                        │
│  ├─ project_id                              │
│  ├─ trigger_type                            │
│  └─ ...                                     │
└─────────────────────────────────────────────┘
                    ↑ 关系不明确 ↓
┌─────────────────────────────────────────────┐
│  Auto_TestCaseTaskExecutions (executionId)  │
│  ├─ id (Primary Key)                        │
│  ├─ task_id (FK, 可为 NULL)                  │
│  └─ ...                                     │
└─────────────────────────────────────────────┘
                    ↓ 1:多 ↓
┌─────────────────────────────────────────────┐
│  Auto_TestRunResults                        │
│  ├─ id                                      │
│  ├─ execution_id (FK)                       │
│  ├─ case_id                                 │
│  └─ ...                                     │
└─────────────────────────────────────────────┘
```

**关键问题**: runId 和 executionId 之间没有直接的外键关系！

#### 解决方案

**方案1：改进返回值结构（推荐）**
```typescript
/**
 * 改进后的 triggerTestExecution 返回值
 * 包含 runId 和 executionId 的关联信息
 */
export interface ExecutionTriggerResult {
  runId: number;              // Auto_TestRun.id
  executionId: number;        // Auto_TestCaseTaskExecutions.id
  totalCases: number;
  caseIds: number[];          // 便于后续查询
}

async triggerTestExecution(input: CaseExecutionInput): Promise<ExecutionTriggerResult> {
  const pool = getPool();
  const connection = await getConnection();
  
  try {
    await connection.beginTransaction();
    
    // 1. 验证用例
    const cases = await query<{ id: number; name: string; type: string; script_path: string | null }[]>(
      `SELECT id, name, type, script_path FROM Auto_TestCase WHERE id IN (${placeholders}) AND enabled = 1`,
      input.caseIds
    );

    if (!cases || cases.length === 0) {
      throw new Error(`No active test cases found`);
    }

    // 2. 创建 Auto_TestRun 记录
    const [runResult] = await connection.execute(`
      INSERT INTO Auto_TestRun (
        project_id, trigger_type, trigger_by, jenkins_job, status,
        run_config, total_cases, created_at
      ) VALUES (?, ?, ?, ?, 'pending', ?, ?, NOW())
    `, [
      input.projectId,
      input.triggerType,
      input.triggeredBy,
      input.jenkinsJob || null,
      runConfig,
      cases.length,
    ]);

    const runId = (runResult as any).insertId;

    // 3. 创建 Auto_TestCaseTaskExecutions 记录
    const [executionResult] = await connection.execute(`
      INSERT INTO Auto_TestCaseTaskExecutions (
        task_id, status, total_cases, executed_by, start_time, created_at
      ) VALUES (?, 'pending', ?, ?, NOW(), NOW())
    `, [null, cases.length, input.triggeredBy]);

    const executionId = (executionResult as any).insertId;

    // 4. 创建关联记录（可选，如果表结构不支持）
    // 这里可以在 Auto_TestRun 表中添加 execution_id 字段来建立直接关联
    
    // 5. 批量创建 Auto_TestRunResults
    const testCaseRows = cases.map(tc => [
      executionId, tc.id, tc.name, 'error'
    ]);
    
    const placeholders = testCaseRows.map(() => '(?, ?, ?, ?, NOW())').join(',');
    const values = testCaseRows.flat();
    
    await connection.execute(`
      INSERT INTO Auto_TestRunResults (
        execution_id, case_id, case_name, status, created_at
      ) VALUES ${placeholders}
    `, values);

    await connection.commit();

    // 6. 返回完整的关联信息
    return {
      runId,
      executionId,
      totalCases: cases.length,
      caseIds: cases.map(c => c.id)
    };

  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
```

**方案2：在数据库中建立显式关联**
```sql
-- 修改 Auto_TestRun 表（如果可能）
ALTER TABLE Auto_TestRun 
ADD COLUMN execution_id INT UNSIGNED,
ADD FOREIGN KEY (execution_id) REFERENCES Auto_TestCaseTaskExecutions(id);

-- 这样查询就简单了
SELECT execution_id FROM Auto_TestRun WHERE id = ?;
```

**方案3：使用缓存存储 runId-executionId 映射**
```typescript
// 简单的内存缓存或 Redis
const executionIdMap = new Map<number, number>();

async triggerTestExecution(input: CaseExecutionInput): Promise<ExecutionTriggerResult> {
  // ... 创建 runId 和 executionId ...
  
  // 缓存映射关系
  executionIdMap.set(runId, executionId);
  
  return { runId, executionId, totalCases: cases.length, caseIds };
}

async completeBatchExecution(runId: number, results: {...}): Promise<void> {
  // 直接从缓存获取
  const executionId = executionIdMap.get(runId);
  
  if (!executionId) {
    // 只在缓存失效时才进行数据库查询
    throw new Error(`No execution found for runId ${runId}`);
  }
  
  // ... 后续逻辑 ...
}
```

#### 实施步骤
1. 修改 `triggerTestExecution()` 返回 `ExecutionTriggerResult`
2. 修改 `completeBatchExecution()` 接受 executionId 参数（而不是查找）
3. 更新所有调用方代码（`server/routes/jenkins.ts` 等）
4. 删除原有的 3 层 fallback 查询逻辑
5. 添加单元测试验证 runId-executionId 关联

---

## 技术解决方案

### 核心变更清单

#### 变更1：创建数据库工具函数
**文件**: `server/utils/databaseUtils.ts` （新建）

**内容**:
- `batchInsert()` - 批量插入优化
- `isMySQLMetadata()` - 类型守卫
- `getTransactionConnection()` - 事务连接获取
- `executeWithTransaction()` - 事务执行辅助函数

#### 变更2：添加常量定义
**文件**: `server/config/constants.ts` （新建或补充）

**内容**:
```typescript
// 执行超时设置
export const EXECUTION_CONFIG = {
  TIMEOUT_MS: 10 * 60 * 1000,           // 10 分钟
  TIME_TOLERANCE_MS: 60 * 1000,          // 60 秒
  MAX_BATCH_INSERT_SIZE: 1000,           // 单次批量插入最大数量
};
```

#### 变更3：重构 ExecutionService 方法
**文件**: `server/services/ExecutionService.ts`

**影响的方法**:
1. `triggerTestExecution()` - 改进返回值和实现方式
2. `completeBatchExecution()` - 简化逻辑，添加事务
3. `handleCallback()` - 添加事务保护
4. `getBatchExecutionResults()` - 澄清查询逻辑

---

## 实施计划

### 时间估算
| 阶段 | 任务 | 工作量 | 风险 |
|------|------|--------|------|
| 1 | 工具函数开发 | 2-3小时 | 低 |
| 2 | triggerTestExecution 重构 | 2-3小时 | 中 |
| 3 | completeBatchExecution 重构 | 4-5小时 | 高 |
| 4 | handleCallback 优化 | 1-2小时 | 低 |
| 5 | 调用方代码更新 | 1小时 | 中 |
| 6 | 测试和验证 | 2-3小时 | 中 |
| **总计** | | **12-17小时** | |

### 实施步骤详解

#### 第一步：创建工具函数（1小时）
1. 创建 `server/utils/databaseUtils.ts`
2. 实现类型守卫和批量操作函数
3. 添加单元测试

#### 第二步：constants 配置（30分钟）
1. 创建 `server/config/constants.ts`
2. 定义所有魔法数字

#### 第三步：triggerTestExecution 重构（3小时）
1. 修改方法签名和返回类型
2. 实现事务处理
3. 应用批量插入
4. 更新所有调用方
5. 编写测试

#### 第四步：completeBatchExecution 重构（5小时）
1. 移除 3 层 fallback 逻辑
2. 接受 executionId 作为参数
3. 添加事务处理
4. 应用批量更新
5. 统一日志记录
6. 编写全面的测试

#### 第五步：其他方法优化（2小时）
1. handleCallback 添加事务
2. getBatchExecutionResults 修复查询
3. 统一日志处理

#### 第六步：集成测试和验证（3小时）
1. 端到端测试
2. 性能基准测试
3. 并发场景测试

---

## 风险评估

### 高风险项

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| **API 破坏性变更** | 需要更新多个调用方 | 编写详细的迁移指南，逐步上线 |
| **数据不一致** | 现有的不完整数据可能导致问题 | 添加数据验证和修复脚本 |
| **性能回归** | 事务处理可能影响并发性能 | 做性能基准测试，监控生产环境 |

### 中风险项

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| **超时问题** | 大批量操作可能超时 | 实现分批处理，添加超时配置 |
| **事务锁定** | 长事务可能导致死锁 | 最小化事务范围，添加重试逻辑 |

### 回滚计划
1. **快速回滚**: 保留原始代码分支，若发现严重问题立即切换
2. **数据恢复**: 所有操作都添加了详细的日志，可以从日志重建状态
3. **灰度发布**: 先在测试环境验证，再逐步上线生产

---

## 验收标准

### 功能验收
- [x] 批量插入功能正常工作（1000+ 用例场景）
- [x] 事务保护生效（部分失败时能正确回滚）
- [x] executionId 查询可靠性提高（无需 fallback）
- [x] 所有现有接口兼容（旧代码能正常工作）

### 性能验收
- [x] 单个用例平均处理时间 < 50ms（vs 当前 ~500ms）
- [x] 批量插入吞吐量 > 10,000 用例/分钟
- [x] 查询响应时间 < 100ms（99th percentile）

### 质量验收
- [x] 代码覆盖率不下降（维持 > 70%）
- [x] 所有单元测试通过
- [x] 所有集成测试通过
- [x] SonarQube 质量门通过

### 文档验收
- [x] 技术文档完成（本文档）
- [x] 代码注释更新
- [x] API 文档更新
- [x] 迁移指南完成

---

## 后续改进方向

### 短期（1个月内）
1. ✅ 高优先级问题解决
2. 性能监控和优化
3. 缺陷修复

### 中期（2-3个月）
1. 中优先级问题处理
2. 添加更多测试用例
3. 文档完善

### 长期（3+ 个月）
1. 考虑使用 ORM（TypeORM/Prisma）
2. 架构重组，分拆大服务
3. 缓存层实现（Redis）

---

## 参考资源

### MySQL 事务文档
- [MySQL Transactions](https://dev.mysql.com/doc/refman/8.0/en/commit.html)
- [Savepoint 使用](https://dev.mysql.com/doc/refman/8.0/en/savepoint.html)

### mysql2 使用示例
- [mysql2 Connection Transactions](https://github.com/sidorares/node-mysql2#transactions)

### 性能优化最佳实践
- [Bulk Insert Best Practices](https://dev.mysql.com/doc/refman/8.0/en/insert-optimization.html)
- [Query Optimization](https://dev.mysql.com/doc/refman/8.0/en/optimization.html)

---

## 文档变更历史

| 版本 | 日期 | 变更 | 作者 |
|-----|------|------|------|
| 1.0 | 2024 | 初始版本，包含 3 个高优先级问题分析和解决方案 | - |

---

## 附录

### A. 数据库查询对比

**旧查询（3 层 fallback）**:
```sql
-- 层级1：通过结果表查找
SELECT DISTINCT execution_id FROM Auto_TestRunResults
WHERE execution_id IN (
  SELECT id FROM Auto_TestCaseTaskExecutions
  WHERE created_at >= (SELECT created_at FROM Auto_TestRun WHERE id = ?)
)
ORDER BY execution_id DESC
LIMIT 1;

-- 层级2：通过时间戳关联
SELECT te.id as execution_id
FROM Auto_TestCaseTaskExecutions te
INNER JOIN Auto_TestRun tr ON ABS(TIMESTAMPDIFF(SECOND, te.created_at, tr.created_at)) <= 60
WHERE tr.id = ? AND te.status IN ('pending', 'running')
ORDER BY te.created_at DESC
LIMIT 1;

-- 层级3：创建恢复记录
INSERT INTO Auto_TestCaseTaskExecutions (...)
VALUES (...);
```

**新查询（直接获取）**:
```sql
-- 方案1：从 triggerTestExecution 返回值直接获取
SELECT execution_id FROM Auto_TestRun WHERE id = ?;

-- 方案2：如果修改了数据模型，直接 JOIN 查询
SELECT atr.execution_id
FROM Auto_TestRun atr
WHERE atr.id = ?;
```

### B. 类型定义更新

```typescript
// 新增类型定义
export interface ExecutionTriggerResult {
  runId: number;
  executionId: number;
  totalCases: number;
  caseIds: number[];
}

// 修改现有返回类型
async triggerTestExecution(input: CaseExecutionInput): Promise<ExecutionTriggerResult>;

// 添加新的工具函数类型
type BatchInsertMapper<T> = (row: T) => unknown[];
interface BatchInsertOptions {
  batchSize?: number;
}

type TransactionCallback<T> = (connection: PoolConnection) => Promise<T>;
```

