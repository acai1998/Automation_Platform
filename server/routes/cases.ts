import { Router } from 'express';
import { getDatabase } from '../db/index.js';

const router = Router();

/**
 * GET /api/cases
 * 获取用例列表
 */
router.get('/', (req, res) => {
  try {
    const db = getDatabase();
    const { projectId, module, status, type, search, limit = 50, offset = 0 } = req.query;

    let sql = `
      SELECT tc.*, p.name as project_name, u.display_name as created_by_name
      FROM test_cases tc
      LEFT JOIN projects p ON tc.project_id = p.id
      LEFT JOIN users u ON tc.created_by = u.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (projectId) {
      sql += ' AND tc.project_id = ?';
      params.push(projectId);
    }
    if (module) {
      sql += ' AND tc.module = ?';
      params.push(module);
    }
    if (status) {
      sql += ' AND tc.status = ?';
      params.push(status);
    }
    if (type) {
      sql += ' AND tc.type = ?';
      params.push(type);
    }
    if (search) {
      sql += ' AND (tc.name LIKE ? OR tc.description LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    sql += ' ORDER BY tc.updated_at DESC LIMIT ? OFFSET ?';
    params.push(Number(limit), Number(offset));

    const data = db.prepare(sql).all(...params);

    // 获取总数
    let countSql = 'SELECT COUNT(*) as total FROM test_cases tc WHERE 1=1';
    const countParams: any[] = [];
    if (projectId) {
      countSql += ' AND tc.project_id = ?';
      countParams.push(projectId);
    }
    if (status) {
      countSql += ' AND tc.status = ?';
      countParams.push(status);
    }

    const total = (db.prepare(countSql).get(...countParams) as any).total;

    res.json({ success: true, data, total });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /api/cases/:id
 * 获取用例详情
 */
router.get('/:id', (req, res) => {
  try {
    const db = getDatabase();
    const id = parseInt(req.params.id);

    const data = db.prepare(`
      SELECT tc.*, p.name as project_name, u.display_name as created_by_name
      FROM test_cases tc
      LEFT JOIN projects p ON tc.project_id = p.id
      LEFT JOIN users u ON tc.created_by = u.id
      WHERE tc.id = ?
    `).get(id);

    if (!data) {
      return res.status(404).json({ success: false, message: 'Case not found' });
    }

    res.json({ success: true, data });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * POST /api/cases
 * 创建用例
 */
router.post('/', (req, res) => {
  try {
    const db = getDatabase();
    const {
      name,
      description,
      projectId,
      module,
      priority = 'P1',
      type = 'api',
      tags,
      configJson,
      createdBy = 1,
    } = req.body;

    if (!name) {
      return res.status(400).json({ success: false, message: 'name is required' });
    }

    const result = db.prepare(`
      INSERT INTO test_cases (name, description, project_id, module, priority, type, tags, config_json, created_by, updated_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      name,
      description || null,
      projectId || null,
      module || null,
      priority,
      type,
      tags || null,
      typeof configJson === 'string' ? configJson : JSON.stringify(configJson || {}),
      createdBy,
      createdBy
    );

    res.json({
      success: true,
      data: { id: result.lastInsertRowid },
      message: 'Case created successfully',
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * PUT /api/cases/:id
 * 更新用例
 */
router.put('/:id', (req, res) => {
  try {
    const db = getDatabase();
    const id = parseInt(req.params.id);
    const {
      name,
      description,
      projectId,
      module,
      priority,
      type,
      status,
      tags,
      configJson,
      updatedBy = 1,
    } = req.body;

    // 构建更新语句
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
    if (module !== undefined) {
      updates.push('module = ?');
      params.push(module);
    }
    if (priority !== undefined) {
      updates.push('priority = ?');
      params.push(priority);
    }
    if (type !== undefined) {
      updates.push('type = ?');
      params.push(type);
    }
    if (status !== undefined) {
      updates.push('status = ?');
      params.push(status);
    }
    if (tags !== undefined) {
      updates.push('tags = ?');
      params.push(tags);
    }
    if (configJson !== undefined) {
      updates.push('config_json = ?');
      params.push(typeof configJson === 'string' ? configJson : JSON.stringify(configJson));
    }

    updates.push('updated_by = ?');
    params.push(updatedBy);
    params.push(id);

    db.prepare(`UPDATE test_cases SET ${updates.join(', ')} WHERE id = ?`).run(...params);

    res.json({ success: true, message: 'Case updated successfully' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * DELETE /api/cases/:id
 * 删除用例
 */
router.delete('/:id', (req, res) => {
  try {
    const db = getDatabase();
    const id = parseInt(req.params.id);

    db.prepare('DELETE FROM test_cases WHERE id = ?').run(id);

    res.json({ success: true, message: 'Case deleted successfully' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /api/cases/modules/list
 * 获取所有模块列表
 */
router.get('/modules/list', (req, res) => {
  try {
    const db = getDatabase();
    const data = db.prepare(`
      SELECT DISTINCT module FROM test_cases WHERE module IS NOT NULL ORDER BY module
    `).all();

    res.json({ success: true, data: data.map((d: any) => d.module) });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
