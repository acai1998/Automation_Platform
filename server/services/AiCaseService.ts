import type { ResultSetHeader } from 'mysql2/promise';
import { query, queryOne } from '../config/database';
import logger from '../utils/logger';
import { LOG_CONTEXTS } from '../config/logging';
import {
  calculateWorkspaceCounters,
  normalizeMapData,
  updateNodeStatusInMap,
  type AiCaseMapData,
  type AiCaseNodeStatus,
  type AiCaseWorkspaceCounters,
} from './aiCaseMapBuilder';

export type AiCaseWorkspaceStatus = 'draft' | 'published' | 'archived';
export type AiCaseSyncSource = 'local_import' | 'remote_direct' | 'mixed';
export type AiCaseStorageProvider = 'local' | 'oss' | 's3' | 'cos' | 'minio';

interface AiCaseWorkspaceRow {
  id: number;
  workspace_key: string;
  name: string;
  project_id: number | null;
  requirement_text: string | null;
  map_data: string;
  status: AiCaseWorkspaceStatus;
  sync_source: AiCaseSyncSource;
  version: number;
  total_cases: number;
  todo_cases: number;
  doing_cases: number;
  blocked_cases: number;
  passed_cases: number;
  failed_cases: number;
  skipped_cases: number;
  last_synced_at: string | null;
  created_by: number | null;
  created_by_name?: string | null;
  updated_by: number | null;
  updated_by_name?: string | null;
  created_at: string;
  updated_at: string;
}

interface AiCaseExecutionRow {
  id: number;
  workspace_id: number;
  workspace_version: number;
  node_id: string;
  node_topic: string;
  node_path: string | null;
  previous_status: AiCaseNodeStatus | null;
  current_status: AiCaseNodeStatus;
  operator_id: number | null;
  operator_name?: string | null;
  comment: string | null;
  meta_json: string | null;
  created_at: string;
}

interface AiCaseAttachmentRow {
  id: number;
  workspace_id: number;
  node_id: string;
  execution_log_id: number | null;
  file_name: string;
  mime_type: string | null;
  file_size: number;
  storage_provider: AiCaseStorageProvider;
  storage_bucket: string | null;
  storage_key: string;
  access_url: string | null;
  checksum_sha256: string | null;
  uploaded_by: number | null;
  uploader_name?: string | null;
  created_at: string;
  is_deleted: number;
  deleted_at: string | null;
}

export interface AiCaseWorkspaceSummary {
  id: number;
  workspaceKey: string;
  name: string;
  projectId: number | null;
  requirementText: string | null;
  status: AiCaseWorkspaceStatus;
  syncSource: AiCaseSyncSource;
  version: number;
  counters: AiCaseWorkspaceCounters;
  lastSyncedAt: string | null;
  createdBy: number | null;
  createdByName: string | null;
  updatedBy: number | null;
  updatedByName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AiCaseWorkspaceDetail extends AiCaseWorkspaceSummary {
  mapData: AiCaseMapData;
}

export interface ListAiCaseWorkspacesFilters {
  projectId?: number;
  status?: AiCaseWorkspaceStatus;
  keyword?: string;
  limit?: number;
  offset?: number;
}

export interface CreateAiCaseWorkspaceInput {
  workspaceKey?: string;
  name: string;
  projectId?: number | null;
  requirementText?: string | null;
  mapData: unknown;
  status?: AiCaseWorkspaceStatus;
  syncSource?: AiCaseSyncSource;
}

export interface UpdateAiCaseWorkspaceInput {
  name?: string;
  projectId?: number | null;
  requirementText?: string | null;
  mapData?: unknown;
  status?: AiCaseWorkspaceStatus;
  syncSource?: AiCaseSyncSource;
  expectedVersion?: number;
}

export interface RecordNodeStatusInput {
  nodeId: string;
  status: AiCaseNodeStatus;
  comment?: string;
  meta?: Record<string, unknown>;
}

export interface CreateAttachmentInput {
  nodeId: string;
  executionLogId?: number | null;
  fileName: string;
  mimeType?: string | null;
  fileSize?: number;
  storageProvider?: AiCaseStorageProvider;
  storageBucket?: string | null;
  storageKey: string;
  accessUrl?: string | null;
  checksumSha256?: string | null;
}

export interface ListAttachmentsFilters {
  nodeId?: string;
  limit?: number;
  offset?: number;
}

function generateWorkspaceKey(): string {
  return `ws-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function clampLimit(limit: number | undefined, fallback: number): number {
  if (!limit || Number.isNaN(limit)) {
    return fallback;
  }
  return Math.max(1, Math.min(200, Math.floor(limit)));
}

function clampOffset(offset: number | undefined): number {
  if (!offset || Number.isNaN(offset)) {
    return 0;
  }
  return Math.max(0, Math.floor(offset));
}

function parseMapDataFromRow(raw: string): AiCaseMapData {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return normalizeMapData(parsed);
  } catch (error) {
    throw new Error(`map_data JSON 解析失败: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function toWorkspaceSummary(row: AiCaseWorkspaceRow): AiCaseWorkspaceSummary {
  return {
    id: row.id,
    workspaceKey: row.workspace_key,
    name: row.name,
    projectId: row.project_id,
    requirementText: row.requirement_text,
    status: row.status,
    syncSource: row.sync_source,
    version: row.version,
    counters: {
      totalCases: row.total_cases,
      todoCases: row.todo_cases,
      doingCases: row.doing_cases,
      blockedCases: row.blocked_cases,
      passedCases: row.passed_cases,
      failedCases: row.failed_cases,
      skippedCases: row.skipped_cases,
    },
    lastSyncedAt: row.last_synced_at,
    createdBy: row.created_by,
    createdByName: row.created_by_name ?? null,
    updatedBy: row.updated_by,
    updatedByName: row.updated_by_name ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toExecutionItem(row: AiCaseExecutionRow) {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    workspaceVersion: row.workspace_version,
    nodeId: row.node_id,
    nodeTopic: row.node_topic,
    nodePath: row.node_path,
    previousStatus: row.previous_status,
    currentStatus: row.current_status,
    operatorId: row.operator_id,
    operatorName: row.operator_name ?? null,
    comment: row.comment,
    meta: row.meta_json ? safeJsonParse(row.meta_json) : null,
    createdAt: row.created_at,
  };
}

function toAttachmentItem(row: AiCaseAttachmentRow) {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    nodeId: row.node_id,
    executionLogId: row.execution_log_id,
    fileName: row.file_name,
    mimeType: row.mime_type,
    fileSize: row.file_size,
    storageProvider: row.storage_provider,
    storageBucket: row.storage_bucket,
    storageKey: row.storage_key,
    accessUrl: row.access_url,
    checksumSha256: row.checksum_sha256,
    uploadedBy: row.uploaded_by,
    uploaderName: row.uploader_name ?? null,
    createdAt: row.created_at,
    isDeleted: row.is_deleted === 1,
    deletedAt: row.deleted_at,
  };
}

function safeJsonParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

export class AiCaseService {
  async listWorkspaces(filters: ListAiCaseWorkspacesFilters): Promise<{ data: AiCaseWorkspaceSummary[]; total: number }> {
    const limit = clampLimit(filters.limit, 20);
    const offset = clampOffset(filters.offset);

    let sql = `
      SELECT
        w.*,
        cu.display_name AS created_by_name,
        uu.display_name AS updated_by_name
      FROM Auto_AiCaseWorkspaces w
      LEFT JOIN Auto_Users cu ON w.created_by = cu.id
      LEFT JOIN Auto_Users uu ON w.updated_by = uu.id
      WHERE 1=1
    `;
    let countSql = 'SELECT COUNT(*) AS total FROM Auto_AiCaseWorkspaces w WHERE 1=1';
    const params: Array<string | number> = [];
    const countParams: Array<string | number> = [];

    if (filters.projectId !== undefined) {
      sql += ' AND w.project_id = ?';
      countSql += ' AND w.project_id = ?';
      params.push(filters.projectId);
      countParams.push(filters.projectId);
    }

    if (filters.status) {
      sql += ' AND w.status = ?';
      countSql += ' AND w.status = ?';
      params.push(filters.status);
      countParams.push(filters.status);
    }

    if (filters.keyword?.trim()) {
      const like = `%${filters.keyword.trim()}%`;
      sql += ' AND (w.name LIKE ? OR w.requirement_text LIKE ?)';
      countSql += ' AND (w.name LIKE ? OR w.requirement_text LIKE ?)';
      params.push(like, like);
      countParams.push(like, like);
    }

    sql += ' ORDER BY w.updated_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const [rows, countRows] = await Promise.all([
      query<AiCaseWorkspaceRow[]>(sql, params),
      query<Array<{ total: number }>>(countSql, countParams),
    ]);

    return {
      data: rows.map((row) => toWorkspaceSummary(row)),
      total: countRows[0]?.total ?? 0,
    };
  }

  async getWorkspaceById(id: number): Promise<AiCaseWorkspaceDetail | null> {
    const row = await this.getWorkspaceRowById(id);
    if (!row) {
      return null;
    }

    return {
      ...toWorkspaceSummary(row),
      mapData: parseMapDataFromRow(row.map_data),
    };
  }

  async createWorkspace(input: CreateAiCaseWorkspaceInput, operatorId: number | null): Promise<AiCaseWorkspaceDetail> {
    const name = input.name.trim();
    if (!name) {
      throw new Error('name 不能为空');
    }

    const normalizedMapData = normalizeMapData(input.mapData);
    const counters = calculateWorkspaceCounters(normalizedMapData);
    const workspaceKey = input.workspaceKey?.trim() || generateWorkspaceKey();
    const mapDataJson = JSON.stringify(normalizedMapData);

    const insertResult = await query<ResultSetHeader>(
      `INSERT INTO Auto_AiCaseWorkspaces (
        workspace_key,
        name,
        project_id,
        requirement_text,
        map_data,
        status,
        sync_source,
        version,
        total_cases,
        todo_cases,
        doing_cases,
        blocked_cases,
        passed_cases,
        failed_cases,
        skipped_cases,
        last_synced_at,
        created_by,
        updated_by,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?, ?, NOW(), NOW())`,
      [
        workspaceKey,
        name,
        input.projectId ?? null,
        input.requirementText ?? null,
        mapDataJson,
        input.status ?? 'draft',
        input.syncSource ?? 'remote_direct',
        1,
        counters.totalCases,
        counters.todoCases,
        counters.doingCases,
        counters.blockedCases,
        counters.passedCases,
        counters.failedCases,
        counters.skippedCases,
        operatorId,
        operatorId,
      ]
    );

    const created = await this.getWorkspaceById(insertResult.insertId);
    if (!created) {
      throw new Error('创建工作台成功但读取失败');
    }

    return created;
  }

  async updateWorkspace(id: number, input: UpdateAiCaseWorkspaceInput, operatorId: number | null): Promise<AiCaseWorkspaceDetail> {
    const row = await this.getWorkspaceRowById(id);
    if (!row) {
      throw new Error('工作台不存在');
    }

    if (typeof input.expectedVersion === 'number' && input.expectedVersion !== row.version) {
      throw new Error('工作台版本冲突，请刷新后重试');
    }

    const existingMapData = parseMapDataFromRow(row.map_data);
    const nextMapData = input.mapData !== undefined ? normalizeMapData(input.mapData) : existingMapData;
    const counters = calculateWorkspaceCounters(nextMapData);
    const nextVersion = row.version + 1;

    await query<ResultSetHeader>(
      `UPDATE Auto_AiCaseWorkspaces
       SET name = ?,
           project_id = ?,
           requirement_text = ?,
           map_data = ?,
           status = ?,
           sync_source = ?,
           version = ?,
           total_cases = ?,
           todo_cases = ?,
           doing_cases = ?,
           blocked_cases = ?,
           passed_cases = ?,
           failed_cases = ?,
           skipped_cases = ?,
           last_synced_at = NOW(),
           updated_by = ?,
           updated_at = NOW()
       WHERE id = ?`,
      [
        input.name?.trim() || row.name,
        input.projectId !== undefined ? input.projectId : row.project_id,
        input.requirementText !== undefined ? input.requirementText : row.requirement_text,
        JSON.stringify(nextMapData),
        input.status ?? row.status,
        input.syncSource ?? row.sync_source,
        nextVersion,
        counters.totalCases,
        counters.todoCases,
        counters.doingCases,
        counters.blockedCases,
        counters.passedCases,
        counters.failedCases,
        counters.skippedCases,
        operatorId,
        id,
      ]
    );

    const updated = await this.getWorkspaceById(id);
    if (!updated) {
      throw new Error('更新后读取工作台失败');
    }

    return updated;
  }

  async recordNodeStatusChange(
    workspaceId: number,
    input: RecordNodeStatusInput,
    operatorId: number | null
  ): Promise<{ executionId: number; workspace: AiCaseWorkspaceDetail }> {
    const row = await this.getWorkspaceRowById(workspaceId);
    if (!row) {
      throw new Error('工作台不存在');
    }

    const mapData = parseMapDataFromRow(row.map_data);
    const result = updateNodeStatusInMap(mapData, input.nodeId, input.status);

    if (!result.updated) {
      throw new Error('未找到指定 nodeId');
    }

    const counters = calculateWorkspaceCounters(result.mapData);
    const nextVersion = row.version + 1;

    await query<ResultSetHeader>(
      `UPDATE Auto_AiCaseWorkspaces
       SET map_data = ?,
           version = ?,
           total_cases = ?,
           todo_cases = ?,
           doing_cases = ?,
           blocked_cases = ?,
           passed_cases = ?,
           failed_cases = ?,
           skipped_cases = ?,
           last_synced_at = NOW(),
           updated_by = ?,
           updated_at = NOW()
       WHERE id = ?`,
      [
        JSON.stringify(result.mapData),
        nextVersion,
        counters.totalCases,
        counters.todoCases,
        counters.doingCases,
        counters.blockedCases,
        counters.passedCases,
        counters.failedCases,
        counters.skippedCases,
        operatorId,
        workspaceId,
      ]
    );

    const insertResult = await query<ResultSetHeader>(
      `INSERT INTO Auto_AiCaseNodeExecutions (
        workspace_id,
        workspace_version,
        node_id,
        node_topic,
        node_path,
        previous_status,
        current_status,
        operator_id,
        comment,
        meta_json,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        workspaceId,
        nextVersion,
        input.nodeId,
        result.nodeTopic,
        result.nodePath,
        result.previousStatus,
        result.currentStatus,
        operatorId,
        input.comment ?? null,
        input.meta ? JSON.stringify(input.meta) : null,
      ]
    );

    const workspace = await this.getWorkspaceById(workspaceId);
    if (!workspace) {
      throw new Error('状态更新成功但工作台读取失败');
    }

    return {
      executionId: insertResult.insertId,
      workspace,
    };
  }

  async listNodeExecutions(
    workspaceId: number,
    options: { nodeId?: string; limit?: number; offset?: number }
  ): Promise<{ data: ReturnType<typeof toExecutionItem>[]; total: number }> {
    const limit = clampLimit(options.limit, 50);
    const offset = clampOffset(options.offset);

    let sql = `
      SELECT
        e.*, u.display_name AS operator_name
      FROM Auto_AiCaseNodeExecutions e
      LEFT JOIN Auto_Users u ON e.operator_id = u.id
      WHERE e.workspace_id = ?
    `;
    let countSql = 'SELECT COUNT(*) AS total FROM Auto_AiCaseNodeExecutions WHERE workspace_id = ?';
    const params: Array<string | number> = [workspaceId];
    const countParams: Array<string | number> = [workspaceId];

    if (options.nodeId?.trim()) {
      sql += ' AND e.node_id = ?';
      countSql += ' AND node_id = ?';
      params.push(options.nodeId.trim());
      countParams.push(options.nodeId.trim());
    }

    sql += ' ORDER BY e.created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const [rows, countRows] = await Promise.all([
      query<AiCaseExecutionRow[]>(sql, params),
      query<Array<{ total: number }>>(countSql, countParams),
    ]);

    return {
      data: rows.map((row) => toExecutionItem(row)),
      total: countRows[0]?.total ?? 0,
    };
  }

  async createAttachment(
    workspaceId: number,
    input: CreateAttachmentInput,
    operatorId: number | null
  ): Promise<ReturnType<typeof toAttachmentItem>> {
    if (!input.nodeId.trim()) {
      throw new Error('nodeId 不能为空');
    }
    if (!input.fileName.trim()) {
      throw new Error('fileName 不能为空');
    }
    if (!input.storageKey.trim()) {
      throw new Error('storageKey 不能为空');
    }

    const workspace = await this.getWorkspaceRowById(workspaceId);
    if (!workspace) {
      throw new Error('工作台不存在');
    }

    const insertResult = await query<ResultSetHeader>(
      `INSERT INTO Auto_AiCaseNodeAttachments (
        workspace_id,
        node_id,
        execution_log_id,
        file_name,
        mime_type,
        file_size,
        storage_provider,
        storage_bucket,
        storage_key,
        access_url,
        checksum_sha256,
        uploaded_by,
        created_at,
        is_deleted,
        deleted_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), 0, NULL)`,
      [
        workspaceId,
        input.nodeId.trim(),
        input.executionLogId ?? null,
        input.fileName.trim(),
        input.mimeType ?? null,
        Math.max(0, Math.floor(input.fileSize ?? 0)),
        input.storageProvider ?? 'oss',
        input.storageBucket ?? null,
        input.storageKey.trim(),
        input.accessUrl ?? null,
        input.checksumSha256 ?? null,
        operatorId,
      ]
    );

    const created = await queryOne<AiCaseAttachmentRow>(
      `SELECT
        a.*,
        u.display_name AS uploader_name
       FROM Auto_AiCaseNodeAttachments a
       LEFT JOIN Auto_Users u ON a.uploaded_by = u.id
       WHERE a.id = ?`,
      [insertResult.insertId]
    );

    if (!created) {
      throw new Error('附件创建成功但读取失败');
    }

    return toAttachmentItem(created);
  }

  async listAttachments(workspaceId: number, options: ListAttachmentsFilters): Promise<{ data: ReturnType<typeof toAttachmentItem>[]; total: number }> {
    const limit = clampLimit(options.limit, 50);
    const offset = clampOffset(options.offset);

    let sql = `
      SELECT
        a.*, u.display_name AS uploader_name
      FROM Auto_AiCaseNodeAttachments a
      LEFT JOIN Auto_Users u ON a.uploaded_by = u.id
      WHERE a.workspace_id = ? AND a.is_deleted = 0
    `;
    let countSql = 'SELECT COUNT(*) AS total FROM Auto_AiCaseNodeAttachments WHERE workspace_id = ? AND is_deleted = 0';
    const params: Array<string | number> = [workspaceId];
    const countParams: Array<string | number> = [workspaceId];

    if (options.nodeId?.trim()) {
      sql += ' AND a.node_id = ?';
      countSql += ' AND node_id = ?';
      params.push(options.nodeId.trim());
      countParams.push(options.nodeId.trim());
    }

    sql += ' ORDER BY a.created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const [rows, countRows] = await Promise.all([
      query<AiCaseAttachmentRow[]>(sql, params),
      query<Array<{ total: number }>>(countSql, countParams),
    ]);

    return {
      data: rows.map((row) => toAttachmentItem(row)),
      total: countRows[0]?.total ?? 0,
    };
  }

  async deleteAttachment(attachmentId: number): Promise<void> {
    const result = await query<ResultSetHeader>(
      `UPDATE Auto_AiCaseNodeAttachments
       SET is_deleted = 1,
           deleted_at = NOW()
       WHERE id = ? AND is_deleted = 0`,
      [attachmentId]
    );

    if (result.affectedRows === 0) {
      throw new Error('附件不存在或已删除');
    }
  }

  private async getWorkspaceRowById(id: number): Promise<AiCaseWorkspaceRow | null> {
    const row = await queryOne<AiCaseWorkspaceRow>(
      `SELECT
        w.*,
        cu.display_name AS created_by_name,
        uu.display_name AS updated_by_name
      FROM Auto_AiCaseWorkspaces w
      LEFT JOIN Auto_Users cu ON w.created_by = cu.id
      LEFT JOIN Auto_Users uu ON w.updated_by = uu.id
      WHERE w.id = ?`,
      [id]
    );

    return row;
  }
}

export const aiCaseService = new AiCaseService();
