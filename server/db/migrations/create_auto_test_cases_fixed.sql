-- ============================================
-- 创建 auto_test_cases 表（修复版本）
-- 修复：约束名称冲突问题
-- ============================================

-- 如果表已存在，先删除（谨慎：会丢失数据）
-- DROP TABLE IF EXISTS `auto_test_cases`;

CREATE TABLE IF NOT EXISTS `auto_test_cases` (
  `id` int(11) NOT NULL AUTO_INCREMENT COMMENT '用例唯一标识',
  `name` varchar(200) NOT NULL COMMENT '用例名称',
  `description` text DEFAULT NULL COMMENT '用例描述',
  `project_id` int(11) DEFAULT NULL COMMENT '所属项目ID',
  `module` varchar(100) DEFAULT NULL COMMENT '功能模块名称',
  `priority` enum('P0','P1','P2','P3') DEFAULT 'P1' COMMENT '优先级',
  `type` enum('api','ui','performance','security') DEFAULT 'api' COMMENT '用例类型',
  `status` enum('active','inactive','deprecated') DEFAULT 'active' COMMENT '用例状态',
  `running_status` enum('idle','running') DEFAULT 'idle' COMMENT '运行状态: idle-空闲, running-运行中',
  `tags` varchar(500) DEFAULT NULL COMMENT '标签',
  `script_path` varchar(500) DEFAULT NULL COMMENT '测试脚本文件路径（pytest格式）',
  `config_json` text DEFAULT NULL COMMENT '用例配置JSON',
  `created_by` int(11) DEFAULT NULL COMMENT '创建人ID',
  `updated_by` int(11) DEFAULT NULL COMMENT '最后修改人ID',
  `created_at` datetime DEFAULT current_timestamp() COMMENT '创建时间',
  `updated_at` datetime DEFAULT current_timestamp() ON UPDATE current_timestamp() COMMENT '更新时间',
  PRIMARY KEY (`id`),
  KEY `idx_auto_cases_project` (`project_id`),
  KEY `idx_auto_cases_status` (`status`),
  KEY `idx_auto_cases_type` (`type`),
  KEY `idx_auto_cases_module` (`module`),
  KEY `idx_auto_cases_priority` (`priority`),
  KEY `idx_auto_cases_running_status` (`running_status`),
  KEY `idx_auto_cases_created_by` (`created_by`),
  KEY `idx_auto_cases_updated_by` (`updated_by`),
  CONSTRAINT `fk_auto_cases_project` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_auto_cases_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_auto_cases_updated_by` FOREIGN KEY (`updated_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='测试用例表';
