import { getDatabase } from '../db/index.js';
import { repositoryService, RepositoryConfig, ScriptFileInfo, ParsedTestCase } from './RepositoryService.js';
import { scriptParserService } from './ScriptParserService.js';

export interface SyncLog {
  id: number;
  repo_config_id: number;
  sync_type: 'manual' | 'scheduled' | 'webhook';
  status: 'pending' | 'running' | 'success' | 'failed';
  total_files: number;
  added_files: number;
  modified_files: number;
  deleted_files: number;
  created_cases: number;
  updated_cases: number;
  conflicts_detected: number;
  error_message?: string;
  start_time?: string;
  end_time?: string;
  duration?: number;
  triggered_by?: number;
  created_at: string;
}

export interface SyncResult {
  syncLogId: number;
  status: 'success' | 'failed';
  totalFiles: number;
  addedFiles: number;
  modifiedFiles: number;
  deletedFiles: number;
  createdCases: number;
  updatedCases: number;
  conflicts: number;
  duration: number;
  message: string;
}

/**
 * 仓库同步服务
 * 负责同步逻辑、脚本解析、用例生成、冲突处理等
 */
export class RepositorySyncService {
  /**
   * 创建同步日志记录
   */
  private createSyncLog(
    repoConfigId: number,
    syncType: 'manual' | 'scheduled' | 'webhook',
    triggeredBy?: number
  ): number {
    const db = getDatabase();
    const result = db.prepare(`
      INSERT INTO sync_logs (repo_config_id, sync_type, status, start_time, triggered_by)
      VALUES (?, ?, 'pending', datetime('now'), ?)
    `).run(repoConfigId, syncType, triggeredBy || null);

    return result.lastInsertRowid as number;
  }

  /**
   * 更新同步日志
   */
  private updateSyncLog(
    logId: number,
    data: {
      status?: 'pending' | 'running' | 'success' | 'failed';
      total_files?: number;
      added_files?: number;
      modified_files?: number;
      deleted_files?: number;
      created_cases?: number;
      updated_cases?: number;
      conflicts_detected?: number;
      error_message?: string;
      end_time?: string;
      duration?: number;
    }
  ): void {
    const db = getDatabase();
    const updates: string[] = [];
    const params: unknown[] = [];

    if (data.status !== undefined) {
      updates.push('status = ?');
      params.push(data.status);
    }
    if (data.total_files !== undefined) {
      updates.push('total_files = ?');
      params.push(data.total_files);
    }
    if (data.added_files !== undefined) {
      updates.push('added_files = ?');
      params.push(data.added_files);
    }
    if (data.modified_files !== undefined) {
      updates.push('modified_files = ?');
      params.push(data.modified_files);
    }
    if (data.deleted_files !== undefined) {
      updates.push('deleted_files = ?');
      params.push(data.deleted_files);
    }
    if (data.created_cases !== undefined) {
      updates.push('created_cases = ?');
      params.push(data.created_cases);
    }
    if (data.updated_cases !== undefined) {
      updates.push('updated_cases = ?');
      params.push(data.updated_cases);
    }
    if (data.conflicts_detected !== undefined) {
      updates.push('conflicts_detected = ?');
      params.push(data.conflicts_detected);
    }
    if (data.error_message !== undefined) {
      updates.push('error_message = ?');
      params.push(data.error_message);
    }
    if (data.end_time !== undefined) {
      updates.push('end_time = ?');
      params.push(data.end_time);
    }
    if (data.duration !== undefined) {
      updates.push('duration = ?');
      params.push(data.duration);
    }

    if (updates.length === 0) return;

    params.push(logId);
    db.prepare(`UPDATE sync_logs SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  }

  /**
   * 执行同步
   */
  async performSync(
    repoConfigId: number,
    syncType: 'manual' | 'scheduled' | 'webhook' = 'manual',
    triggeredBy?: number
  ): Promise<SyncResult> {
    const startTime = Date.now();
    const logId = this.createSyncLog(repoConfigId, syncType, triggeredBy);

    try {
      // 1. 获取仓库配置
      const config = repositoryService.getRepositoryConfig(repoConfigId);
      if (!config) {
        throw new Error(`Repository configuration not found: ${repoConfigId}`);
      }

      this.updateSyncLog(logId, { status: 'running' });

      // 2. 同步仓库
      await repositoryService.syncRepository(config);

      // 3. 扫描脚本文件
      const scriptFiles = await repositoryService.scanScriptFiles(config);

      // 4. 检测文件变更
      const { addedFiles, modifiedFiles, deletedFiles } = await this.detectFileChanges(
        repoConfigId,
        scriptFiles
      );

      // 5. 解析脚本并创建/更新用例
      let createdCases = 0;
      let updatedCases = 0;

      if (config.auto_create_cases) {
        for (const scriptFile of scriptFiles) {
          const parsedCases = await scriptParserService.parseScript(scriptFile, config.script_type);

          for (const parsedCase of parsedCases) {
            const result = await this.createOrUpdateCase(repoConfigId, scriptFile.path, parsedCase);
            if (result === 'created') createdCases++;
            else if (result === 'updated') updatedCases++;
          }
        }
      }

      // 6. 更新仓库配置的最后同步时间
      repositoryService.updateRepositoryConfig(repoConfigId, {
        last_sync_at: new Date().toISOString(),
        last_sync_status: 'success',
        status: 'active',
      });

      // 7. 完成同步
      const duration = Math.floor((Date.now() - startTime) / 1000);
      this.updateSyncLog(logId, {
        status: 'success',
        total_files: scriptFiles.length,
        added_files: addedFiles.length,
        modified_files: modifiedFiles.length,
        deleted_files: deletedFiles.length,
        created_cases: createdCases,
        updated_cases: updatedCases,
        end_time: new Date().toISOString(),
        duration,
      });

      return {
        syncLogId: logId,
        status: 'success',
        totalFiles: scriptFiles.length,
        addedFiles: addedFiles.length,
        modifiedFiles: modifiedFiles.length,
        deletedFiles: deletedFiles.length,
        createdCases,
        updatedCases,
        conflicts: 0,
        duration,
        message: 'Sync completed successfully',
      };
    } catch (error) {
      const duration = Math.floor((Date.now() - startTime) / 1000);
      const errorMessage = error instanceof Error ? error.message : String(error);

      // 更新仓库配置状态为错误
      repositoryService.updateRepositoryConfig(repoConfigId, {
        last_sync_at: new Date().toISOString(),
        last_sync_status: 'failed',
        status: 'error',
      });

      // 更新同步日志
      this.updateSyncLog(logId, {
        status: 'failed',
        error_message: errorMessage,
        end_time: new Date().toISOString(),
        duration,
      });

      return {
        syncLogId: logId,
        status: 'failed',
        totalFiles: 0,
        addedFiles: 0,
        modifiedFiles: 0,
        deletedFiles: 0,
        createdCases: 0,
        updatedCases: 0,
        conflicts: 0,
        duration,
        message: `Sync failed: ${errorMessage}`,
      };
    }
  }

  /**
   * 检测文件变更
   */
  private async detectFileChanges(
    repoConfigId: number,
    currentScriptFiles: ScriptFileInfo[]
  ): Promise<{
    addedFiles: ScriptFileInfo[];
    modifiedFiles: ScriptFileInfo[];
    deletedFiles: ScriptFileInfo[];
  }> {
    const db = getDatabase();

    // 获取上次同步的脚本映射
    const previousMappings = db
      .prepare('SELECT script_file_path, script_hash FROM repository_script_mappings WHERE repo_config_id = ?')
      .all(repoConfigId) as Array<{ script_file_path: string; script_hash: string }>;

    const previousMap = new Map(previousMappings.map(m => [m.script_file_path, m.script_hash]));
    const currentMap = new Map(currentScriptFiles.map(f => [f.path, f.hash]));

    const addedFiles: ScriptFileInfo[] = [];
    const modifiedFiles: ScriptFileInfo[] = [];
    const deletedFiles: ScriptFileInfo[] = [];

    // 检测新增和修改的文件
    for (const scriptFile of currentScriptFiles) {
      const previousHash = previousMap.get(scriptFile.path);
      if (!previousHash) {
        addedFiles.push(scriptFile);
      } else if (previousHash !== scriptFile.hash) {
        modifiedFiles.push(scriptFile);
      }
    }

    // 检测删除的文件
    for (const [path, hash] of previousMap) {
      if (!currentMap.has(path)) {
        deletedFiles.push({ path, content: '', hash, size: 0 });
      }
    }

    return { addedFiles, modifiedFiles, deletedFiles };
  }

  /**
   * 创建或更新用例
   */
  private async createOrUpdateCase(
    repoConfigId: number,
    scriptPath: string,
    parsedCase: ParsedTestCase
  ): Promise<'created' | 'updated' | 'skipped'> {
    const db = getDatabase();

    // 检查是否已存在映射
    const existingMapping = db
      .prepare('SELECT case_id FROM repository_script_mappings WHERE repo_config_id = ? AND script_file_path = ?')
      .get(repoConfigId, scriptPath) as { case_id: number } | undefined;

    if (existingMapping && existingMapping.case_id) {
      // 更新已存在的用例
      db.prepare(`
        UPDATE test_cases
        SET name = ?, description = ?, module = ?, priority = ?, type = ?, tags = ?, config_json = ?
        WHERE id = ?
      `).run(
        parsedCase.name,
        parsedCase.description || null,
        parsedCase.module || null,
        parsedCase.priority || 'P1',
        parsedCase.type || 'api',
        parsedCase.tags ? parsedCase.tags.join(',') : null,
        JSON.stringify(parsedCase.configJson || {}),
        existingMapping.case_id
      );

      return 'updated';
    }

    // 创建新用例
    const result = db.prepare(`
      INSERT INTO test_cases (name, description, module, priority, type, tags, script_path, config_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      parsedCase.name,
      parsedCase.description || null,
      parsedCase.module || null,
      parsedCase.priority || 'P1',
      parsedCase.type || 'api',
      parsedCase.tags ? parsedCase.tags.join(',') : null,
      scriptPath,
      JSON.stringify(parsedCase.configJson || {})
    );

    const caseId = result.lastInsertRowid as number;

    // 创建脚本与用例的映射
    db.prepare(`
      INSERT INTO repository_script_mappings (repo_config_id, case_id, script_file_path, status)
      VALUES (?, ?, ?, 'synced')
    `).run(repoConfigId, caseId, scriptPath);

    return 'created';
  }

  /**
   * 获取同步日志
   */
  getSyncLog(logId: number): SyncLog | null {
    const db = getDatabase();
    const log = db.prepare('SELECT * FROM sync_logs WHERE id = ?').get(logId) as SyncLog | undefined;
    return log || null;
  }

  /**
   * 获取仓库的同步日志列表
   */
  getRepositorySyncLogs(repoConfigId: number, limit = 20, offset = 0): SyncLog[] {
    const db = getDatabase();
    return db
      .prepare(`
        SELECT * FROM sync_logs
        WHERE repo_config_id = ?
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
      `)
      .all(repoConfigId, limit, offset) as SyncLog[];
  }

  /**
   * 获取仓库同步日志总数
   */
  getRepositorySyncLogsCount(repoConfigId: number): number {
    const db = getDatabase();
    const result = db.prepare('SELECT COUNT(*) as count FROM sync_logs WHERE repo_config_id = ?').get(repoConfigId) as {
      count: number;
    };
    return result.count;
  }
}

// 导出单例
export const repositorySyncService = new RepositorySyncService();