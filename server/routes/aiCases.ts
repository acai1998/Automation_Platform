import { Router, type Response } from 'express';
import { generalAuthRateLimiter } from '../middleware/authRateLimiter';
import { authenticate } from '../middleware/auth';
import { aiCaseService } from '../services/AiCaseService';
import {
  aiCaseGenerationService,
  type AiCaseGenerationProgressEvent,
} from '../services/AiCaseGenerationService';
import type { AiCaseNodeStatus } from '../services/aiCaseMapBuilder';
import type {
  AiCaseStorageProvider,
  AiCaseSyncSource,
  AiCaseWorkspaceStatus,
} from '../services/AiCaseService';

const router = Router();

const WORKSPACE_STATUS: AiCaseWorkspaceStatus[] = ['draft', 'published', 'archived'];
const WORKSPACE_SYNC_SOURCE: AiCaseSyncSource[] = ['local_import', 'remote_direct', 'mixed'];
const NODE_STATUS: AiCaseNodeStatus[] = ['todo', 'doing', 'blocked', 'passed', 'failed', 'skipped'];
const STORAGE_PROVIDER: AiCaseStorageProvider[] = ['local', 'oss', 's3', 'cos', 'minio'];

function isWorkspaceStatus(value: unknown): value is AiCaseWorkspaceStatus {
  return typeof value === 'string' && WORKSPACE_STATUS.includes(value as AiCaseWorkspaceStatus);
}

function isSyncSource(value: unknown): value is AiCaseSyncSource {
  return typeof value === 'string' && WORKSPACE_SYNC_SOURCE.includes(value as AiCaseSyncSource);
}

function isNodeStatus(value: unknown): value is AiCaseNodeStatus {
  return typeof value === 'string' && NODE_STATUS.includes(value as AiCaseNodeStatus);
}

function isStorageProvider(value: unknown): value is AiCaseStorageProvider {
  return typeof value === 'string' && STORAGE_PROVIDER.includes(value as AiCaseStorageProvider);
}

function parseId(raw: string, label: string): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error(`${label} 必须是正整数`);
  }
  return id;
}

function toNumberOrUndefined(raw: unknown): number | undefined {
  if (raw === undefined || raw === null || raw === '') {
    return undefined;
  }

  const n = Number(raw);
  if (!Number.isFinite(n)) {
    return undefined;
  }

  return n;
}

function getOperatorId(req: Parameters<typeof authenticate>[0]): number {
  if (!req.user?.id) {
    throw new Error('未认证用户');
  }
  return req.user.id;
}

function resolveErrorStatus(message: string): number {
  if (message.includes('版本冲突')) return 409;
  if (message.includes('不存在')) return 404;
  if (message.includes('不能为空') || message.includes('无效') || message.includes('必须')) return 400;
  return 500;
}

function writeSseEvent(res: Response, event: string, payload: unknown): void {
  if (res.writableEnded) {
    return;
  }

  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

router.use(generalAuthRateLimiter);
router.use(authenticate);

/**
 * POST /api/ai-cases/generate
 * 调用大模型生成测试脑图草稿
 */
router.post('/generate', async (req, res) => {
  try {
    const requirementText = typeof req.body?.requirementText === 'string' ? req.body.requirementText.trim() : '';
    const workspaceName = typeof req.body?.workspaceName === 'string' ? req.body.workspaceName.trim() : undefined;
    const persist = req.body?.persist === true;

    if (!requirementText) {
      return res.status(400).json({
        success: false,
        message: 'requirementText 不能为空',
      });
    }

    const generated = await aiCaseGenerationService.generate({
      requirementText,
      workspaceName,
    });

    if (!persist) {
      return res.json({
        success: true,
        data: generated,
      });
    }

    const operatorId = getOperatorId(req);
    const created = await aiCaseService.createWorkspace(
      {
        name: generated.workspaceName,
        projectId: toNumberOrUndefined(req.body?.projectId) ?? null,
        requirementText,
        mapData: generated.mapData,
        status: 'draft',
        syncSource: 'remote_direct',
      },
      operatorId
    );

    res.json({
      success: true,
      data: {
        generated,
        workspace: created,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '生成失败';
    res.status(resolveErrorStatus(message)).json({ success: false, message });
  }
});

/**
 * POST /api/ai-cases/generate/stream
 * 流式返回 AI 生成进度（SSE）
 */
router.post('/generate/stream', async (req, res) => {
  let heartbeat: NodeJS.Timeout | null = null;
  let clientClosed = false;

  try {
    const requirementText = typeof req.body?.requirementText === 'string' ? req.body.requirementText.trim() : '';
    const workspaceName = typeof req.body?.workspaceName === 'string' ? req.body.workspaceName.trim() : undefined;
    const persist = req.body?.persist === true;

    if (!requirementText) {
      return res.status(400).json({
        success: false,
        message: 'requirementText 不能为空',
      });
    }

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    if (typeof res.flushHeaders === 'function') {
      res.flushHeaders();
    }

    req.on('close', () => {
      clientClosed = true;
      if (heartbeat) {
        clearInterval(heartbeat);
        heartbeat = null;
      }
    });

    heartbeat = setInterval(() => {
      if (res.writableEnded || clientClosed) {
        return;
      }
      res.write(': keep-alive\n\n');
    }, 15000);

    const emitProgress = (event: AiCaseGenerationProgressEvent): void => {
      if (clientClosed || res.writableEnded) {
        return;
      }
      writeSseEvent(res, 'progress', event);
    };

    writeSseEvent(res, 'progress', {
      progress: 2,
      stage: '连接已建立，开始处理请求',
      source: 'system',
    });

    const generated = await aiCaseGenerationService.generate(
      {
        requirementText,
        workspaceName,
      },
      emitProgress
    );

    if (persist) {
      const operatorId = getOperatorId(req);
      const created = await aiCaseService.createWorkspace(
        {
          name: generated.workspaceName,
          projectId: toNumberOrUndefined(req.body?.projectId) ?? null,
          requirementText,
          mapData: generated.mapData,
          status: 'draft',
          syncSource: 'remote_direct',
        },
        operatorId
      );

      writeSseEvent(res, 'result', {
        success: true,
        data: {
          generated,
          workspace: created,
        },
      });
    } else {
      writeSseEvent(res, 'result', {
        success: true,
        data: generated,
      });
    }

    writeSseEvent(res, 'done', { success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '生成失败';

    if (!res.headersSent) {
      res.status(resolveErrorStatus(message)).json({ success: false, message });
      return;
    }

    writeSseEvent(res, 'error', {
      success: false,
      message,
    });
    writeSseEvent(res, 'done', { success: false });
  } finally {
    if (heartbeat) {
      clearInterval(heartbeat);
      heartbeat = null;
    }

    if (res.headersSent && !res.writableEnded) {
      res.end();
    }
  }
});

/**
 * GET /api/ai-cases/workspaces
 * 获取工作台列表
 */
router.get('/workspaces', async (req, res) => {
  try {
    const projectId = toNumberOrUndefined(req.query.projectId);
    const limit = toNumberOrUndefined(req.query.limit);
    const offset = toNumberOrUndefined(req.query.offset);
    const status = isWorkspaceStatus(req.query.status) ? req.query.status : undefined;
    const keyword = typeof req.query.keyword === 'string' ? req.query.keyword : undefined;

    const result = await aiCaseService.listWorkspaces({
      projectId,
      status,
      keyword,
      limit,
      offset,
    });

    res.json({ success: true, ...result });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '获取工作台失败';
    res.status(resolveErrorStatus(message)).json({ success: false, message });
  }
});

/**
 * GET /api/ai-cases/workspaces/:id
 * 获取工作台详情
 */
router.get('/workspaces/:id', async (req, res) => {
  try {
    const id = parseId(req.params.id, 'workspaceId');
    const workspace = await aiCaseService.getWorkspaceById(id);

    if (!workspace) {
      return res.status(404).json({ success: false, message: '工作台不存在' });
    }

    res.json({ success: true, data: workspace });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '获取工作台详情失败';
    res.status(resolveErrorStatus(message)).json({ success: false, message });
  }
});

/**
 * POST /api/ai-cases/workspaces
 * 创建工作台
 */
router.post('/workspaces', async (req, res) => {
  try {
    if (typeof req.body?.name !== 'string' || !req.body.name.trim()) {
      return res.status(400).json({ success: false, message: 'name 不能为空' });
    }

    if (!req.body?.mapData) {
      return res.status(400).json({ success: false, message: 'mapData 不能为空' });
    }

    const operatorId = getOperatorId(req);
    const created = await aiCaseService.createWorkspace(
      {
        workspaceKey: typeof req.body.workspaceKey === 'string' ? req.body.workspaceKey.trim() : undefined,
        name: req.body.name,
        projectId: toNumberOrUndefined(req.body.projectId) ?? null,
        requirementText: typeof req.body.requirementText === 'string' ? req.body.requirementText : null,
        mapData: req.body.mapData,
        status: isWorkspaceStatus(req.body.status) ? req.body.status : 'draft',
        syncSource: isSyncSource(req.body.syncSource) ? req.body.syncSource : 'remote_direct',
      },
      operatorId
    );

    res.status(201).json({ success: true, data: created });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '创建工作台失败';
    res.status(resolveErrorStatus(message)).json({ success: false, message });
  }
});

/**
 * PUT /api/ai-cases/workspaces/:id
 * 更新工作台（支持 mapData 覆盖更新）
 */
router.put('/workspaces/:id', async (req, res) => {
  try {
    const id = parseId(req.params.id, 'workspaceId');
    const operatorId = getOperatorId(req);

    const updated = await aiCaseService.updateWorkspace(
      id,
      {
        name: typeof req.body?.name === 'string' ? req.body.name : undefined,
        projectId: req.body?.projectId !== undefined ? toNumberOrUndefined(req.body.projectId) ?? null : undefined,
        requirementText:
          req.body?.requirementText !== undefined && typeof req.body.requirementText === 'string'
            ? req.body.requirementText
            : undefined,
        mapData: req.body?.mapData,
        status: isWorkspaceStatus(req.body?.status) ? req.body.status : undefined,
        syncSource: isSyncSource(req.body?.syncSource) ? req.body.syncSource : undefined,
        expectedVersion: toNumberOrUndefined(req.body?.expectedVersion),
      },
      operatorId
    );

    res.json({ success: true, data: updated });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '更新工作台失败';
    res.status(resolveErrorStatus(message)).json({ success: false, message });
  }
});

/**
 * POST /api/ai-cases/workspaces/:id/node-status
 * 更新节点状态并记录状态流水
 */
router.post('/workspaces/:id/node-status', async (req, res) => {
  try {
    const workspaceId = parseId(req.params.id, 'workspaceId');
    const nodeId = typeof req.body?.nodeId === 'string' ? req.body.nodeId.trim() : '';
    const status = req.body?.status;

    if (!nodeId) {
      return res.status(400).json({ success: false, message: 'nodeId 不能为空' });
    }

    if (!isNodeStatus(status)) {
      return res.status(400).json({ success: false, message: `status 必须是 ${NODE_STATUS.join(' / ')}` });
    }

    const operatorId = getOperatorId(req);
    const result = await aiCaseService.recordNodeStatusChange(
      workspaceId,
      {
        nodeId,
        status,
        comment: typeof req.body?.comment === 'string' ? req.body.comment : undefined,
        meta:
          req.body?.meta && typeof req.body.meta === 'object' && !Array.isArray(req.body.meta)
            ? req.body.meta
            : undefined,
      },
      operatorId
    );

    res.json({ success: true, data: result });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '更新节点状态失败';
    res.status(resolveErrorStatus(message)).json({ success: false, message });
  }
});

/**
 * GET /api/ai-cases/workspaces/:id/node-executions
 * 获取节点状态流水
 */
router.get('/workspaces/:id/node-executions', async (req, res) => {
  try {
    const workspaceId = parseId(req.params.id, 'workspaceId');
    const nodeId = typeof req.query.nodeId === 'string' ? req.query.nodeId.trim() : undefined;
    const limit = toNumberOrUndefined(req.query.limit);
    const offset = toNumberOrUndefined(req.query.offset);

    const result = await aiCaseService.listNodeExecutions(workspaceId, {
      nodeId,
      limit,
      offset,
    });

    res.json({ success: true, ...result });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '获取节点状态流水失败';
    res.status(resolveErrorStatus(message)).json({ success: false, message });
  }
});

/**
 * POST /api/ai-cases/workspaces/:id/attachments
 * 记录节点附件（对象存储元数据）
 */
router.post('/workspaces/:id/attachments', async (req, res) => {
  try {
    const workspaceId = parseId(req.params.id, 'workspaceId');
    const operatorId = getOperatorId(req);

    const nodeId = typeof req.body?.nodeId === 'string' ? req.body.nodeId.trim() : '';
    const fileName = typeof req.body?.fileName === 'string' ? req.body.fileName.trim() : '';
    const storageKey = typeof req.body?.storageKey === 'string' ? req.body.storageKey.trim() : '';

    if (!nodeId || !fileName || !storageKey) {
      return res.status(400).json({ success: false, message: 'nodeId / fileName / storageKey 不能为空' });
    }

    const attachment = await aiCaseService.createAttachment(
      workspaceId,
      {
        nodeId,
        executionLogId: toNumberOrUndefined(req.body?.executionLogId) ?? null,
        fileName,
        mimeType: typeof req.body?.mimeType === 'string' ? req.body.mimeType : null,
        fileSize: toNumberOrUndefined(req.body?.fileSize),
        storageProvider: isStorageProvider(req.body?.storageProvider) ? req.body.storageProvider : 'oss',
        storageBucket: typeof req.body?.storageBucket === 'string' ? req.body.storageBucket : null,
        storageKey,
        accessUrl: typeof req.body?.accessUrl === 'string' ? req.body.accessUrl : null,
        checksumSha256: typeof req.body?.checksumSha256 === 'string' ? req.body.checksumSha256 : null,
      },
      operatorId
    );

    res.status(201).json({ success: true, data: attachment });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '创建附件失败';
    res.status(resolveErrorStatus(message)).json({ success: false, message });
  }
});

/**
 * GET /api/ai-cases/workspaces/:id/attachments
 * 获取工作台附件列表
 */
router.get('/workspaces/:id/attachments', async (req, res) => {
  try {
    const workspaceId = parseId(req.params.id, 'workspaceId');
    const result = await aiCaseService.listAttachments(workspaceId, {
      nodeId: typeof req.query.nodeId === 'string' ? req.query.nodeId : undefined,
      limit: toNumberOrUndefined(req.query.limit),
      offset: toNumberOrUndefined(req.query.offset),
    });

    res.json({ success: true, ...result });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '获取附件列表失败';
    res.status(resolveErrorStatus(message)).json({ success: false, message });
  }
});

/**
 * DELETE /api/ai-cases/attachments/:attachmentId
 * 软删除附件
 */
router.delete('/attachments/:attachmentId', async (req, res) => {
  try {
    const attachmentId = parseId(req.params.attachmentId, 'attachmentId');
    await aiCaseService.deleteAttachment(attachmentId);
    res.json({ success: true, message: '附件已删除' });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '删除附件失败';
    res.status(resolveErrorStatus(message)).json({ success: false, message });
  }
});

export default router;
