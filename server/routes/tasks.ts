import { Router } from 'express';
import { getDatabase } from '../db/index.js';

const router = Router();

/**
 * GET /api/tasks
 * 获取任务列表
 */
router.get('/', (req, res) => {
  try {
    const db = getDatabase();
    const { projectId, status, limit = 50, offset = 0 } = req.query;

    let sql = `
      SELECT t.*, p.name as project_name, u.display_name as created_by_name, e.name as environment_name
      FROM tasks t
      LEFT JOIN projects p ON t.project_id = p.id
      LEFT JOIN users u ON t.created_by = u.id
      LEFT JOIN environments e ON t.environment_id = e.id
      WHERE 1=1
    `;
    const params: any[] = [];

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

    const data = db.prepare(sql).all(...params);

    res.json({ success: true, data });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /api/tasks/:id
 * 获取任务详情
 */
router.get('/:id', (req, res) => {
  try {
    const db = getDatabase();
    const id = parseInt(req.params.id);

    const task = db.prepare(`
      SELECT t.*, p.name as project_name, u.display_name as created_by_name, e.name as environment_name
      FROM tasks t
      LEFT JOIN projects p ON t.project_id = p.id
      LEFT JOIN users u ON t.created_by = u.id
      LEFT JOIN environments e ON t.environment_id = e.id
      WHERE t.id = ?
    `).get(id) as any;

    if (!task) {
      return res.status(404).json({ success: false, message: 'Task not found' });
    }

    // 获取关联的用例
    let cases: any[] = [];
    if (task.case_ids) {
      try {
        const caseIds = JSON.parse(task.case_ids);
        if (caseIds.length > 0) {
          const placeholders = caseIds.map(() => '?').join(',');
          cases = db.prepare(`SELECT id, name, type, status, priority FROM test_cases WHERE id IN (${placeholders})`).all(...caseIds);
        }
      } catch {}
    }

    // 获取最近执行记录
    const recentExecutions = db.prepare(`
      SELECT id, status, start_time, end_time, duration, passed_cases, failed_cases
      FROM task_executions
      WHERE task_id = ?
      ORDER BY start_time DESC
      LIMIT 5
    `).all(id);

    res.json({
      success: true,
      data: {
        ...task,
        cases,
        recentExecutions,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * POST /api/tasks
 * 创建任务
 */
router.post('/', (req, res) => {
  try {
    const db = getDatabase();
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

    const result = db.prepare(`
      INSERT INTO tasks (name, description, project_id, case_ids, trigger_type, cron_expression, environment_id, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      name,
      description || null,
      projectId || null,
      JSON.stringify(caseIds || []),
      triggerType,
      cronExpression || null,
      environmentId || null,
      createdBy
    );

    res.json({
      success: true,
      data: { id: result.lastInsertRowid },
      message: 'Task created successfully',
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * PUT /api/tasks/:id
 * 更新任务
 */
router.put('/:id', (req, res) => {
  try {
    const db = getDatabase();
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
    const params: any[] = [];

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
    db.prepare(`UPDATE tasks SET ${updates.join(', ')} WHERE id = ?`).run(...params);

    res.json({ success: true, message: 'Task updated successfully' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * DELETE /api/tasks/:id
 * 删除任务
 */
router.delete('/:id', (req, res) => {
  try {
    const db = getDatabase();
    const id = parseInt(req.params.id);

    db.prepare('DELETE FROM tasks WHERE id = ?').run(id);

    res.json({ success: true, message: 'Task deleted successfully' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /api/tasks/:id/executions
 * 获取任务的执行历史
 */
router.get('/:id/executions', (req, res) => {
  try {
    const db = getDatabase();
    const id = parseInt(req.params.id);
    const limit = parseInt(req.query.limit as string) || 20;

    const data = db.prepare(`
      SELECT te.*, u.display_name as executed_by_name
      FROM task_executions te
      LEFT JOIN users u ON te.executed_by = u.id
      WHERE te.task_id = ?
      ORDER BY te.start_time DESC
      LIMIT ?
    `).all(id, limit);

    res.json({ success: true, data });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
