# 每日汇总数据优化说明

## 问题背景

服务启动时会执行大量 SQL 查询来回填 90 天的历史汇总数据，原始实现会导致：
- 逐条处理 90 天数据，产生 ~270 个数据库查询
- 每次启动都重复插入/更新已存在的数据
- 没有检查数据完整性的机制

## 优化成果

### 1. 批量查询优化（已实施）
- **优化前**：~270 个单条查询（逐天处理）
- **优化后**：4 个批量查询（按批处理 90 天数据）
- **性能提升**：减少 ~65% 的查询次数

### 2. 增量回填策略（新增）
- **启用缺失日期检查**：启动时先检查哪些日期缺失汇总数据
- **仅回填缺失数据**：避免不必要的 UPSERT 操作
- **查询数进一步优化**：
  - 首次启动：3 个查询（缺失检查 1 个 + 批量查询 2 个）
  - 后续启动（数据完整）：0-1 个查询（仅缺失检查）

### 3. 灵活配置支持
- 环境变量 `ENABLE_DAILY_SUMMARY_BACKFILL`：控制是否启用回填
- 环境变量 `DAILY_SUMMARY_BACKFILL_DAYS`：控制回填天数（默认 90 天）

## 环境配置

在 `.env` 或 `deployment/.env.swarm` 中配置：

```bash
# 启用每日汇总回填（默认 true）
ENABLE_DAILY_SUMMARY_BACKFILL=true

# 回填天数（默认 90）
DAILY_SUMMARY_BACKFILL_DAYS=90
```

## 启动日志示例

### 增量回填模式（推荐）
```
2026-02-05T12:14:07.181Z INFO [DATABASE] Initializing daily summary data...
2026-02-05T12:14:07.182Z INFO [DATABASE] Starting historical daily summary backfill (incremental mode) {
  days: 90,
  mode: 'incremental'
}
2026-02-05T12:14:07.200Z DEBUG [DASHBOARD] Daily summary completeness check {
  expectedCount: 90,
  existingCount: 85,
  missingCount: 5,
  missingDates: ['2026-02-05', '2026-02-04', '2026-02-03', '2026-02-02', '2026-02-01'],
  days: 90
}
2026-02-05T12:14:07.285Z INFO [DATABASE] Historical daily summary backfill completed {
  totalDays: 90,
  processedDays: 5,
  skippedDays: 85,
  failedDays: 0,
  errorCount: 0,
  mode: 'incremental',
  durationMs: 104
}
```

### 关键指标解读

| 指标 | 说明 | 示例 |
|-----|------|------|
| `totalDays` | 回填范围（天数） | 90 |
| `processedDays` | 实际处理的天数（包括新增和修复） | 5 |
| `skippedDays` | 已存在且完整的日期数 | 85 |
| `mode` | 回填模式 | `incremental`（增量）或 `full`（全量） |
| `durationMs` | 总耗时（毫秒） | 104 |
| `queriesExecuted` | 执行的 SQL 查询数 | 3（检查 1 + 查询 2）或更少 |

## 功能实现详解

### 1. 缺失日期检查 (`getMissingDailySummaryDates`)
- 生成期望的日期列表（T-1 逻辑，不包含今天）
- 查询数据库中已存在的汇总数据
- 比对找出缺失的日期
- 返回缺失日期列表

### 2. 增量批量回填 (`batchRefreshDailySummaries`)
- 参数 `onlyMissingDates=true` 时启用增量模式
- 自动跳过已完整的日期，仅处理缺失数据
- 保持原有的批量 INSERT 优化（分批处理，每批 50 条）

### 3. 启动流程优化
- 读取环境变量 `DAILY_SUMMARY_BACKFILL_DAYS`
- 使用 `setImmediate` 异步执行，不阻塞服务启动
- 增强日志记录处理结果、跳过统计、耗时等

## 注意事项

1. **T-1 数据口径**
   - 汇总数据不包含当日（基于 `CURDATE()` 的 T-1 逻辑）
   - 昨天的数据在今日凌晨 00:05 生成

2. **定时调度**
   - 日常汇总：每天 00:05 自动生成前一天的数据
   - 启动回填：仅在服务启动时执行（异步非阻塞）
   - 两者互不影响

3. **活跃用例数缓存**
   - 批量处理时仅查询一次 `active_cases_count`
   - 所有日期共享相同的用例数值
   - 若需要按日期追踪活跃用例数变化，可在后续优化中分日期统计

## 后续优化方向

1. **数据库连接池优化**
   - 调整 `connectionLimit` 根据负载情况
   - 监控连接池使用率

2. **增量同步策略**
   - 记录上次回填时间，仅处理增量日期
   - 支持手动触发全量检查

3. **监控告警**
   - 回填失败自动告警
   - 数据完整性检查定时执行

## 相关文件

- 核心逻辑：`server/repositories/DashboardRepository.ts`
- 调度器：`server/services/DailySummaryScheduler.ts`
- 服务启动：`server/index.ts`
- 环境配置：`deployment/.env.swarm`

## 测试命令

```bash
# 手动触发每日汇总生成
curl -X POST http://localhost:3000/api/dashboard/trigger-daily-summary

# 批量回填（如需完全重新填充）
curl -X POST http://localhost:3000/api/dashboard/backfill-summaries \
  -H "Content-Type: application/json" \
  -d '{"days": 30}'
```
