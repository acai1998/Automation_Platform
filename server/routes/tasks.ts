import { Router } from 'express';
import { query, queryOne, getPool } from '../config/database';
import { generalAuthRateLimiter } from '../middleware/authRateLimiter';

const router = Router();

interface Task {
  id: number;
  name: string;
  description?: string;
  project_id?: number;
  project_name?: string;
  case_ids?: string;
  trigger_type: string;
  cron_expression?: string;
  environment_id?: number;
  environment_name?: string;
  status: string;
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
  status: string;
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

/**
 * 简单 Cron 表达式合法性校验（标准 5 段 cron）
 * 格式：分 时 日 月 周
 */
function isValidCron(expr: string): boolean {
  // 允许 "* / , - 数字" 组成的 5 段 cron
  const parts = expr.trim().split(/\s+/);
  return parts.length === 5;
}

/**
 * GET /api/tasks
 * 获取任务列表（支持筛选、分页，内联最近5条执行记录，返回 total）
 *
 * Query params:
 *   projectId     - 按项目筛选
 *   status        - 按任务状态筛选（active/paused/archived）
 *   triggerType   - 按触发类型筛选（manual/scheduled/ci_triggered）
 *   keyword       - 按任务名称或描述模糊搜索
 *   limit         - 分页大小（默认 50）
 *   offset        - 分页偏移（默认 0）
 */
router.get('/', async (req, res) => {
  try {
    const {
      projectId,
      status,
      triggerType,
      keyword,
      limit = 20,
      offset = 0,
    } = req.query;

    let countSql = `SELECT COUNT(*) as total FROM Auto_TestCaseTasks t WHERE 1=1`;
    let sql = `
      SELECT t.*, u.display_name as created_by_name, e.name as environment_name
      FROM Auto_TestCaseTasks t
      LEFT JOIN Auto_Users u ON t.created_by = u.id
      LEFT JOIN Auto_TestEnvironments e ON t.environment_id = e.id
      WHERE 1=1
    `;
    const params: unknown[] = [];
    const countParams: unknown[] = [];

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
      params.push(status);
      countParams.push(status);
    }
    if (triggerType) {
      const clause = ' AND t.trigger_type = ?';
      sql += clause;
      countSql += clause;
      params.push(triggerType);
      countParams.push(triggerType);
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
    params.push(Number(limit), Number(offset));

    const [tasks, countResult] = await Promise.all([
      query<Task[]>(sql, params),
      query<{ total: number }[]>(countSql, countParams),
    ]);

    const total = countResult[0]?.total ?? 0;

    // 批量获取所有任务的最近5条执行记录（避免 N+1）
    let executionsByTaskId: Map<number, TaskExecution[]> = new Map();
    if (tasks.length > 0) {
      const taskIds = tasks.map((t) => t.id);
      const placeholders = taskIds.map(() => '?').join(',');

      // MariaDB 窗口函数：RANK() OVER PARTITION BY task_id
      const executions = await query<(TaskExecution & { task_id: number })[]>(
        `SELECT id, task_id, status, start_time, end_time, duration, passed_cases, failed_cases, total_cases
         FROM (
           SELECT id, task_id, status, start_time, end_time, duration, passed_cases, failed_cases, total_cases,
                  RANK() OVER (PARTITION BY task_id ORDER BY COALESCE(start_time, created_at) DESC) AS rn
           FROM Auto_TestCaseTaskExecutions
           WHERE task_id IN (${placeholders})
         ) ranked
         WHERE rn <= 5
         ORDER BY task_id, COALESCE(start_time, created_at) DESC`,
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

    res.json({ success: true, data, total });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ success: false, message });
  }
});

/**
 * GET /api/tasks/:id
 * 获取任务详情（含关联用例 + 最近执行记录）
 */
router.get('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ success: false, message: 'Invalid task id' });
    }

    const task = await queryOne<Task>(`
      SELECT t.*, u.display_name as created_by_name, e.name as environment_name
      FROM Auto_TestCaseTasks t
      LEFT JOIN Auto_Users u ON t.created_by = u.id
      LEFT JOIN Auto_TestEnvironments e ON t.environment_id = e.id
      WHERE t.id = ?
    `, [id]);

    if (!task) {
      return res.status(404).json({ success: false, message: 'Task not found' });
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
      } catch {
        // ignore parse error
      }
    }

    // 获取最近执行记录
    const recentExecutions = await query<TaskExecution[]>(`
      SELECT id, status, start_time, end_time, duration, passed_cases, failed_cases, total_cases
      FROM Auto_TestCaseTaskExecutions
      WHERE task_id = ?
      ORDER BY COALESCE(start_time, created_at) DESC
      LIMIT 5
    `, [id]);

    // 获取最近一次关联的 Auto_TestRun id，供前端跳转报告使用
    const latestRunRow = await queryOne<{ run_id: number | null }>(`
      SELECT tr.id as run_id
      FROM Auto_TestRun tr
      WHERE tr.id IN (
        SELECT DISTINCT rr.execution_id
        FROM Auto_TestRunResults rr
        INNER JOIN Auto_TestCaseTaskExecutions te ON te.id = rr.execution_id
        WHERE te.task_id = ?
      )
      ORDER BY tr.start_time DESC
      LIMIT 1
    `, [id]);

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
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ success: false, message });
  }
});

/**
 * POST /api/tasks
 * 创建任务
 *
 * Body: { name, description?, projectId?, caseIds?, triggerType?, cronExpression?, environmentId?, createdBy? }
 */
router.post('/', generalAuthRateLimiter, async (req, res) => {
  try {
    const {
      name,
      description,
      projectId,
      caseIds,
      triggerType = 'manual',
      cronExpression,
      environmentId,
      createdBy = 1,
    } = req.body;

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
        return res.status(400).json({ success: false, message: 'cronExpression 格式无效（需为标准5段 cron）' });
      }
    }
    if (caseIds !== undefined && !Array.isArray(caseIds)) {
      return res.status(400).json({ success: false, message: 'caseIds 必须是数组' });
    }

    const pool = getPool();
    const [result] = await pool.execute(
      `INSERT INTO Auto_TestCaseTasks (name, description, project_id, case_ids, trigger_type, cron_expression, environment_id, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        name.trim(),
        description?.trim() || null,
        projectId || null,
        JSON.stringify(Array.isArray(caseIds) ? caseIds : []),
        triggerType,
        cronExpression?.trim() || null,
        environmentId || null,
        createdBy,
      ]
    );

    const insertResult = result as { insertId: number };

    res.json({
      success: true,
      data: { id: insertResult.insertId },
      message: '任务创建成功',
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ success: false, message });
  }
});

/**
 * PUT /api/tasks/:id
 * 更新任务
 */
router.put('/:id', generalAuthRateLimiter, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ success: false, message: 'Invalid task id' });
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
    if (triggerType === 'scheduled' && cronExpression !== undefined && !isValidCron(cronExpression)) {
      return res.status(400).json({ success: false, message: 'cronExpression 格式无效（需为标准5段 cron）' });
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
      return res.status(404).json({ success: false, message: 'Task not found' });
    }

    const updates: string[] = [];
    const params: unknown[] = [];

    if (name !== undefined) {
      updates.push('name = ?');
      params.push(name.trim());
    }
    if (description !== undefined) {
      updates.push('description = ?');
      params.push(description?.trim() || null);
    }
    if (projectId !== undefined) {
      updates.push('project_id = ?');
      params.push(projectId || null);
    }
    if (caseIds !== undefined) {
      updates.push('case_ids = ?');
      params.push(JSON.stringify(caseIds));
    }
    if (triggerType !== undefined) {
      updates.push('trigger_type = ?');
      params.push(triggerType);
    }
    if (cronExpression !== undefined) {
      updates.push('cron_expression = ?');
      params.push(cronExpression?.trim() || null);
    }
    if (environmentId !== undefined) {
      updates.push('environment_id = ?');
      params.push(environmentId || null);
    }
    if (status !== undefined) {
      updates.push('status = ?');
      params.push(status);
    }

    if (updates.length === 0) {
      return res.status(400).json({ success: false, message: '没有可更新的字段' });
    }

    params.push(id);
    const pool = getPool();
    await pool.execute(`UPDATE Auto_TestCaseTasks SET ${updates.join(', ')} WHERE id = ?`, params);

    res.json({ success: true, message: '任务更新成功' });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ success: false, message });
  }
});

/**
 * DELETE /api/tasks/:id
 * 删除任务
 */
router.delete('/:id', generalAuthRateLimiter, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ success: false, message: 'Invalid task id' });
    }

    const existing = await queryOne<{ id: number }>('SELECT id FROM Auto_TestCaseTasks WHERE id = ?', [id]);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Task not found' });
    }

    const pool = getPool();
    await pool.execute('DELETE FROM Auto_TestCaseTasks WHERE id = ?', [id]);

    res.json({ success: true, message: '任务已删除' });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ success: false, message });
  }
});

/**
 * PATCH /api/tasks/:id/status
 * 切换任务状态（active / paused / archived）
 */
router.patch('/:id/status', generalAuthRateLimiter, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { status } = req.body;

    if (isNaN(id)) {
      return res.status(400).json({ success: false, message: 'Invalid task id' });
    }
    if (!VALID_STATUSES.includes(status as typeof VALID_STATUSES[number])) {
      return res.status(400).json({
        success: false,
        message: `status 必须是 ${VALID_STATUSES.join(' / ')} 之一`,
      });
    }

    const existing = await queryOne<{ id: number }>('SELECT id FROM Auto_TestCaseTasks WHERE id = ?', [id]);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Task not found' });
    }

    const pool = getPool();
    await pool.execute('UPDATE Auto_TestCaseTasks SET status = ? WHERE id = ?', [status, id]);

    res.json({ success: true, message: '状态更新成功' });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
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
      return res.status(400).json({ success: false, message: 'Invalid task id' });
    }
    const limit = Math.min(100, parseInt(req.query.limit as string) || 20);

    const data = await query<TaskExecution[]>(`
      SELECT te.id, te.status, te.start_time, te.end_time, te.duration,
             te.passed_cases, te.failed_cases, te.total_cases,
             u.display_name as executed_by_name
      FROM Auto_TestCaseTaskExecutions te
      LEFT JOIN Auto_Users u ON te.executed_by = u.id
      WHERE te.task_id = ?
      ORDER BY COALESCE(te.start_time, te.created_at) DESC
      LIMIT ?
    `, [id, limit]);

    res.json({ success: true, data });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ success: false, message });
  }
});

export default router;
