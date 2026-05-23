import { getPool, query, queryOne } from '../../config/database';
import type {
  BrunoRepositoryInput,
  BrunoRepositoryRecord,
  BrunoRequestIndex,
} from '@shared/types/bruno';

interface InsertResult {
  insertId: number;
}

export class BrunoAutomationRepository {
  async createRepository(input: BrunoRepositoryInput): Promise<number> {
    const pool = getPool();
    const [result] = await pool.execute(
      `INSERT INTO Auto_BrunoRepositories
       (name, project_id, git_url, default_branch, collection_root, auth_secret_ref)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        input.name,
        input.projectId,
        input.gitUrl,
        input.defaultBranch,
        input.collectionRoot,
        input.authSecretRef ?? null,
      ],
    );

    return (result as InsertResult).insertId;
  }

  async listRepositories(projectId?: number): Promise<BrunoRepositoryRecord[]> {
    const params: Array<string | number> = [];
    let sql = `
      SELECT id, name, project_id as projectId, git_url as gitUrl,
             default_branch as defaultBranch, collection_root as collectionRoot,
             auth_secret_ref as authSecretRef,
             COALESCE(last_sync_status, 'never') as lastSyncStatus,
             last_sync_commit as lastSyncCommit,
             last_sync_error as lastSyncError,
             created_at as createdAt, updated_at as updatedAt
      FROM Auto_BrunoRepositories
      WHERE 1=1
    `;

    if (projectId !== undefined) {
      sql += ' AND project_id = ?';
      params.push(projectId);
    }

    sql += ' ORDER BY updated_at DESC';
    return query<BrunoRepositoryRecord[]>(sql, params);
  }

  async getRepository(id: number): Promise<BrunoRepositoryRecord | null> {
    return queryOne<BrunoRepositoryRecord>(
      `SELECT id, name, project_id as projectId, git_url as gitUrl,
              default_branch as defaultBranch, collection_root as collectionRoot,
              auth_secret_ref as authSecretRef,
              COALESCE(last_sync_status, 'never') as lastSyncStatus,
              last_sync_commit as lastSyncCommit,
              last_sync_error as lastSyncError,
              created_at as createdAt, updated_at as updatedAt
       FROM Auto_BrunoRepositories
       WHERE id = ?`,
      [id],
    );
  }

  async listCollections(filters: { repositoryId?: number; projectId?: number }): Promise<Array<{
    id: number;
    repositoryId: number;
    projectId: number;
    name: string;
    relativePath: string;
    requestCount: number;
    lastSyncCommit: string | null;
  }>> {
    const params: number[] = [];
    let sql = `
      SELECT id, repository_id as repositoryId, project_id as projectId,
             name, relative_path as relativePath, request_count as requestCount,
             last_sync_commit as lastSyncCommit
      FROM Auto_BrunoCollections
      WHERE 1=1
    `;

    if (filters.repositoryId !== undefined) {
      sql += ' AND repository_id = ?';
      params.push(filters.repositoryId);
    }
    if (filters.projectId !== undefined) {
      sql += ' AND project_id = ?';
      params.push(filters.projectId);
    }

    sql += ' ORDER BY updated_at DESC';
    return query(sql, params);
  }

  async replaceRequestIndex(input: {
    repositoryId: number;
    collectionName: string;
    collectionPath: string;
    projectId: number;
    syncCommit: string;
    requests: BrunoRequestIndex[];
  }): Promise<void> {
    const pool = getPool();
    await pool.execute('DELETE FROM Auto_BrunoRequests WHERE collection_id IN (SELECT id FROM Auto_BrunoCollections WHERE repository_id = ?)', [input.repositoryId]);
    await pool.execute('DELETE FROM Auto_BrunoCollections WHERE repository_id = ?', [input.repositoryId]);

    const [collectionResult] = await pool.execute(
      `INSERT INTO Auto_BrunoCollections
       (repository_id, project_id, name, relative_path, format, request_count, environment_count, tags_json, last_sync_commit)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        input.repositoryId,
        input.projectId,
        input.collectionName,
        input.collectionPath,
        'bru',
        input.requests.length,
        0,
        JSON.stringify([...new Set(input.requests.flatMap((request) => request.tags))]),
        input.syncCommit,
      ],
    );

    const collectionId = (collectionResult as InsertResult).insertId;
    for (const request of input.requests) {
      await pool.execute(
        `INSERT INTO Auto_BrunoRequests
         (collection_id, name, method, relative_path, folder_path, url_template, tags_json, has_tests, has_scripts)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          collectionId,
          request.name,
          request.method,
          request.relativePath,
          request.folderPath,
          request.urlTemplate,
          JSON.stringify(request.tags),
          request.hasTests ? 1 : 0,
          request.hasScripts ? 1 : 0,
        ],
      );
    }

    await pool.execute(
      `UPDATE Auto_BrunoRepositories
       SET last_sync_commit = ?, last_sync_status = 'success', last_sync_error = NULL
       WHERE id = ?`,
      [input.syncCommit, input.repositoryId],
    );
  }
}
