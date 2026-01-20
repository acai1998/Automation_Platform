import { query, queryOne, getPool } from '../config/database';
import { repositoryService, RepositoryConfig, ScriptFileInfo, ParsedTestCase } from './RepositoryService';
import { scriptParserService } from './ScriptParserService';

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
  private async createSyncLog(
    repoConfigId: number,
    syncType: 'manual' | 'scheduled' | 'webhook',
    triggeredBy?: number
  ): Promise<number> {
    const pool = getPool();
    const [result] = await pool.execute(`
      INSERT INTO sync_logs (repo_config_id, sync_type, status, start_time, triggered_by)
      VALUES (?, ?, 'pending', NOW(), ?)
    `, [repoConfigId, syncType, triggeredBy || null]);

    const insertResult = result as { insertId: number };
    return insertResult.insertId;
  }

  /**
   * 更新同步日志
   */
  private async updateSyncLog(
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
  ): Promise<void> {
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
    const pool = getPool();
    await pool.execute(`UPDATE sync_logs SET ${updates.join(', ')} WHERE id = ?`, params);
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
    const logId = await this.createSyncLog(repoConfigId, syncType, triggeredBy);

    try {
      // 1. 获取仓库配置
      const config = await repositoryService.getRepositoryConfig(repoConfigId);
      if (!config) {
        throw new Error(`Repository configuration not found: ${repoConfigId}`);
      }

      await this.updateSyncLog(logId, { status: 'running' });

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

      // 根据仓库名称推断用例类型（如果仓库名称包含类型关键词）
      const inferCaseType = (repoName: string): 'api' | 'ui' | 'performance' => {
        const name = repoName.toLowerCase();
        if (name.includes('ui') || name.includes('界面') || name.includes('ui测试')) {
          return 'ui';
        }
        if (name.includes('performance') || name.includes('性能') || name.includes('压测')) {
          return 'performance';
        }
        return 'api'; // 默认为 API
      };

      const caseType = inferCaseType(config.name);

      if (config.auto_create_cases) {
        for (const scriptFile of scriptFiles) {
          const parsedCases = await scriptParserService.parseScript(scriptFile, config.script_type);

          for (const parsedCase of parsedCases) {
            // 设置用例类型
            parsedCase.type = caseType;

            // 获取 pytest 完整路径（如果存在），否则使用文件路径
            const scriptPath = (parsedCase.configJson?.fullPath as string) || scriptFile.path;

            const result = await this.createOrUpdateCase(repoConfigId, scriptPath, parsedCase);
            if (result === 'created') createdCases++;
            else if (result === 'updated') updatedCases++;
          }
        }
      }

      // 6. 更新仓库配置的最后同步时间
      await repositoryService.updateRepositoryConfig(repoConfigId, {
        last_sync_at: new Date().toISOString(),
        last_sync_status: 'success',
        status: 'active',
      });

      // 7. 完成同步
      const duration = Math.floor((Date.now() - startTime) / 1000);
      await this.updateSyncLog(logId, {
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
      await repositoryService.updateRepositoryConfig(repoConfigId, {
        last_sync_at: new Date().toISOString(),
        last_sync_status: 'failed',
        status: 'error',
      });

      // 更新同步日志
      await this.updateSyncLog(logId, {
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
    // 获取上次同步的脚本映射
    const previousMappings = await query<Array<{ script_file_path: string; script_hash: string }>>(
      'SELECT script_file_path, script_hash FROM repository_script_mappings WHERE repo_config_id = ?',
      [repoConfigId]
    );

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
    const pool = getPool();

    // 检查是否已存在映射
    const existingMapping = await queryOne<{ case_id: number }>(
      'SELECT case_id FROM repository_script_mappings WHERE repo_config_id = ? AND script_file_path = ?',
      [repoConfigId, scriptPath]
    );

    if (existingMapping && existingMapping.case_id) {
      // 更新已存在的用例
      await pool.execute(`
        UPDATE Auto_TestCase
        SET name = ?, description = ?, module = ?, priority = ?, type = ?, tags = ?, config_json = ?
        WHERE id = ?
      `, [
        parsedCase.name,
        parsedCase.description || null,
        parsedCase.module || null,
        parsedCase.priority || 'P1',
        parsedCase.type || 'api',
        parsedCase.tags ? parsedCase.tags.join(',') : null,
        JSON.stringify(parsedCase.configJson || {}),
        existingMapping.case_id,
      ]);

      return 'updated';
    }

    // 创建新用例
    const [result] = await pool.execute(`
      INSERT INTO Auto_TestCase (name, description, module, priority, type, tags, script_path, config_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      parsedCase.name,
      parsedCase.description || null,
      parsedCase.module || null,
      parsedCase.priority || 'P1',
      parsedCase.type || 'api',
      parsedCase.tags ? parsedCase.tags.join(',') : null,
      scriptPath,
      JSON.stringify(parsedCase.configJson || {}),
    ]);

    const insertResult = result as { insertId: number };
    const caseId = insertResult.insertId;

    // 创建脚本与用例的映射
    await pool.execute(`
      INSERT INTO repository_script_mappings (repo_config_id, case_id, script_file_path, status)
      VALUES (?, ?, ?, 'synced')
    `, [repoConfigId, caseId, scriptPath]);

    return 'created';
  }

  /**
   * 获取同步日志
   */
  async getSyncLog(logId: number): Promise<SyncLog | null> {
    const log = await queryOne<SyncLog>('SELECT * FROM sync_logs WHERE id = ?', [logId]);
    return log || null;
  }

  /**
   * 获取仓库的同步日志列表
   */
  async getRepositorySyncLogs(repoConfigId: number, limit = 20, offset = 0): Promise<SyncLog[]> {
    return query<SyncLog[]>(`
      SELECT * FROM sync_logs
      WHERE repo_config_id = ?
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `, [repoConfigId, limit, offset]);
  }

  /**
   * 获取仓库同步日志总数
   */
  async getRepositorySyncLogsCount(repoConfigId: number): Promise<number> {
    const result = await queryOne<{ count: number }>(
      'SELECT COUNT(*) as count FROM sync_logs WHERE repo_config_id = ?',
      [repoConfigId]
    );
    return result?.count ?? 0;
  }
}

// 导出单例
export const repositorySyncService = new RepositorySyncService();
