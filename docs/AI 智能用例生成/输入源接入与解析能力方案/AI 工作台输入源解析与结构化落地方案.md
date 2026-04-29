当前项目阶段来设计：
**Phase 1 先能跑通输入源模型、解析状态、Markdown 标准化和轻量汇聚图**
**Phase 2 再接真实解析和外部平台**

现有规划里，Phase 1 本来就是先完成 4 页签结构、输入材料页签基础结构、附件区复用、外部来源占位、基础状态管理和空态/加载态/错误态；真实 Git/GitHub、缺陷平台、流量平台暂不纳入 Phase 1
所以这版方案的核心原则是：**先统一模型和流程，不急着把所有来源真实打通。**

---

# AI 工作台输入源解析与结构化落地方案

## 1. 方案目标

本方案解决 3 件事：

1. **需求描述、附件材料怎么转成 AI 可用内容**
2. **多来源怎么统一成 SourceItem，并支持状态流转**
3. **怎么用类似 n8n 的汇聚图表达“多源输入 → AI 生成”**

最终落地后，输入材料页要能回答：

```text
输入了什么？
哪些已经解析？
哪些参与本次生成？
现在能不能生成？
最终 AI 生成用了哪些证据？
```

这和改造大纲里“输入材料页集中管理 AI 生成所依赖的所有输入证据，让用户清楚知道本次生成用了什么”的目标一致。

---

# 2. 总体落地架构

建议采用这条链路：

```text
原始输入
  ↓
SourceItem 来源对象
  ↓
解析任务 ParseJob
  ↓
标准化 Markdown
  ↓
结构化片段 Sections
  ↓
AI 切片 Chunks
  ↓
生成前组装 Prompt Payload
  ↓
AI 生成结构化用例
```

也就是：

```text
需求描述 / 附件材料 / 接口文档 / 代码变更 / 缺陷单 / 流量摘要
  ↓
统一 SourceItem
  ↓
统一解析和归一化
  ↓
统一参与生成
```

---

# 3. 第一阶段落地边界

## 3.1 Phase 1 必做

```text
1. 定义统一 SourceItem 数据结构
2. 定义来源限制配置 sourceConfig
3. 定义状态枚举 contentStatus / parseStatus / participateStatus
4. 需求描述转 normalizedMarkdown
5. 附件上传后创建 SourceItem
6. TXT / MD 附件可直接解析
7. PDF / DOCX 先允许上传，解析状态可先 mock 或待解析
8. 输入材料页展示状态标签
9. 右侧生成准备卡判断 canGenerate
10. 做轻量来源汇聚图，不做拖拽编排
```

## 3.2 Phase 1 不做

```text
1. 不真实接 GitLab / GitHub
2. 不真实接缺陷平台
3. 不真实接流量平台
4. 不做复杂风险评分
5. 不做真正 n8n 式自由编排
6. 不强制实现 OCR
```

这和 Phase 1 “外部来源占位、保留现有附件、为后续真实接口预留结构”的排期方向一致。

---

# 4. 数据模型设计

## 4.1 SourceType

```ts
export type SourceType =
  | 'requirement'
  | 'attachment'
  | 'interface_doc'
  | 'code_change'
  | 'defect'
  | 'traffic_summary';
```

---

## 4.2 内容状态

```ts
export type ContentStatus =
  | 'empty'              // 未填写
  | 'filled'             // 已填写
  | 'pending_connection' // 待接入
  | 'connected';         // 已接入
```

---

## 4.3 解析状态

```ts
export type ParseStatus =
  | 'not_required' // 不需要解析
  | 'pending'      // 待解析
  | 'parsing'      // 解析中
  | 'parsed'       // 已解析
  | 'failed';      // 解析失败
```

---

## 4.4 参与状态

```ts
export type ParticipateStatus =
  | 'included' // 已参与
  | 'excluded'; // 未参与
```

---

## 4.5 统一输入源对象

```ts
export interface AiInputSourceItem {
  id: string;
  workspaceId: string;

  type: SourceType;
  title: string;
  description?: string;

  rawContent?: string;
  rawFileUrl?: string;
  rawFileName?: string;

  normalizedMarkdown?: string;
  sections?: AiSourceSection[];
  chunks?: AiSourceChunk[];

  contentStatus: ContentStatus;
  parseStatus: ParseStatus;
  participateStatus: ParticipateStatus;

  sourceRef?: {
    platform:
      | 'local'
      | 'manual'
      | 'openapi'
      | 'gitlab'
      | 'github'
      | 'jira'
      | 'zentao'
      | 'traffic';
    refId?: string;
    url?: string;
  };

  metadata?: {
    fileType?: string;
    fileSize?: number;
    tokenEstimate?: number;
    parser?: string;
    parseErrorMessage?: string;
    createdAt?: string;
    updatedAt?: string;
  };
}
```

---

## 4.6 结构化片段

```ts
export interface AiSourceSection {
  id: string;
  sourceId: string;

  sectionType:
    | 'background'
    | 'goal'
    | 'business_rule'
    | 'main_flow'
    | 'exception_flow'
    | 'acceptance_criteria'
    | 'api_spec'
    | 'code_change'
    | 'defect'
    | 'traffic'
    | 'attachment_text'
    | 'unknown';

  title: string;
  content: string;
  order: number;

  metadata?: {
    pageNumber?: number;
    headingPath?: string[];
    confidence?: number;
  };
}
```

---

## 4.7 AI 切片

```ts
export interface AiSourceChunk {
  id: string;
  sourceId: string;
  sectionId?: string;

  content: string;
  markdownPath?: string[];
  tokenEstimate: number;
  order: number;
}
```

---

# 5. 来源限制配置

前端和后端都应该共用一套配置理念。

```ts
export interface SourceTypeConfig {
  type: SourceType;
  label: string;
  allowedInputModes: Array<'text' | 'file' | 'url' | 'platform_ref'>;
  allowedFileTypes?: string[];
  maxFileSizeMB?: number;
  maxCount?: number;
  requireParsing: boolean;
  defaultParticipate: boolean;
}
```

---

## 5.1 推荐配置

```ts
export const SOURCE_TYPE_CONFIG: SourceTypeConfig[] = [
  {
    type: 'requirement',
    label: '需求描述 / PRD',
    allowedInputModes: ['text'],
    maxCount: 1,
    requireParsing: false,
    defaultParticipate: true,
  },
  {
    type: 'attachment',
    label: '附件材料',
    allowedInputModes: ['file'],
    allowedFileTypes: ['pdf', 'docx', 'txt', 'md', 'png', 'jpg', 'jpeg'],
    maxFileSizeMB: 20,
    maxCount: 10,
    requireParsing: true,
    defaultParticipate: true,
  },
  {
    type: 'interface_doc',
    label: '接口文档',
    allowedInputModes: ['file', 'url', 'text'],
    allowedFileTypes: ['json', 'yaml', 'yml', 'txt'],
    maxFileSizeMB: 10,
    maxCount: 5,
    requireParsing: true,
    defaultParticipate: false,
  },
  {
    type: 'code_change',
    label: '代码变更',
    allowedInputModes: ['platform_ref', 'text', 'file'],
    allowedFileTypes: ['diff', 'patch', 'txt'],
    maxFileSizeMB: 5,
    maxCount: 20,
    requireParsing: true,
    defaultParticipate: false,
  },
  {
    type: 'defect',
    label: '缺陷单',
    allowedInputModes: ['platform_ref', 'text', 'file'],
    allowedFileTypes: ['csv', 'txt', 'json'],
    maxFileSizeMB: 5,
    maxCount: 50,
    requireParsing: true,
    defaultParticipate: false,
  },
  {
    type: 'traffic_summary',
    label: '流量摘要',
    allowedInputModes: ['platform_ref', 'text', 'file'],
    allowedFileTypes: ['csv', 'json', 'txt'],
    maxFileSizeMB: 10,
    maxCount: 5,
    requireParsing: true,
    defaultParticipate: false,
  },
];
```

---

# 6. 需求描述解析方案

## 6.1 输入

用户在“需求描述 / PRD”文本框输入：

```text
登录模块支持账号密码登录和验证码登录。
连续输错 5 次后触发图形验证码。
Token 过期后需要重新登录。
支持退出登录和多端会话管理。
```

---

## 6.2 处理流程

```text
用户输入
  ↓
前端自动保存
  ↓
创建 / 更新 requirement SourceItem
  ↓
normalizeRequirementToMarkdown()
  ↓
extractRequirementSections()
  ↓
splitMarkdownToChunks()
  ↓
更新生成准备状态
```

---

## 6.3 Markdown 标准化产物

Markdown 适合作为 AI 输入的**中间文本格式**，不是唯一存储结构。它的价值是层级清晰、便于审阅、便于切片、也容易作为 Prompt 内容。

```md
# 需求描述：登录模块

## 业务背景
登录模块用于用户身份验证与访问控制。

## 核心流程
- 用户可以通过账号密码登录。
- 用户可以通过验证码登录。
- 登录成功后生成 Token 并写入会话。

## 业务规则
- 连续 5 次登录失败后，需要触发图形验证码。
- Token 过期后，用户需要重新登录。
- 支持退出登录与多端会话管理。

## 异常场景
- 密码错误。
- 验证码错误或过期。
- Token 过期。
- 多端登录冲突。

## 验收标准
- 正常登录成功。
- 异常登录失败时返回明确提示。
- Token 失效后不可访问受保护资源。
```

---

## 6.4 需求描述解析函数

```ts
export function normalizeRequirementToMarkdown(input: {
  title: string;
  rawText: string;
}): string {
  const safeTitle = input.title?.trim() || '未命名需求';
  const rawText = input.rawText.trim();

  return [
    `# 需求描述：${safeTitle}`,
    '',
    '## 原始需求',
    rawText,
    '',
    '## 待 AI 抽取的信息',
    '- 业务背景',
    '- 核心流程',
    '- 业务规则',
    '- 异常场景',
    '- 验收标准',
  ].join('\n');
}
```

Phase 1 可以先不做复杂 AI 抽取，只做规范化 Markdown。

Phase 2 再调用 AI 或规则抽取：

```ts
export function extractRequirementSections(markdown: string): AiSourceSection[] {
  return [
    {
      id: crypto.randomUUID(),
      sourceId: '',
      sectionType: 'unknown',
      title: '原始需求',
      content: markdown,
      order: 1,
    },
  ];
}
```

---

# 7. 附件材料解析方案

## 7.1 Phase 1 支持策略

| 文件类型    | Phase 1 动作          | 解析状态        |
| ------- | ------------------- | ----------- |
| TXT     | 读取文本并转 Markdown     | 已解析         |
| MD      | 直接作为 Markdown       | 已解析         |
| PDF     | 上传入库，解析可 mock / 待解析 | 待解析         |
| DOCX    | 上传入库，解析可 mock / 待解析 | 待解析         |
| PNG/JPG | 上传入库，不参与文本生成        | 待解析 / 不支持解析 |

Apache Tika 可以检测并提取大量文件类型的文本和元数据，官方说明支持超过千种文件类型，包括 PPT、XLS、PDF 等；Unstructured 则提供面向 LLM 数据工作流的开源文档摄取和预处理能力，支持 PDF、HTML、Word 文档、图片等格式。([Apache Tika][1])

---

## 7.2 附件上传后 SourceItem

```ts
export function createAttachmentSourceItem(input: {
  workspaceId: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  fileUrl: string;
}): AiInputSourceItem {
  const canParseImmediately = ['txt', 'md'].includes(input.fileType.toLowerCase());

  return {
    id: crypto.randomUUID(),
    workspaceId: input.workspaceId,
    type: 'attachment',
    title: input.fileName,
    rawFileName: input.fileName,
    rawFileUrl: input.fileUrl,
    contentStatus: 'connected',
    parseStatus: canParseImmediately ? 'pending' : 'pending',
    participateStatus: 'excluded',
    sourceRef: {
      platform: 'local',
      url: input.fileUrl,
    },
    metadata: {
      fileName: input.fileName,
      fileType: input.fileType,
      fileSize: input.fileSize,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  };
}
```

---

## 7.3 附件转 Markdown

```ts
export function normalizeAttachmentToMarkdown(input: {
  fileName: string;
  fileType: string;
  plainText: string;
  pageNumber?: number;
}): string {
  return [
    `# 附件材料：${input.fileName}`,
    '',
    '## 文件信息',
    `- 文件类型：${input.fileType}`,
    input.pageNumber ? `- 页码：${input.pageNumber}` : '',
    '',
    '## 解析正文',
    input.plainText.trim(),
  ]
    .filter(Boolean)
    .join('\n');
}
```

---

## 7.4 Chunk 切片

Phase 1 可以用简单规则：

```ts
export function splitMarkdownToChunks(input: {
  sourceId: string;
  markdown: string;
  maxChars?: number;
}): AiSourceChunk[] {
  const maxChars = input.maxChars ?? 1800;
  const paragraphs = input.markdown.split(/\n{2,}/).filter(Boolean);

  const chunks: AiSourceChunk[] = [];
  let buffer = '';
  let order = 1;

  for (const paragraph of paragraphs) {
    if ((buffer + '\n\n' + paragraph).length > maxChars) {
      chunks.push({
        id: crypto.randomUUID(),
        sourceId: input.sourceId,
        content: buffer,
        tokenEstimate: Math.ceil(buffer.length / 1.8),
        order: order++,
      });
      buffer = paragraph;
    } else {
      buffer = buffer ? `${buffer}\n\n${paragraph}` : paragraph;
    }
  }

  if (buffer) {
    chunks.push({
      id: crypto.randomUUID(),
      sourceId: input.sourceId,
      content: buffer,
      tokenEstimate: Math.ceil(buffer.length / 1.8),
      order,
    });
  }

  return chunks;
}
```

Phase 2 可以换成 Markdown Header Splitter 或语义切分。

Unstructured 的 partitioning functions 可以把原始非结构化文档拆成 `Title`、`NarrativeText`、`ListItem` 等结构化元素，适合后续做更精细的 sections 抽取。([Unstructured][2])

---

# 8. 解析状态机

这里建议不要散落在组件里写 if/else，要集中管理。

## 8.1 状态流转

```text
empty
  ↓ 用户输入
filled
  ↓ 不需要解析
parsed

pending_connection
  ↓ 接入来源
connected
  ↓ 创建解析任务
pending
  ↓ 开始解析
parsing
  ↓ 成功
parsed
  ↓ 用户选择
included / excluded

parsing
  ↓ 失败
failed
  ↓ 重试
pending
```

---

## 8.2 事件定义

```ts
export type SourceEvent =
  | { type: 'FILL_TEXT'; rawContent: string }
  | { type: 'CONNECT_SOURCE' }
  | { type: 'START_PARSE' }
  | { type: 'PARSE_SUCCESS'; normalizedMarkdown: string; chunks: AiSourceChunk[] }
  | { type: 'PARSE_FAILED'; errorMessage: string }
  | { type: 'RETRY_PARSE' }
  | { type: 'INCLUDE' }
  | { type: 'EXCLUDE' }
  | { type: 'REMOVE' };
```

如果状态流程后续变复杂，可以用 XState。XState 官方定位是 JavaScript / TypeScript 应用的状态管理与编排方案，使用事件驱动、状态机和 statecharts；它适合这种“接入 → 解析 → 成功/失败 → 是否参与”的明确流程。([stately.ai][3])

---

# 9. 生成准备判断

```ts
export interface GenerationReadiness {
  canGenerate: boolean;
  level: 'blocked' | 'ready' | 'suggest_improve';
  includedSources: AiInputSourceItem[];
  blockedReasons: string[];
  suggestions: string[];
}
```

---

## 9.1 判断函数

```ts
export function evaluateGenerationReadiness(
  sources: AiInputSourceItem[],
): GenerationReadiness {
  const included = sources.filter((source) => source.participateStatus === 'included');

  const usable = included.filter((source) => {
    if (source.type === 'requirement') {
      return source.contentStatus === 'filled';
    }

    return source.contentStatus === 'connected' && source.parseStatus === 'parsed';
  });

  const hasRequirement = usable.some((source) => source.type === 'requirement');
  const hasEnhancedSource = usable.some((source) =>
    ['attachment', 'interface_doc', 'code_change', 'defect', 'traffic_summary'].includes(source.type),
  );

  if (usable.length === 0) {
    return {
      canGenerate: false,
      level: 'blocked',
      includedSources: [],
      blockedReasons: ['请先填写需求描述，或接入至少一个已解析的输入来源。'],
      suggestions: [],
    };
  }

  if (hasRequirement && !hasEnhancedSource) {
    return {
      canGenerate: true,
      level: 'suggest_improve',
      includedSources: usable,
      blockedReasons: [],
      suggestions: ['当前仅基于需求描述生成，建议补充接口文档、附件或缺陷单以提升覆盖质量。'],
    };
  }

  return {
    canGenerate: true,
    level: 'ready',
    includedSources: usable,
    blockedReasons: [],
    suggestions: ['当前输入源已具备，可生成首版结构化测试用例。'],
  };
}
```

---

# 10. AI 生成 Payload 设计

不要直接把全部原始内容塞给 AI。建议组装成：

```ts
export interface AiGenerationSourcePayload {
  sourceId: string;
  sourceType: SourceType;
  title: string;
  normalizedMarkdown: string;
  chunks: Array<{
    chunkId: string;
    content: string;
  }>;
}

export interface AiGenerateRequest {
  workspaceId: string;
  mode: 'first_version' | 'supplement' | 'regenerate';
  sources: AiGenerationSourcePayload[];
}
```

---

## 10.1 Prompt 组装结构

```md
# 任务
请基于以下输入材料生成结构化测试用例。

# 输出要求
- 按模块组织
- 覆盖正常流程、异常流程、边界条件
- 标记优先级 P0 / P1 / P2
- 标记来源依据 sourceId / chunkId
- 输出结构化 JSON

# 输入来源

## 来源 1：需求描述 / PRD
sourceId: src_req_001

...Markdown 内容...

## 来源 2：附件材料
sourceId: src_att_001
fileName: 登录模块PRD_v2.pdf

...Markdown 内容...
```

---

## 10.2 生成结果 evidence 字段

后续每条用例要带来源：

```ts
export interface AiGenerationEvidence {
  sourceId: string;
  sourceType: SourceType;
  sourceTitle: string;
  chunkId?: string;
  quote?: string;
}
```

接口清单中也已经建议生成结果补充 `evidences`、`riskLevel`、`moduleName`、`caseType` 等字段。

---

# 11. 来源汇聚图设计

你说的类似 n8n 的“线状结构”是对的，但建议先做**轻量只读汇聚图**。

## 11.1 Phase 1 形态

```text
需求描述 ───┐
附件材料 ───┤
接口文档 ───┤
代码变更 ───┼──> 输入归一化 ──> AI 生成 ──> 生成结果
缺陷单   ───┤
流量摘要 ───┘
```

---

## 11.2 每个节点展示内容

```text
需求描述
已填写 / 已参与

附件材料
已接入 2 个 / 已解析 / 已参与

接口文档
待接入 / 未参与
```

---

## 11.3 节点颜色规则

| 状态     | 节点颜色    | 线条   |
| ------ | ------- | ---- |
| 未接入    | 灰色      | 虚线   |
| 已接入待解析 | 橙色      | 点线   |
| 解析中    | 蓝色      | 动态点线 |
| 已解析已参与 | 绿色 / 紫色 | 高亮实线 |
| 解析失败   | 红色      | 红色断线 |
| 未参与    | 灰色弱化    | 淡线   |

---

## 11.4 交互

Phase 1：

* 点击来源节点，滚动到对应来源卡片
* 点击 AI 生成节点，聚焦右侧生成准备卡
* hover 节点展示状态详情
* 不支持拖拽
* 不支持自由连线

Phase 2：

* 使用 React Flow 做节点图
* 支持节点点击展开详情
* 支持失败节点重试解析
* 支持节点开关参与生成

React Flow 官方说明它是用于构建 node-based editors 和 interactive diagrams 的可定制 React 组件，适合后续把“来源汇聚图”升级成可交互编排视图。([React Flow][4])

---

# 12. UI 页面落地结构

输入材料页建议增加一个顶部小区域：

```text
┌──────────────────────────────────────────────┐
│ 输入源汇聚图                                  │
│ 需求描述 ─┐                                  │
│ 附件材料 ─┼──> 输入归一化 ──> AI 生成          │
│ 接口文档 ─┘                                  │
└──────────────────────────────────────────────┘
```

下面继续现有卡片区：

```text
左侧：输入源卡片
- 核心输入
- 附件材料
- 外部来源

右侧：生成准备情况
- 可开始生成
- 本次参与来源
- 缺失与建议
- AI 生成首版用例
```

不要把汇聚图做得太大。它的作用是**解释关系和状态**，不是替代输入源卡片。

---

# 13. 后端接口落地

接口调整清单已经建议新增 `PUT /api/ai-cases/workspaces/:id/input-sources`，并且 Phase 2 再补工作台执行、质量评分和推荐补充接口。

## 13.1 Phase 1 可先用工作台扩展字段

```http
PUT /api/ai-cases/workspaces/:id
```

```json
{
  "inputSummary": {
    "sources": [],
    "selectedSourceIds": []
  }
}
```

## 13.2 Phase 2 正式接口

```http
GET /api/ai-cases/workspaces/:id/input-sources
PUT /api/ai-cases/workspaces/:id/input-sources
POST /api/ai-cases/workspaces/:id/input-sources/:sourceId/parse
POST /api/ai-cases/workspaces/:id/input-sources/:sourceId/retry
DELETE /api/ai-cases/workspaces/:id/input-sources/:sourceId
POST /api/ai-cases/workspaces/:id/generate/stream
```

---

# 14. 前端组件拆分

建议新增这些文件：

```text
src/pages/cases/input-materials/
  InputMaterialsTab.tsx
  SourceConvergenceGraph.tsx
  InputSourceCard.tsx
  RequirementSourceCard.tsx
  AttachmentSourceCard.tsx
  ExternalSourceGrid.tsx
  GenerationReadinessPanel.tsx
  StageTips.tsx

src/domain/ai-workbench/
  sourceTypes.ts
  sourceConfig.ts
  sourceStatus.ts
  sourceNormalize.ts
  sourceChunk.ts
  generationReadiness.ts
  sourceGraph.ts
```

---

## 14.1 组件职责

| 组件                         | 职责            |
| -------------------------- | ------------- |
| `InputMaterialsTab`        | 输入材料页整体容器     |
| `SourceConvergenceGraph`   | 来源汇聚图         |
| `InputSourceCard`          | 通用来源卡         |
| `RequirementSourceCard`    | 需求描述专用卡       |
| `AttachmentSourceCard`     | 附件专用卡         |
| `ExternalSourceGrid`       | 接口、代码、缺陷、流量来源 |
| `GenerationReadinessPanel` | 右侧生成准备判断      |
| `StageTips`                | 四阶段 tooltip   |

---

# 15. 开源能力选型

| 能力   | Phase 1        | Phase 2                      |
| ---- | -------------- | ---------------------------- |
| 文件上传 | 复用现有上传         | 可升级 Uppy / react-dropzone    |
| 文档解析 | TXT / MD 简单解析  | Apache Tika / Unstructured   |
| DOCX | 先上传不解析         | Mammoth / Tika               |
| PDF  | 先上传不解析         | Tika / PDF.js / Unstructured |
| 状态机  | 自定义枚举和 reducer | XState                       |
| 汇聚图  | CSS + SVG 固定图  | React Flow                   |
| 表单   | 现有表单           | React Hook Form              |
| 列表表格 | 现有组件           | TanStack Table               |

---

# 16. 研发任务拆分

## 第 1 批：1～2 天，先落模型和 UI 骨架

### T1. 定义输入源模型

产出：

```text
sourceTypes.ts
sourceConfig.ts
sourceStatus.ts
```

验收：

* 6 类来源枚举完整
* 3 类状态完整
* 每种来源有格式限制配置

---

### T2. 输入材料页 UI 调整

产出：

```text
InputMaterialsTab.tsx
InputSourceCard.tsx
GenerationReadinessPanel.tsx
```

验收：

* 能展示需求、附件、接口、代码、缺陷、流量 6 类来源
* 每张卡展示内容状态、解析状态、参与状态
* 右侧能展示生成准备情况

---

### T3. Stage Tips

产出：

```text
StageTips.tsx
```

验收：

* 4 个阶段都有 info 图标
* hover 展示说明
* 文案统一

---

## 第 2 批：2～3 天，落需求和附件解析

### T4. 需求描述标准化

产出：

```text
normalizeRequirementToMarkdown()
splitMarkdownToChunks()
```

验收：

* 用户输入需求后生成 normalizedMarkdown
* 生成 chunks
* requirement source 自动 included

---

### T5. 附件 SourceItem 接入

产出：

```text
createAttachmentSourceItem()
AttachmentSourceCard.tsx
```

验收：

* 上传附件后生成 SourceItem
* TXT / MD 可解析成 Markdown
* PDF / DOCX 显示待解析
* 支持删除附件和切换参与状态

---

## 第 3 批：1～2 天，落汇聚图和生成准备逻辑

### T6. 生成准备判断

产出：

```text
evaluateGenerationReadiness()
```

验收：

* 无来源时按钮置灰
* 只有需求时提示建议补充
* 有需求 + 附件 / 接口 / 缺陷时显示可生成

---

### T7. 来源汇聚图

产出：

```text
SourceConvergenceGraph.tsx
```

验收：

* 显示 6 个来源节点
* 显示“输入归一化 → AI 生成 → 生成结果”
* 节点颜色和线条根据状态变化
* 点击节点定位对应来源卡

---

## 第 4 批：1～2 天，联调和体验收尾

### T8. 自动保存与本地草稿

验收：

* 需求文本编辑后自动保存
* 来源参与状态变化后自动保存
* 页面刷新后状态不丢

### T9. 空态 / 错误态

验收：

* 附件解析失败可显示原因
* 接口/代码/缺陷/流量待接入有明确操作
* 生成按钮有禁用原因提示

---

# 17. 验收标准

## 17.1 产品验收

* 用户能看到 6 类输入源
* 用户能知道哪些来源已接入、已解析、已参与
* 用户能通过汇聚图理解多来源如何进入 AI 生成
* 用户能明确知道当前是否可以生成
* 需求描述和附件能转换为 AI 可用内容

---

## 17.2 技术验收

* SourceItem 模型统一
* 解析状态流转不混乱
* 生成 payload 只包含可用来源
* UI 不直接依赖原始附件结构
* 后续接接口文档、代码变更、缺陷单、流量摘要时无需重构页面

---

# 18. 最终建议落地版本

我建议你们先落这个版本：

```text
V1.0：输入源模型 + 状态标签 + 需求 Markdown + 附件 SourceItem + 右侧生成准备卡

V1.1：来源汇聚图 + 节点状态 + 点击定位

V1.2：TXT / MD 附件真实解析 + PDF / DOCX 待解析占位

V2.0：Tika / Unstructured 文档解析 + OpenAPI 解析 + 多来源生成

V3.0：React Flow 可交互编排 + Git / 缺陷 / 流量真实接入
```

总结：

> 把“输入源统一模型 + AI 可用 Markdown + 结构化片段 + 轻量来源汇聚图”落下来。
> 当前页面马上会更有系统感，后续接任何外部来源都只是在 SourceItem 模型下新增 adapter，而不是重做一套业务逻辑。

[1]: https://tika.apache.org/?utm_source=chatgpt.com "Apache Tika – Apache Tika"
[2]: https://docs.unstructured.io/open-source/core-functionality/partitioning?utm_source=chatgpt.com "Partitioning"
[3]: https://stately.ai/docs/xstate?utm_source=chatgpt.com "XState"
[4]: https://reactflow.dev/?utm_source=chatgpt.com "React Flow: Node-Based UIs in React"
