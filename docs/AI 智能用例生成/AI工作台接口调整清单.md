# AI 工作台接口调整清单

## 1. 文档目的

本文档用于梳理 AI 工作台改造成 4 个页签后，前后端接口层面的复用点、缺口和建议新增接口。

目标是：

- 先明确哪些接口可以直接复用
- 再明确哪些字段需要扩展
- 最后确定哪些能力需要新增接口

## 2. 现有接口能力盘点

当前 AI 工作台已具备以下接口基础：

### 2.1 生成相关

- `POST /api/ai-cases/generate`
- `POST /api/ai-cases/generate/stream`

作用：

- 根据 `requirementText` 生成脑图结果
- 支持流式生成进度

### 2.2 工作台相关

- `GET /api/ai-cases/workspaces`
- `GET /api/ai-cases/workspaces/:id`
- `POST /api/ai-cases/workspaces`
- `PUT /api/ai-cases/workspaces/:id`

作用：

- 工作台列表与详情
- 工作台创建与更新

### 2.3 节点状态相关

- `POST /api/ai-cases/workspaces/:id/node-status`
- `GET /api/ai-cases/workspaces/:id/node-executions`

作用：

- 节点状态流转
- 节点状态流水查询

### 2.4 附件相关

- `POST /api/ai-cases/workspaces/:id/attachments`
- `GET /api/ai-cases/workspaces/:id/attachments`
- `DELETE /api/ai-cases/attachments/:attachmentId`

作用：

- 工作台节点附件管理

### 2.5 知识库相关

- `POST /api/ai-cases/workspaces/:id/knowledge-base`
- `DELETE /api/ai-cases/workspaces/:id/knowledge-base`

作用：

- 将工作台加入或移出知识库

## 3. 改造后的接口需求总览

工作台改造成 4 个页签后，接口需求将从“单一生成+脑图保存”扩展为 4 类：

1. 输入材料接口
2. 生成结果接口
3. 覆盖与风险接口
4. 执行与回流接口

## 4. 可直接复用的接口

## 4.1 可继续复用的核心接口

以下接口原则上无需废弃：

- `POST /generate`
- `POST /generate/stream`
- `GET /workspaces/:id`
- `PUT /workspaces/:id`
- `POST /workspaces/:id/attachments`
- `GET /workspaces/:id/attachments`
- `POST /workspaces/:id/knowledge-base`

原因：

- 这些接口已经覆盖了工作台主数据、生成、附件、知识库回流等核心能力

## 4.2 需要扩展但仍可复用的接口

### `GET /api/ai-cases/workspaces/:id`

建议扩展返回内容，不要新开完全独立接口。

建议新增返回区块：

- `inputSummary`
- `analysisSummary`
- `executionSummary`
- `publishSummary`

### `PUT /api/ai-cases/workspaces/:id`

建议支持更丰富的工作台更新字段，例如：

- 输入源配置
- 来源摘要
- 发布状态
- 执行摘要缓存

## 5. 建议新增的数据结构

## 5.1 输入材料数据结构

建议在工作台详情中新增：

```ts
interface AiWorkspaceInputSummary {
  requirementText: string | null;
  interfaceDocs: AiInputSourceItem[];
  attachments: AiInputSourceItem[];
  codeChanges: AiInputSourceItem[];
  defects: AiInputSourceItem[];
  trafficSummaries: AiInputSourceItem[];
  selectedSourceTypes: string[];
}
```

建议通用来源结构：

```ts
interface AiInputSourceItem {
  id: string;
  type: 'requirement' | 'interface_doc' | 'attachment' | 'code_change' | 'defect' | 'traffic_summary';
  title: string;
  description?: string | null;
  status?: 'ready' | 'parsing' | 'failed';
  sourceRef?: string | null;
  metadata?: Record<string, unknown>;
}
```

## 5.2 生成结果扩展结构

建议为节点或结果项补充：

```ts
interface AiGenerationEvidence {
  sourceType: 'requirement' | 'code_change' | 'defect' | 'traffic_summary' | 'knowledge_base';
  sourceLabel: string;
  sourceRef?: string | null;
}
```

建议在结果明细中返回：

- `riskLevel`
- `evidences`
- `moduleName`
- `caseType`

## 5.3 覆盖与风险数据结构

建议新增：

```ts
interface AiCoverageRiskSummary {
  overallCoverage: number;
  requirementCoverage: number;
  interfaceCoverage: number;
  changeCoverage: number;
  highRiskCoverage: number;
  highRiskCount: number;
  uncoveredHighRiskCount: number;
  highRiskItems: AiRiskItem[];
  uncoveredItems: AiCoverageGapItem[];
  recommendations: AiRecommendationItem[];
}
```

## 5.4 执行与回流数据结构

建议新增：

```ts
interface AiExecutionFeedbackSummary {
  publishStatus: 'draft' | 'published' | 'archived';
  publishedVersion?: number | null;
  lastExecutionId?: number | null;
  lastExecutionStatus?: string | null;
  jenkinsJob?: string | null;
  jenkinsBuildId?: string | null;
  jenkinsUrl?: string | null;
  qualityScore?: number | null;
  knowledgeBaseStatus?: 'none' | 'candidate' | 'added';
}
```

## 6. 建议的接口改造方案

## 6.1 方案原则

- 优先扩展已有工作台详情接口
- 对分析类和执行类能力新增独立接口
- 避免把所有数据都塞进单一更新接口

## 6.2 工作台详情接口扩展

### 现有接口

- `GET /api/ai-cases/workspaces/:id`

### 建议扩展返回

```json
{
  "id": 1,
  "name": "登录模块 AI 工作台",
  "mapData": {},
  "inputSummary": {},
  "analysisSummary": {},
  "executionSummary": {},
  "publishSummary": {}
}
```

用途：

- 页面首次加载时一次性拿到 4 个页签的摘要信息

## 6.3 建议新增：输入材料更新接口

### 建议接口

- `PUT /api/ai-cases/workspaces/:id/input-sources`

作用：

- 更新本次工作台所使用的输入源信息

建议请求体：

```json
{
  "requirementText": "xxx",
  "interfaceDocs": [],
  "codeChanges": [],
  "defects": [],
  "trafficSummaries": [],
  "selectedSourceTypes": ["requirement", "attachment", "code_change"]
}
```

说明：

- 如果第一阶段不想新增表结构，也可以先将其序列化存入工作台扩展字段或 `map_data` 外挂字段

## 6.4 建议新增：覆盖与风险分析接口

### 建议接口

- `GET /api/ai-cases/workspaces/:id/coverage-risk`

作用：

- 返回当前工作台的覆盖与风险分析结果

建议返回：

- 总体覆盖率
- 高风险项
- 未覆盖项
- 推荐补充项

说明：

- 第一阶段可以后端返回 mock 结构
- 第二阶段接真实分析逻辑

## 6.5 建议新增：推荐补充生成接口

### 建议接口

- `POST /api/ai-cases/workspaces/:id/recommendations/generate`

作用：

- 根据覆盖缺口或高风险点生成补充测试项

建议请求体：

```json
{
  "riskItemIds": ["risk-1", "risk-2"],
  "mode": "append"
}
```

## 6.6 建议新增：执行摘要接口

### 建议接口

- `GET /api/ai-cases/workspaces/:id/execution-summary`

作用：

- 获取该工作台最近一次或最近几次执行摘要

建议返回：

- 最近执行状态
- Jenkins 信息
- 执行统计
- 最近失败项

## 6.7 建议新增：工作台执行接口

### 建议接口

- `POST /api/ai-cases/workspaces/:id/execute`

作用：

- 从工作台直接触发 Jenkins 或平台执行链路

建议请求体：

```json
{
  "mode": "all",
  "moduleIds": [],
  "riskOnly": false,
  "environmentId": 1
}
```

说明：

- 第一阶段如果不直接触发，也可先做成能力占位

## 6.8 建议新增：质量评分接口

### 建议接口

- `POST /api/ai-cases/workspaces/:id/quality-score`

作用：

- 记录人工或系统给出的质量评分

建议请求体：

```json
{
  "score": 85,
  "comment": "覆盖完整，执行稳定，可入知识库"
}
```

## 7. 前后端字段对齐建议

## 7.1 第一阶段优先对齐字段

建议先对齐以下前端急需字段：

- `inputSummary`
- `highRiskCount`
- `overallCoverage`
- `lastExecutionStatus`
- `qualityScore`

## 7.2 节点级字段扩展建议

建议后续在节点元数据中逐步补充：

- `riskLevel`
- `evidences`
- `moduleName`
- `owner`
- `lastExecutedAt`

## 8. Phase 1 最小接口方案

如果想快速推进第一阶段而不大改后端，建议采用以下最小方案：

### 直接复用

- `GET /workspaces/:id`
- `PUT /workspaces/:id`
- `POST /generate/stream`
- 附件相关接口
- 知识库相关接口

### 仅新增 2 个接口

- `GET /workspaces/:id/coverage-risk`
- `GET /workspaces/:id/execution-summary`

### 前端本地派生

- 输入材料统计
- 用例列表数据
- 基础覆盖率占位

这样可以先把 4 页签跑起来，再逐步扩展。

## 9. Phase 2 建议接口方案

当进入真实联动阶段，建议补齐：

- `PUT /workspaces/:id/input-sources`
- `POST /workspaces/:id/execute`
- `POST /workspaces/:id/quality-score`
- `POST /workspaces/:id/recommendations/generate`

## 10. 风险与注意事项

### 10.1 风险点

- 工作台详情接口过重，可能导致首次加载变慢
- 输入源模型尚未落库前，前后端协议容易反复变化
- 风险评分口径未定，会影响分析接口稳定性
- 执行与回流容易与现有 Jenkins 执行链路重复建设

### 10.2 规避建议

- 摘要接口与详细分析接口分开
- 输入源先以可扩展 JSON 结构承接
- 风险页第一阶段先返回静态结构
- 执行接口优先复用现有执行能力

## 11. 建议的后端研发顺序

建议后端按以下顺序推进：

1. 扩展工作台详情返回摘要字段
2. 新增覆盖与风险摘要接口
3. 新增执行摘要接口
4. 落输入源结构
5. 补工作台执行接口
6. 补质量评分与推荐补充接口

## 12. 联调完成标准

接口层改造完成后，至少应满足以下联调目标：

- 前端可以完整渲染 4 个页签
- 输入材料页有真实工作台数据承接
- 生成结果页可展示脑图与列表数据
- 覆盖与风险页有独立分析数据来源
- 执行与回流页可展示最近执行摘要
- 工作台可进入知识库回流流程

