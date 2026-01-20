import { Router } from 'express';
import { AppDataSource } from '../config/dataSource';
import { TestCaseRepository } from '../repositories/TestCaseRepository';
import { jenkinsService, CaseType } from '../services/JenkinsService';
import logger from '../utils/logger';
import { LOG_CONTEXTS, createTimer } from '../config/logging';

const router = Router();
const testCaseRepository = new TestCaseRepository(AppDataSource);

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
  const timer = createTimer();

  try {
    const { projectId, module, enabled, type, search, limit = 50, offset = 0 } = req.query;

    logger.info('Fetching test cases list', {
      filters: { projectId, module, enabled, type, search },
      pagination: { limit, offset },
    }, LOG_CONTEXTS.CASES);

    const options = {
      projectId: projectId ? Number(projectId) : undefined,
      module: module as string | undefined,
      enabled: enabled !== undefined ? (enabled === 'true' || enabled === '1') : undefined,
      type: type as string | undefined,
      search: search as string | undefined,
      limit: Number(limit),
      offset: Number(offset),
    };

    const data = await testCaseRepository.findAllWithUser(options);

    // 如果没有数据,返回空数组和友善提示
    if (!Array.isArray(data) || data.length === 0) {
      return res.json({
        success: true,
        data: [],
        total: 0,
        message: '暂无测试用例数据,请检查筛选条件或联系管理员添加用例'
      });
    }

    // 获取总数
    const total = await testCaseRepository.count(options);

    const duration = timer();
    logger.info('Test cases list fetched successfully', {
      resultCount: data.length,
      total,
      duration: `${duration}ms`,
      hasFilters: !!(projectId || module || enabled !== undefined || type || search),
    }, LOG_CONTEXTS.CASES);

    res.json({ success: true, data, total });
  } catch (error: unknown) {
    const duration = timer();
    logger.errorLog(error, 'Failed to fetch test cases list', {
      endpoint: req.path,
      method: req.method,
      duration: `${duration}ms`,
      query: req.query,
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
    const data = await testCaseRepository.getDistinctModules();

    res.json({ success: true, data });
  } catch (error: unknown) {
    // 增强错误日志记录
    console.error('Database operation failed:', {
      error: error instanceof Error ? error.message : error,
      stack: error instanceof Error ? error.stack : undefined,
      endpoint: '/api/cases/modules/list',
      method: 'GET'
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
      endpoint: '/api/cases/running/list',
      method: 'GET'
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

    const data = await testCaseRepository.findByIdWithUser(id);

    if (!data) {
      return res.status(404).json({ success: false, message: 'Case not found' });
    }

    res.json({ success: true, data });
  } catch (error: unknown) {
    // 增强错误日志记录
    console.error('Database operation failed:', {
      error: error instanceof Error ? error.message : error,
      stack: error instanceof Error ? error.stack : undefined,
      endpoint: req.path,
      method: req.method
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

    const testCase = await testCaseRepository.createTestCase({
      name,
      description,
      module,
      priority,
      type,
      tags,
      configJson: typeof configJson === 'string' ? configJson : JSON.stringify(configJson || {}),
      createdBy,
    });

    res.json({
      success: true,
      data: { id: testCase.id },
      message: 'Case created successfully',
    });
  } catch (error: unknown) {
    // 增强错误日志记录
    console.error('Database operation failed:', {
      error: error instanceof Error ? error.message : error,
      stack: error instanceof Error ? error.stack : undefined,
      endpoint: req.path,
      method: req.method
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

    const updateData: Record<string, unknown> = {};

    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (projectId !== undefined) updateData.projectId = projectId;
    if (module !== undefined) updateData.module = module;
    if (priority !== undefined) updateData.priority = priority;
    if (type !== undefined) updateData.type = type;
    if (enabled !== undefined) updateData.enabled = enabled;
    if (tags !== undefined) updateData.tags = tags;
    if (scriptPath !== undefined) updateData.scriptPath = scriptPath;
    if (configJson !== undefined) {
      updateData.configJson = typeof configJson === 'string' ? configJson : JSON.stringify(configJson);
    }
    updateData.updatedBy = updatedBy;

    await testCaseRepository.updateTestCase(id, updateData);

    res.json({ success: true, message: 'Case updated successfully' });
  } catch (error: unknown) {
    // 增强错误日志记录
    console.error('Database operation failed:', {
      error: error instanceof Error ? error.message : error,
      stack: error instanceof Error ? error.stack : undefined,
      endpoint: req.path,
      method: req.method
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

    await testCaseRepository.deleteTestCase(id);

    res.json({ success: true, message: 'Case deleted successfully' });
  } catch (error: unknown) {
    // 增强错误日志记录
    console.error('Database operation failed:', {
      error: error instanceof Error ? error.message : error,
      stack: error instanceof Error ? error.stack : undefined,
      endpoint: req.path,
      method: req.method
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
    const testCase = await testCaseRepository.findById(id);

    if (!testCase) {
      return res.status(404).json({ success: false, message: 'Case not found' });
    }

    // 检查是否启用
    if (!testCase.enabled) {
      return res.status(400).json({ success: false, message: 'Case is disabled' });
    }

    // 检查是否有脚本路径
    if (!testCase.scriptPath) {
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
      testCase.scriptPath,
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
      endpoint: req.path,
      method: req.method
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
    const testCase = await testCaseRepository.findById(id);
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
      endpoint: req.path,
      method: req.method
    });

    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ success: false, message });
  }
});

export default router;
