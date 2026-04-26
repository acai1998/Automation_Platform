import { executionService } from '../ExecutionService';
import { jenkinsStatusService } from '../JenkinsStatusService';
import logger from '../../utils/logger';
import { LOG_CONTEXTS } from '../../config/logging';
import { HYBRID_SYNC_CONFIG } from '../../config/monitoring';
import { calculatePollInterval, calculateTotalPollingDuration } from './polling';
import type { CallbackData, MonitoringConfig, SyncStatus } from './types';

/**
 * 娣峰悎鍚屾鏈嶅姟
 * 瀹炵幇Jenkins鐘舵€佸悓姝ョ殑娣峰悎绛栫暐锛?
 * 1. 浼樺厛浣跨敤HTTP鍥炶皟
 * 2. 鍥炶皟澶辫触鏃惰嚜鍔ㄥ垏鎹㈠埌API杞
 * 3. 瓒呮椂鏃惰嚜鍔ㄦ爣璁颁负澶辫触
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
   * 寮€濮嬬洃鎺ф墽琛岀姸鎬?
   * 鍦ㄥ垱寤鸿繍琛岃褰曞悗璋冪敤锛屽紑濮嬬瓑寰呭洖璋?
   */
  async startMonitoring(runId: number, options?: Partial<MonitoringConfig>): Promise<void> {
    const config = { ...this.config, ...options };

    logger.info(`Starting hybrid monitoring for runId: ${runId}`, {}, LOG_CONTEXTS.HYBRID_SYNC);

    // 鍒濆鍖栧悓姝ョ姸鎬?
    this.syncStatuses.set(runId, {
      runId,
      status: 'waiting_callback',
      lastUpdate: new Date(),
      attempts: 0,
      method: 'callback',
      message: 'Waiting for Jenkins callback'
    });

    // 璁剧疆鍥炶皟瓒呮椂瀹氭椂鍣?
    const callbackTimer = setTimeout(() => {
      this.handleCallbackTimeout(runId);
    }, config.callbackTimeout);

    this.callbackTimers.set(runId, callbackTimer);
  }

  /**
   * 澶勭悊Jenkins HTTP鍥炶皟
   * 涓昏鍚屾绛栫暐
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

      // 1. 楠岃瘉鏄惁鍦ㄧ洃鎺т腑
      const syncStatus = this.syncStatuses.get(runId);
      if (!syncStatus) {
        logger.warn(`Received callback for unmonitored runId: ${runId}`, {}, LOG_CONTEXTS.HYBRID_SYNC);
        // 鍗充娇涓嶅湪鐩戞帶涓紝涔熷鐞嗗洖璋?
      }

      // 2. 澶勭悊鍥炶皟鏁版嵁
      await executionService.completeBatchExecution(runId, data);

      // 3. 鏇存柊鍚屾鐘舵€?
      this.updateSyncStatus(runId, {
        status: 'completed',
        method: 'callback',
        message: 'Successfully processed callback'
      });

      // 4. 娓呯悊瀹氭椂鍣?
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
   * 澶勭悊鍥炶皟瓒呮椂
   * 褰撳洖璋冭秴鏃舵椂锛屽垏鎹㈠埌API杞绛栫暐
   */
  private async handleCallbackTimeout(runId: number): Promise<void> {
    logger.info(`Callback timeout for runId: ${runId}, switching to API polling`, {}, LOG_CONTEXTS.HYBRID_SYNC);

    this.updateSyncStatus(runId, {
      status: 'polling',
      method: 'polling',
      message: 'Callback timeout, started API polling'
    });

    // 娓呯悊鍥炶皟瀹氭椂鍣?
    const callbackTimer = this.callbackTimers.get(runId);
    if (callbackTimer) {
      clearTimeout(callbackTimer);
      this.callbackTimers.delete(runId);
    }

    // 寮€濮婣PI杞
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
   * Uses tiered approach: fast 鈫?normal 鈫?slow
   *
   * @param attempt - Current attempt number (1-based)
   * @returns Polling interval in milliseconds
   */
  private calculatePollInterval(attempt: number): number {
    return calculatePollInterval(attempt, this.config.pollInterval);
  }

  /**
   * Calculate total polling duration based on max attempts and adaptive intervals
   *
   * @returns Total duration in milliseconds
   */
  private calculateTotalPollingDuration(): number {
    return calculateTotalPollingDuration(this.config.maxPollAttempts, this.config.pollInterval);
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
   * 鍋滄鐩戞帶
   */
  stopMonitoring(runId: number): void {
    logger.info(`Stopping monitoring for runId: ${runId}`, {}, LOG_CONTEXTS.HYBRID_SYNC);

    // 娓呯悊鍥炶皟瀹氭椂鍣?
    const callbackTimer = this.callbackTimers.get(runId);
    if (callbackTimer) {
      clearTimeout(callbackTimer);
      this.callbackTimers.delete(runId);
    }

    // 娓呯悊杞瀹氭椂鍣?
    const pollTimer = this.pollTimers.get(runId);
    if (pollTimer) {
      clearTimeout(pollTimer);
      this.pollTimers.delete(runId);
    }

    // 淇濈暀鍚屾鐘舵€佽褰曚竴娈垫椂闂达紝鐢ㄤ簬鏌ヨ
    setTimeout(() => {
      this.syncStatuses.delete(runId);
    }, 60 * 60 * 1000); // 1灏忔椂鍚庡垹闄?
  }

  /**
   * 鏇存柊鍚屾鐘舵€?
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
   * 鑾峰彇鍚屾鐘舵€?
   */
  getSyncStatus(runId: number): SyncStatus | null {
    return this.syncStatuses.get(runId) || null;
  }

  /**
   * 鑾峰彇鎵€鏈夊悓姝ョ姸鎬?
   */
  getAllSyncStatuses(): SyncStatus[] {
    return Array.from(this.syncStatuses.values());
  }

  /**
   * 楠岃瘉鐘舵€佷竴鑷存€?
   * 妫€鏌ュ钩鍙扮姸鎬佷笌Jenkins鐘舵€佹槸鍚︿竴鑷?
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
        // 楠岃瘉鍗曚釜鎵ц鐨勭姸鎬佷竴鑷存€?
        const result = await executionService.verifyStatusConsistency({ runId });
        return result;
      } else {
        // 楠岃瘉鎵€鏈夋墽琛岀殑鐘舵€佷竴鑷存€?
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
   * 鎵嬪姩瑙﹀彂鐘舵€佸悓姝?
   * 鐢ㄤ簬鐢ㄦ埛鎵嬪姩閲嶈瘯鎴栫鐞嗗憳缁存姢
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
        // 妫€鏌ユ槸鍚﹂渶瑕佸仠姝㈢洃鎺?
        const isCompleted = syncResult.jenkinsStatus &&
          ['success', 'failed', 'aborted'].includes(syncResult.jenkinsStatus);

        if (isCompleted) {
          this.updateSyncStatus(runId, {
            status: 'completed',
            method: 'callback', // 鏍囪涓烘墜鍔ㄥ悓姝?
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
      logger.errorLog(error, 'Hybrid manual sync failed', {
        event: 'HYBRID_MANUAL_SYNC_FAILED',
        runId,
      });
      return {
        success: false,
        message: `Manual sync failed: ${error instanceof Error ? error.message : String(error)}`,
        updated: false
      };
    }
  }

  /**
   * 鍚姩瀹氭湡涓€鑷存€ф鏌?
   * 姣忛殧涓€娈垫椂闂存鏌ョ姸鎬佷竴鑷存€э紝鍙戠幇闂鑷姩淇
   */
  private startConsistencyCheck(): void {
    const checkConsistency = async () => {
      try {
        logger.debug('Running scheduled consistency check', {
          event: 'HYBRID_CONSISTENCY_CHECK_STARTED',
        }, LOG_CONTEXTS.HYBRID_SYNC);

        // 1. 妫€鏌ョ姸鎬佷竴鑷存€?
        const consistencyResult = await this.verifyStatusConsistency();

        if (consistencyResult.inconsistent.length > 0) {
          logger.warn('Found inconsistent executions during scheduled check', {
            event: 'HYBRID_CONSISTENCY_INCONSISTENT_FOUND',
            inconsistentCount: consistencyResult.inconsistent.length,
          }, LOG_CONTEXTS.HYBRID_SYNC);

          // 2. 灏濊瘯淇涓嶄竴鑷寸殑鐘舵€?
          for (const inconsistent of consistencyResult.inconsistent) {
            try {
              const syncResult = await this.manualSync(inconsistent.runId);
              if (syncResult.success && syncResult.updated) {
                logger.info('Fixed inconsistent execution status', {
                  event: 'HYBRID_CONSISTENCY_FIXED',
                  runId: inconsistent.runId,
                }, LOG_CONTEXTS.HYBRID_SYNC);
              }
            } catch (error) {
              logger.errorLog(error, 'Failed to fix inconsistent execution status', {
                event: 'HYBRID_CONSISTENCY_FIX_FAILED',
                runId: inconsistent.runId,
              });
            }
          }
        }

        // 3. 妫€鏌ュ苟澶勭悊瓒呮椂鎵ц
        const timeoutResult = await executionService.checkAndHandleTimeouts();
        if (timeoutResult.checked > 0) {
          logger.info('Timeout check completed', {
            event: 'HYBRID_TIMEOUT_CHECK_COMPLETED',
            checked: timeoutResult.checked,
            timedOut: timeoutResult.timedOut,
            updated: timeoutResult.updated,
          }, LOG_CONTEXTS.HYBRID_SYNC);
        }

      } catch (error) {
        logger.errorLog(error, 'Scheduled consistency check failed', {
          event: 'HYBRID_CONSISTENCY_CHECK_FAILED',
        });
      }

      // 瀹夋帓涓嬫妫€鏌?
      setTimeout(checkConsistency, this.config.consistencyCheckInterval);
    };

    // 寤惰繜鍚姩绗竴娆℃鏌?
    setTimeout(checkConsistency, this.config.consistencyCheckInterval);
  }

  /**
   * 鑾峰彇鐩戞帶缁熻淇℃伅
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
   * 鏇存柊鐩戞帶閰嶇疆
   */
  updateConfig(newConfig: Partial<MonitoringConfig>): void {
    this.config = { ...this.config, ...newConfig };
    logger.info('Hybrid monitoring config updated', {
      event: 'HYBRID_CONFIG_UPDATED',
      config: this.config,
    }, LOG_CONTEXTS.HYBRID_SYNC);
  }

  /**
   * 鑾峰彇褰撳墠鐩戞帶閰嶇疆
   */
  getConfig(): MonitoringConfig {
    return { ...this.config };
  }
}

// 瀵煎嚭鍗曚緥
export const hybridSyncService = new HybridSyncService();
