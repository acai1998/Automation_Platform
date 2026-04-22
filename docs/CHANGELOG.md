# 更新日志

> **触发场景**：需要了解某版本新增了哪些功能、数据库变更历史、或追溯某个功能是何时引入的时候读取本文件。

---

## v1.5.2 (2026-04-06)

- 🗺️ **AI 脑图节点结构再次重构**：从「4节点扁平并列」改为「4节点链式串联（一行展示）」
  - 新结构：`testcase → 前置条件 → 测试步骤 → 预期结果`，每级只有1个子节点，脑图中横向串联成一行
  - `buildCaseChain` / `buildCaseChainNodes`（前后端）构建链式子节点，取代旧的并列兄弟节点方案
- 🔄 **旧数据迁移升级**（`src/lib/aiCaseMindMap.ts`）：
  - 新增 `isNewChainFormat` 检测节点是否已是链式新格式
  - 新增 `migrateToChainFormat` 统一将三种旧格式（note格式 / 嵌套"测试点"层 / 并列前缀标签子节点）迁移为链式结构
  - 旧的 `isLegacyNestedTestcase` / `migrateNestedTestcaseToFlat` / `extractCaseSiblings` 已合并重构
- 🔧 **Sidebar 和导出适配**：`AiCaseSidebar` 通过链式访问（`testcase.children[0]` → `.children[0]` → `.children[0]`）展示前置条件/步骤/预期结果；`exportMindDataToMarkdown` 同步适配链式结构

## v1.5.1 (2026-04-06)

- 🗺️ **AI 脑图节点结构重构**：将多层嵌套格式改为「4节点横向平铺」结构（已被 v1.5.2 进一步重构）
  - testcase 节点直接挂 3 个 scenario 子节点：前置条件 / 测试步骤 / 预期结果
  - 多条内容不再换行，改用分号拼接（`1.xxx；2.xxx；3.xxx`），节点简洁可读
  - 子节点 `topic` 不再携带「前置条件：」等前缀标签，纯内容展示
- 🔄 **旧数据自动迁移**（`src/lib/aiCaseMindMap.ts`）：
  - `isLegacyNestedTestcase` 检测两种历史格式（嵌套"测试点"层 / 含前缀标签的子节点）
  - `migrateNestedTestcaseToFlat` 去前缀标签 + 多行改分号拼接 + 子节点顺序排列
  - 用户打开画布时自动触发迁移，写入 IndexedDB，下次打开无需重复处理
- 🔧 **前后端格式统一**：`server/services/aiCaseMapBuilder.ts` 同步引入 `fmtInline` 和 `buildCaseChildNodes`，后端生成数据与前端渲染格式完全一致

## v1.3.1 (2026-03-12)

- ✨ 任务管理页面新增**关联用例**功能：新建/编辑任务时可通过选择器多选测试用例，支持关键字搜索（300ms防抖）和 API/UI/性能类型过滤
- 🎨 任务卡片新增关联用例数量显示（`ListChecks` 图标 + 数量，未关联时显示橙色提示）
- 🧹 移除任务卡片中无实际填写项的「未分类」和「测试环境」标签
- 🔧 前端 `useAllCasesForSelect` Hook（`src/hooks/useCases.ts`）：无需强制指定类型、支持 `enabled` 开关（弹窗关闭时不发请求）、30秒 stale 缓存
- 🔗 `caseIds` 正确传递至后端 `POST /api/tasks` 和 `PUT /api/tasks/:id`，执行时 `TaskSchedulerService` 从 `case_ids` 字段读取并触发 Jenkins 任务
- ⚠️ 若任务未关联任何用例，运行时调度引擎会记录 warn 日志并跳过执行（不触发 Jenkins），前端弹窗中有对应提示

## v1.3.0 (2026-03-12)

- 🚀 新增 `TaskSchedulerService` 定时调度引擎：自研5段式 Cron 解析、服务重启任务恢复、24h 漏触发补偿、每分钟 DB 轮询同步
- 🔒 新增任务执行控制：FIFO 等待队列、并发上限（默认3可配置）、指数退避重试策略、支持取消运行中执行
- 📊 新增任务维度统计：`GET /api/tasks/:id/stats`（成功率趋势、Top 10 失败原因聚合）
- 🔍 新增权限与审计：`Auto_TaskAuditLogs` + `GET /api/tasks/:id/audit`（10种操作行为追踪）
- 🗄️ 数据库迁移 `scripts/migrate-v1.3.0.sql`：新建审计表、重试配置字段、多组性能索引
- 🐛 修复外键约束：`operator_id` 改为 `DEFAULT NULL`，解决 `ON DELETE SET NULL` 与 `NOT NULL` 不兼容导致的 errno 150
- 🎨 任务 UI 增强：集成统计图表（成功率折线图、失败原因柱状图）、审计日志时间线、调度器状态监控面板

## v1.2.0 (2026-03-12)

- ✨ 任务管理页面新增新建/编辑/删除完整交互流程（含表单校验）
- 🔍 任务列表支持 keyword/status/triggerType 筛选与分页
- ⚡ 优化 `/api/tasks` 列表接口，内联 recentExecutions，消除前端 N+1 查询
- 🛡️ 完善任务 CRUD 参数校验（triggerType、cronExpression、caseIds）
- 🔄 新增 `PATCH /api/tasks/:id/status` 接口，支持 active/paused/archived 状态切换
- 🔗 任务卡片支持"查看报告"联动跳转（优先跳转最近运行详情）

## v1.1.0 (2025-03-10)

- ✨ 新增 TestRun.execution_id 字段，优化执行记录关联逻辑
- 🐛 修复今日执行统计甜甜圈图显示问题
- ⚡ 优化 Jenkins 回调用例统计逻辑，支持 pytest 真实结果解析
- 🎨 重构日期范围选择器，新增快捷选项和自定义双月历
- 📊 优化报告详情页展示和筛选功能
- 🔧 修复最近测试运行数据不更新问题
- 📈 统一测试统计数据口径，区分 T-1 和实时数据
- 🎯 优化仪表盘数据查询性能
- 🔄 支持测试运行记录按触发方式、状态和时间筛选

## v1.0.0 (2025-02-08)

- 🎉 初始版本发布
- 完整的测试用例管理功能
- Jenkins 集成和执行管理
- 仪表盘统计和报告展示
- Git 仓库集成和脚本同步
- 任务调度和定时执行
