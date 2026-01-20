import { Router } from 'express';
import { repositoryService } from '../services/RepositoryService';
import { repositorySyncService } from '../services/RepositorySyncService';
import { schedulerService } from '../services/SchedulerService';

const router = Router();

/**
 * GET /api/repositories
 * 获取仓库配置列表
 */
router.get('/', async (req, res) => {
  try {
    const { status } = req.query;
    const configs = await repositoryService.getAllRepositoryConfigs(status as string | undefined);
    res.json({ success: true, data: configs });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ success: false, message });
  }
});

/**
 * GET /api/repositories/:id
 * 获取仓库详情
 */
router.get('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const config = await repositoryService.getRepositoryConfig(id);

    if (!config) {
      return res.status(404).json({ success: false, message: 'Repository not found' });
    }

    res.json({ success: true, data: config });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ success: false, message });
  }
});

/**
 * POST /api/repositories
 * 创建新仓库配置
 */
router.post('/', async (req, res) => {
  try {
    const {
      name,
      description,
      repo_url,
      branch,
      auth_type,
      credentials_encrypted,
      script_path_pattern,
      script_type,
      sync_interval,
      auto_create_cases,
      created_by,
    } = req.body;

    if (!name || !repo_url) {
      return res.status(400).json({ success: false, message: 'name and repo_url are required' });
    }

    const id = await repositoryService.createRepositoryConfig({
      name,
      description,
      repo_url,
      branch,
      auth_type,
      credentials_encrypted,
      script_path_pattern,
      script_type,
      sync_interval,
      auto_create_cases,
      created_by,
    });

    // 重新加载调度器（如果设置了同步间隔）
    if (sync_interval && sync_interval > 0) {
      await schedulerService.loadAndScheduleRepositories();
    }

    res.json({
      success: true,
      data: { id },
      message: 'Repository configuration created successfully',
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ success: false, message });
  }
});

/**
 * PUT /api/repositories/:id
 * 更新仓库配置
 */
router.put('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const config = await repositoryService.getRepositoryConfig(id);

    if (!config) {
      return res.status(404).json({ success: false, message: 'Repository not found' });
    }

    await repositoryService.updateRepositoryConfig(id, req.body);

    // 重新加载调度器（同步间隔可能已更改）
    await schedulerService.loadAndScheduleRepositories();

    res.json({ success: true, message: 'Repository configuration updated successfully' });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ success: false, message });
  }
});

/**
 * DELETE /api/repositories/:id
 * 删除仓库配置
 */
router.delete('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const config = await repositoryService.getRepositoryConfig(id);

    if (!config) {
      return res.status(404).json({ success: false, message: 'Repository not found' });
    }

    await repositoryService.deleteRepositoryConfig(id);

    res.json({ success: true, message: 'Repository configuration deleted successfully' });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ success: false, message });
  }
});

/**
 * POST /api/repositories/:id/sync
 * 手动触发同步
 */
router.post('/:id/sync', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { triggeredBy } = req.body;

    const config = await repositoryService.getRepositoryConfig(id);
    if (!config) {
      return res.status(404).json({ success: false, message: 'Repository not found' });
    }

    const result = await repositorySyncService.performSync(id, 'manual', triggeredBy);

    res.json({ success: true, data: result });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ success: false, message });
  }
});

/**
 * GET /api/repositories/:id/sync-logs
 * 获取同步日志列表
 */
router.get('/:id/sync-logs', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { limit = 20, offset = 0 } = req.query;

    const config = await repositoryService.getRepositoryConfig(id);
    if (!config) {
      return res.status(404).json({ success: false, message: 'Repository not found' });
    }

    const logs = await repositorySyncService.getRepositorySyncLogs(id, Number(limit), Number(offset));
    const total = await repositorySyncService.getRepositorySyncLogsCount(id);

    res.json({ success: true, data: logs, total });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ success: false, message });
  }
});

/**
 * GET /api/repositories/:id/sync-logs/:logId
 * 获取同步日志详情
 */
router.get('/:id/sync-logs/:logId', async (req, res) => {
  try {
    const logId = parseInt(req.params.logId);

    const log = await repositorySyncService.getSyncLog(logId);
    if (!log) {
      return res.status(404).json({ success: false, message: 'Sync log not found' });
    }

    res.json({ success: true, data: log });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ success: false, message });
  }
});

/**
 * POST /api/repositories/:id/test-connection
 * 测试仓库连接
 */
router.post('/:id/test-connection', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { repo_url } = req.body;

    const config = await repositoryService.getRepositoryConfig(id);
    const url = repo_url || config?.repo_url;
    if (!url) {
      return res.status(400).json({ success: false, message: 'repo_url is required' });
    }

    const connected = await repositoryService.testConnection(url);

    res.json({ success: true, data: { connected } });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ success: false, message });
  }
});

/**
 * GET /api/repositories/:id/branches
 * 获取仓库分支列表
 */
router.get('/:id/branches', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const config = await repositoryService.getRepositoryConfig(id);

    if (!config) {
      return res.status(404).json({ success: false, message: 'Repository not found' });
    }

    const branches = await repositoryService.getBranches(config.repo_url);

    res.json({ success: true, data: branches });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ success: false, message });
  }
});

export default router;
