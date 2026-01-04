# test_cases 表结构优化建议

## 当前问题分析

### 1. ❌ 缺失关键字段：`running_status`

**问题**：代码中大量使用了 `running_status` 字段来跟踪用例执行状态，但您的表结构中缺少此字段。

**影响**：
- 无法跟踪用例是否正在运行
- Jenkins 回调无法更新用例状态
- 用例列表无法显示运行状态

**解决方案**：必须添加此字段

### 2. ⚠️ 索引缺失

**问题**：
- 缺少 `type` 字段索引（用例类型查询频繁）
- 缺少 `running_status` 字段索引（查询正在运行的用例）

**影响**：查询性能可能较差

### 3. ✅ 其他字段

- `repository_script_mappings` 表已管理仓库和用例的映射关系，不需要在 `test_cases` 表中添加 `repository_id`
- `script_path` 长度 500 足够（pytest 路径通常不会超过此长度）

## 优化后的表结构

```sql
CREATE TABLE `test_cases` (
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
  KEY `created_by` (`created_by`),
  KEY `updated_by` (`updated_by`),
  CONSTRAINT `test_cases_ibfk_1` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE,
  CONSTRAINT `test_cases_ibfk_2` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `test_cases_ibfk_3` FOREIGN KEY (`updated_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='测试用例表';
```

## 迁移脚本

如果您的表已经存在数据，使用以下 SQL 进行迁移：

```sql
-- 1. 添加 running_status 字段
ALTER TABLE `test_cases` 
ADD COLUMN `running_status` enum('idle','running') DEFAULT 'idle' 
COMMENT '运行状态: idle-空闲, running-运行中' 
AFTER `status`;

-- 2. 添加 type 字段索引（如果不存在）
ALTER TABLE `test_cases` 
ADD INDEX `idx_cases_type` (`type`);

-- 3. 添加 running_status 字段索引
ALTER TABLE `test_cases` 
ADD INDEX `idx_cases_running_status` (`running_status`);

-- 4. 更新现有数据的 running_status（可选，默认为 idle）
UPDATE `test_cases` SET `running_status` = 'idle' WHERE `running_status` IS NULL;
```

## 字段说明

### running_status（新增，必需）

- **类型**：`enum('idle','running')`
- **默认值**：`'idle'`
- **说明**：用例运行状态
  - `idle`：空闲，可以执行
  - `running`：正在运行中，不能重复执行
- **用途**：
  - 防止用例重复执行
  - 在用例列表中显示运行状态
  - Jenkins 回调更新执行状态

### type（已有，需添加索引）

- **类型**：`enum('api','ui','performance','security')`
- **说明**：用例类型，用于分类管理
- **索引**：需要添加索引以优化查询性能

## 索引优化说明

### 新增索引

1. **idx_cases_type**：按用例类型查询（用例管理页面按类型筛选）
2. **idx_cases_running_status**：查询正在运行的用例（监控和状态更新）

### 现有索引（保留）

- `idx_cases_project`：按项目查询
- `idx_cases_status`：按状态查询
- `idx_cases_module`：按模块查询
- `idx_cases_priority`：按优先级查询

## 验证脚本

执行迁移后，使用以下 SQL 验证：

```sql
-- 检查字段是否存在
SHOW COLUMNS FROM `test_cases` LIKE 'running_status';

-- 检查索引是否存在
SHOW INDEX FROM `test_cases` WHERE Key_name IN ('idx_cases_type', 'idx_cases_running_status');

-- 检查数据
SELECT COUNT(*) as total, 
       COUNT(CASE WHEN running_status = 'idle' THEN 1 END) as idle_count,
       COUNT(CASE WHEN running_status = 'running' THEN 1 END) as running_count
FROM `test_cases`;
```

## 注意事项

1. **数据迁移**：如果表中有数据，添加 `running_status` 字段后，所有现有记录的默认值都是 `'idle'`
2. **代码兼容**：确保代码中使用的字段名与数据库一致
3. **性能影响**：添加索引会略微影响写入性能，但会大幅提升查询性能
4. **备份**：执行迁移前请备份数据库

## 推荐操作

1. ✅ **立即添加** `running_status` 字段（必需）
2. ✅ **添加索引** `idx_cases_type` 和 `idx_cases_running_status`（推荐）
3. ⚠️ **可选优化**：如果 `script_path` 经常超过 500 字符，可以考虑增加到 1000
