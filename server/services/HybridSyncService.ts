import { executionService } from './ExecutionService';
import { jenkinsStatusService } from './JenkinsStatusService';
import { Auto_TestRunResultsInput } from './ExecutionService';

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
    this.config = {
      callbackTimeout: 2 * 60 * 1000,        // 2分钟回调超时
      pollInterval: 30 * 1000,               // 30秒轮询间隔
      maxPollAttempts: 20,                   // 最多轮询20次（总计10分钟）
      consistencyCheckInterval: 5 * 60 * 1000 // 5分钟一致性检查
    };

    // 启动定期一致性检查
    this.startConsistencyCheck();
  }

  /**
   * 开始监控执行状态
   * 在创建执行记录后调用，开始等待回调
   */
  async startMonitoring(runId: number, options?: Partial<MonitoringConfig>): Promise<void> {
    const config = { ...this.config, ...options };

    console.log(`Starting hybrid monitoring for runId: ${runId}`);

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
      console.log(`Processing callback for runId: ${runId}`, {
        status: data.status,
        passedCases: data.passedCases,
        failedCases: data.failedCases,
        skippedCases: data.skippedCases,
        durationMs: data.durationMs,
        resultsCount: data.results?.length || 0
      });

      // 1. 验证是否在监控中
      const syncStatus = this.syncStatuses.get(runId);
      if (!syncStatus) {
        console.warn(`Received callback for unmonitored runId: ${runId}`);
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

      console.log(`Callback processed successfully for runId: ${runId}`);

      return {
        success: true,
        message: 'Callback processed successfully'
      };

    } catch (error) {
      console.error(`Failed to process callback for runId: ${runId}:`, error);

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
    console.log(`Callback timeout for runId: ${runId}, switching to API polling`);

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
   * 开始API轮询监控
   * 备用同步策略
   */
  private async startApiPolling(runId: number): Promise<void> {
    const syncStatus = this.syncStatuses.get(runId);
    if (!syncStatus) {
      console.error(`No sync status found for runId: ${runId}`);
      return;
    }

    console.log(`Starting API polling for runId: ${runId}`);

    const pollExecution = async () => {
      try {
        const currentStatus = this.syncStatuses.get(runId);
        if (!currentStatus || currentStatus.status !== 'polling') {
          console.log(`Stopping polling for runId: ${runId} - status changed`);
          return;
        }

        // 检查轮询次数限制
        if (currentStatus.attempts >= this.config.maxPollAttempts) {
          console.log(`Max polling attempts reached for runId: ${runId}`);
          await this.handlePollingTimeout(runId);
          return;
        }

        // 执行状态同步
        const syncResult = await executionService.syncExecutionStatusFromJenkins(runId);

        this.updateSyncStatus(runId, {
          attempts: currentStatus.attempts + 1,
          message: `Polling attempt ${currentStatus.attempts + 1}: ${syncResult.message}`
        });

        if (syncResult.success) {
          if (syncResult.updated) {
            // 状态已更新，检查是否完成
            const isCompleted = syncResult.jenkinsStatus &&
              ['success', 'failed', 'aborted'].includes(syncResult.jenkinsStatus);

            if (isCompleted) {
              console.log(`Execution completed via polling for runId: ${runId}`);
              this.updateSyncStatus(runId, {
                status: 'completed',
                method: 'polling',
                message: `Completed via API polling: ${syncResult.jenkinsStatus}`
              });
              this.stopMonitoring(runId);
              return;
            }
          }

          // 继续轮询
          const pollTimer = setTimeout(pollExecution, this.config.pollInterval);
          this.pollTimers.set(runId, pollTimer);
        } else {
          console.error(`Polling failed for runId: ${runId}: ${syncResult.message}`);
          // 轮询失败，继续尝试
          const pollTimer = setTimeout(pollExecution, this.config.pollInterval);
          this.pollTimers.set(runId, pollTimer);
        }

      } catch (error) {
        console.error(`Polling error for runId: ${runId}:`, error);
        this.updateSyncStatus(runId, {
          attempts: (this.syncStatuses.get(runId)?.attempts || 0) + 1,
          message: `Polling error: ${error instanceof Error ? error.message : String(error)}`
        });

        // 继续轮询
        const pollTimer = setTimeout(pollExecution, this.config.pollInterval);
        this.pollTimers.set(runId, pollTimer);
      }
    };

    // 立即开始第一次轮询
    await pollExecution();
  }

  /**
   * 处理轮询超时
   * 兜底策略：标记为超时状态
   */
  private async handlePollingTimeout(runId: number): Promise<void> {
    console.log(`Polling timeout for runId: ${runId}, marking as timed out`);

    try {
      // 标记执行为超时
      await executionService.completeBatchExecution(runId, {
        status: 'aborted',
        passedCases: 0,
        failedCases: 0,
        skippedCases: 0,
        durationMs: this.config.callbackTimeout + this.config.maxPollAttempts * this.config.pollInterval,
        results: []
      });

      this.updateSyncStatus(runId, {
        status: 'timeout',
        method: 'timeout',
        message: 'Execution timed out after maximum polling attempts'
      });

      this.stopMonitoring(runId);

    } catch (error) {
      console.error(`Failed to handle polling timeout for runId: ${runId}:`, error);

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
    console.log(`Stopping monitoring for runId: ${runId}`);

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
        const result = await executionService.verifyStatusConsistency(1);
        // 过滤指定的runId（这里需要ExecutionService支持按runId过滤）
        return result;
      } else {
        // 验证所有执行的状态一致性
        return await executionService.verifyStatusConsistency(50);
      }
    } catch (error) {
      console.error('Failed to verify status consistency:', error);
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
      console.log(`Manual sync triggered for runId: ${runId}`);

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