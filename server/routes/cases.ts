import { Router } from 'express';
import { query, queryOne, getPool } from '../config/database.js';
import { jenkinsService, CaseType } from '../services/JenkinsService.js';

const router = Router();

interface TestCase {
  id: number;
  case_key?: string;
  name: string;
  description?: string;
  project_id?: number;
  project_name?: string;
  repo_id?: number;
  module?: string;
  priority: string;
  type: string;
  tags?: string;
  owner?: string;
  source?: string;
  enabled: boolean;
  last_sync_commit?: string;
  script_path?: string;
  config_json?: string;
  created_by?: number;
  created_by_name?: string;
  updated_by?: number;
  created_at: string;
  updated_at: string;
}

/**
 * GET /api/cases
 * 获取用例列表
 */
router.get('/', async (req, res) => {
  try {
    const { projectId, module, enabled, type, search, limit = 50, offset = 0 } = req.query;

    let sql = `
      SELECT tc.*, u.display_name as created_by_name
      FROM Auto_TestCase tc
      LEFT JOIN Auto_Users u ON tc.created_by = u.id
      WHERE 1=1
    `;
    const params: unknown[] = [];

    if (projectId) {
      sql += ' AND tc.project_id = ?';
      params.push(projectId);
    }
    if (module) {
      sql += ' AND tc.module = ?';
      params.push(module);
    }
    if (enabled !== undefined) {
      sql += ' AND tc.enabled = ?';
      params.push(enabled === 'true' || enabled === '1' ? 1 : 0);
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

    const data = await query<TestCase[]>(sql, params);

    // 如果没有数据，返回空数组和友善提示
    if (!Array.isArray(data) || data.length === 0) {
      return res.json({
        success: true,
        data: [],
        total: 0,
        message: '暂无测试用例数据，请检查筛选条件或联系管理员添加用例'
      });
    }

    // 获取总数
    let countSql = 'SELECT COUNT(*) as total FROM Auto_TestCase tc WHERE 1=1';
    const countParams: unknown[] = [];
    if (projectId) {
      countSql += ' AND tc.project_id = ?';
      countParams.push(projectId);
    }
    if (enabled !== undefined) {
      countSql += ' AND tc.enabled = ?';
      countParams.push(enabled === 'true' || enabled === '1' ? 1 : 0);
    }
    if (type) {
      countSql += ' AND tc.type = ?';
      countParams.push(type);
    }
    if (search) {
      countSql += ' AND (tc.name LIKE ? OR tc.description LIKE ?)';
      countParams.push(`%${search}%`, `%${search}%`);
    }

    const countResult = await queryOne<{ total: number }>(countSql, countParams);
    const total = countResult?.total ?? 0;

    res.json({ success: true, data, total });
  } catch (error: unknown) {
    // 增强错误日志记录
    console.error('Database operation failed:', {
      error: error instanceof Error ? error.message : error,
      stack: error instanceof Error ? error.stack : undefined,
      query: sql || 'N/A',
      params: params || 'N/A'
    });

    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ success: false, message });
  }
});

/**
 * GET /api/cases/modules/list
 * 获取所有模块列表
 */
router.get('/modules/list', async (_req, res) => {
  try {
    const data = await query<Array<{ module: string }>>(
      'SELECT DISTINCT module FROM Auto_TestCase WHERE module IS NOT NULL ORDER BY module'
    );

    res.json({ success: true, data: data.map((d) => d.module) });
  } catch (error: unknown) {
    // 增强错误日志记录
    console.error('Database operation failed:', {
      error: error instanceof Error ? error.message : error,
      stack: error instanceof Error ? error.stack : undefined,
      query: sql || 'N/A',
      params: params || 'N/A'
    });

    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ success: false, message });
  }
});

/**
 * GET /api/cases/running/list
 * 获取所有正在运行的用例（注：远程表无此字段，返回空数组）
 */
router.get('/running/list', async (_req, res) => {
  try {
    // 远程 Auto_TestCase 表没有 running_status 字段
    // 返回空数组以保持 API 兼容性
    res.json({ success: true, data: [] });
  } catch (error: unknown) {
    // 增强错误日志记录
    console.error('Database operation failed:', {
      error: error instanceof Error ? error.message : error,
      stack: error instanceof Error ? error.stack : undefined,
      query: sql || 'N/A',
      params: params || 'N/A'
    });

    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ success: false, message });
  }
});

/**
 * GET /api/cases/:id
 * 获取用例详情
 */
router.get('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);

    const data = await queryOne<TestCase>(`
      SELECT tc.*, u.display_name as created_by_name
      FROM Auto_TestCase tc
      LEFT JOIN Auto_Users u ON tc.created_by = u.id
      WHERE tc.id = ?
    `, [id]);

    if (!data) {
      return res.status(404).json({ success: false, message: 'Case not found' });
    }

    res.json({ success: true, data });
  } catch (error: unknown) {
    // 增强错误日志记录
    console.error('Database operation failed:', {
      error: error instanceof Error ? error.message : error,
      stack: error instanceof Error ? error.stack : undefined,
      query: sql || 'N/A',
      params: params || 'N/A'
    });

    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ success: false, message });
  }
});

/**
 * POST /api/cases
 * 创建用例
 */
router.post('/', async (req, res) => {
  try {
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

    const pool = getPool();
    const [result] = await pool.execute(
      `INSERT INTO Auto_TestCase (name, description, project_id, module, priority, type, tags, config_json, created_by, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        name,
        description || null,
        projectId || null,
        module || null,
        priority,
        type,
        tags || null,
        typeof configJson === 'string' ? configJson : JSON.stringify(configJson || {}),
        createdBy,
        createdBy,
      ]
    );

    const insertResult = result as { insertId: number };

    res.json({
      success: true,
      data: { id: insertResult.insertId },
      message: 'Case created successfully',
    });
  } catch (error: unknown) {
    // 增强错误日志记录
    console.error('Database operation failed:', {
      error: error instanceof Error ? error.message : error,
      stack: error instanceof Error ? error.stack : undefined,
      query: sql || 'N/A',
      params: params || 'N/A'
    });

    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ success: false, message });
  }
});

/**
 * PUT /api/cases/:id
 * 更新用例
 */
router.put('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const {
      name,
      description,
      projectId,
      module,
      priority,
      type,
      enabled,
      tags,
      scriptPath,
      configJson,
      updatedBy = 1,
    } = req.body;

    // 构建更新语句
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
    if (enabled !== undefined) {
      updates.push('enabled = ?');
      params.push(enabled ? 1 : 0);
    }
    if (tags !== undefined) {
      updates.push('tags = ?');
      params.push(tags);
    }
    if (scriptPath !== undefined) {
      updates.push('script_path = ?');
      params.push(scriptPath);
    }
    if (configJson !== undefined) {
      updates.push('config_json = ?');
      params.push(typeof configJson === 'string' ? configJson : JSON.stringify(configJson));
    }

    updates.push('updated_by = ?');
    params.push(updatedBy);
    params.push(id);

    const pool = getPool();
    await pool.execute(`UPDATE Auto_TestCase SET ${updates.join(', ')} WHERE id = ?`, params);

    res.json({ success: true, message: 'Case updated successfully' });
  } catch (error: unknown) {
    // 增强错误日志记录
    console.error('Database operation failed:', {
      error: error instanceof Error ? error.message : error,
      stack: error instanceof Error ? error.stack : undefined,
      query: sql || 'N/A',
      params: params || 'N/A'
    });

    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ success: false, message });
  }
});

/**
 * DELETE /api/cases/:id
 * 删除用例
 */
router.delete('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);

    const pool = getPool();
    await pool.execute('DELETE FROM Auto_TestCase WHERE id = ?', [id]);

    res.json({ success: true, message: 'Case deleted successfully' });
  } catch (error: unknown) {
    // 增强错误日志记录
    console.error('Database operation failed:', {
      error: error instanceof Error ? error.message : error,
      stack: error instanceof Error ? error.stack : undefined,
      query: sql || 'N/A',
      params: params || 'N/A'
    });

    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ success: false, message });
  }
});

/**
 * POST /api/cases/:id/run
 * 触发单用例执行
 */
router.post('/:id/run', async (req, res) => {
  try {
    const id = parseInt(req.params.id);

    // 获取用例信息
    const testCase = await queryOne<{
      id: number;
      name: string;
      type: string;
      script_path: string;
      enabled: boolean;
    }>(`
      SELECT id, name, type, script_path, enabled
      FROM Auto_TestCase
      WHERE id = ?
    `, [id]);

    if (!testCase) {
      return res.status(404).json({ success: false, message: 'Case not found' });
    }

    // 检查是否启用
    if (!testCase.enabled) {
      return res.status(400).json({ success: false, message: 'Case is disabled' });
    }

    // 检查是否有脚本路径
    if (!testCase.script_path) {
      return res.status(400).json({ success: false, message: 'Case has no script path configured' });
    }

    // 验证用例类型
    const validTypes: CaseType[] = ['api', 'ui', 'performance'];
    const caseType = testCase.type as CaseType;
    if (!validTypes.includes(caseType)) {
      return res.status(400).json({ success: false, message: `Invalid case type: ${testCase.type}` });
    }

    // 构建回调 URL
    const callbackUrl = `${req.protocol}://${req.get('host')}/api/cases/${id}/callback`;

    // 触发 Jenkins Job
    const result = await jenkinsService.triggerJob(
      id,
      caseType,
      testCase.script_path,
      callbackUrl
    );

    if (result.success) {
      res.json({
        success: true,
        data: {
          caseId: id,
          caseName: testCase.name,
          status: 'triggered',
          buildUrl: result.buildUrl,
          queueId: result.queueId,
        },
        message: 'Case execution triggered successfully',
      });
    } else {
      res.status(500).json({
        success: false,
        message: result.message,
      });
    }
  } catch (error: unknown) {
    // 增强错误日志记录
    console.error('Database operation failed:', {
      error: error instanceof Error ? error.message : error,
      stack: error instanceof Error ? error.stack : undefined,
      query: sql || 'N/A',
      params: params || 'N/A'
    });

    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ success: false, message });
  }
});

/**
 * POST /api/cases/:id/callback
 * Jenkins 执行回调（预留接口）
 */
router.post('/:id/callback', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { status, duration, errorMessage } = req.body;

    // 检查用例是否存在
    const testCase = await queryOne<{ id: number }>('SELECT id FROM Auto_TestCase WHERE id = ?', [id]);
    if (!testCase) {
      return res.status(404).json({ success: false, message: 'Case not found' });
    }

    // 记录执行结果（可以扩展为写入执行记录表）
    console.log(`Case ${id} execution completed: status=${status}, duration=${duration}ms`);
    if (errorMessage) {
      console.log(`Error: ${errorMessage}`);
    }

    res.json({
      success: true,
      message: 'Callback received successfully',
    });
  } catch (error: unknown) {
    // 增强错误日志记录
    console.error('Database operation failed:', {
      error: error instanceof Error ? error.message : error,
      stack: error instanceof Error ? error.stack : undefined,
      query: sql || 'N/A',
      params: params || 'N/A'
    });

    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ success: false, message });
  }
});

export default router;
