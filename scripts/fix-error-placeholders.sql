-- 修复孤立的 ERROR 占位符脚本
-- 这个脚本查找所有 Completed/Failed/Aborted 的运行，
-- 并清理其中的孤立 ERROR 占位符

-- 1. 先查看有多少孤立 ERROR 占位符
SELECT 
    r.id as run_id,
    r.status as run_status,
    r.total_cases,
    r.passed_cases,
    r.failed_cases,
    r.skipped_cases,
    COUNT(rr.id) as error_count
FROM Auto_TestRun r
LEFT JOIN Auto_TestCaseTaskExecutions te ON r.execution_id = te.id
LEFT JOIN Auto_TestRunResults rr ON te.id = rr.execution_id AND rr.status = 'error'
WHERE r.status IN ('success', 'failed', 'aborted')
    AND rr.id IS NOT NULL
GROUP BY r.id
ORDER BY r.id DESC
LIMIT 20;

-- 2. 针对运行 #310 的诊断查询
SELECT 
    rr.id,
    rr.status,
    rr.case_name,
    rr.start_time,
    rr.end_time,
    rr.error_message
FROM Auto_TestRunResults rr
WHERE rr.execution_id = (
    SELECT execution_id FROM Auto_TestRun WHERE id = 310
)
AND rr.status = 'error'
LIMIT 20;

-- 3. 修复：将所有 success 运行下的 ERROR 占位符更新为 passed
-- UPDATE Auto_TestRunResults
-- SET status = 'passed', end_time = NOW()
-- WHERE execution_id IN (
--     SELECT execution_id FROM Auto_TestRun WHERE status = 'success'
-- )
-- AND status = 'error'
-- LIMIT 1000;

-- 4. 修复：将所有 failed 运行下的 ERROR 占位符更新为 failed
-- UPDATE Auto_TestRunResults
-- SET status = 'failed', end_time = NOW()
-- WHERE execution_id IN (
--     SELECT execution_id FROM Auto_TestRun WHERE status = 'failed'
-- )
-- AND status = 'error'
-- LIMIT 1000;

-- 5. 修复：将所有 aborted 运行下的 ERROR 占位符更新为 skipped
-- UPDATE Auto_TestRunResults
-- SET status = 'skipped', end_time = NOW()
-- WHERE execution_id IN (
--     SELECT execution_id FROM Auto_TestRun WHERE status = 'aborted'
-- )
-- AND status = 'error'
-- LIMIT 1000;
