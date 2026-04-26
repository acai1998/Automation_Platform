-- ============================================================
-- 迁移脚本 v1.4.0
-- 功能：
--   1. 给 Auto_TestCase.case_key 添加唯一索引，防止用例重复写入
--      （修复：当测试文件从目录A移动到目录B时，script_path变化
--        导致 ON DUPLICATE KEY UPDATE 失效，产生重复记录的问题）
-- 背景：
--   - case_key = ClassName::method_name，在文件移动时不变
--   - 原唯一约束 uniq_repo_case (repo_id, script_path) 无法处理路径变更
--   - TypeORM Entity 上声明了 unique: true，但数据库实际缺少该约束
-- 执行方式：
--   mysql -u <user> -p <database> < migrate-v1.4.0.sql
-- 注意：
--   步骤1会先清理已有重复的 case_key，保留最早创建的记录，再建索引
-- ============================================================

-- ── 0. 将 case_key 改为允许 NULL（为后续去重操作做准备）─────────
-- 原表定义为 NOT NULL，手动/自动创建的用例可能没有 case_key，
-- 允许 NULL 更合理，且 MySQL 唯一索引允许多个 NULL 并存
ALTER TABLE `Auto_TestCase`
  MODIFY COLUMN `case_key` varchar(200) DEFAULT NULL COMMENT '用例唯一Key（函数名 / case_id）';

-- ── 1. 修正存量 case_key 格式（去掉路径前缀）──────────────────
-- 历史数据中 case_key 被错误地存为完整 script_path 格式，如：
--   examples/A/test_login.py::TestLogin::test_login
-- 正确格式应为（同 sync_cases.py 当前逻辑）：
--   类方法：ClassName::method_name
--   独立函数：func_name
--
-- 分两步处理：
--   a. 类方法（case_key 含 '.py::XX::YY'，取最后两段）
UPDATE Auto_TestCase
SET case_key = SUBSTRING_INDEX(case_key, '::', -2)
WHERE case_key LIKE '%.py::%::%';

--   b. 独立函数（case_key 含 '.py::func_name'，取最后一段）
UPDATE Auto_TestCase
SET case_key = SUBSTRING_INDEX(case_key, '::', -1)
WHERE case_key LIKE '%.py::%'
  AND case_key NOT LIKE '%.py::%::%';

-- ── 2. 清理修正后仍重复的 case_key（保留最小 id 的记录）────────
-- 极少数情况：不同文件里有同名类+方法（如 TestA::test_run 在多个文件中）
-- 将重复的 case_key 中较新的记录的 case_key 置为 NULL，避免建索引失败
-- （NULL 值不参与唯一约束，允许多个 NULL 并存）
UPDATE Auto_TestCase tc
INNER JOIN (
    SELECT case_key, MIN(id) AS keep_id
    FROM Auto_TestCase
    WHERE case_key IS NOT NULL
    GROUP BY case_key
    HAVING COUNT(*) > 1
) dup ON tc.case_key = dup.case_key AND tc.id != dup.keep_id
SET tc.case_key = NULL,
    tc.enabled   = 0
WHERE tc.case_key IS NOT NULL;

-- ── 3. 给 case_key 添加唯一索引 ──────────────────────────────
-- case_key 允许为 NULL（手动创建的用例可能没有 case_key）
-- MySQL/MariaDB 中 NULL 不触发唯一约束，多个 NULL 可共存
ALTER TABLE `Auto_TestCase`
  ADD UNIQUE INDEX IF NOT EXISTS `uniq_case_key` (`case_key`);

-- ── 验证 ────────────────────────────────────────────────────
SELECT 'Migration v1.4.0 completed successfully' AS status;
SELECT
    COUNT(*) AS total_cases,
    SUM(CASE WHEN case_key IS NOT NULL THEN 1 ELSE 0 END) AS cases_with_key,
    SUM(CASE WHEN case_key IS NULL THEN 1 ELSE 0 END)     AS cases_without_key
FROM Auto_TestCase;
