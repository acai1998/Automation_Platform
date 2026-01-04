import { repositoryService } from './RepositoryService.js';
import { repositorySyncService } from './RepositorySyncService.js';
import type { RepositoryConfig } from './RepositoryService.js';

/**
 * 定时任务调度器服务
 * 负责定时同步仓库中的测试脚本
 */
export class SchedulerService {
  private timers: Map<number, NodeJS.Timeout> = new Map();
  private isRunning = false;

  /**
   * 启动所有定时任务
   */
  start(): void {
    if (this.isRunning) {
      console.log('Scheduler is already running');
      return;
    }

    console.log('Starting repository sync scheduler...');
    this.isRunning = true;

    // 加载所有活跃的仓库配置
    this.loadAndScheduleRepositories();

    // 每 5 分钟检查一次是否有新的仓库需要调度
    setInterval(() => {
      this.loadAndScheduleRepositories();
    }, 5 * 60 * 1000); // 5 分钟

    console.log('Repository sync scheduler started');
  }

  /**
   * 停止所有定时任务
   */
  stop(): void {
    console.log('Stopping repository sync scheduler...');
    this.isRunning = false;

    // 清除所有定时器
    for (const [repoId, timer] of this.timers.entries()) {
      clearInterval(timer);
      console.log(`Stopped scheduler for repository ${repoId}`);
    }

    this.timers.clear();
    console.log('Repository sync scheduler stopped');
  }

  /**
   * 加载并调度所有需要定时同步的仓库
   * 公开方法，供外部调用（如仓库更新后重新调度）
   */
  async loadAndScheduleRepositories(): Promise<void> {
    try {
      const repositories = await repositoryService.getAllRepositoryConfigs('active');

      for (const repo of repositories) {
        // 只调度设置了同步间隔的仓库（sync_interval > 0）
        if (repo.sync_interval > 0) {
          this.scheduleRepository(repo);
        } else {
          // 如果没有设置同步间隔，移除定时器（如果存在）
          this.unscheduleRepository(repo.id);
        }
      }
    } catch (error) {
      console.error('Error loading repositories for scheduling:', error);
    }
  }

  /**
   * 为单个仓库设置定时同步
   */
  private scheduleRepository(repo: RepositoryConfig): void {
    // 如果已经存在定时器，先清除
    if (this.timers.has(repo.id)) {
      clearInterval(this.timers.get(repo.id)!);
    }

    // 计算同步间隔（分钟转毫秒）
    const intervalMs = repo.sync_interval * 60 * 1000;

    // 创建定时器
    const timer = setInterval(async () => {
      await this.syncRepository(repo);
    }, intervalMs);

    this.timers.set(repo.id, timer);

    console.log(
      `Scheduled sync for repository "${repo.name}" (ID: ${repo.id}) every ${repo.sync_interval} minutes`
    );

    // 如果距离上次同步已经超过间隔时间，立即执行一次
    if (repo.last_sync_at) {
      const lastSyncTime = new Date(repo.last_sync_at).getTime();
      const now = Date.now();
      const timeSinceLastSync = now - lastSyncTime;

      if (timeSinceLastSync >= intervalMs) {
        console.log(`Executing immediate sync for repository "${repo.name}" (ID: ${repo.id})`);
        this.syncRepository(repo).catch((error) => {
          console.error(`Error in immediate sync for repository ${repo.id}:`, error);
        });
      }
    } else {
      // 如果从未同步过，立即执行一次
      console.log(`Executing initial sync for repository "${repo.name}" (ID: ${repo.id})`);
      this.syncRepository(repo).catch((error) => {
        console.error(`Error in initial sync for repository ${repo.id}:`, error);
      });
    }
  }

  /**
   * 取消仓库的定时同步
   */
  private unscheduleRepository(repoId: number): void {
    const timer = this.timers.get(repoId);
    if (timer) {
      clearInterval(timer);
      this.timers.delete(repoId);
      console.log(`Unscheduled sync for repository ${repoId}`);
    }
  }

  /**
   * 执行仓库同步
   */
  private async syncRepository(repo: RepositoryConfig): Promise<void> {
    try {
      console.log(`[Scheduler] Starting scheduled sync for repository "${repo.name}" (ID: ${repo.id})`);

      const result = await repositorySyncService.performSync(repo.id, 'scheduled');

      if (result.status === 'success') {
        console.log(
          `[Scheduler] Successfully synced repository "${repo.name}": ` +
            `${result.createdCases} created, ${result.updatedCases} updated cases`
        );
      } else {
        console.error(
          `[Scheduler] Failed to sync repository "${repo.name}": ${result.message}`
        );
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(
        `[Scheduler] Error syncing repository "${repo.name}" (ID: ${repo.id}):`,
        errorMessage
      );
    }
  }

  /**
   * 手动触发某个仓库的同步（不影响定时任务）
   */
  async triggerSync(repoId: number): Promise<void> {
    const repo = await repositoryService.getRepositoryConfig(repoId);
    if (!repo) {
      throw new Error(`Repository ${repoId} not found`);
    }

    await this.syncRepository(repo);
  }

  /**
   * 获取所有已调度的仓库信息
   */
  async getScheduledRepositories(): Promise<Array<{ repoId: number; name: string; interval: number }>> {
    const repositories = await repositoryService.getAllRepositoryConfigs('active');
    return repositories
      .filter((repo) => repo.sync_interval > 0 && this.timers.has(repo.id))
      .map((repo) => ({
        repoId: repo.id,
        name: repo.name,
        interval: repo.sync_interval,
      }));
  }
}

// 导出单例
export const schedulerService = new SchedulerService();
