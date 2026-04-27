# AI 工作台列表版开发方案

## 1. 目标

本方案用于指导 AI 工作台从 `mind-elixir` 脑图页重构为列表化工作台。

目标分成 3 件事：

1. 让 UI 先跑起来
2. 给后续能力预留扩展点
3. 最终彻底移除 `mind-elixir`

## 2. 当前现状

当前实现里：

- [AICases.tsx](/d:/AllProject/Automation_Platform/src/pages/cases/AICases.tsx) 体量很大
- 脑图、列表、附件、远端同步、状态流转都混在一个页面里
- `mind-elixir` 深度耦合在类型、渲染和本地数据结构中

所以这次不建议“小改补丁式重构”，而建议按“新骨架替换旧骨架”的方式推进。

## 3. 研发策略

建议采用：

- `先搭新列表骨架`
- `再把旧能力迁移进来`
- `最后删掉脑图依赖`

而不是：

- 在旧脑图页面上继续堆功能

## 4. 页面拆分建议

### 4.1 路由层

保留现有路由，不改用户入口：

- `/cases/ai-create`
- `/cases/ai`
- `/cases/ai-history`

对应导航建议改成父子结构：

- `AI 工作台`
- `AI 工作台 / 工作台首页` -> `/cases/ai-create`
- `AI 工作台 / 全部记录` -> `/cases/ai-history`

父菜单 `AI 工作台` 默认进入 `工作台首页`。

### 4.2 页面职责

#### `AICaseCreate.tsx`

负责：

- 工作台首页
- 首次引导
- 最近工作台继续
- 新建需求入口
- 跳转全部记录入口

#### `AICaseHistory.tsx`

负责：

- 全部记录列表
- 搜索
- 排序
- 筛选
- 分页
- 历史工作台管理

#### `AICases.tsx`

负责：

- 单个工作台详情
- 输入材料 / 生成结果 / 风险 / 执行页签

但需要重写为“列表工作台容器”。

## 5. 组件拆分建议

建议把新的 `AICases.tsx` 拆成这些组件：

### 5.1 页面骨架组件

- `AiWorkspaceHeader`
- `AiWorkspaceSummaryBar`
- `AiWorkspaceTabs`

### 5.1.1 首页与记录页组件

- `AiWorkspaceHomeHero`
- `AiRecentWorkspaceStrip`
- `AiWorkspaceHistoryTable`
- `AiWorkspaceHistoryPagination`

### 5.2 输入材料页

- `AiMaterialsPanel`
- `AiRequirementEditor`
- `AiAttachmentPanel`
- `AiSourcePlaceholderPanel`
- `AiGenerateActionCard`

### 5.3 生成结果页

- `AiCaseFilterBar`
- `AiCaseListTable`
- `AiCaseBatchToolbar`
- `AiCaseDetailDrawer`

### 5.4 覆盖与风险页

- `AiRiskSummaryCards`
- `AiHighRiskList`
- `AiCoveragePanel`
- `AiRecommendationPanel`

### 5.5 执行与回流页

- `AiExecutionEntryPanel`
- `AiExecutionSummaryPanel`
- `AiExecutionFailuresPanel`
- `AiQualityFeedbackPanel`

## 6. 状态与数据层建议

### 6.1 页面状态拆分

建议把 `AICases.tsx` 的状态分为：

- 工作台基础状态
- 当前页签状态
- 列表筛选状态
- 当前详情抽屉状态
- 批量操作状态
- 上传与生成状态

### 6.2 数据适配层

建议新增一个列表适配层，例如：

- `src/pages/cases/adapters/aiCaseWorkspaceAdapter.ts`

职责：

- 从 `mapData` 派生结构化列表项
- 从列表项反推详情抽屉数据
- 聚合 KPI 摘要
- 聚合模块覆盖和风险统计

这样后续后端改成直接返回 `cases[]` 后，只需要改 adapter。

## 7. 需要预留的扩展点

### 7.0 首页与记录页职责分离

首页只负责：

- 最近 3~5 条
- 引导
- 继续工作台

全部记录页负责：

- 搜索
- 排序
- 筛选
- 分页

这样可以避免首页承担大列表查询压力。

### 7.1 筛选器扩展点

筛选器建议使用配置驱动：

```ts
interface AiCaseFilterDefinition {
  key: string;
  label: string;
  type: 'select' | 'search' | 'toggle';
  options?: Array<{ label: string; value: string }>;
}
```

预留给后续：

- 来源筛选
- 风险筛选
- 审核状态筛选
- 执行批次筛选

### 7.2 列定义扩展点

列表列建议配置化：

```ts
interface AiCaseColumnDefinition {
  key: string;
  title: string;
  width?: number | string;
  visible?: boolean;
  sortable?: boolean;
}
```

预留给后续：

- 列设置
- 权限化列展示
- 自定义列顺序

### 7.3 详情抽屉扩展点

建议抽屉分 section 渲染：

```ts
interface AiCaseDetailSection {
  key: string;
  title: string;
  fields: string[];
}
```

预留给后续：

- 来源解释
- AI 推荐原因
- 执行日志
- 知识库回流信息

### 7.4 批量操作扩展点

批量操作建议做 action registry：

- 改优先级
- 分派负责人
- 标记覆盖
- 加标签
- 加入执行

未来可扩：

- 加入回归集
- 批量评分
- 批量回流知识库

## 8. 研发分期建议

### Phase 1：页面骨架替换

目标：

- 完成菜单信息架构调整
- 首页与全部记录页职责分离
- 重写 `AICases.tsx` 页面骨架
- 去掉脑图主视图
- 落 4 个页签的新列表化布局

范围：

- 首页仅展示最近 5 条
- 全部记录页提供搜索和分页骨架
- Header / KPI / Tabs
- 输入材料页
- 结果页表格骨架
- 风险页骨架
- 执行页骨架

这一阶段可继续复用：

- `mapData`
- 本地 IndexedDB
- 现有附件能力
- 现有工作台保存能力

### Phase 2：结果页结构化增强

目标：

- 让结果页可真正使用

范围：

- 筛选器
- 表格列
- 详情抽屉
- 批量操作栏
- 来源、风险、状态字段透出

### Phase 3：风险与执行接入

目标：

- 把分析和执行能力接进来

范围：

- 覆盖与风险真实数据
- 执行摘要
- 回流入口
- 质量评分

### Phase 4：彻底移除 mind-elixir

目标：

- 删除脑图依赖和旧数据假设

范围：

- 删除 `mind-elixir` 依赖
- 删除画布组件和工具栏
- 清理脑图主题与缩放逻辑
- 收口 `mapData` 到结构化列表数据

## 9. 代码改造顺序建议

建议按下面顺序改：

1. 新建列表化组件，不先删旧文件
2. 让 `AICases.tsx` 先渲染新骨架
3. 把现有数据通过 adapter 喂给新组件
4. 替换旧的结果区、风险区、执行区
5. 确认无引用后，删除脑图相关组件和逻辑

## 10. 建议新增的文件

建议新增：

- `src/pages/cases/components/AiWorkspaceHomeHero.tsx`
- `src/pages/cases/components/AiRecentWorkspaceStrip.tsx`
- `src/pages/cases/components/AiWorkspaceHistoryTable.tsx`
- `src/pages/cases/components/AiWorkspaceHistoryPagination.tsx`
- `src/pages/cases/components/AiWorkspaceHeader.tsx`
- `src/pages/cases/components/AiWorkspaceSummaryBar.tsx`
- `src/pages/cases/components/AiWorkspaceTabs.tsx`
- `src/pages/cases/components/AiCaseFilterBar.tsx`
- `src/pages/cases/components/AiCaseListTable.tsx`
- `src/pages/cases/components/AiCaseDetailDrawer.tsx`
- `src/pages/cases/components/AiRiskSummaryCards.tsx`
- `src/pages/cases/components/AiExecutionSummaryPanel.tsx`
- `src/pages/cases/adapters/aiCaseWorkspaceAdapter.ts`

## 11. 风险点

### 11.1 数据仍然基于 `mapData`

风险：

- 前端需要先从树结构里派生列表

规避：

- 加 adapter，不让页面直接耦合 `mapData`

### 11.2 AICases 现有页面过重

风险：

- 直接原地修改容易越来越乱

规避：

- 先拆组件，再迁移逻辑

### 11.3 一次删太多

风险：

- 容易把附件、同步、生成等现有功能带崩

规避：

- 先替换 UI 容器，再逐步删除脑图逻辑

## 12. 本轮开发建议产出

本轮建议先完成：

1. UI 草图
2. 开发方案
3. 组件拆分清单
4. 可扩展点设计
5. 菜单与路由职责划分

下一轮再正式进入：

1. `AICases.tsx` 列表化重构
2. 新组件落地
3. `mind-elixir` 依赖移除

## 13. 结论

这次重构不是简单“把脑图换成表格”，而是把 AI 工作台变成真正可扩展的业务工作台。

因此开发上最重要的是两件事：

- 先把 UI 骨架和组件边界定清楚
- 先把扩展点留好，再开始删旧逻辑

这样后面无论接风险分析、执行回流还是知识库能力，都不会重新推翻页面结构。
