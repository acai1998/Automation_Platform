-- ============================================
-- 修复 test_cases 表创建错误
-- 错误：Duplicate key on write or update (errno: 121)
-- ============================================

-- 方案1：如果表已存在，先删除（谨慎使用，会丢失数据）
-- DROP TABLE IF EXISTS `auto_test_cases`;

-- 方案2：如果表已存在，先检查并删除冲突的约束和索引
-- 检查并删除可能存在的约束
SET @constraint_exists = (
    SELECT COUNT(*) 
    FROM information_schema.TABLE_CONSTRAINTS 
    WHERE CONSTRAINT_SCHEMA = DATABASE() 
    AND TABLE_NAME = 'auto_test_cases' 
    AND CONSTRAINT_NAME LIKE 'test_cases_ibfk_%'
);

-- 如果存在冲突的约束，先删除表（如果表是空的或可以重建）
-- 或者手动删除约束：
-- ALTER TABLE `auto_test_cases` DROP FOREIGN KEY `test_cases_ibfk_1`;
-- ALTER TABLE `auto_test_cases` DROP FOREIGN KEY `test_cases_ibfk_2`;
-- ALTER TABLE `auto_test_cases` DROP FOREIGN KEY `test_cases_ibfk_3`;

-- ============================================
-- 推荐的创建语句（使用正确的约束名称）
-- ============================================

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
  KEY `idx_cases_project` (`project_id`),
  KEY `idx_cases_status` (`status`),
  KEY `idx_cases_type` (`type`),
  KEY `idx_cases_module` (`module`),
  KEY `idx_cases_priority` (`priority`),
  KEY `idx_cases_running_status` (`running_status`),
  KEY `idx_cases_created_by` (`created_by`),
  KEY `idx_cases_updated_by` (`updated_by`),
  CONSTRAINT `fk_auto_test_cases_project` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_auto_test_cases_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_auto_test_cases_updated_by` FOREIGN KEY (`updated_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='测试用例表';
