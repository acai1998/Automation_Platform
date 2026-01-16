import { simpleGit, SimpleGit } from 'simple-git';
import { promises as fs } from 'fs';
import { join } from 'path';
import { createHash } from 'crypto';
import { glob } from 'glob';
import { query, queryOne, getPool } from '../config/database.js';

export interface RepositoryConfig {
  id: number;
  name: string;
  description?: string;
  repo_url: string;
  branch: string;
  auth_type: 'none' | 'ssh' | 'token';
  credentials_encrypted?: string;
  script_path_pattern?: string;
  script_type: 'javascript' | 'python' | 'java' | 'other';
  status: 'active' | 'inactive' | 'error';
  last_sync_at?: string;
  last_sync_status?: string;
  sync_interval: number;
  auto_create_cases: boolean;
  created_by?: number;
  created_at: string;
  updated_at: string;
}

export interface ScriptFileInfo {
  path: string;
  content: string;
  hash: string;
  size: number;
}

export interface ParsedTestCase {
  name: string;
  description?: string;
  module?: string;
  priority?: 'P0' | 'P1' | 'P2' | 'P3';
  type?: 'api' | 'ui' | 'performance' | 'security';
  tags?: string[];
  configJson?: Record<string, unknown>;
}

/**
 * 仓库服务
 * 负责 Git 仓库操作、文件扫描、脚本解析等
 */
export class RepositoryService {
  private repoDir = join(process.cwd(), 'server', 'repos');

  /**
   * 初始化仓库目录
   */
  async initRepoDir(): Promise<void> {
    try {
      await fs.mkdir(this.repoDir, { recursive: true });
    } catch (error) {
      console.error('Failed to create repo directory:', error);
      throw error;
    }
  }

  /**
   * 获取仓库本地路径
   */
  private getRepoPath(repoId: number): string {
    return join(this.repoDir, `repo-${repoId}`);
  }

  /**
   * 克隆或拉取仓库
   */
  async syncRepository(config: RepositoryConfig): Promise<void> {
    await this.initRepoDir();
    const repoPath = this.getRepoPath(config.id);

    try {
      let git: SimpleGit;

      // 检查仓库是否已存在
      try {
        await fs.access(join(repoPath, '.git'));
        // 仓库已存在，执行拉取
        git = simpleGit(repoPath);
        await git.fetch();
        await git.checkout(config.branch);
        await git.pull('origin', config.branch);
      } catch {
        // 仓库不存在，执行克隆
        git = simpleGit();
        await git.clone(config.repo_url, repoPath, ['--branch', config.branch]);
      }
    } catch (error) {
      console.error(`Failed to sync repository ${config.id}:`, error);
      throw new Error(`Failed to sync repository: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 扫描仓库中的脚本文件
   */
  async scanScriptFiles(config: RepositoryConfig): Promise<ScriptFileInfo[]> {
    const repoPath = this.getRepoPath(config.id);
    const pattern = config.script_path_pattern || '**/*.{js,ts,py,java}';

    try {
      const files = await glob(pattern, {
        cwd: repoPath,
        ignore: ['**/node_modules/**', '**/.git/**', '**/dist/**', '**/.next/**'],
      });

      const scriptFiles: ScriptFileInfo[] = [];

      for (const file of files) {
        const filePath = join(repoPath, file);
        const content = await fs.readFile(filePath, 'utf-8');
        const hash = this.calculateHash(content);
        const stat = await fs.stat(filePath);

        scriptFiles.push({
          path: file,
          content,
          hash,
          size: stat.size,
        });
      }

      return scriptFiles;
    } catch (error) {
      console.error(`Failed to scan script files for repository ${config.id}:`, error);
      throw new Error(`Failed to scan script files: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 计算文件 Hash（用于变更检测）
   */
  private calculateHash(content: string): string {
    return createHash('sha256').update(content).digest('hex');
  }

  /**
   * 获取仓库信息
   */
  async getRepositoryConfig(id: number): Promise<RepositoryConfig | null> {
    const config = await queryOne<RepositoryConfig>('SELECT * FROM Auto_RepositoryConfigs WHERE id = ?', [id]);
    return config || null;
  }

  /**
   * 获取所有仓库配置
   */
  async getAllRepositoryConfigs(status?: string): Promise<RepositoryConfig[]> {
    let sql = 'SELECT * FROM Auto_RepositoryConfigs';
    const params: unknown[] = [];

    if (status) {
      sql += ' WHERE status = ?';
      params.push(status);
    }

    sql += ' ORDER BY created_at DESC';
    return query<RepositoryConfig[]>(sql, params);
  }

  /**
   * 创建仓库配置
   */
  async createRepositoryConfig(data: {
    name: string;
    description?: string;
    repo_url: string;
    branch?: string;
    auth_type?: 'none' | 'ssh' | 'token';
    credentials_encrypted?: string;
    script_path_pattern?: string;
    script_type?: 'javascript' | 'python' | 'java' | 'other';
    sync_interval?: number;
    auto_create_cases?: boolean;
    created_by?: number;
  }): Promise<number> {
    const pool = getPool();

    const [result] = await pool.execute(`
      INSERT INTO Auto_RepositoryConfigs (
        name, description, repo_url, branch, auth_type, credentials_encrypted,
        script_path_pattern, script_type, sync_interval, auto_create_cases, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      data.name,
      data.description || null,
      data.repo_url,
      data.branch || 'main',
      data.auth_type || 'none',
      data.credentials_encrypted || null,
      data.script_path_pattern || null,
      data.script_type || 'javascript',
      data.sync_interval || 0,
      data.auto_create_cases !== false ? 1 : 0,
      data.created_by || null,
    ]);

    const insertResult = result as { insertId: number };
    return insertResult.insertId;
  }

  /**
   * 更新仓库配置
   */
  async updateRepositoryConfig(id: number, data: Partial<RepositoryConfig>): Promise<void> {
    const updates: string[] = [];
    const params: unknown[] = [];

    if (data.name !== undefined) {
      updates.push('name = ?');
      params.push(data.name);
    }
    if (data.description !== undefined) {
      updates.push('description = ?');
      params.push(data.description);
    }
    if (data.repo_url !== undefined) {
      updates.push('repo_url = ?');
      params.push(data.repo_url);
    }
    if (data.branch !== undefined) {
      updates.push('branch = ?');
      params.push(data.branch);
    }
    if (data.status !== undefined) {
      updates.push('status = ?');
      params.push(data.status);
    }
    if (data.script_path_pattern !== undefined) {
      updates.push('script_path_pattern = ?');
      params.push(data.script_path_pattern);
    }
    if (data.script_type !== undefined) {
      updates.push('script_type = ?');
      params.push(data.script_type);
    }
    if (data.sync_interval !== undefined) {
      updates.push('sync_interval = ?');
      params.push(data.sync_interval);
    }
    if (data.auto_create_cases !== undefined) {
      updates.push('auto_create_cases = ?');
      params.push(data.auto_create_cases ? 1 : 0);
    }
    if (data.last_sync_at !== undefined) {
      updates.push('last_sync_at = ?');
      params.push(data.last_sync_at);
    }
    if (data.last_sync_status !== undefined) {
      updates.push('last_sync_status = ?');
      params.push(data.last_sync_status);
    }

    if (updates.length === 0) return;

    params.push(id);
    const pool = getPool();
    await pool.execute(`UPDATE Auto_RepositoryConfigs SET ${updates.join(', ')} WHERE id = ?`, params);
  }

  /**
   * 删除仓库配置
   */
  async deleteRepositoryConfig(id: number): Promise<void> {
    const pool = getPool();
    await pool.execute('DELETE FROM Auto_RepositoryConfigs WHERE id = ?', [id]);

    // 清理本地克隆的仓库
    const repoPath = this.getRepoPath(id);
    try {
      await fs.rm(repoPath, { recursive: true, force: true });
    } catch (error) {
      console.warn(`Failed to clean up repository directory for repo ${id}:`, error);
    }
  }

  /**
   * 测试仓库连接
   */
  async testConnection(repoUrl: string): Promise<boolean> {
    try {
      const git = simpleGit();
      // 尝试获取远程信息
      const remotes = await git.listRemote(['--heads', repoUrl]);
      return remotes.length > 0;
    } catch (error) {
      console.error('Failed to test repository connection:', error);
      return false;
    }
  }

  /**
   * 获取仓库分支列表
   */
  async getBranches(repoUrl: string): Promise<string[]> {
    try {
      const git = simpleGit();
      const branches = await git.listRemote(['--heads', repoUrl]);
      return branches
        .split('\n')
        .filter(line => line.trim())
        .map(line => {
          const match = line.match(/refs\/heads\/(.+)$/);
          return match ? match[1] : '';
        })
        .filter(branch => branch);
    } catch (error) {
      console.error('Failed to get branches:', error);
      return [];
    }
  }
}

// 导出单例
export const repositoryService = new RepositoryService();
