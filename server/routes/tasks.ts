import { Router } from 'express';
import { query, queryOne, getPool } from '../config/database.js';

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
  executed_by_name?: string;
}

/**
 * GET /api/tasks
 * 获取任务列表
 */
router.get('/', async (req, res) => {
  try {
    const { projectId, status, limit = 50, offset = 0 } = req.query;

    let sql = `
      SELECT t.*, p.name as project_name, u.display_name as created_by_name, e.name as environment_name
      FROM tasks t
      LEFT JOIN projects p ON t.project_id = p.id
      LEFT JOIN Auto_Users u ON t.created_by = u.id
      LEFT JOIN environments e ON t.environment_id = e.id
      WHERE 1=1
    `;
    const params: unknown[] = [];

    if (projectId) {
      sql += ' AND t.project_id = ?';
      params.push(projectId);
    }
    if (status) {
      sql += ' AND t.status = ?';
      params.push(status);
    }

    sql += ' ORDER BY t.updated_at DESC LIMIT ? OFFSET ?';
    params.push(Number(limit), Number(offset));

    const data = await query<Task[]>(sql, params);

    res.json({ success: true, data });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ success: false, message });
  }
});

/**
 * GET /api/tasks/:id
 * 获取任务详情
 */
router.get('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);

    const task = await queryOne<Task>(`
      SELECT t.*, p.name as project_name, u.display_name as created_by_name, e.name as environment_name
      FROM tasks t
      LEFT JOIN projects p ON t.project_id = p.id
      LEFT JOIN Auto_Users u ON t.created_by = u.id
      LEFT JOIN environments e ON t.environment_id = e.id
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
        if (caseIds.length > 0) {
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
      SELECT id, status, start_time, end_time, duration, passed_cases, failed_cases
      FROM task_executions
      WHERE task_id = ?
      ORDER BY start_time DESC
      LIMIT 5
    `, [id]);

    res.json({
      success: true,
      data: {
        ...task,
        cases,
        recentExecutions,
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
 */
router.post('/', async (req, res) => {
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

    if (!name) {
      return res.status(400).json({ success: false, message: 'name is required' });
    }

    const pool = getPool();
    const [result] = await pool.execute(
      `INSERT INTO tasks (name, description, project_id, case_ids, trigger_type, cron_expression, environment_id, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        name,
        description || null,
        projectId || null,
        JSON.stringify(caseIds || []),
        triggerType,
        cronExpression || null,
        environmentId || null,
        createdBy,
      ]
    );

    const insertResult = result as { insertId: number };

    res.json({
      success: true,
      data: { id: insertResult.insertId },
      message: 'Task created successfully',
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
router.put('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
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

    const updates: string[] = [];
    const params: unknown[] = [];

    if (name !== undefined) {
      updates.push('name = ?');
      params.push(name);
    }
    if (description !== undefined) {
      updates.push('description = ?');
      params.push(description);
    }
    if (projectId !== undefined) {
      updates.push('project_id = ?');
      params.push(projectId);
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
      params.push(cronExpression);
    }
    if (environmentId !== undefined) {
      updates.push('environment_id = ?');
      params.push(environmentId);
    }
    if (status !== undefined) {
      updates.push('status = ?');
      params.push(status);
    }

    if (updates.length === 0) {
      return res.status(400).json({ success: false, message: 'No fields to update' });
    }

    params.push(id);
    const pool = getPool();
    await pool.execute(`UPDATE tasks SET ${updates.join(', ')} WHERE id = ?`, params);

    res.json({ success: true, message: 'Task updated successfully' });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ success: false, message });
  }
});

/**
 * DELETE /api/tasks/:id
 * 删除任务
 */
router.delete('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);

    const pool = getPool();
    await pool.execute('DELETE FROM tasks WHERE id = ?', [id]);

    res.json({ success: true, message: 'Task deleted successfully' });
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
    const limit = parseInt(req.query.limit as string) || 20;

    const data = await query<TaskExecution[]>(`
      SELECT te.*, u.display_name as executed_by_name
      FROM task_executions te
      LEFT JOIN Auto_Users u ON te.executed_by = u.id
      WHERE te.task_id = ?
      ORDER BY te.start_time DESC
      LIMIT ?
    `, [id, limit]);

    res.json({ success: true, data });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ success: false, message });
  }
});

export default router;
