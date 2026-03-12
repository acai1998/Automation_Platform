-- ============================================================
-- 迁移脚本 v1.3.0
-- 功能：
--   1. 新增 Auto_TaskAuditLogs 表（任务操作审计）
--   2. 为 Auto_TestCaseTasks 添加 max_retries / retry_delay_ms 字段
-- 执行方式：
--   mysql -u <user> -p <database> < migrate-v1.3.0.sql
-- ============================================================

-- ── 1. 任务审计日志表 ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `Auto_TaskAuditLogs` (
  `id`          INT(11) NOT NULL AUTO_INCREMENT COMMENT '日志ID',
  `task_id`     INT(11) NOT NULL                COMMENT '关联任务ID',
  `action`      VARCHAR(100) NOT NULL           COMMENT '操作类型（created/updated/deleted/status_changed/manually_triggered/execution_cancelled/compensated/triggered/retry_scheduled/permanently_failed）',
  `operator_id` INT(11) NOT NULL DEFAULT 1      COMMENT '操作人ID（1=系统）',
  `metadata`    TEXT DEFAULT NULL               COMMENT '操作元数据（JSON）',
  `created_at`  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '操作时间',
  PRIMARY KEY (`id`),
  KEY `idx_audit_task`     (`task_id`),
  KEY `idx_audit_operator` (`operator_id`),
  KEY `idx_audit_action`   (`action`),
  KEY `idx_audit_created`  (`created_at`),
  CONSTRAINT `fk_audit_task`
    FOREIGN KEY (`task_id`) REFERENCES `Auto_TestCaseTasks` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_audit_operator`
    FOREIGN KEY (`operator_id`) REFERENCES `Auto_Users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci
  COMMENT='任务操作审计日志表';

-- ── 2. 为任务表添加重试配置字段 ──────────────────────────────
-- 使用 IF NOT EXISTS 语法（MySQL 8.0+），旧版本请根据实际情况手动判断

-- max_retries: 失败最大重试次数（默认 1）
ALTER TABLE `Auto_TestCaseTasks`
  ADD COLUMN IF NOT EXISTS `max_retries`    TINYINT(3) NOT NULL DEFAULT 1     COMMENT '失败最大重试次数' AFTER `cron_expression`,
  ADD COLUMN IF NOT EXISTS `retry_delay_ms` INT(11) NOT NULL DEFAULT 30000   COMMENT '重试延迟毫秒' AFTER `max_retries`;

-- ── 验证 ────────────────────────────────────────────────────
SELECT 'Migration v1.3.0 completed successfully' AS status;
