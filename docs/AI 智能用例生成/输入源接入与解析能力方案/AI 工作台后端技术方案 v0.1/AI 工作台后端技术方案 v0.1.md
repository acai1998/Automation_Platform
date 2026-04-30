当前项目阶段做分层：**Phase 1 先支撑页面骨架、输入源模型、附件复用、生成任务复用；Phase 2 再补真实解析、外部平台接入、覆盖风险分析；Phase 3 做执行闭环和质量回流。**

---

# AI 工作台后端技术方案 v0.1

## 1. 方案背景

当前 AI 工作台已经具备基础的 AI 用例生成能力，核心模式是用户输入 `requirementText`，系统调用 AI 生成测试用例脑图。后续产品目标是将 AI 工作台从单一生成页面升级为一个支持 **多源输入、风险驱动、覆盖分析、执行回流** 的测试设计中台。

根据现有改造大纲，新的 AI 工作台需要支持 4 个核心阶段：

1. 输入材料
2. 生成结果
3. 覆盖与风险
4. 执行与回流

输入材料阶段需要管理 PRD / 需求描述、接口文档、附件、代码变更、缺陷单、流量摘要等输入证据，并展示解析状态、参与状态和生成前准备情况。

Phase 1 的目标不是一次性完成所有真实智能能力，而是先完成 4 页签结构、输入材料页签基础结构、覆盖与风险骨架、执行与回流骨架，并为后续真实接口和分析能力预留数据结构。

---

## 2. 建设目标

### 2.1 业务目标

* 支持 AI 生成从单一需求文本升级为多源证据驱动。
* 支持用户明确管理“本次生成用了哪些材料”。
* 支持生成结果具备来源说明和风险依据。
* 支持后续覆盖分析、风险识别、执行回流和知识沉淀。

### 2.2 技术目标

* 统一输入源数据模型 `AiInputSourceItem`。
* 建立输入源状态流转机制。
* 建立文档解析任务模型。
* 复用现有 AI 生成、工作台、附件、知识库接口能力。
* 为 Git、缺陷平台、流量平台、Jenkins 等第三方集成预留扩展点。
* 支持异步任务、失败重试、审计日志和降级策略。

### 2.3 分期目标

| 阶段      | 建设重点                                   |
| ------- | -------------------------------------- |
| Phase 1 | 工作台结构改造、输入源模型、附件复用、外部来源占位、生成任务复用       |
| Phase 2 | 文档解析、OpenAPI 解析、Git / 缺陷 / 流量真实接入、多源生成 |
| Phase 3 | 覆盖率分析、风险识别、执行回流、质量评分、知识库沉淀             |

---

## 3. 业务范围

### 3.1 范围内

* AI 工作台创建与维护
* 需求描述管理
* 输入材料接入
* 附件上传与解析
* 接口文档、代码变更、缺陷单、流量摘要来源预留
* AI 生成任务管理
* 测试用例结果管理
* 覆盖与风险摘要
* 执行摘要与质量回流
* 第三方平台接入扩展

### 3.2 Phase 1 暂不纳入

* GitLab / GitHub 真实对接
* 缺陷平台真实对接
* 流量平台真实对接
* 风险评分真实算法
* 覆盖率真实计算模型
* 工作台直连 Jenkins 执行新链路

这些能力在现有 Phase 1 排期中已明确暂不纳入第一阶段。

---

## 4. 后端整体架构

### 4.1 架构分层

```text
前端页面层
  ↓
API 接入层 Controller
  ↓
业务服务层 Service
  ↓
领域服务层 Domain Service
  ↓
异步任务层 Worker / Queue
  ↓
数据持久层 Repository / Mapper
  ↓
第三方集成层 Adapter
```

---

### 4.2 后端核心服务

```text
AiWorkspaceService
  - 工作台创建、查询、更新、发布状态管理

AiInputSourceService
  - 输入源接入、更新、删除、参与生成控制

AiDocumentParseService
  - 文档解析任务创建、执行、重试、结果保存

AiGenerationTaskService
  - AI 生成任务创建、流式生成、任务状态管理

AiTestCaseService
  - 测试用例结果保存、列表查询、详情查询、编辑

AiCoverageService
  - 覆盖率摘要、覆盖缺口分析

AiRiskService
  - 风险项识别、高风险项管理、推荐补充项

AiExecutionFeedbackService
  - 执行摘要、Jenkins 结果、质量评分、知识库回流

ThirdPartyIntegrationService
  - Git、缺陷平台、流量平台、Jenkins 接入适配
```

---

### 4.3 整体架构图

```text
┌────────────────────────────────────────────┐
│                前端 AI 工作台               │
│ 输入材料 / 生成结果 / 覆盖风险 / 执行回流       │
└────────────────────────────────────────────┘
                    ↓
┌────────────────────────────────────────────┐
│                 API Gateway / Controller    │
└────────────────────────────────────────────┘
                    ↓
┌────────────────────────────────────────────┐
│                 业务服务层                  │
│ Workspace / InputSource / Generation / Case │
│ Coverage / Risk / Execution / Integration  │
└────────────────────────────────────────────┘
                    ↓
┌────────────────────────────────────────────┐
│                 异步任务层                  │
│ 文档解析任务 / AI 生成任务 / 分析任务 / 回流任务 │
└────────────────────────────────────────────┘
                    ↓
┌────────────────────────────────────────────┐
│                 数据存储层                  │
│ MySQL / Redis / Object Storage / Vector DB  │
└────────────────────────────────────────────┘
                    ↓
┌────────────────────────────────────────────┐
│                 第三方平台                  │
│ GitLab / GitHub / Jira / 禅道 / Jenkins / APM │
└────────────────────────────────────────────┘
```

---

## 5. 核心业务流程

### 5.1 新建 AI 工作台流程

```text
用户点击新增需求
  ↓
填写工作台名称、需求描述
  ↓
POST /workspaces
  ↓
创建 workspace
  ↓
创建 requirement 类型输入源
  ↓
需求文本转 normalizedMarkdown
  ↓
默认参与生成
  ↓
返回工作台详情
```

---

### 5.2 输入材料接入流程

```text
用户上传附件 / 接入外部来源
  ↓
创建 input_source 记录
  ↓
content_status = connected
  ↓
parse_status = pending
  ↓
创建 parse_job
  ↓
异步解析
  ↓
保存 normalized_markdown / sections / chunks
  ↓
parse_status = parsed / failed
```

---

### 5.3 AI 生成流程

```text
用户点击 AI 生成首版用例
  ↓
后端校验参与来源
  ↓
过滤 included + parsed / not_required 来源
  ↓
组装 AI 上下文
  ↓
创建 generation_task
  ↓
调用 AI 流式生成接口
  ↓
解析生成结果
  ↓
保存测试用例
  ↓
更新工作台摘要
```

---

### 5.4 覆盖与风险流程

```text
生成结果完成
  ↓
根据用例、来源、模块、风险规则做分析
  ↓
生成 coverage_summary
  ↓
生成 risk_items
  ↓
生成 recommendations
  ↓
前端展示覆盖与风险页签
```

---

### 5.5 执行与回流流程

```text
用户发布工作台
  ↓
选择执行范围
  ↓
触发 Jenkins / 执行平台
  ↓
执行结果回调 / 定时拉取
  ↓
保存 execution_summary
  ↓
计算质量评分
  ↓
用户确认是否回流知识库
```

---

# 6. 功能模块设计

## 6.1 需求管理模块

### 6.1.1 职责

* 创建 AI 工作台
* 维护工作台名称、所属项目、状态、版本
* 管理需求描述文本
* 自动保存草稿
* 维护发布状态和远端同步状态

### 6.1.2 工作台状态

```ts
type WorkspaceStatus =
  | 'draft'        // 草稿中
  | 'ready'        // 可生成
  | 'generating'   // 生成中
  | 'generated'    // 已生成
  | 'reviewing'    // 待评审
  | 'published'    // 已发布
  | 'executing'    // 执行中
  | 'executed'     // 已执行
  | 'archived';    // 已归档
```

### 6.1.3 核心接口

```http
POST /api/ai-cases/workspaces
GET  /api/ai-cases/workspaces
GET  /api/ai-cases/workspaces/:id
PUT  /api/ai-cases/workspaces/:id
DELETE /api/ai-cases/workspaces/:id
```

你们现有接口已经包含工作台列表、详情、创建和更新能力，可继续复用。

---

## 6.2 材料接入模块

### 6.2.1 职责

* 管理所有输入源。
* 统一需求描述、附件、接口文档、代码变更、缺陷单、流量摘要。
* 控制是否参与本次生成。
* 维护内容状态、解析状态、参与状态。

### 6.2.2 输入源类型

```ts
type SourceType =
  | 'requirement'
  | 'attachment'
  | 'interface_doc'
  | 'code_change'
  | 'defect'
  | 'traffic_summary';
```

### 6.2.3 状态设计

```ts
type ContentStatus =
  | 'empty'
  | 'filled'
  | 'pending_connection'
  | 'connected';

type ParseStatus =
  | 'not_required'
  | 'pending'
  | 'parsing'
  | 'parsed'
  | 'failed';

type ParticipateStatus =
  | 'included'
  | 'excluded';
```

### 6.2.4 状态流转

```text
待接入
  ↓
已接入
  ↓
待解析
  ↓
解析中
  ↓
已解析 / 解析失败
  ↓
已参与 / 未参与
```

### 6.2.5 核心接口

```http
GET    /api/ai-cases/workspaces/:id/input-sources
PUT    /api/ai-cases/workspaces/:id/input-sources
POST   /api/ai-cases/workspaces/:id/input-sources
PATCH  /api/ai-cases/workspaces/:id/input-sources/:sourceId
DELETE /api/ai-cases/workspaces/:id/input-sources/:sourceId
POST   /api/ai-cases/workspaces/:id/input-sources/:sourceId/include
POST   /api/ai-cases/workspaces/:id/input-sources/:sourceId/exclude
```

现有接口清单中已建议新增 `PUT /api/ai-cases/workspaces/:id/input-sources` 来更新工作台输入源。

---

## 6.3 文档解析模块

### 6.3.1 职责

* 接收附件、接口文档、Diff、缺陷文本、流量摘要。
* 提取文本内容。
* 转换为标准化 Markdown。
* 抽取结构化片段 sections。
* 切分 AI chunks。
* 记录解析任务状态和失败原因。

### 6.3.2 支持格式

| 类型                  | Phase 1    | Phase 2 |
| ------------------- | ---------- | ------- |
| TXT / MD            | 直接解析       | 继续支持    |
| PDF                 | 上传展示，解析可延后 | 接入解析器   |
| DOCX                | 上传展示，解析可延后 | 接入解析器   |
| PNG / JPG           | 仅上传展示      | OCR     |
| OpenAPI JSON / YAML | 占位         | 结构化解析   |
| Diff / Patch        | 手动摘要       | 结构化解析   |

### 6.3.3 解析产物

```ts
interface ParseResult {
  sourceId: string;
  normalizedMarkdown: string;
  sections: AiSourceSection[];
  chunks: AiSourceChunk[];
  metadata: {
    parser: string;
    tokenEstimate: number;
    pageCount?: number;
    parseDurationMs: number;
  };
}
```

### 6.3.4 核心接口

```http
POST /api/ai-cases/workspaces/:id/input-sources/:sourceId/parse
POST /api/ai-cases/workspaces/:id/input-sources/:sourceId/retry-parse
GET  /api/ai-cases/workspaces/:id/input-sources/:sourceId/parse-result
```

---

## 6.4 AI 生成任务模块

### 6.4.1 职责

* 校验生成前准备状态。
* 过滤可参与来源。
* 组装 AI 上下文。
* 创建生成任务。
* 调用 AI 流式生成。
* 保存生成结果。
* 更新工作台状态和摘要。

### 6.4.2 任务状态

```ts
type GenerationTaskStatus =
  | 'pending'
  | 'running'
  | 'success'
  | 'failed'
  | 'cancelled';
```

### 6.4.3 生成模式

```ts
type GenerationMode =
  | 'first_version'
  | 'regenerate'
  | 'supplement'
  | 'risk_based_supplement';
```

### 6.4.4 核心接口

```http
POST /api/ai-cases/workspaces/:id/generate/stream
GET  /api/ai-cases/workspaces/:id/generation-tasks/:taskId
POST /api/ai-cases/workspaces/:id/generation-tasks/:taskId/cancel
```

现有 `POST /api/ai-cases/generate` 和 `POST /api/ai-cases/generate/stream` 可以继续复用，并逐步扩展为支持多输入源。

---

## 6.5 测试用例管理模块

### 6.5.1 职责

* 保存 AI 生成的结构化测试用例。
* 支持列表查询、详情查询、编辑、状态流转。
* 保存用例来源依据 evidence。
* 支持脑图视图与列表视图共用数据。

### 6.5.2 测试用例结构

```ts
interface AiTestCase {
  id: string;
  workspaceId: string;
  parentId?: string;

  title: string;
  moduleName?: string;
  precondition?: string;
  steps: string[];
  expectedResult: string;

  priority: 'P0' | 'P1' | 'P2' | 'P3';
  caseType: 'functional' | 'api' | 'exception' | 'security' | 'performance' | 'regression';
  status: 'draft' | 'confirmed' | 'published' | 'executed';

  riskLevel?: 'high' | 'medium' | 'low';
  evidences: AiGenerationEvidence[];

  createdBy: string;
  updatedBy: string;
}
```

### 6.5.3 Evidence 结构

```ts
interface AiGenerationEvidence {
  sourceId: string;
  sourceType: SourceType;
  sourceTitle: string;
  chunkId?: string;
  quote?: string;
}
```

接口清单里已经建议结果明细补充 `riskLevel`、`evidences`、`moduleName`、`caseType`。

---

## 6.6 覆盖率分析模块

### 6.6.1 职责

* 根据需求、接口、变更、缺陷、流量摘要计算覆盖情况。
* 输出总体覆盖率、需求覆盖率、接口覆盖率、变更覆盖率、高风险覆盖率。
* 识别覆盖缺口。

### 6.6.2 Phase 1 策略

Phase 1 可以返回 mock 或静态结构，只保证页面可展示。

### 6.6.3 Phase 2 / 3 策略

逐步支持：

* 需求章节覆盖
* 接口路径覆盖
* 代码变更文件覆盖
* 缺陷复发场景覆盖
* 流量热点路径覆盖

### 6.6.4 数据结构

```ts
interface AiCoverageRiskSummary {
  overallCoverage: number;
  requirementCoverage: number;
  interfaceCoverage: number;
  changeCoverage: number;
  highRiskCoverage: number;
  highRiskCount: number;
  uncoveredHighRiskCount: number;
  uncoveredItems: AiCoverageGapItem[];
}
```

该结构与你们接口调整清单中的覆盖与风险数据结构方向一致。

---

## 6.7 风险识别模块

### 6.7.1 职责

* 基于多源输入识别高风险点。
* 给测试用例标记风险等级。
* 输出推荐补充项。
* 支持点击风险项跳转生成结果。

### 6.7.2 风险来源

| 风险来源 | 示例            |
| ---- | ------------- |
| 需求风险 | 复杂业务规则、异常分支   |
| 接口风险 | 参数缺失、状态码异常、鉴权 |
| 代码风险 | 改动范围大、核心模块变更  |
| 缺陷风险 | 历史缺陷复发        |
| 流量风险 | 高访问量、高异常率、慢接口 |

### 6.7.3 风险项结构

```ts
interface AiRiskItem {
  id: string;
  workspaceId: string;
  title: string;
  description?: string;
  riskLevel: 'high' | 'medium' | 'low';
  sourceType: SourceType;
  sourceId?: string;
  relatedCaseIds?: string[];
  coverageStatus: 'covered' | 'uncovered' | 'partial';
  recommendation?: string;
}
```

### 6.7.4 推荐补充接口

```http
POST /api/ai-cases/workspaces/:id/recommendations/generate
```

该接口也已在接口调整清单中被建议用于根据覆盖缺口或高风险点生成补充测试项。

---

## 6.8 执行回流模块

### 6.8.1 职责

* 管理工作台发布状态。
* 展示最近执行摘要。
* 对接 Jenkins 或执行平台。
* 保存执行结果。
* 支持质量评分。
* 支持知识库回流。

### 6.8.2 执行摘要结构

```ts
interface AiExecutionFeedbackSummary {
  publishStatus: 'draft' | 'published' | 'archived';
  publishedVersion?: number;
  lastExecutionId?: number;
  lastExecutionStatus?: string;
  jenkinsJob?: string;
  jenkinsBuildId?: string;
  jenkinsUrl?: string;
  qualityScore?: number;
  knowledgeBaseStatus?: 'none' | 'candidate' | 'added';
}
```

现有接口调整清单也建议新增执行摘要接口、工作台执行接口和质量评分接口。

---

## 6.9 第三方集成模块

### 6.9.1 职责

* 对接 GitLab / GitHub
* 对接 Jira / 禅道 / TAPD / 自研缺陷平台
* 对接 Jenkins
* 对接流量平台 / APM / 日志平台
* 对接 OpenAPI URL 或接口文档仓库

### 6.9.2 Adapter 设计

```ts
interface ThirdPartyAdapter<TInput, TOutput> {
  platform: string;
  validate(input: TInput): Promise<boolean>;
  fetch(input: TInput): Promise<TOutput>;
  normalize(data: TOutput): Promise<AiInputSourceItem>;
}
```

### 6.9.3 建议接入优先级

```text
1. OpenAPI / Swagger
2. GitLab / GitHub PR
3. 缺陷平台
4. Jenkins
5. 流量平台 / APM
```

---

# 7. 数据库设计

下面是建议的核心表设计。字段可根据你们现有表结构做裁剪。

---

## 7.1 ai_workspace

工作台主表。

| 字段                | 类型       | 说明     |
| ----------------- | -------- | ------ |
| id                | bigint   | 主键     |
| name              | varchar  | 工作台名称  |
| project_id        | bigint   | 项目 ID  |
| module_name       | varchar  | 所属模块   |
| requirement_text  | text     | 需求描述   |
| status            | varchar  | 工作台状态  |
| publish_status    | varchar  | 发布状态   |
| version           | int      | 当前版本   |
| map_data          | json     | 现有脑图数据 |
| input_summary     | json     | 输入源摘要  |
| analysis_summary  | json     | 分析摘要   |
| execution_summary | json     | 执行摘要   |
| created_by        | bigint   | 创建人    |
| updated_by        | bigint   | 更新人    |
| created_at        | datetime | 创建时间   |
| updated_at        | datetime | 更新时间   |

---

## 7.2 ai_input_source

输入源表。

| 字段                  | 类型       | 说明           |
| ------------------- | -------- | ------------ |
| id                  | bigint   | 主键           |
| workspace_id        | bigint   | 工作台 ID       |
| source_type         | varchar  | 来源类型         |
| title               | varchar  | 来源标题         |
| description         | varchar  | 来源描述         |
| raw_content         | longtext | 原始文本         |
| raw_file_url        | varchar  | 文件地址         |
| raw_file_name       | varchar  | 文件名          |
| normalized_markdown | longtext | 标准化 Markdown |
| content_status      | varchar  | 内容状态         |
| parse_status        | varchar  | 解析状态         |
| participate_status  | varchar  | 参与状态         |
| source_ref          | json     | 第三方来源引用      |
| metadata            | json     | 元数据          |
| created_at          | datetime | 创建时间         |
| updated_at          | datetime | 更新时间         |

索引建议：

```sql
idx_workspace_id
idx_workspace_source_type
idx_workspace_participate_status
idx_workspace_parse_status
```

---

## 7.3 ai_source_section

结构化片段表。

| 字段           | 类型       | 说明           |
| ------------ | -------- | ------------ |
| id           | bigint   | 主键           |
| source_id    | bigint   | 输入源 ID       |
| workspace_id | bigint   | 工作台 ID       |
| section_type | varchar  | 片段类型         |
| title        | varchar  | 片段标题         |
| content      | longtext | 片段内容         |
| order_no     | int      | 排序           |
| metadata     | json     | 页码、标题路径、置信度等 |
| created_at   | datetime | 创建时间         |

---

## 7.4 ai_source_chunk

AI 切片表。

| 字段             | 类型       | 说明       |
| -------------- | -------- | -------- |
| id             | bigint   | 主键       |
| source_id      | bigint   | 输入源 ID   |
| section_id     | bigint   | 片段 ID    |
| workspace_id   | bigint   | 工作台 ID   |
| content        | longtext | 切片内容     |
| token_estimate | int      | token 估算 |
| order_no       | int      | 排序       |
| metadata       | json     | 元数据      |
| created_at     | datetime | 创建时间     |

---

## 7.5 ai_parse_job

解析任务表。

| 字段            | 类型       | 说明                                   |
| ------------- | -------- | ------------------------------------ |
| id            | bigint   | 主键                                   |
| workspace_id  | bigint   | 工作台 ID                               |
| source_id     | bigint   | 输入源 ID                               |
| status        | varchar  | pending / running / success / failed |
| parser_type   | varchar  | tika / mammoth / openapi / manual    |
| progress      | int      | 解析进度                                 |
| error_message | text     | 错误信息                                 |
| retry_count   | int      | 重试次数                                 |
| started_at    | datetime | 开始时间                                 |
| finished_at   | datetime | 完成时间                                 |
| created_at    | datetime | 创建时间                                 |

---

## 7.6 ai_generation_task

生成任务表。

| 字段              | 类型       | 说明                                      |
| --------------- | -------- | --------------------------------------- |
| id              | bigint   | 主键                                      |
| workspace_id    | bigint   | 工作台 ID                                  |
| mode            | varchar  | first_version / supplement / regenerate |
| status          | varchar  | pending / running / success / failed    |
| source_ids      | json     | 本次参与来源                                  |
| prompt_snapshot | longtext | prompt 快照                               |
| model_name      | varchar  | 模型名称                                    |
| output_snapshot | longtext | 原始输出                                    |
| error_message   | text     | 错误信息                                    |
| started_at      | datetime | 开始时间                                    |
| finished_at     | datetime | 完成时间                                    |
| created_at      | datetime | 创建时间                                    |

---

## 7.7 ai_test_case

测试用例表。

| 字段              | 类型       | 说明           |
| --------------- | -------- | ------------ |
| id              | bigint   | 主键           |
| workspace_id    | bigint   | 工作台 ID       |
| parent_id       | bigint   | 父节点          |
| title           | varchar  | 用例标题         |
| module_name     | varchar  | 模块           |
| precondition    | text     | 前置条件         |
| steps           | json     | 步骤           |
| expected_result | text     | 预期结果         |
| priority        | varchar  | P0 / P1 / P2 |
| case_type       | varchar  | 用例类型         |
| status          | varchar  | 状态           |
| risk_level      | varchar  | 风险等级         |
| evidence        | json     | 来源依据         |
| created_at      | datetime | 创建时间         |
| updated_at      | datetime | 更新时间         |

---

## 7.8 ai_coverage_summary

覆盖率摘要表。

| 字段                   | 类型       | 说明     |
| -------------------- | -------- | ------ |
| id                   | bigint   | 主键     |
| workspace_id         | bigint   | 工作台 ID |
| overall_coverage     | decimal  | 总体覆盖率  |
| requirement_coverage | decimal  | 需求覆盖率  |
| interface_coverage   | decimal  | 接口覆盖率  |
| change_coverage      | decimal  | 变更覆盖率  |
| high_risk_coverage   | decimal  | 高风险覆盖率 |
| summary_json         | json     | 完整摘要   |
| created_at           | datetime | 创建时间   |

---

## 7.9 ai_risk_item

风险项表。

| 字段              | 类型       | 说明                            |
| --------------- | -------- | ----------------------------- |
| id              | bigint   | 主键                            |
| workspace_id    | bigint   | 工作台 ID                        |
| title           | varchar  | 风险标题                          |
| description     | text     | 风险描述                          |
| risk_level      | varchar  | high / medium / low           |
| source_type     | varchar  | 风险来源类型                        |
| source_id       | bigint   | 来源 ID                         |
| coverage_status | varchar  | covered / uncovered / partial |
| recommendation  | text     | 推荐动作                          |
| created_at      | datetime | 创建时间                          |

---

## 7.10 ai_execution_feedback

执行回流表。

| 字段               | 类型       | 说明          |
| ---------------- | -------- | ----------- |
| id               | bigint   | 主键          |
| workspace_id     | bigint   | 工作台 ID      |
| execution_id     | varchar  | 执行 ID       |
| jenkins_job      | varchar  | Jenkins Job |
| jenkins_build_id | varchar  | Build ID    |
| jenkins_url      | varchar  | Jenkins URL |
| status           | varchar  | 执行状态        |
| passed_count     | int      | 通过数         |
| failed_count     | int      | 失败数         |
| skipped_count    | int      | 跳过数         |
| quality_score    | int      | 质量评分        |
| feedback_json    | json     | 执行详情        |
| created_at       | datetime | 创建时间        |

---

# 8. 接口设计

## 8.1 工作台接口

```http
POST /api/ai-cases/workspaces
GET /api/ai-cases/workspaces
GET /api/ai-cases/workspaces/:id
PUT /api/ai-cases/workspaces/:id
DELETE /api/ai-cases/workspaces/:id
```

### 工作台详情返回

```json
{
  "id": 1,
  "name": "登录模块 AI 工作台",
  "status": "draft",
  "publishStatus": "draft",
  "version": 1,
  "requirementText": "登录模块支持账号密码登录...",
  "inputSummary": {},
  "analysisSummary": {},
  "executionSummary": {},
  "mapData": {}
}
```

现有接口清单建议在 `GET /workspaces/:id` 中扩展 `inputSummary`、`analysisSummary`、`executionSummary`、`publishSummary`。

---

## 8.2 输入源接口

```http
GET /api/ai-cases/workspaces/:id/input-sources
PUT /api/ai-cases/workspaces/:id/input-sources
POST /api/ai-cases/workspaces/:id/input-sources
PATCH /api/ai-cases/workspaces/:id/input-sources/:sourceId
DELETE /api/ai-cases/workspaces/:id/input-sources/:sourceId
```

### 创建输入源

```json
{
  "type": "interface_doc",
  "title": "登录接口 OpenAPI",
  "inputMode": "file",
  "sourceRef": {
    "platform": "local",
    "url": "https://xxx/openapi.yaml"
  }
}
```

---

## 8.3 解析接口

```http
POST /api/ai-cases/workspaces/:id/input-sources/:sourceId/parse
POST /api/ai-cases/workspaces/:id/input-sources/:sourceId/retry-parse
GET /api/ai-cases/workspaces/:id/input-sources/:sourceId/parse-result
```

---

## 8.4 生成接口

```http
POST /api/ai-cases/workspaces/:id/generate/stream
```

请求：

```json
{
  "mode": "first_version",
  "sourceIds": ["src-001", "src-002", "src-003"]
}
```

---

## 8.5 测试用例接口

```http
GET /api/ai-cases/workspaces/:id/test-cases
GET /api/ai-cases/workspaces/:id/test-cases/:caseId
PUT /api/ai-cases/workspaces/:id/test-cases/:caseId
DELETE /api/ai-cases/workspaces/:id/test-cases/:caseId
```

---

## 8.6 覆盖与风险接口

```http
GET /api/ai-cases/workspaces/:id/coverage-risk
POST /api/ai-cases/workspaces/:id/recommendations/generate
```

---

## 8.7 执行与回流接口

```http
GET /api/ai-cases/workspaces/:id/execution-summary
POST /api/ai-cases/workspaces/:id/execute
POST /api/ai-cases/workspaces/:id/quality-score
POST /api/ai-cases/workspaces/:id/knowledge-base
DELETE /api/ai-cases/workspaces/:id/knowledge-base
```

执行摘要、执行触发、质量评分和知识库接口在接口清单中均已有对应建议或现有能力。

---

# 9. AI 上下文与 Prompt 设计

## 9.1 上下文组装原则

AI 不直接读取原始文件，而是读取：

```text
normalizedMarkdown + sections + chunks + source metadata
```

---

## 9.2 Prompt 输入结构

```md
# 任务
请基于以下输入材料生成结构化测试用例。

# 生成要求
- 按模块组织
- 覆盖正常流程、异常流程、边界条件、权限校验
- 标记优先级 P0 / P1 / P2
- 标记风险等级 high / medium / low
- 每条用例必须返回来源依据 evidence

# 输入来源

## 来源 1：需求描述
sourceId: src_req_001
sourceType: requirement

...Markdown...

## 来源 2：接口文档
sourceId: src_api_001
sourceType: interface_doc

...Markdown...

# 输出 JSON Schema
{
  "cases": [
    {
      "title": "",
      "moduleName": "",
      "priority": "P1",
      "riskLevel": "medium",
      "caseType": "functional",
      "precondition": "",
      "steps": [],
      "expectedResult": "",
      "evidences": [
        {
          "sourceId": "",
          "chunkId": "",
          "quote": ""
        }
      ]
    }
  ]
}
```

---

## 9.3 Prompt 分层

建议拆成：

| 层级             | 内容           |
| -------------- | ------------ |
| System Prompt  | 角色、输出约束、安全边界 |
| Task Prompt    | 本次生成任务       |
| Context Prompt | 输入源内容        |
| Output Schema  | 输出 JSON 结构   |
| Quality Rules  | 风险、覆盖、优先级规则  |

---

# 10. 异步任务与消息队列设计

## 10.1 异步任务类型

| 任务           | 是否异步    | 原因      |
| ------------ | ------- | ------- |
| 文档解析         | 是       | 解析耗时不稳定 |
| AI 生成        | 是 / SSE | 流式输出耗时  |
| 覆盖率分析        | 是       | 后续可能复杂  |
| 风险识别         | 是       | 可异步计算   |
| Jenkins 执行回流 | 是       | 外部执行耗时  |

---

## 10.2 队列设计

```text
parse.queue
generation.queue
analysis.queue
execution.queue
callback.queue
```

---

## 10.3 任务状态表

统一使用：

```ts
type TaskStatus =
  | 'pending'
  | 'running'
  | 'success'
  | 'failed'
  | 'cancelled';
```

---

## 10.4 重试策略

| 任务         | 重试次数  | 策略     |
| ---------- | ----- | ------ |
| 文档解析       | 3 次   | 指数退避   |
| AI 生成      | 1~2 次 | 失败提示用户 |
| 第三方拉取      | 3 次   | 指数退避   |
| Jenkins 回调 | 3 次   | 定时补偿   |

---

# 11. 第三方平台接入方案

## 11.1 接入模式

统一采用 Adapter 模式：

```text
ThirdPartyAdapter
  ↓
fetch raw data
  ↓
normalize to SourceItem
  ↓
parse to Markdown / Sections / Chunks
```

---

## 11.2 Git 接入

支持：

* GitLab MR
* GitHub PR
* Commit
* Diff

输出：

* changedFiles
* impactedModules
* impactedApis
* riskSummary

---

## 11.3 缺陷平台接入

支持：

* Jira
* 禅道
* TAPD
* 自研缺陷平台

输出：

* defectId
* title
* severity
* reproduceSteps
* rootCause
* fixSummary

---

## 11.4 流量平台接入

支持：

* 时间范围选择
* 热门接口
* 异常接口
* 慢接口
* P95 / P99

输出：

* hotEndpoints
* errorRate
* latency
* requestCount

---

## 11.5 Jenkins 接入

支持：

* 触发 Job
* 查询 Build 状态
* 拉取执行结果
* 回写执行摘要

---

# 12. 权限与安全设计

## 12.1 权限模型

| 权限                 | 说明       |
| ------------------ | -------- |
| workspace:create   | 创建工作台    |
| workspace:read     | 查看工作台    |
| workspace:update   | 编辑工作台    |
| workspace:delete   | 删除工作台    |
| workspace:generate | 触发 AI 生成 |
| workspace:publish  | 发布工作台    |
| workspace:execute  | 触发执行     |
| workspace:admin    | 管理工作台    |

---

## 12.2 数据隔离

* 按租户 / 项目隔离工作台。
* 输入源和附件必须校验 workspace 权限。
* 第三方凭证不直接暴露给前端。
* AI Prompt 快照中敏感字段需脱敏。

---

## 12.3 文件安全

* 限制文件类型。
* 限制文件大小。
* 文件名安全处理。
* 病毒扫描可作为后续增强。
* 私有对象存储访问使用签名 URL。
* 解析失败文件不进入 AI 上下文。

---

# 13. 异常处理与降级方案

## 13.1 文档解析失败

处理方式：

* 标记 `parseStatus = failed`
* 记录失败原因
* 支持重试
* 支持用户删除
* 不参与 AI 生成

---

## 13.2 AI 生成失败

处理方式：

* 保留 generation_task 失败状态
* 保存错误信息
* 前端提示重新生成
* 不覆盖上一次成功结果

---

## 13.3 第三方平台失败

处理方式：

* 显示来源不可用
* 支持手动输入摘要兜底
* 支持稍后重试
* 不影响需求文本生成

---

## 13.4 覆盖与风险分析失败

处理方式：

* 返回静态空态结构
* 不阻断生成结果查看
* 提示“分析暂不可用”

---

# 14. 日志、监控与审计

## 14.1 业务日志

记录：

* 工作台创建 / 更新
* 输入源新增 / 删除 / 参与状态切换
* 解析任务开始 / 成功 / 失败
* AI 生成开始 / 成功 / 失败
* 发布 / 执行 / 回流操作

---

## 14.2 审计日志

```ts
interface AuditLog {
  id: string;
  workspaceId: string;
  operatorId: string;
  action: string;
  targetType: string;
  targetId: string;
  before?: unknown;
  after?: unknown;
  createdAt: string;
}
```

---

## 14.3 监控指标

| 指标                      | 说明          |
| ----------------------- | ----------- |
| parse_success_rate      | 解析成功率       |
| parse_duration          | 解析耗时        |
| generation_success_rate | AI 生成成功率    |
| generation_duration     | 生成耗时        |
| queue_pending_count     | 队列积压        |
| ai_token_usage          | AI token 消耗 |
| third_party_error_rate  | 第三方平台错误率    |

---

# 15. 技术选型

## 15.1 后端基础

| 能力      | 推荐                             |
| ------- | ------------------------------ |
| Web 框架  | 复用当前后端技术栈                      |
| 数据库     | MySQL / PostgreSQL             |
| 缓存      | Redis                          |
| 消息队列    | RabbitMQ / Kafka / Redis Queue |
| 对象存储    | MinIO / S3 / OSS               |
| 文档解析    | Apache Tika / Unstructured     |
| PDF 解析  | Tika / PDFBox                  |
| DOCX 解析 | Tika / Mammoth                 |
| AI 调用   | 复用现有 AiCaseGenerationService   |
| SSE     | 复用现有流式生成能力                     |
| 日志      | ELK / Loki                     |
| 监控      | Prometheus + Grafana           |

---

## 15.2 选型原则

* Phase 1 优先复用当前系统能力。
* 文档解析优先后端统一处理。
* 第三方接入采用 Adapter 模式。
* AI 生成接口优先兼容现有 `generate/stream`。
* 覆盖与风险分析可先 mock，后续真实实现。

---

# 16. 部署方案

## 16.1 Phase 1 部署

```text
ai-workbench-api
  - 工作台接口
  - 输入源接口
  - 生成接口
  - 附件接口

existing-ai-service
  - AI 生成能力复用

database
  - 工作台表
  - 输入源扩展字段或新表

object-storage
  - 附件文件
```

---

## 16.2 Phase 2 部署

```text
ai-workbench-api
document-parser-worker
generation-worker
analysis-worker
integration-worker
message-queue
object-storage
```

---

## 16.3 部署建议

* API 服务和解析 Worker 分离。
* AI 生成 Worker 和文档解析 Worker 分离。
* 附件文件放对象存储。
* 解析结果入库，避免重复解析。
* 第三方接入 Worker 独立限流。

---

# 17. 性能与容量设计

## 17.1 文件限制

| 类型              | 限制        |
| --------------- | --------- |
| 单文件大小           | 20MB      |
| 单工作台附件数         | 10 个      |
| 单工作台输入源数        | 50 个以内    |
| 单次生成来源数         | 建议 10 个以内 |
| 单次 Prompt Token | 按模型上限动态裁剪 |

---

## 17.2 Token 控制

策略：

* 超长文档先摘要。
* 只使用 included 来源。
* 优先使用 sections 摘要。
* chunks 按相关性排序。
* Prompt 中携带 sourceId / chunkId。

---

## 17.3 解析性能

策略：

* 同一文件 hash 去重。
* 解析结果缓存。
* 大文件异步解析。
* 解析任务限流。
* 失败任务重试上限。

---

# 18. 测试方案

## 18.1 单元测试

覆盖：

* SourceItem 状态流转
* 来源限制校验
* Markdown 标准化
* Chunk 切分
* 生成准备判断
* Prompt 组装

---

## 18.2 接口测试

覆盖：

* 工作台创建
* 输入源新增 / 更新 / 删除
* 附件上传
* 解析任务创建
* AI 生成任务创建
* 覆盖风险接口
* 执行摘要接口

---

## 18.3 集成测试

覆盖：

* 新建工作台 → 填写需求 → 上传附件 → 生成用例
* 输入源解析失败 → 重试 → 参与生成
* 生成结果 → 风险分析 → 推荐补充
* 发布 → 执行摘要 → 知识库回流

---

## 18.4 回归测试

确保：

* 现有 AI 生成能力不受影响
* 现有脑图编辑能力不受影响
* 现有附件上传能力不受影响
* 现有知识库回流能力不受影响

这些能力都是 Phase 1 需要保留的主能力。

---

# 19. 风险点与解决方案

| 风险        | 说明                 | 解决方案                        |
| --------- | ------------------ | --------------------------- |
| 输入源模型频繁变更 | 多来源需求不稳定           | 先用 JSON 扩展字段承接，再固化表结构       |
| 文档解析复杂    | PDF / DOCX / 图片差异大 | Phase 1 先上传展示，Phase 2 接解析器  |
| Prompt 太长 | 多来源导致 token 超限     | sections + chunks + 摘要裁剪    |
| 第三方接入成本高  | Git / 缺陷 / 流量平台差异大 | Adapter 模式，先手动摘要兜底          |
| 覆盖率口径不清   | 不同团队理解不同           | Phase 1 mock，Phase 2 定义覆盖规则 |
| 生成结果质量不稳定 | 输入材料噪音大            | 加来源筛选、参与开关、生成前检查            |
| 解析失败影响生成  | 文件不可读或格式异常         | 失败来源不参与生成，可重试               |
| 工作台详情接口过重 | 四页签数据过多            | 摘要进详情，明细独立接口                |

---

# 20. 迭代计划

## Phase 1：后端基础支撑

目标：支撑 4 页签页面和输入源骨架。

范围：

* 工作台详情扩展
* 输入源模型落地
* 需求描述 SourceItem
* 附件 SourceItem
* 附件接口复用
* 外部来源占位
* 生成准备判断
* 覆盖风险 mock 接口
* 执行摘要 mock 接口

建议对应你们现有排期中的 S1、S2、S3：工作台详情字段补充、覆盖与风险摘要接口、执行摘要接口。

---

## Phase 2：输入源与生成增强

目标：让 AI 生成真正使用多源证据。

范围：

* `PUT /input-sources`
* 文档解析任务
* TXT / MD / PDF / DOCX 解析
* OpenAPI 解析
* 代码变更摘要
* 缺陷单摘要
* 多来源 Prompt 组装
* 生成结果 evidence 字段

---

## Phase 3：风险分析与执行闭环

目标：从生成工具升级为测试设计闭环平台。

范围：

* 覆盖率计算
* 风险评分
* 推荐补充项
* Jenkins 执行联动
* 质量评分
* 知识库回流
* 执行失败分析

---

# 最小可执行后端版本建议

如果你现在要立刻进入开发，我建议第一版后端只做这些：

```text
1. 扩展 GET /workspaces/:id，返回 inputSummary / analysisSummary / executionSummary
2. 新增或模拟 PUT /workspaces/:id/input-sources
3. 复用附件上传接口，附件上传后生成 attachment 类型 SourceItem
4. 需求描述保存为 requirement 类型 SourceItem
5. 增加 parseStatus / participateStatus 字段
6. AI 生成接口先继续复用 generate/stream
7. 覆盖风险和执行摘要先返回 mock 结构
```

这一版能支撑前端完整跑通：

```text
新增需求
  ↓
输入材料
  ↓
选择参与来源
  ↓
AI 生成
  ↓
查看生成结果
  ↓
查看覆盖风险骨架
  ↓
查看执行回流骨架
```

后续再逐步把 mock、占位和手动摘要替换为真实解析与第三方平台接入。
