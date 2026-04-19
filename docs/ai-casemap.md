# AI 测试用例脑图开发文档

> **触发场景**：开发或修改 AI 用例脑图相关功能时读取本文件，涉及 `src/lib/aiCaseMindMap.ts`、`server/services/aiCaseMapBuilder.ts`、`AiCaseSidebar` 组件。

---

## 脑图节点结构（v1.5.2 起，4节点链式串联格式）

```
根节点
└── 功能模块（module）
    └── 场景（scenario）
        └── 测试点（testcase）              ← 节点1：测试点标题
            └── 前置条件内容（scenario）    ← 节点2：多条用「1.xxx；2.xxx」分号拼接
                └── 测试步骤内容（scenario）  ← 节点3：同上
                    └── 预期结果内容（scenario） ← 节点4：同上（叶子节点）
```

脑图中 4 个节点横向串联展开为**一行**，对应一条完整测试用例：
`测试点 ──→ 前置条件 ──→ 测试步骤 ──→ 预期结果`

---

## 核心函数说明

### 前端（`src/lib/aiCaseMindMap.ts`）

| 函数 | 说明 |
|------|------|
| `fmtInline(items)` | 将多条条目格式化为单行：单条直接返回原文，多条用 `1.xxx；2.xxx` 分号拼接 |
| `buildCaseChain(preconditions, steps, expectedResults)` | 构建 testcase 的链式子节点（前置条件→步骤→预期结果，每级只有1个子节点） |
| `isNewChainFormat(node)` | 检测节点是否已是新链式格式（第一个子节点无旧前缀标签） |
| `migrateToChainFormat(node)` | 将旧格式子节点迁移为新链式格式，返回链式根节点列表；`null` 表示已是新格式 |
| `expandImportedCaseNodesFromNote(data, options)` | 全局遍历脑图数据，自动迁移所有旧格式 testcase 节点 |
| `expandNoteToChildren(note)` | 将仅有 `note` 字段的旧版 testcase 解析为链式子节点列表 |

### 后端（`server/services/aiCaseMapBuilder.ts`）

| 函数 | 说明 |
|------|------|
| `fmtInline(items)` | 同前端，保持前后端生成格式一致 |
| `buildCaseChainNodes(testCase)` | 后端构建 testcase 链式子节点（前置条件→测试步骤→预期结果） |
| `buildMapDataFromPlan(plan)` | 将 AI 生成的 JSON 计划转换为标准脑图数据格式 |

---

## 旧数据迁移策略

- **触发时机**：用户打开画布时（`bootstrap` 阶段），`expandImportedCaseNodesFromNote` 自动检测并迁移
- **三种旧格式均已覆盖**：
  1. 仅有 `note` 字段（`note` 中含前缀标签格式）
  2. 嵌套 "测试点" 层（`testcase → 测试点(scenario) → [前置条件/测试步骤/预期结果]`）
  3. 含前缀标签格式（`testcase → "前置条件：xxx" / "测试步骤：xxx"` 等并列子节点）
- **迁移后**统一转为链式：`testcase → 前置条件 → 测试步骤 → 预期结果`
- **幂等保证**：迁移后自动将 `nodeVersion + 1`，写入 IndexedDB 缓存，下次打开无需重复迁移

---

## 数据库表

| 表名 | 说明 |
|------|------|
| `Auto_AiCaseWorkspaces` | 工作台主快照（`map_data` JSON）、版本号、节点进度聚合字段 |
| `Auto_AiCaseNodeExecutions` | 节点状态流转记录（`previous_status -> current_status`） |
| `Auto_AiCaseNodeAttachments` | 节点截图/证据元数据（对象存储地址、校验和） |

迁移脚本：`scripts/migrate-v1.5.0.sql`
