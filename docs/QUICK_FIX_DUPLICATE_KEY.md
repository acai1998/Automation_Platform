# 快速修复 Duplicate Key 错误

## 问题原因

错误 `1005 - Can't create table (errno: 121 "Duplicate key on write or update")` 是因为：

1. **约束名称冲突**：`test_cases_ibfk_*` 约束名可能已经存在
2. **索引名称冲突**：索引名可能与现有索引重复

## 快速解决方案

### 方案1：使用修复后的 SQL（推荐）

使用修复后的 SQL，所有约束和索引名称都使用 `auto_` 前缀：

```sql
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
```

**关键修改**：
- ✅ 约束名称：`fk_auto_cases_*`（与表名一致）
- ✅ 索引名称：`idx_auto_cases_*`（避免冲突）

### 方案2：如果表已存在，先检查并清理

```sql
-- 1. 检查表是否存在
SHOW TABLES LIKE 'auto_test_cases';

-- 2. 如果表存在，检查约束
SELECT CONSTRAINT_NAME 
FROM information_schema.TABLE_CONSTRAINTS 
WHERE CONSTRAINT_SCHEMA = DATABASE() 
AND TABLE_NAME = 'auto_test_cases';

-- 3. 如果存在冲突的约束，删除它们
ALTER TABLE `auto_test_cases` DROP FOREIGN KEY `test_cases_ibfk_1`;
ALTER TABLE `auto_test_cases` DROP FOREIGN KEY `test_cases_ibfk_2`;
ALTER TABLE `auto_test_cases` DROP FOREIGN KEY `test_cases_ibfk_3`;

-- 4. 然后使用修复后的 SQL 创建表
```

### 方案3：如果表已存在，使用 ALTER TABLE 添加缺失字段

```sql
-- 检查表结构
DESC `auto_test_cases`;

-- 如果缺少 running_status 字段，添加它
ALTER TABLE `auto_test_cases` 
ADD COLUMN IF NOT EXISTS `running_status` enum('idle','running') DEFAULT 'idle' 
COMMENT '运行状态: idle-空闲, running-运行中' 
AFTER `status`;

-- 添加缺失的索引（如果不存在）
ALTER TABLE `auto_test_cases` 
ADD INDEX IF NOT EXISTS `idx_auto_cases_type` (`type`);

ALTER TABLE `auto_test_cases` 
ADD INDEX IF NOT EXISTS `idx_auto_cases_running_status` (`running_status`);
```

## 验证

执行后验证表结构：

```sql
-- 查看表结构
DESC `auto_test_cases`;

-- 查看所有约束
SHOW CREATE TABLE `auto_test_cases`;

-- 检查 running_status 字段
SHOW COLUMNS FROM `auto_test_cases` LIKE 'running_status';
```

## 注意事项

1. **备份数据**：如果表已有数据，执行前请备份
2. **约束名称**：确保约束名称唯一，使用表名作为前缀
3. **索引名称**：避免使用字段名作为索引名，使用描述性名称
