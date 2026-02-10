import { executionService } from './ExecutionService';
import { jenkinsStatusService } from './JenkinsStatusService';
import { Auto_TestRunResultsInput } from './ExecutionService';
import logger from '../utils/logger';
import { LOG_CONTEXTS } from '../config/logging';
import { HYBRID_SYNC_CONFIG } from '../config/monitoring';

/**
 * 回调数据接口
 */
export interface CallbackData {
  runId: number;
  status: 'success' | 'failed' | 'aborted' | 'cancelled';
  passedCases: number;
  failedCases: number;
  skippedCases: number;
  durationMs: number;
  results?: Auto_TestRunResultsInput[];
}

/**
 * 监控配置接口
 */
export interface MonitoringConfig {
  callbackTimeout: number;        // 回调超时时间（毫秒）
  pollInterval: number;           // API轮询间隔（毫秒）
  maxPollAttempts: number;        // 最大轮询次数
  consistencyCheckInterval: number; // 状态检查间隔（毫秒）
}

/**
 * 同步状态接口
 */
export interface SyncStatus {
  runId: number;
  status: 'waiting_callback' | 'polling' | 'completed' | 'failed' | 'timeout';
  lastUpdate: Date;
  attempts: number;
  method: 'callback' | 'polling' | 'timeout';
  message: string;
}

/**
 * 混合同步服务
 * 实现Jenkins状态同步的混合策略：
 * 1. 优先使用HTTP回调
 * 2. 回调失败时自动切换到API轮询
 * 3. 超时时自动标记为失败
 */
export class HybridSyncService {
  private config: MonitoringConfig;
  private syncStatuses = new Map<number, SyncStatus>();
  private callbackTimers = new Map<number, NodeJS.Timeout>();
  private pollTimers = new Map<number, NodeJS.Timeout>();

  constructor() {
    // Use centralized configuration optimized for intranet environment
    this.config = {
      callbackTimeout: HYBRID_SYNC_CONFIG.CALLBACK_TIMEOUT,
      pollInterval: HYBRID_SYNC_CONFIG.POLL_INTERVAL_NORMAL, // Default to normal interval
      maxPollAttempts: HYBRID_SYNC_CONFIG.MAX_POLL_ATTEMPTS,
      consistencyCheckInterval: HYBRID_SYNC_CONFIG.CONSISTENCY_CHECK_INTERVAL,
    };

    logger.info('[HybridSyncService] Initialized with config:', {
      callbackTimeout: `${this.config.callbackTimeout}ms`,
      pollInterval: `${this.config.pollInterval}ms`,
      maxPollAttempts: this.config.maxPollAttempts,
      consistencyCheckInterval: `${this.config.consistencyCheckInterval}ms`,
      adaptivePolling: HYBRID_SYNC_CONFIG.ADAPTIVE_POLLING_ENABLED ? 'Enabled' : 'Disabled',
    }, LOG_CONTEXTS.HYBRID_SYNC);

    // Start periodic consistency check
    this.startConsistencyCheck();
  }

  /**
   * 开始监控执行状态
   * 在创建执行记录后调用，开始等待回调
   */
  async startMonitoring(runId: number, options?: Partial<MonitoringConfig>): Promise<void> {
    const config = { ...this.config, ...options };

    logger.info(`Starting hybrid monitoring for runId: ${runId}`, {}, LOG_CONTEXTS.HYBRID_SYNC);

    // 初始化同步状态
    this.syncStatuses.set(runId, {
      runId,
      status: 'waiting_callback',
      lastUpdate: new Date(),
      attempts: 0,
      method: 'callback',
      message: 'Waiting for Jenkins callback'
    });

    // 设置回调超时定时器
    const callbackTimer = setTimeout(() => {
      this.handleCallbackTimeout(runId);
    }, config.callbackTimeout);

    this.callbackTimers.set(runId, callbackTimer);
  }

  /**
   * 处理Jenkins HTTP回调
   * 主要同步策略
   */
  async handleCallback(data: CallbackData): Promise<{ success: boolean; message: string }> {
    const runId = data.runId;

    try {
      logger.info(`Processing callback for runId: ${runId}`, {
        status: data.status,
        passedCases: data.passedCases,
        failedCases: data.failedCases,
        skippedCases: data.skippedCases,
        durationMs: data.durationMs,
        resultsCount: data.results?.length || 0
      }, LOG_CONTEXTS.HYBRID_SYNC);

      // 1. 验证是否在监控中
      const syncStatus = this.syncStatuses.get(runId);
      if (!syncStatus) {
        logger.warn(`Received callback for unmonitored runId: ${runId}`, {}, LOG_CONTEXTS.HYBRID_SYNC);
        // 即使不在监控中，也处理回调
      }

      // 2. 处理回调数据
      await executionService.completeBatchExecution(runId, data);

      // 3. 更新同步状态
      this.updateSyncStatus(runId, {
        status: 'completed',
        method: 'callback',
        message: 'Successfully processed callback'
      });

      // 4. 清理定时器
      this.stopMonitoring(runId);

      logger.info(`Callback processed successfully for runId: ${runId}`, {}, LOG_CONTEXTS.HYBRID_SYNC);

      return {
        success: true,
        message: 'Callback processed successfully'
      };

    } catch (error) {
      logger.error(`Failed to process callback for runId: ${runId}`, {
        error: error instanceof Error ? error.message : String(error)
      }, LOG_CONTEXTS.HYBRID_SYNC);

      this.updateSyncStatus(runId, {
        status: 'failed',
        method: 'callback',
        message: `Callback processing failed: ${error instanceof Error ? error.message : String(error)}`
      });

      return {
        success: false,
        message: `Callback processing failed: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * 处理回调超时
   * 当回调超时时，切换到API轮询策略
   */
  private async handleCallbackTimeout(runId: number): Promise<void> {
    logger.info(`Callback timeout for runId: ${runId}, switching to API polling`, {}, LOG_CONTEXTS.HYBRID_SYNC);

    this.updateSyncStatus(runId, {
      status: 'polling',
      method: 'polling',
      message: 'Callback timeout, started API polling'
    });

    // 清理回调定时器
    const callbackTimer = this.callbackTimers.get(runId);
    if (callbackTimer) {
      clearTimeout(callbackTimer);
      this.callbackTimers.delete(runId);
    }

    // 开始API轮询
    await this.startApiPolling(runId);
  }

  /**
   * Start API polling monitoring
   * Backup sync strategy with adaptive intervals
   */
  private async startApiPolling(runId: number): Promise<void> {
    const syncStatus = this.syncStatuses.get(runId);
    if (!syncStatus) {
      logger.error(`No sync status found for runId: ${runId}`, {}, LOG_CONTEXTS.HYBRID_SYNC);
      return;
    }

    logger.info(`Starting API polling for runId: ${runId}`, {
      adaptivePolling: HYBRID_SYNC_CONFIG.ADAPTIVE_POLLING_ENABLED,
    }, LOG_CONTEXTS.HYBRID_SYNC);

    const pollExecution = async () => {
      try {
        const currentStatus = this.syncStatuses.get(runId);
        if (!currentStatus || currentStatus.status !== 'polling') {
          logger.info(`Stopping polling for runId: ${runId} - status changed`, {}, LOG_CONTEXTS.HYBRID_SYNC);
          return;
        }

        // Check polling attempts limit
        if (currentStatus.attempts >= this.config.maxPollAttempts) {
          logger.info(`Max polling attempts reached for runId: ${runId}`, {}, LOG_CONTEXTS.HYBRID_SYNC);
          await this.handlePollingTimeout(runId);
          return;
        }

        // Execute status sync
        const syncResult = await executionService.syncExecutionStatusFromJenkins(runId);

        this.updateSyncStatus(runId, {
          attempts: currentStatus.attempts + 1,
          message: `Polling attempt ${currentStatus.attempts + 1}: ${syncResult.message}`
        });

        if (syncResult.success) {
          if (syncResult.updated) {
            // Status updated, check if completed
            const isCompleted = syncResult.jenkinsStatus &&
              ['success', 'failed', 'aborted'].includes(syncResult.jenkinsStatus);

            if (isCompleted) {
              logger.info(`Execution completed via polling for runId: ${runId}`, {}, LOG_CONTEXTS.HYBRID_SYNC);
              this.updateSyncStatus(runId, {
                status: 'completed',
                method: 'polling',
                message: `Completed via API polling: ${syncResult.jenkinsStatus}`
              });
              this.stopMonitoring(runId);
              return;
            }
          }

          // Calculate next polling interval using adaptive strategy
          const nextInterval = this.calculatePollInterval(currentStatus.attempts + 1);

          logger.debug(`Scheduling next poll for runId: ${runId}`, {
            attempt: currentStatus.attempts + 1,
            nextInterval: `${nextInterval}ms`,
          }, LOG_CONTEXTS.HYBRID_SYNC);

          // Continue polling
          const pollTimer = setTimeout(pollExecution, nextInterval);
          this.pollTimers.set(runId, pollTimer);
        } else {
          logger.error(`Polling failed for runId: ${runId}: ${syncResult.message}`, {}, LOG_CONTEXTS.HYBRID_SYNC);
          // Continue polling on failure
          const nextInterval = this.calculatePollInterval(currentStatus.attempts + 1);
          const pollTimer = setTimeout(pollExecution, nextInterval);
          this.pollTimers.set(runId, pollTimer);
        }

      } catch (error) {
        logger.error(`Polling error for runId: ${runId}`, {
          error: error instanceof Error ? error.message : String(error)
        }, LOG_CONTEXTS.HYBRID_SYNC);
        this.updateSyncStatus(runId, {
          attempts: (this.syncStatuses.get(runId)?.attempts || 0) + 1,
          message: `Polling error: ${error instanceof Error ? error.message : String(error)}`
        });

        // Continue polling on error
        const nextInterval = this.calculatePollInterval((this.syncStatuses.get(runId)?.attempts || 0) + 1);
        const pollTimer = setTimeout(pollExecution, nextInterval);
        this.pollTimers.set(runId, pollTimer);
      }
    };

    // Start first polling immediately
    await pollExecution();
  }

  /**
   * Calculate adaptive polling interval based on attempt number
   * Uses tiered approach: fast → normal → slow
   *
   * @param attempt - Current attempt number (1-based)
   * @returns Polling interval in milliseconds
   */
  private calculatePollInterval(attempt: number): number {
    if (!HYBRID_SYNC_CONFIG.ADAPTIVE_POLLING_ENABLED) {
      // Use fixed interval if adaptive polling is disabled
      return this.config.pollInterval;
    }

    // Fast polling for initial attempts (1-3): 5s
    if (attempt <= HYBRID_SYNC_CONFIG.FAST_POLL_ATTEMPTS) {
      return HYBRID_SYNC_CONFIG.POLL_INTERVAL_FAST;
    }

    // Normal polling for mid-range attempts (4-8): 10s
    if (attempt <= HYBRID_SYNC_CONFIG.FAST_POLL_ATTEMPTS + HYBRID_SYNC_CONFIG.NORMAL_POLL_ATTEMPTS) {
      return HYBRID_SYNC_CONFIG.POLL_INTERVAL_NORMAL;
    }

    // Slow polling for later attempts (9+): 15s
    return HYBRID_SYNC_CONFIG.POLL_INTERVAL_SLOW;
  }

  /**
   * Calculate total polling duration based on max attempts and adaptive intervals
   *
   * @returns Total duration in milliseconds
   */
  private calculateTotalPollingDuration(): number {
    if (!HYBRID_SYNC_CONFIG.ADAPTIVE_POLLING_ENABLED) {
      // Fixed interval: total = maxAttempts × interval
      return this.config.maxPollAttempts * this.config.pollInterval;
    }

    // Calculate duration for each tier
    const fastAttempts = Math.min(HYBRID_SYNC_CONFIG.FAST_POLL_ATTEMPTS, this.config.maxPollAttempts);
    const fastDuration = fastAttempts * HYBRID_SYNC_CONFIG.POLL_INTERVAL_FAST;

    const normalAttempts = Math.min(
      HYBRID_SYNC_CONFIG.NORMAL_POLL_ATTEMPTS,
      Math.max(0, this.config.maxPollAttempts - HYBRID_SYNC_CONFIG.FAST_POLL_ATTEMPTS)
    );
    const normalDuration = normalAttempts * HYBRID_SYNC_CONFIG.POLL_INTERVAL_NORMAL;

    const slowAttempts = Math.max(
      0,
      this.config.maxPollAttempts - HYBRID_SYNC_CONFIG.FAST_POLL_ATTEMPTS - HYBRID_SYNC_CONFIG.NORMAL_POLL_ATTEMPTS
    );
    const slowDuration = slowAttempts * HYBRID_SYNC_CONFIG.POLL_INTERVAL_SLOW;

    return fastDuration + normalDuration + slowDuration;
  }

  /**
   * Handle polling timeout
   * Fallback strategy: mark as timed out
   */
  private async handlePollingTimeout(runId: number): Promise<void> {
    logger.info(`Polling timeout for runId: ${runId}, marking as timed out`, {}, LOG_CONTEXTS.HYBRID_SYNC);

    try {
      // Calculate total timeout duration based on adaptive polling
      const totalDuration = this.calculateTotalPollingDuration();

      // Mark execution as timed out
      await executionService.completeBatchExecution(runId, {
        status: 'aborted',
        passedCases: 0,
        failedCases: 0,
        skippedCases: 0,
        durationMs: this.config.callbackTimeout + totalDuration,
        results: []
      });

      this.updateSyncStatus(runId, {
        status: 'timeout',
        method: 'timeout',
        message: 'Execution timed out after maximum polling attempts'
      });

      this.stopMonitoring(runId);

    } catch (error) {
      logger.error(`Failed to handle polling timeout for runId: ${runId}`, {
        error: error instanceof Error ? error.message : String(error)
      }, LOG_CONTEXTS.HYBRID_SYNC);

      this.updateSyncStatus(runId, {
        status: 'failed',
        method: 'timeout',
        message: `Failed to handle timeout: ${error instanceof Error ? error.message : String(error)}`
      });
    }
  }

  /**
   * 停止监控
   */
  stopMonitoring(runId: number): void {
    logger.info(`Stopping monitoring for runId: ${runId}`, {}, LOG_CONTEXTS.HYBRID_SYNC);

    // 清理回调定时器
    const callbackTimer = this.callbackTimers.get(runId);
    if (callbackTimer) {
      clearTimeout(callbackTimer);
      this.callbackTimers.delete(runId);
    }

    // 清理轮询定时器
    const pollTimer = this.pollTimers.get(runId);
    if (pollTimer) {
      clearTimeout(pollTimer);
      this.pollTimers.delete(runId);
    }

    // 保留同步状态记录一段时间，用于查询
    setTimeout(() => {
      this.syncStatuses.delete(runId);
    }, 60 * 60 * 1000); // 1小时后删除
  }

  /**
   * 更新同步状态
   */
  private updateSyncStatus(runId: number, updates: Partial<SyncStatus>): void {
    const current = this.syncStatuses.get(runId);
    if (current) {
      this.syncStatuses.set(runId, {
        ...current,
        ...updates,
        lastUpdate: new Date()
      });
    }
  }

  /**
   * 获取同步状态
   */
  getSyncStatus(runId: number): SyncStatus | null {
    return this.syncStatuses.get(runId) || null;
  }

  /**
   * 获取所有同步状态
   */
  getAllSyncStatuses(): SyncStatus[] {
    return Array.from(this.syncStatuses.values());
  }

  /**
   * 验证状态一致性
   * 检查平台状态与Jenkins状态是否一致
   */
  async verifyStatusConsistency(runId?: number): Promise<{
    total: number;
    inconsistent: Array<{
      runId: number;
      platformStatus: string;
      jenkinsStatus: string;
      buildId: string;
      jobName: string;
    }>;
  }> {
    try {
      if (runId) {
        // 验证单个执行的状态一致性
        const result = await executionService.verifyStatusConsistency({ runId });
        return result;
      } else {
        // 验证所有执行的状态一致性
        return await executionService.verifyStatusConsistency({ limit: 50 });
      }
    } catch (error) {
      logger.error('Failed to verify status consistency', {
        error: error instanceof Error ? error.message : String(error)
      }, LOG_CONTEXTS.HYBRID_SYNC);
      return { total: 0, inconsistent: [] };
    }
  }

  /**
   * 手动触发状态同步
   * 用于用户手动重试或管理员维护
   */
  async manualSync(runId: number): Promise<{
    success: boolean;
    message: string;
    updated: boolean;
  }> {
    try {
      logger.info(`Manual sync triggered for runId: ${runId}`, {}, LOG_CONTEXTS.HYBRID_SYNC);

      const syncResult = await executionService.syncExecutionStatusFromJenkins(runId);

      if (syncResult.success && syncResult.updated) {
        // 检查是否需要停止监控
        const isCompleted = syncResult.jenkinsStatus &&
          ['success', 'failed', 'aborted'].includes(syncResult.jenkinsStatus);

        if (isCompleted) {
          this.updateSyncStatus(runId, {
            status: 'completed',
            method: 'callback', // 标记为手动同步
            message: 'Manual sync completed'
          });
          this.stopMonitoring(runId);
        }
      }

      return {
        success: syncResult.success,
        message: syncResult.message,
        updated: syncResult.updated
      };

    } catch (error) {
      console.error(`Manual sync failed for runId: ${runId}:`, error);
      return {
        success: false,
        message: `Manual sync failed: ${error instanceof Error ? error.message : String(error)}`,
        updated: false
      };
    }
  }

  /**
   * 启动定期一致性检查
   * 每隔一段时间检查状态一致性，发现问题自动修复
   */
  private startConsistencyCheck(): void {
    const checkConsistency = async () => {
      try {
        console.log('Running scheduled consistency check...');

        // 1. 检查状态一致性
        const consistencyResult = await this.verifyStatusConsistency();

        if (consistencyResult.inconsistent.length > 0) {
          console.log(`Found ${consistencyResult.inconsistent.length} inconsistent executions`);

          // 2. 尝试修复不一致的状态
          for (const inconsistent of consistencyResult.inconsistent) {
            try {
              const syncResult = await this.manualSync(inconsistent.runId);
              if (syncResult.success && syncResult.updated) {
                console.log(`Fixed inconsistent status for runId: ${inconsistent.runId}`);
              }
            } catch (error) {
              console.error(`Failed to fix inconsistent status for runId: ${inconsistent.runId}:`, error);
            }
          }
        }

        // 3. 检查并处理超时执行
        const timeoutResult = await executionService.checkAndHandleTimeouts();
        if (timeoutResult.checked > 0) {
          console.log(`Timeout check: checked ${timeoutResult.checked}, timed out ${timeoutResult.timedOut}, updated ${timeoutResult.updated}`);
        }

      } catch (error) {
        console.error('Consistency check failed:', error);
      }

      // 安排下次检查
      setTimeout(checkConsistency, this.config.consistencyCheckInterval);
    };

    // 延迟启动第一次检查
    setTimeout(checkConsistency, this.config.consistencyCheckInterval);
  }

  /**
   * 获取监控统计信息
   */
  getMonitoringStats(): {
    totalMonitored: number;
    waitingCallback: number;
    polling: number;
    completed: number;
    failed: number;
    timeout: number;
  } {
    const statuses = Array.from(this.syncStatuses.values());

    return {
      totalMonitored: statuses.length,
      waitingCallback: statuses.filter(s => s.status === 'waiting_callback').length,
      polling: statuses.filter(s => s.status === 'polling').length,
      completed: statuses.filter(s => s.status === 'completed').length,
      failed: statuses.filter(s => s.status === 'failed').length,
      timeout: statuses.filter(s => s.status === 'timeout').length
    };
  }

  /**
   * 更新监控配置
   */
  updateConfig(newConfig: Partial<MonitoringConfig>): void {
    this.config = { ...this.config, ...newConfig };
    console.log('Monitoring config updated:', this.config);
  }

  /**
   * 获取当前监控配置
   */
  getConfig(): MonitoringConfig {
    return { ...this.config };
  }
}

// 导出单例
export const hybridSyncService = new HybridSyncService();