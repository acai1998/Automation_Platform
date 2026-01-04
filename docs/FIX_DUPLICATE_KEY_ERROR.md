# 修复 Duplicate Key 错误指南

## 错误原因

错误 `1005 - Can't create table (errno: 121 "Duplicate key on write or update")` 通常由以下原因引起：

1. **外键约束名称冲突**：约束名称 `test_cases_ibfk_*` 可能已经存在
2. **索引名称冲突**：索引名称可能重复
3. **表已存在但结构不同**：表已存在但缺少某些字段或约束

## 解决方案

### 方案1：检查并清理冲突（推荐）

```sql
-- 1. 检查表是否存在
SHOW TABLES LIKE 'auto_test_cases';

-- 2. 如果表存在，检查现有约束
SELECT 
    CONSTRAINT_NAME,
    CONSTRAINT_TYPE,
    TABLE_NAME
FROM information_schema.TABLE_CONSTRAINTS 
WHERE CONSTRAINT_SCHEMA = DATABASE() 
AND TABLE_NAME = 'auto_test_cases';

-- 3. 检查现有索引
SHOW INDEX FROM `auto_test_cases`;

-- 4. 如果存在冲突的约束，删除它们
ALTER TABLE `auto_test_cases` DROP FOREIGN KEY `test_cases_ibfk_1`;
ALTER TABLE `auto_test_cases` DROP FOREIGN KEY `test_cases_ibfk_2`;
ALTER TABLE `auto_test_cases` DROP FOREIGN KEY `test_cases_ibfk_3`;

-- 5. 然后使用修复后的 SQL 创建表
```

### 方案2：使用修复后的 SQL（推荐）

使用修复后的 SQL，约束名称改为与表名一致：

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
```

**关键修改**：
- 约束名称改为 `fk_auto_test_cases_*`（与表名一致）
- 索引名称 `created_by` 和 `updated_by` 改为 `idx_cases_created_by` 和 `idx_cases_updated_by`（避免与字段名冲突）

### 方案3：如果表已存在，使用 ALTER TABLE

如果表已经存在但缺少字段，使用 ALTER TABLE：

```sql
-- 检查表结构
DESC `auto_test_cases`;

-- 如果缺少 running_status 字段，添加它
ALTER TABLE `auto_test_cases` 
ADD COLUMN `running_status` enum('idle','running') DEFAULT 'idle' 
COMMENT '运行状态: idle-空闲, running-运行中' 
AFTER `status`;

-- 添加缺失的索引
ALTER TABLE `auto_test_cases` 
ADD INDEX `idx_cases_type` (`type`);

ALTER TABLE `auto_test_cases` 
ADD INDEX `idx_cases_running_status` (`running_status`);
```

## 完整诊断脚本

```sql
-- 1. 检查表是否存在
SELECT 
    TABLE_NAME,
    TABLE_TYPE,
    ENGINE
FROM information_schema.TABLES 
WHERE TABLE_SCHEMA = DATABASE() 
AND TABLE_NAME = 'auto_test_cases';

-- 2. 检查所有约束
SELECT 
    CONSTRAINT_NAME,
    CONSTRAINT_TYPE,
    TABLE_NAME,
    REFERENCED_TABLE_NAME
FROM information_schema.TABLE_CONSTRAINTS 
WHERE CONSTRAINT_SCHEMA = DATABASE() 
AND TABLE_NAME = 'auto_test_cases';

-- 3. 检查所有索引
SHOW INDEX FROM `auto_test_cases`;

-- 4. 检查表结构
DESC `auto_test_cases`;
```

## 常见问题

### Q: 为什么约束名称要改？

**A**: 约束名称在数据库中必须唯一。如果之前创建过 `test_cases` 表并使用了 `test_cases_ibfk_*` 约束名，现在创建 `auto_test_cases` 表时使用相同的约束名会导致冲突。

### Q: 如何避免这个问题？

**A**: 
1. 使用 `CREATE TABLE IF NOT EXISTS` 而不是 `CREATE TABLE`
2. 约束名称使用表名作为前缀，如 `fk_auto_test_cases_*`
3. 在创建前先检查表是否存在

### Q: 如果表已经有数据怎么办？

**A**: 使用 `ALTER TABLE` 添加缺失的字段和索引，而不是删除重建表。

## 推荐操作步骤

1. **检查表是否存在**：
   ```sql
   SHOW TABLES LIKE 'auto_test_cases';
   ```

2. **如果表不存在**：使用方案2的修复后 SQL

3. **如果表已存在**：
   - 检查表结构：`DESC auto_test_cases;`
   - 如果缺少 `running_status` 字段，使用方案3的 ALTER TABLE
   - 如果缺少索引，添加索引

4. **验证**：
   ```sql
   SHOW CREATE TABLE `auto_test_cases`;
   ```
