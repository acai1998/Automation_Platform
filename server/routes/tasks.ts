import { Router } from 'express';
import { query, queryOne, getPool } from '../config/database';
import { generalAuthRateLimiter } from '../middleware/authRateLimiter';
import { authenticate, optionalAuth } from '../middleware/auth';
import { taskSchedulerService, getNextCronTime } from '../services/TaskSchedulerService';
import { executionService } from '../services/ExecutionService';
import logger from '../utils/logger';
import { LOG_CONTEXTS } from '../config/logging';

const router = Router();

// ─────────────────────────────────────────────────
// 审计日志工具（写入 Auto_TaskAuditLogs）
// ─────────────────────────────────────────────────
async function writeAuditLog(
  taskId: number,
  action: string,
  operatorId: number | null,
  metadata: Record<string, unknown>
): Promise<void> {
  try {
    const pool = getPool();
    await pool.execute(
      `INSERT INTO Auto_TaskAuditLogs (task_id, action, operator_id, metadata, created_at)
       VALUES (?, ?, ?, ?, NOW())`,
      [taskId, action, operatorId, JSON.stringify(metadata)]
    );
  } catch (err) {
    // 审计日志写入失败不影响主流程
    logger.errorLog(err, 'Failed to write audit log', { taskId, action });
  }
}

// 任务执行状态联合类型（与前端 useTasks.ts 保持一致）
type TaskExecutionStatus = 'pending' | 'running' | 'success' | 'failed' | 'cancelled';

interface Task {
  id: number;
  name: string;
  description?: string;
  project_id?: number;
  project_name?: string;
  case_ids?: string;
  trigger_type: 'manual' | 'scheduled' | 'ci_triggered';
  cron_expression?: string;
  environment_id?: number;
  environment_name?: string;
  status: 'active' | 'paused' | 'archived';
  created_by?: number;
  created_by_name?: string;
  created_at: string;
  updated_at: string;
}

interface TestCase {
  id: number;
  name: string;
  type: string;
  status: string;
  priority: string;
}

interface TaskExecution {
  id: number;
  status: TaskExecutionStatus;
  start_time?: string;
  end_time?: string;
  duration?: number;
  passed_cases: number;
  failed_cases: number;
  total_cases: number;
  executed_by_name?: string;
}

// 合法的 cron 字段值（基础枚举），用于字段格式快速校验
const VALID_TRIGGER_TYPES = ['manual', 'scheduled', 'ci_triggered'] as const;
const VALID_STATUSES = ['active', 'paused', 'archived'] as const;

// Cron 表达式合法性校验（标准 5 段 cron）
// 格式：分 时 日 月 周
// 支持：全通配(*)、步进(每N分钟)、纯数字、数字范围(1-5)、枚举列表(1,3,5)
// 同时校验各字段数值是否在合法范围内
function isValidCron(expr: string): boolean {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return false;

  // [min, max] inclusive
  const fieldRanges: [number, number][] = [
    [0, 59],  // 分钟
    [0, 23],  // 小时
    [1, 31],  // 日
    [1, 12],  // 月
    [0, 6],   // 周（0=周日，6=周六）
  ];

  return parts.every((part, i) => {
    const [minVal, maxVal] = fieldRanges[i];

    // * 全通配
    if (part === '*') return true;

    // */N 步进，如 */5
    if (/^\*\/(\d+)$/.test(part)) {
      const step = parseInt(part.slice(2), 10);
      return step >= 1 && step <= maxVal;
    }

    // a-b 范围，如 1-5
    if (/^(\d+)-(\d+)$/.test(part)) {
      const [, a, b] = /^(\d+)-(\d+)$/.exec(part)!;
      const na = parseInt(a, 10), nb = parseInt(b, 10);
      return na >= minVal && nb <= maxVal && na <= nb;
    }

    // a,b,c 枚举，如 1,3,5
    if (/^\d+(,\d+)+$/.test(part)) {
      return part.split(',').every(n => {
        const v = parseInt(n, 10);
        return v >= minVal && v <= maxVal;
      });
    }

    // 纯数字
    if (/^\d+$/.test(part)) {
      const v = parseInt(part, 10);
      return v >= minVal && v <= maxVal;
    }

    return false;
  });
}

// ─────────────────────────────────────────────────────────────────────────
// 注意：/scheduler/status 必须注册在 /:id 之前，否则会被 Express 路由拦截
// ─────────────────────────────────────────────────────────────────────────

/**
 * GET /api/tasks/scheduler/status
 * 获取调度引擎当前运行状态（运行中、排队、已调度任务列表）
 */
router.get('/scheduler/status', async (_req, res) => {
  try {
    const status = taskSchedulerService.getStatus();
    res.json({ success: true, data: status });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '服务器内部错误';
    res.status(500).json({ success: false, message });
  }
});

/**
 * GET /api/tasks/cron/preview
 * 解析 Cron 表达式，返回未来 N 次触发时间
 *
 * Query params:
 *   expr  - 标准 5 段 cron 表达式（必填）
 *   count - 返回次数（默认 5，最大 10）
 */
router.get('/cron/preview', (req, res) => {
  const { expr, count } = req.query;

  if (!expr || typeof expr !== 'string') {
    return res.status(400).json({ success: false, message: 'expr 参数不能为空' });
  }

  if (!isValidCron(expr)) {
    return res.status(400).json({ success: false, message: 'Cron 表达式格式无效' });
  }

  // count 解析：parseInt 可能返回 NaN，用 || 兜底为 5，再 clamp 到 [1, 10]
  const parsedCount = parseInt(String(count ?? '5'), 10);
  const n = Math.min(Math.max(1, isNaN(parsedCount) ? 5 : parsedCount), 10);

  // 直接复用 TaskSchedulerService 导出的 getNextCronTime，消除重复实现
  const times: string[] = [];
  let cursor = new Date();
  for (let i = 0; i < n; i++) {
    const next = getNextCronTime(expr, cursor);
    if (!next) break;
    times.push(next.toISOString());
    cursor = next;
  }

  res.json({ success: true, data: { times } });
});

/**
 * GET /api/tasks
 * 获取任务列表（支持筛选、分页，内联最近5条运行记录，返回 total）
 *
 * Query params:
 *   projectId     - 按项目筛选
 *   status        - 按任务状态筛选（active/paused/archived）
 *   triggerType   - 按触发类型筛选（manual/scheduled/ci_triggered）
 *   keyword       - 按任务名称或描述模糊搜索
 *   limit         - 分页大小（默认 20，最大 100）
 *   offset        - 分页偏移（默认 0）
 */
router.get('/', async (req, res) => {
  try {
    const {
      projectId,
      status,
      triggerType,
      keyword,
      limit,
      offset,
    } = req.query;

    // 白名单校验：status 和 triggerType
    if (status !== undefined && !VALID_STATUSES.includes(status as typeof VALID_STATUSES[number])) {
      return res.status(400).json({
        success: false,
        message: `status 必须是 ${VALID_STATUSES.join(' / ')} 之一`,
      });
    }
    if (triggerType !== undefined && !VALID_TRIGGER_TYPES.includes(triggerType as typeof VALID_TRIGGER_TYPES[number])) {
      return res.status(400).json({
        success: false,
        message: `triggerType 必须是 ${VALID_TRIGGER_TYPES.join(' / ')} 之一`,
      });
    }

    // limit 上限保护（默认 20，最大 100），offset 非负保护
    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string) || 20));
    const offsetNum = Math.max(0, parseInt(offset as string) || 0);

    let countSql = `SELECT COUNT(*) as total FROM Auto_TestCaseTasks t WHERE 1=1`;
    let sql = `
      SELECT t.*, u.display_name as created_by_name, e.name as environment_name
      FROM Auto_TestCaseTasks t
      LEFT JOIN Auto_Users u ON t.created_by = u.id
      LEFT JOIN Auto_TestEnvironments e ON t.environment_id = e.id
      WHERE 1=1
    `;
    const params: (string | number | null)[] = [];
    const countParams: (string | number | null)[] = [];

    if (projectId) {
      const clause = ' AND t.project_id = ?';
      sql += clause;
      countSql += clause;
      params.push(Number(projectId));
      countParams.push(Number(projectId));
    }
    if (status) {
      const clause = ' AND t.status = ?';
      sql += clause;
      countSql += clause;
      params.push(String(status));
      countParams.push(String(status));
    }
    if (triggerType) {
      const clause = ' AND t.trigger_type = ?';
      sql += clause;
      countSql += clause;
      params.push(String(triggerType));
      countParams.push(String(triggerType));
    }
    if (keyword && typeof keyword === 'string' && keyword.trim()) {
      const clause = ' AND (t.name LIKE ? OR t.description LIKE ?)';
      const like = `%${keyword.trim()}%`;
      sql += clause;
      countSql += clause;
      params.push(like, like);
      countParams.push(like, like);
    }

    sql += ' ORDER BY t.updated_at DESC LIMIT ? OFFSET ?';
    params.push(limitNum, offsetNum);

    // 统计今日范围（使用范围查询代替 DATE() 函数，可走 created_at/start_time 索引）
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);
    const todayStartStr = todayStart.toISOString().replace('T', ' ').substring(0, 19);
    const todayEndStr = todayEnd.toISOString().replace('T', ' ').substring(0, 19);

    // 所有独立查询并行执行，消除串行等待
    const [tasks, countResult, statsResult, todayRunsResult] = await Promise.all([
      query<Task[]>(sql, params),
      query<{ total: number }[]>(countSql, countParams),
      query<{ active_count: number }[]>(
        `SELECT COUNT(*) as active_count FROM Auto_TestCaseTasks WHERE status = 'active'`
      ),
      query<{ today_runs: number }[]>(
        `SELECT COUNT(*) as today_runs FROM Auto_TestCaseTaskExecutions
         WHERE start_time IS NOT NULL AND start_time BETWEEN ? AND ?`,
        [todayStartStr, todayEndStr]
      ),
    ]);

    const total = countResult[0]?.total ?? 0;
    const activeCount = statsResult[0]?.active_count ?? 0;
    const todayRuns = todayRunsResult[0]?.today_runs ?? 0;

    // 批量获取所有任务的最近5条运行记录（避免 N+1）
    let executionsByTaskId: Map<number, TaskExecution[]> = new Map();
    if (tasks.length > 0) {
      const taskIds = tasks.map((t) => t.id);
      const placeholders = taskIds.map(() => '?').join(',');

      // MariaDB 窗口函数：RANK() OVER PARTITION BY task_id
      const executions = await query<(TaskExecution & { task_id: number })[]>(
        `SELECT id, task_id, status, start_time, end_time, duration, passed_cases, failed_cases, total_cases
         FROM (
           SELECT id, task_id, status, start_time, end_time, duration, passed_cases, failed_cases, total_cases,
                  RANK() OVER (PARTITION BY task_id ORDER BY COALESCE(start_time, id) DESC) AS rn
           FROM Auto_TestCaseTaskExecutions
           WHERE task_id IN (${placeholders})
         ) ranked
         WHERE rn <= 5
         ORDER BY task_id, COALESCE(start_time, id) DESC`,
        taskIds
      );

      // 按 task_id 分组
      executionsByTaskId = new Map(taskIds.map((id) => [id, []]));
      for (const exec of executions) {
        const list = executionsByTaskId.get(exec.task_id) ?? [];
        list.push(exec);
        executionsByTaskId.set(exec.task_id, list);
      }
    }

    const data = tasks.map((task) => ({
      ...task,
      recentExecutions: executionsByTaskId.get(task.id) ?? [],
    }));

    res.json({
      success: true,
      data,
      total,
      stats: {
        activeCount,
        todayRuns,
      }
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '服务器内部错误';
    res.status(500).json({ success: false, message });
  }
});

/**
 * GET /api/tasks/:id
 * 获取任务详情（含关联用例 + 最近运行记录）
 */
router.get('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ success: false, message: '无效的任务 ID' });
    }

    const task = await queryOne<Task>(`
      SELECT t.*, u.display_name as created_by_name, e.name as environment_name
      FROM Auto_TestCaseTasks t
      LEFT JOIN Auto_Users u ON t.created_by = u.id
      LEFT JOIN Auto_TestEnvironments e ON t.environment_id = e.id
      WHERE t.id = ?
    `, [id]);

    if (!task) {
      return res.status(404).json({ success: false, message: '任务不存在' });
    }

    // 获取关联的用例
    let cases: TestCase[] = [];
    if (task.case_ids) {
      try {
        const caseIds = JSON.parse(task.case_ids) as number[];
        if (Array.isArray(caseIds) && caseIds.length > 0) {
          const placeholders = caseIds.map(() => '?').join(',');
          cases = await query<TestCase[]>(
            `SELECT id, name, type, status, priority FROM Auto_TestCase WHERE id IN (${placeholders})`,
            caseIds
          );
        }
      } catch (parseErr) {
        // case_ids 字段存储了非法 JSON，记录 warn 日志以便追踪数据异常
        logger.warn(`Task ${id} has invalid case_ids JSON, returning empty cases`, {
          rawValue: task.case_ids,
          err: parseErr instanceof Error ? parseErr.message : String(parseErr),
        }, LOG_CONTEXTS.DATABASE);
      }
    }

    // 并行获取最近运行记录和最新关联 TestRun
    const [recentExecutions, latestRunRow] = await Promise.all([
      query<TaskExecution[]>(`
SELECT id, status, start_time, end_time, duration, passed_cases, failed_cases, total_cases
FROM Auto_TestCaseTaskExecutions
WHERE task_id = ?
ORDER BY COALESCE(start_time, id) DESC
LIMIT 5
      `, [id]),
      // Auto_TestRun.execution_id 直接存储了关联的 Auto_TestCaseTaskExecutions.id
      // 通过 task_id 找到最近一次 TaskExecution，再经由 execution_id 字段定位对应的 TestRun
      queryOne<{ run_id: number | null }>(`
        SELECT tr.id as run_id
        FROM Auto_TestRun tr
        INNER JOIN Auto_TestCaseTaskExecutions te ON tr.execution_id = te.id
        WHERE te.task_id = ?
        ORDER BY tr.start_time DESC
        LIMIT 1
      `, [id]),
    ]);

    res.json({
      success: true,
      data: {
        ...task,
        cases,
        recentExecutions,
        latestRunId: latestRunRow?.run_id ?? null,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '服务器内部错误';
    res.status(500).json({ success: false, message });
  }
});

/**
 * POST /api/tasks
 * 创建任务
 *
 * Body: { name, description?, projectId?, caseIds?, triggerType?, cronExpression?, environmentId? }
 * 注：createdBy 从认证用户上下文（req.user.id）获取，不接受客户端传入
 */
router.post('/', generalAuthRateLimiter, authenticate, async (req, res) => {
  try {
    const {
      name,
      description,
      projectId,
      caseIds,
      triggerType = 'manual',
      cronExpression,
      environmentId,
      maxRetries,
      retryDelayMs,
    } = req.body;

    // createdBy 从认证中间件获取，防止客户端伪造（authenticate 已确保 req.user 存在）
    const createdBy = req.user!.id;

    // 参数校验
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ success: false, message: 'name 不能为空' });
    }
    if (name.trim().length > 200) {
      return res.status(400).json({ success: false, message: 'name 长度不能超过200个字符' });
    }
    if (!VALID_TRIGGER_TYPES.includes(triggerType as typeof VALID_TRIGGER_TYPES[number])) {
      return res.status(400).json({
        success: false,
        message: `triggerType 必须是 ${VALID_TRIGGER_TYPES.join(' / ')} 之一`,
      });
    }
    if (triggerType === 'scheduled') {
      if (!cronExpression) {
        return res.status(400).json({ success: false, message: '定时任务必须提供 cronExpression' });
      }
      if (!isValidCron(cronExpression)) {
        return res.status(400).json({ success: false, message: 'cronExpression 格式无效（需为标准5段 cron，如 0 2 * * *）' });
      }
    }
    if (caseIds !== undefined && !Array.isArray(caseIds)) {
      return res.status(400).json({ success: false, message: 'caseIds 必须是数组' });
    }

    // maxRetries / retryDelayMs 使用默认值兜底，防止非法值写入
    const safeMaxRetries = (typeof maxRetries === 'number' && maxRetries >= 0) ? maxRetries : 1;
    const safeRetryDelayMs = (typeof retryDelayMs === 'number' && retryDelayMs >= 0) ? retryDelayMs : 30_000;

    const pool = getPool();
    const [result] = await pool.execute(
      `INSERT INTO Auto_TestCaseTasks (name, description, project_id, case_ids, trigger_type, cron_expression, environment_id, created_by, max_retries, retry_delay_ms)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        name.trim(),
        description?.trim() || null,
        projectId || null,
        JSON.stringify(Array.isArray(caseIds) ? caseIds : []),
        triggerType,
        cronExpression?.trim() || null,
        environmentId || null,
        createdBy,
        safeMaxRetries,
        safeRetryDelayMs,
      ]
    );

    const insertResult = result as { insertId: number };
    const newTaskId = insertResult.insertId;

    // 写入审计日志
    await writeAuditLog(newTaskId, 'created', createdBy, {
      name: name.trim(),
      triggerType,
      cronExpression: cronExpression?.trim() || null,
      caseCount: Array.isArray(caseIds) ? caseIds.length : 0,
      projectId: projectId || null,
      maxRetries: safeMaxRetries,
      retryDelayMs: safeRetryDelayMs,
    });

    // 若为定时任务，注册到调度引擎
    if (triggerType === 'scheduled') {
      taskSchedulerService.registerTask(newTaskId).catch(err => {
        logger.errorLog(err, `Failed to register task ${newTaskId} in scheduler`, {});
      });
    }

    res.json({
      success: true,
      data: { id: newTaskId },
      message: '任务创建成功',
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '服务器内部错误';
    res.status(500).json({ success: false, message });
  }
});

/**
 * PUT /api/tasks/:id
 * 更新任务
 */
router.put('/:id', generalAuthRateLimiter, authenticate, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ success: false, message: '无效的任务 ID' });
    }

    const {
      name,
      description,
      projectId,
      caseIds,
      triggerType,
      cronExpression,
      environmentId,
      status,
    } = req.body;

    // 字段级校验
    if (name !== undefined) {
      if (typeof name !== 'string' || name.trim().length === 0) {
        return res.status(400).json({ success: false, message: 'name 不能为空' });
      }
      if (name.trim().length > 200) {
        return res.status(400).json({ success: false, message: 'name 长度不能超过200个字符' });
      }
    }
    if (triggerType !== undefined && !VALID_TRIGGER_TYPES.includes(triggerType as typeof VALID_TRIGGER_TYPES[number])) {
      return res.status(400).json({
        success: false,
        message: `triggerType 必须是 ${VALID_TRIGGER_TYPES.join(' / ')} 之一`,
      });
    }
    // 若将触发类型切换为 scheduled，必须同时提供有效的 cronExpression
    if (triggerType === 'scheduled') {
      if (cronExpression === undefined || cronExpression === null || String(cronExpression).trim() === '') {
        return res.status(400).json({ success: false, message: '定时任务必须提供 cronExpression' });
      }
      if (!isValidCron(cronExpression)) {
        return res.status(400).json({ success: false, message: 'cronExpression 格式无效（需为标准5段 cron，如 0 2 * * *）' });
      }
    } else if (triggerType !== undefined && cronExpression !== undefined && !isValidCron(cronExpression)) {
      // 非 scheduled 类型但仍传了 cronExpression，仍做格式校验
      return res.status(400).json({ success: false, message: 'cronExpression 格式无效（需为标准5段 cron，如 0 2 * * *）' });
    }
    if (status !== undefined && !VALID_STATUSES.includes(status as typeof VALID_STATUSES[number])) {
      return res.status(400).json({
        success: false,
        message: `status 必须是 ${VALID_STATUSES.join(' / ')} 之一`,
      });
    }
    if (caseIds !== undefined && !Array.isArray(caseIds)) {
      return res.status(400).json({ success: false, message: 'caseIds 必须是数组' });
    }

    // 确认任务存在
    const existing = await queryOne<{ id: number }>('SELECT id FROM Auto_TestCaseTasks WHERE id = ?', [id]);
    if (!existing) {
      return res.status(404).json({ success: false, message: '任务不存在' });
    }

    const updates: string[] = [];
    const changedFieldNames: string[] = [];
    const params: (string | number | null)[] = [];

    if (name !== undefined) {
      updates.push('name = ?');
      changedFieldNames.push('name');
      params.push(name.trim());
    }
    if (description !== undefined) {
      updates.push('description = ?');
      changedFieldNames.push('description');
      params.push(description?.trim() || null);
    }
    if (projectId !== undefined) {
      updates.push('project_id = ?');
      changedFieldNames.push('project_id');
      params.push(projectId || null);
    }
    if (caseIds !== undefined) {
      updates.push('case_ids = ?');
      changedFieldNames.push('case_ids');
      params.push(JSON.stringify(caseIds));
    }
    if (triggerType !== undefined) {
      updates.push('trigger_type = ?');
      changedFieldNames.push('trigger_type');
      params.push(triggerType);
    }
    if (cronExpression !== undefined) {
      updates.push('cron_expression = ?');
      changedFieldNames.push('cron_expression');
      params.push(cronExpression?.trim() || null);
    }
    if (environmentId !== undefined) {
      updates.push('environment_id = ?');
      changedFieldNames.push('environment_id');
      params.push(environmentId || null);
    }
    if (status !== undefined) {
      updates.push('status = ?');
      changedFieldNames.push('status');
      params.push(status);
    }

    if (updates.length === 0) {
      return res.status(400).json({ success: false, message: '没有可更新的字段' });
    }

    params.push(id);
    const pool = getPool();
    await pool.execute(`UPDATE Auto_TestCaseTasks SET ${updates.join(', ')} WHERE id = ?`, params);

    // 写入审计日志（使用独立的字段名数组，不依赖 SQL 片段解析）
    const operatorId = req.user!.id;
    await writeAuditLog(id, 'updated', operatorId, {
      changedFields: changedFieldNames,
      triggerType,
      status,
    });

    // 若涉及 cron/status/triggerType 变更，通知调度引擎更新
    if (triggerType !== undefined || cronExpression !== undefined || status !== undefined) {
      taskSchedulerService.registerTask(id).catch(err => {
        logger.errorLog(err, `Failed to update task ${id} in scheduler`, {});
      });
    }

    res.json({ success: true, message: '任务更新成功' });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '服务器内部错误';
    res.status(500).json({ success: false, message });
  }
});

/**
 * DELETE /api/tasks/:id
 * 删除任务
 */
router.delete('/:id', generalAuthRateLimiter, authenticate, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ success: false, message: '无效的任务 ID' });
    }

    const existing = await queryOne<{ id: number; name: string }>('SELECT id, name FROM Auto_TestCaseTasks WHERE id = ?', [id]);
    if (!existing) {
      return res.status(404).json({ success: false, message: '任务不存在' });
    }

    // 先注销调度器，防止 DB 删除后调度器仍触发已删除的任务
    taskSchedulerService.unregisterTask(id);

    const pool = getPool();
    await pool.execute('DELETE FROM Auto_TestCaseTasks WHERE id = ?', [id]);

    // 审计日志
    const operatorId = req.user!.id;
    await writeAuditLog(id, 'deleted', operatorId, { name: existing.name });

    res.json({ success: true, message: '任务已删除' });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '服务器内部错误';
    res.status(500).json({ success: false, message });
  }
});

/**
 * PATCH /api/tasks/:id/status
 * 切换任务状态（active / paused / archived）
 */
router.patch('/:id/status', generalAuthRateLimiter, authenticate, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { status } = req.body;

    if (isNaN(id)) {
      return res.status(400).json({ success: false, message: '无效的任务 ID' });
    }
    if (!VALID_STATUSES.includes(status as typeof VALID_STATUSES[number])) {
      return res.status(400).json({
        success: false,
        message: `status 必须是 ${VALID_STATUSES.join(' / ')} 之一`,
      });
    }

    const existing = await queryOne<{ id: number; status: string }>('SELECT id, status FROM Auto_TestCaseTasks WHERE id = ?', [id]);
    if (!existing) {
      return res.status(404).json({ success: false, message: '任务不存在' });
    }

    // 幂等保护：状态未变更时直接返回，避免无效写入和重复审计日志
    if (existing.status === status) {
      return res.json({ success: true, message: '状态未变更' });
    }

    const pool = getPool();
    await pool.execute('UPDATE Auto_TestCaseTasks SET status = ? WHERE id = ?', [status, id]);

    // 审计日志
    const operatorId = req.user!.id;
    await writeAuditLog(id, 'status_changed', operatorId, {
      from: existing.status,
      to: status,
    });

    // 调度引擎响应（暂停/归档时注销，恢复 active 时重新注册）
    if (status === 'active') {
      taskSchedulerService.registerTask(id).catch(err => {
        logger.errorLog(err, `Failed to re-register task ${id} after status change`, {});
      });
    } else {
      taskSchedulerService.unregisterTask(id);
    }

    res.json({ success: true, message: '状态更新成功' });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '服务器内部错误';
    res.status(500).json({ success: false, message });
  }
});

/**
 * GET /api/tasks/:id/executions
 * 获取任务的执行历史
 */
router.get('/:id/executions', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ success: false, message: '无效的任务 ID' });
    }
    const limit = Math.min(100, parseInt(req.query.limit as string) || 20);

    const data = await query<TaskExecution[]>(`
      SELECT te.id, te.status, te.start_time, te.end_time, te.duration,
             te.passed_cases, te.failed_cases, te.total_cases,
             u.display_name as executed_by_name
      FROM Auto_TestCaseTaskExecutions te
      LEFT JOIN Auto_Users u ON te.executed_by = u.id
      WHERE te.task_id = ?
      ORDER BY COALESCE(te.start_time, te.id) DESC
      LIMIT ?
    `, [id, limit]);

    res.json({ success: true, data });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '服务器内部错误';
    res.status(500).json({ success: false, message });
  }
});

// ─────────────────────────────────────────────────────────────────────────
// P1: 执行控制 - 取消运行中的执行
// ─────────────────────────────────────────────────────────────────────────

/**
 * POST /api/tasks/:id/executions/:execId/cancel
 * 取消某次正在运行的任务执行（仅限 pending / running 状态）
 */
router.post('/:id/executions/:execId/cancel', generalAuthRateLimiter, authenticate, async (req, res) => {
  try {
    const taskId = parseInt(req.params.id);
    const execId = parseInt(req.params.execId);

    if (isNaN(taskId) || isNaN(execId)) {
      return res.status(400).json({ success: false, message: '无效的 ID' });
    }

    // 确认该执行属于该任务
    const exec = await queryOne<{ id: number; status: string; task_id: number }>(
      'SELECT id, status, task_id FROM Auto_TestCaseTaskExecutions WHERE id = ? AND task_id = ?',
      [execId, taskId]
    );

    if (!exec) {
      return res.status(404).json({ success: false, message: '运行记录不存在或不属于该任务' });
    }
    if (!['pending', 'running'].includes(exec.status)) {
      return res.status(400).json({ success: false, message: `当前状态 ${exec.status} 不可取消` });
    }

    await executionService.cancelExecution(execId);

    // 审计日志
    const operatorId = req.user!.id;
    await writeAuditLog(taskId, 'execution_cancelled', operatorId, {
      execId,
      previousStatus: exec.status,
    });

    res.json({ success: true, message: '执行已取消' });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '服务器内部错误';
    res.status(500).json({ success: false, message });
  }
});

// ─────────────────────────────────────────────────────────────────────────
// P1: 手动立即触发任务
// ─────────────────────────────────────────────────────────────────────────

/**
 * POST /api/tasks/:id/run
 * 手动立即触发任务执行
 * - 受并发上限保护（调度引擎队列）
 * - 写入审计日志
 */
router.post('/:id/run', generalAuthRateLimiter, authenticate, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ success: false, message: '无效的任务 ID' });
    }

    const task = await queryOne<{ id: number; name: string; case_ids: string; status: string }>(
      'SELECT id, name, case_ids, status FROM Auto_TestCaseTasks WHERE id = ?',
      [id]
    );

    if (!task) {
      return res.status(404).json({ success: false, message: '任务不存在' });
    }
    if (task.status === 'archived') {
      return res.status(400).json({ success: false, message: '已归档任务不可触发' });
    }

    const operatorId = req.user!.id;

    // 写入审计日志（执行）
    await writeAuditLog(id, 'manually_triggered', operatorId, {
      triggeredBy: operatorId,
    });

    // 通过调度引擎分发（享受并发保护），传入实际操作者ID以便记录正确的触发用户
    taskSchedulerService.dispatchTask(id, 'manual', operatorId).catch(err => {
      logger.errorLog(err, `Manual dispatch failed for task ${id}`, {});
    });

    res.json({ success: true, message: '任务已提交执行队列' });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '服务器内部错误';
    res.status(500).json({ success: false, message });
  }
});

// ─────────────────────────────────────────────────────────────────────────
// P2: 任务维度统计 - 成功率趋势 + 失败原因聚合
// ─────────────────────────────────────────────────────────────────────────

/**
 * GET /api/tasks/:id/stats
 * 获取任务的执行统计数据
 *
 * 返回：
 *   - summary:   整体成功率、平均耗时、总执行次数
 *   - trend:     近 N 天每日成功率趋势（按 start_time 分组）
 *   - topErrors: 失败次数最多的前 10 条错误原因（来自 Auto_TestRunResults）
 */
router.get('/:id/stats', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ success: false, message: '无效的任务 ID' });
    }

    const days = Math.min(90, parseInt(req.query.days as string) || 30);

    // 并行查询：整体摘要 + 每日趋势 + 失败原因
    const [summaryRows, trendRows, topErrorRows] = await Promise.all([
      // 1. 整体摘要
      query<{
        total: number;
        success_count: number;
        failed_count: number;
        avg_duration: number;
        last_run_at: string | null;
      }[]>(`
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as success_count,
          SUM(CASE WHEN status IN ('failed', 'cancelled') THEN 1 ELSE 0 END) as failed_count,
          ROUND(AVG(NULLIF(duration, 0))) as avg_duration,
          MAX(start_time) as last_run_at
        FROM Auto_TestCaseTaskExecutions
        WHERE task_id = ?
          AND COALESCE(start_time, NOW()) >= DATE_SUB(NOW(), INTERVAL ? DAY)
      `, [id, days]),

      // 2. 每日成功率趋势
      query<{
        day: string;
        total: number;
        success_count: number;
        failed_count: number;
        avg_duration: number;
      }[]>(`
        SELECT
          DATE(COALESCE(start_time, NOW())) as day,
          COUNT(*) as total,
          SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as success_count,
          SUM(CASE WHEN status IN ('failed', 'cancelled') THEN 1 ELSE 0 END) as failed_count,
          ROUND(AVG(NULLIF(duration, 0))) as avg_duration
        FROM Auto_TestCaseTaskExecutions
        WHERE task_id = ?
          AND COALESCE(start_time, NOW()) >= DATE_SUB(NOW(), INTERVAL ? DAY)
        GROUP BY DATE(COALESCE(start_time, NOW()))
        ORDER BY day ASC
      `, [id, days]),

      // 3. 失败原因聚合（使用 JOIN 替代 IN 子查询，提升大数据量下的性能）
      query<{ error_message: string; count: number }[]>(`
        SELECT
          LEFT(COALESCE(trr.error_message, 'Unknown error'), 200) as error_message,
          COUNT(*) as count
        FROM Auto_TestRunResults trr
        INNER JOIN Auto_TestRun tr ON trr.execution_id = tr.id
        INNER JOIN Auto_TestCaseTaskExecutions te ON tr.execution_id = te.id
        WHERE te.task_id = ?
          AND trr.status IN ('failed', 'error')
          AND tr.start_time >= DATE_SUB(NOW(), INTERVAL ? DAY)
        GROUP BY LEFT(COALESCE(trr.error_message, 'Unknown error'), 200)
        ORDER BY count DESC
        LIMIT 10
      `, [id, days]),
    ]);

    const summary = summaryRows[0] ?? { total: 0, success_count: 0, failed_count: 0, avg_duration: 0, last_run_at: null };
    const successRate = summary.total > 0
      ? Math.round((Number(summary.success_count) / Number(summary.total)) * 100)
      : 0;

    res.json({
      success: true,
      data: {
        summary: {
          total: Number(summary.total),
          successCount: Number(summary.success_count),
          failedCount: Number(summary.failed_count),
          successRate,
          avgDurationSec: Number(summary.avg_duration) || 0,
          lastRunAt: summary.last_run_at,
          periodDays: days,
        },
        trend: trendRows.map(r => ({
          day: r.day,
          total: Number(r.total),
          successCount: Number(r.success_count),
          failedCount: Number(r.failed_count),
          successRate: Number(r.total) > 0
            ? Math.round((Number(r.success_count) / Number(r.total)) * 100)
            : 0,
          avgDurationSec: Number(r.avg_duration) || 0,
        })),
        topErrors: topErrorRows.map(e => ({
          errorMessage: e.error_message,
          count: Number(e.count),
        })),
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '服务器内部错误';
    res.status(500).json({ success: false, message });
  }
});

// ─────────────────────────────────────────────────────────────────────────
// P2: 审计日志查询
// ─────────────────────────────────────────────────────────────────────────

/**
 * GET /api/tasks/:id/audit-logs
 * 获取任务的审计操作日志
 *
 * Query params:
 *   limit  - 分页大小（默认 50，最大 200）
 *   offset - 分页偏移（默认 0）
 */
router.get('/:id/audit-logs', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ success: false, message: '无效的任务 ID' });
    }

    const limit = Math.min(200, parseInt(req.query.limit as string) || 50);
    const offset = Math.max(0, parseInt(req.query.offset as string) || 0);

    const [logs, countResult] = await Promise.all([
      query<{
        id: number;
        task_id: number;
        action: string;
        operator_id: number | null;
        operator_name: string | null;
        metadata: string;
        created_at: string;
      }[]>(`
        SELECT a.id, a.task_id, a.action, a.operator_id,
               u.display_name as operator_name,
               a.metadata, a.created_at
        FROM Auto_TaskAuditLogs a
        LEFT JOIN Auto_Users u ON a.operator_id = u.id
        WHERE a.task_id = ?
        ORDER BY a.created_at DESC
        LIMIT ? OFFSET ?
      `, [id, limit, offset]),

      query<{ total: number }[]>(
        'SELECT COUNT(*) as total FROM Auto_TaskAuditLogs WHERE task_id = ?',
        [id]
      ),
    ]);

    res.json({
      success: true,
      data: logs.map(l => ({
        id: l.id,
        action: l.action,
        operatorId: l.operator_id,
        operatorName: l.operator_name,
        metadata: (() => { try { return JSON.parse(l.metadata); } catch { return {}; } })(),
        createdAt: l.created_at,
      })),
      total: countResult[0]?.total ?? 0,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '服务器内部错误';
    res.status(500).json({ success: false, message });
  }
});

export default router;
