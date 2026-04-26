-- ============================================================
-- 迁移脚本 v1.5.0
-- 功能：
--   1. 新增 Auto_AiCaseWorkspaces（AI 用例工作台主表）
--   2. 新增 Auto_AiCaseNodeExecutions（节点状态变更流水）
--   3. 新增 Auto_AiCaseNodeAttachments（节点截图与证据）
-- 执行方式：
--   mysql -u <user> -p <database> < migrate-v1.5.0.sql
-- ============================================================

-- ── 1. AI 用例工作台主表 ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS `Auto_AiCaseWorkspaces` (
  `id`             INT(11) NOT NULL AUTO_INCREMENT COMMENT '工作台ID',
  `workspace_key`  VARCHAR(64) NOT NULL COMMENT '工作台稳定唯一键(UUID)',
  `name`           VARCHAR(255) NOT NULL COMMENT '工作台名称',
  `project_id`     INT(11) DEFAULT NULL COMMENT '关联项目ID',
  `requirement_text` LONGTEXT DEFAULT NULL COMMENT '需求描述/PRD文本',
  `map_data`       LONGTEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL COMMENT 'MindElixir脑图JSON快照' CHECK (json_valid(`map_data`)),
  `status`         ENUM('draft','published','archived') DEFAULT 'draft' COMMENT '工作台状态',
  `sync_source`    ENUM('local_import','remote_direct','mixed') DEFAULT 'remote_direct' COMMENT '同步来源',
  `version`        INT(11) NOT NULL DEFAULT 1 COMMENT '版本号',

  `total_cases`    INT(11) NOT NULL DEFAULT 0 COMMENT '测试节点总数',
  `todo_cases`     INT(11) NOT NULL DEFAULT 0 COMMENT '待执行节点数',
  `doing_cases`    INT(11) NOT NULL DEFAULT 0 COMMENT '执行中节点数',
  `blocked_cases`  INT(11) NOT NULL DEFAULT 0 COMMENT '阻塞节点数',
  `passed_cases`   INT(11) NOT NULL DEFAULT 0 COMMENT '通过节点数',
  `failed_cases`   INT(11) NOT NULL DEFAULT 0 COMMENT '失败节点数',
  `skipped_cases`  INT(11) NOT NULL DEFAULT 0 COMMENT '跳过节点数',

  `last_synced_at` DATETIME DEFAULT NULL COMMENT '最近同步时间',
  `created_by`     INT(11) DEFAULT NULL COMMENT '创建人ID',
  `updated_by`     INT(11) DEFAULT NULL COMMENT '更新人ID',
  `created_at`     DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at`     DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',

  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_ai_workspace_key` (`workspace_key`),
  KEY `idx_ai_workspace_project` (`project_id`),
  KEY `idx_ai_workspace_status` (`status`),
  KEY `idx_ai_workspace_updated_at` (`updated_at`),
  KEY `idx_ai_workspace_created_by` (`created_by`),
  KEY `idx_ai_workspace_updated_by` (`updated_by`),

  CONSTRAINT `fk_ai_workspace_project`
    FOREIGN KEY (`project_id`) REFERENCES `Auto_TestCaseProjects` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_ai_workspace_created_by`
    FOREIGN KEY (`created_by`) REFERENCES `Auto_Users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_ai_workspace_updated_by`
    FOREIGN KEY (`updated_by`) REFERENCES `Auto_Users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci
  COMMENT='AI 用例工作台主表';

-- ── 2. 节点状态变更流水表 ───────────────────────────────────
CREATE TABLE IF NOT EXISTS `Auto_AiCaseNodeExecutions` (
  `id`               INT(11) NOT NULL AUTO_INCREMENT COMMENT '节点执行记录ID',
  `workspace_id`     INT(11) NOT NULL COMMENT '关联工作台ID',
  `workspace_version` INT(11) NOT NULL DEFAULT 1 COMMENT '记录时工作台版本',
  `node_id`          VARCHAR(64) NOT NULL COMMENT '脑图节点ID',
  `node_topic`       VARCHAR(255) NOT NULL COMMENT '节点标题快照',
  `node_path`        VARCHAR(1000) DEFAULT NULL COMMENT '节点路径快照',
  `previous_status`  ENUM('todo','doing','blocked','passed','failed','skipped') DEFAULT NULL COMMENT '变更前状态',
  `current_status`   ENUM('todo','doing','blocked','passed','failed','skipped') NOT NULL DEFAULT 'todo' COMMENT '变更后状态',
  `operator_id`      INT(11) DEFAULT NULL COMMENT '操作人ID',
  `comment`          TEXT DEFAULT NULL COMMENT '执行备注',
  `meta_json`        LONGTEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL COMMENT '扩展信息JSON' CHECK (`meta_json` IS NULL OR json_valid(`meta_json`)),
  `created_at`       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '记录时间',

  PRIMARY KEY (`id`),
  KEY `idx_ai_node_exec_workspace` (`workspace_id`),
  KEY `idx_ai_node_exec_node` (`workspace_id`, `node_id`, `created_at`),
  KEY `idx_ai_node_exec_status` (`current_status`),
  KEY `idx_ai_node_exec_operator` (`operator_id`),

  CONSTRAINT `fk_ai_node_exec_workspace`
    FOREIGN KEY (`workspace_id`) REFERENCES `Auto_AiCaseWorkspaces` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_ai_node_exec_operator`
    FOREIGN KEY (`operator_id`) REFERENCES `Auto_Users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci
  COMMENT='AI 用例节点状态变更流水表';

-- ── 3. 节点附件与截图证据表 ─────────────────────────────────
CREATE TABLE IF NOT EXISTS `Auto_AiCaseNodeAttachments` (
  `id`               INT(11) NOT NULL AUTO_INCREMENT COMMENT '附件ID',
  `workspace_id`     INT(11) NOT NULL COMMENT '关联工作台ID',
  `node_id`          VARCHAR(64) NOT NULL COMMENT '脑图节点ID',
  `execution_log_id` INT(11) DEFAULT NULL COMMENT '关联节点执行流水ID',
  `file_name`        VARCHAR(255) NOT NULL COMMENT '原始文件名',
  `mime_type`        VARCHAR(120) DEFAULT NULL COMMENT '文件MIME类型',
  `file_size`        INT(11) NOT NULL DEFAULT 0 COMMENT '文件大小(bytes)',
  `storage_provider` ENUM('local','oss','s3','cos','minio') NOT NULL DEFAULT 'oss' COMMENT '对象存储提供方',
  `storage_bucket`   VARCHAR(120) DEFAULT NULL COMMENT '对象存储bucket',
  `storage_key`      VARCHAR(500) NOT NULL COMMENT '对象存储key',
  `access_url`       VARCHAR(1000) DEFAULT NULL COMMENT '可访问URL',
  `checksum_sha256`  VARCHAR(64) DEFAULT NULL COMMENT '文件SHA256',
  `uploaded_by`      INT(11) DEFAULT NULL COMMENT '上传人ID',
  `created_at`       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '上传时间',
  `is_deleted`       TINYINT(1) NOT NULL DEFAULT 0 COMMENT '软删除标记',
  `deleted_at`       DATETIME DEFAULT NULL COMMENT '删除时间',

  PRIMARY KEY (`id`),
  KEY `idx_ai_attachment_workspace` (`workspace_id`),
  KEY `idx_ai_attachment_node` (`workspace_id`, `node_id`),
  KEY `idx_ai_attachment_exec_log` (`execution_log_id`),
  KEY `idx_ai_attachment_uploader` (`uploaded_by`),
  KEY `idx_ai_attachment_storage` (`storage_provider`, `storage_bucket`),

  CONSTRAINT `fk_ai_attachment_workspace`
    FOREIGN KEY (`workspace_id`) REFERENCES `Auto_AiCaseWorkspaces` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_ai_attachment_exec_log`
    FOREIGN KEY (`execution_log_id`) REFERENCES `Auto_AiCaseNodeExecutions` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_ai_attachment_uploaded_by`
    FOREIGN KEY (`uploaded_by`) REFERENCES `Auto_Users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci
  COMMENT='AI 用例节点截图与证据表';

-- ── 验证 ────────────────────────────────────────────────────
SELECT 'Migration v1.5.0 completed successfully' AS status;
