-- ============================================================
-- 迁移脚本 v1.3.0
-- 功能：
--   1. 新增 Auto_TaskAuditLogs 表（任务操作审计）
--   2. 为 Auto_TestCaseTasks 添加 max_retries / retry_delay_ms 字段
--   3. 为 Auto_TestCaseTaskExecutions 添加性能优化索引
--   4. 为 Auto_TestCaseTasks 添加性能优化复合索引
-- 执行方式：
--   mysql -u <user> -p <database> < migrate-v1.3.0.sql
-- 注意：需 MySQL 8.0+ 支持 ADD COLUMN IF NOT EXISTS / ADD INDEX IF NOT EXISTS
-- ============================================================

-- ── 1. 任务审计日志表 ────────────────────────────────────────
-- 说明：
--   operator_id 设计为 NULL-able：
--     NULL  = 系统自动操作（调度引擎、补偿触发等）
--     非空  = 真实用户操作
--   ON DELETE SET NULL：用户被删除后审计记录保留，operator_id 置 NULL
CREATE TABLE IF NOT EXISTS `Auto_TaskAuditLogs` (
  `id`          INT(11) NOT NULL AUTO_INCREMENT COMMENT '日志ID',
  `task_id`     INT(11) NOT NULL                COMMENT '关联任务ID',
  `action`      VARCHAR(100) NOT NULL           COMMENT '操作类型（created/updated/deleted/status_changed/manually_triggered/execution_cancelled/compensated/triggered/retry_scheduled/permanently_failed）',
  `operator_id` INT(11) DEFAULT NULL            COMMENT '操作人ID（NULL=系统自动）',
  `metadata`    TEXT DEFAULT NULL               COMMENT '操作元数据（JSON）',
  `created_at`  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '操作时间',
  PRIMARY KEY (`id`),
  KEY `idx_audit_task`          (`task_id`),
  KEY `idx_audit_operator`      (`operator_id`),
  KEY `idx_audit_action`        (`action`),
  KEY `idx_audit_created`       (`created_at`),
  -- 最常用的复合查询：按 task_id + 时间降序
  KEY `idx_audit_task_created`  (`task_id`, `created_at` DESC),
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

-- ── 3. 为任务执行表添加性能优化索引 ─────────────────────────
-- 用于加速以下查询：
--   a. 统计成功率趋势：WHERE task_id = ? AND COALESCE(start_time, created_at) >= ?
--   b. 漏触发检测：MAX(COALESCE(start_time, created_at)) WHERE task_id = ?
--   c. 取消执行查询：WHERE id = ? AND task_id = ?

-- task_id + start_time 复合索引（覆盖统计查询）
ALTER TABLE `Auto_TestCaseTaskExecutions`
  ADD INDEX IF NOT EXISTS `idx_exec_task_start`   (`task_id`, `start_time`),
  ADD INDEX IF NOT EXISTS `idx_exec_task_status`  (`task_id`, `status`),
  ADD INDEX IF NOT EXISTS `idx_exec_task_created` (`task_id`, `created_at`);

-- ── 4. 为任务表添加调度引擎常用查询索引 ──────────────────────
-- 用于加速以下查询：
--   a. 启动时加载所有定时任务：WHERE trigger_type = 'scheduled' AND status IN (...)
--   b. 轮询变更：WHERE trigger_type = 'scheduled'

ALTER TABLE `Auto_TestCaseTasks`
  ADD INDEX IF NOT EXISTS `idx_task_trigger_status` (`trigger_type`, `status`),
  ADD INDEX IF NOT EXISTS `idx_task_status`         (`status`),
  ADD INDEX IF NOT EXISTS `idx_task_updated`        (`updated_at`);

-- ── 5. 为测试运行结果表添加失败原因聚合索引 ──────────────────
-- 用于加速：WHERE trr.status IN ('failed', 'error') 的 TOP 10 错误聚合查询

ALTER TABLE `Auto_TestRunResults`
  ADD INDEX IF NOT EXISTS `idx_result_status_exec` (`status`, `execution_id`);

-- ── 验证 ────────────────────────────────────────────────────
SELECT 'Migration v1.3.0 completed successfully' AS status;
