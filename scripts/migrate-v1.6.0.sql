-- ============================================================
-- 迁移脚本 v1.6.0
-- 功能：
--   为 Auto_AiCaseWorkspaces 表添加知识库相关字段，
--   支持 AI 用例生成的向量检索与知识库接入功能
--
--   新增字段：
--     1. requirement_embedding  - 需求文本向量（用于语义检索）
--     2. is_knowledge_base      - 是否加入知识库标记
--     3. quality_score          - 用例质量评分（0-100）
--
-- 执行方式：
--   mysql -u <user> -p <database> < migrate-v1.6.0.sql
-- 前置条件：
--   已执行 migrate-v1.5.0.sql（Auto_AiCaseWorkspaces 表已存在）
-- ============================================================

-- ── 1. 添加需求文本向量字段 ───────────────────────────────────
ALTER TABLE `Auto_AiCaseWorkspaces`
  ADD COLUMN IF NOT EXISTS `requirement_embedding`
    LONGTEXT DEFAULT NULL
    COMMENT '需求文本的向量表示（JSON 编码的 float[]，由 EmbeddingService 生成，用于知识库语义检索）'
  AFTER `requirement_text`;

-- ── 2. 添加知识库标记字段 ────────────────────────────────────
ALTER TABLE `Auto_AiCaseWorkspaces`
  ADD COLUMN IF NOT EXISTS `is_knowledge_base`
    TINYINT(1) NOT NULL DEFAULT 0
    COMMENT '是否已加入知识库（0=否，1=是）；用户可手动标记优质用例集，供后续 AI 生成参考'
  AFTER `requirement_embedding`;

-- ── 3. 添加质量评分字段 ──────────────────────────────────────
ALTER TABLE `Auto_AiCaseWorkspaces`
  ADD COLUMN IF NOT EXISTS `quality_score`
    INT(11) NOT NULL DEFAULT 0
    COMMENT '用例质量评分（0=未评分，1-100=人工或自动评分）；检索时优先返回高分用例'
  AFTER `is_knowledge_base`;

-- ── 4. 添加索引（加速知识库查询） ────────────────────────────
-- 仅在知识库中检索时使用，避免全表扫描
ALTER TABLE `Auto_AiCaseWorkspaces`
  ADD INDEX IF NOT EXISTS `idx_ai_workspace_knowledge`
    (`is_knowledge_base`, `quality_score`);

-- ── 验证 ────────────────────────────────────────────────────
SELECT
  COLUMN_NAME,
  COLUMN_TYPE,
  IS_NULLABLE,
  COLUMN_DEFAULT,
  COLUMN_COMMENT
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'Auto_AiCaseWorkspaces'
  AND COLUMN_NAME IN ('requirement_embedding', 'is_knowledge_base', 'quality_score')
ORDER BY ORDINAL_POSITION;

SELECT 'Migration v1.6.0 completed successfully' AS status;
