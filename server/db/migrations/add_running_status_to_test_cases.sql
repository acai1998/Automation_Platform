-- ============================================
-- 迁移脚本：为 test_cases 表添加 running_status 字段和索引
-- 执行日期：2025-01-XX
-- ============================================

-- 1. 添加 running_status 字段
ALTER TABLE `test_cases` 
ADD COLUMN `running_status` enum('idle','running') DEFAULT 'idle' 
COMMENT '运行状态: idle-空闲, running-运行中' 
AFTER `status`;

-- 2. 添加 type 字段索引（如果不存在）
-- 注意：如果索引已存在，此语句会报错，可以忽略
ALTER TABLE `test_cases` 
ADD INDEX `idx_cases_type` (`type`);

-- 3. 添加 running_status 字段索引
ALTER TABLE `test_cases` 
ADD INDEX `idx_cases_running_status` (`running_status`);

-- 4. 更新现有数据的 running_status（确保所有记录都有值）
UPDATE `test_cases` SET `running_status` = 'idle' WHERE `running_status` IS NULL;

-- 验证
SELECT 
    'Migration completed' as status,
    COUNT(*) as total_cases,
    COUNT(CASE WHEN running_status = 'idle' THEN 1 END) as idle_cases,
    COUNT(CASE WHEN running_status = 'running' THEN 1 END) as running_cases
FROM `test_cases`;
