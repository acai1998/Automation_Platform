import logger from '../utils/logger';
import { LOG_CONTEXTS, createTimer } from '../config/logging';
import { executionService } from './ExecutionService';
import { ExecutionRepository } from '../repositories/ExecutionRepository';
import { AppDataSource } from '../config/database';

/**
 * ExecutionMonitorService
 *
 * Background service to detect and fix stuck executions caused by:
 * - Jenkins compilation failures (Pipeline script errors)
 * - Network issues preventing callbacks
 * - Jenkins hanging or timeouts
 *
 * Strategy:
 * 1. Periodically query database for pending/running executions
 * 2. Check Jenkins status via API for executions older than threshold
 * 3. Update platform status if inconsistent
 * 4. Mark as failed if Jenkins shows compilation failure
 */

export interface MonitorConfig {
  checkInterval: number;          // How often to scan (default: 15000ms = 15 sec - optimized for quick fail)
  compilationCheckWindow: number; // Check compilation fails quickly (default: 30000ms = 30 sec - quick fail detection)
  batchSize: number;              // Max executions to process per cycle (default: 20)
  enabled: boolean;               // Feature flag
  rateLimitDelay: number;         // Delay between Jenkins API calls (default: 100ms)
}

export interface MonitorStats {
  cyclesRun: number;
  totalExecutionsChecked: number;
  totalExecutionsUpdated: number;
  totalCompilationFailures: number;
  totalErrors: number;
  lastCycleTime: Date | null;
  lastCycleDuration: number | null;
  isProcessing: boolean;
}

export interface StuckExecution {
  id: number;
  status: string;
  jenkinsJob: string | null;
  jenkinsBuildId: string | null;
  startTime: Date | null;
  durationSeconds: number | null;
}

export class ExecutionMonitorService {
  private timer: NodeJS.Timeout | null = null;
  private isRunning = false;
  private isProcessing = false;
  private config: MonitorConfig;
  private executionRepository: ExecutionRepository;
  private stats: MonitorStats = {
    cyclesRun: 0,
    totalExecutionsChecked: 0,
    totalExecutionsUpdated: 0,
    totalCompilationFailures: 0,
    totalErrors: 0,
    lastCycleTime: null,
    lastCycleDuration: null,
    isProcessing: false,
  };

  constructor() {
    this.executionRepository = new ExecutionRepository(AppDataSource);
    this.config = {
      checkInterval: parseInt(process.env.EXECUTION_MONITOR_INTERVAL || '15000', 10),          // 15秒检查间隔（快速失败优化）
      compilationCheckWindow: parseInt(process.env.COMPILATION_CHECK_WINDOW || '30000', 10),   // 30秒编译检查窗口（快速失败检测）
      batchSize: parseInt(process.env.EXECUTION_MONITOR_BATCH_SIZE || '20', 10),
      enabled: process.env.EXECUTION_MONITOR_ENABLED !== 'false',
      rateLimitDelay: parseInt(process.env.EXECUTION_MONITOR_RATE_LIMIT || '100', 10),
    };

    logger.info('[ExecutionMonitorService] Initialized with config:', {
      checkInterval: `${this.config.checkInterval}ms`,
      compilationCheckWindow: `${this.config.compilationCheckWindow}ms`,
      batchSize: this.config.batchSize,
      enabled: this.config.enabled,
      rateLimitDelay: `${this.config.rateLimitDelay}ms`
    }, LOG_CONTEXTS.MONITOR);
  }

  /**
   * Start the execution monitor
   */
  start(): void {
    if (!this.config.enabled) {
      logger.info('Execution monitor is disabled', {}, LOG_CONTEXTS.MONITOR);
      return;
    }

    if (this.isRunning) {
      logger.info('Execution monitor is already running', {}, LOG_CONTEXTS.MONITOR);
      return;
    }

    logger.info('Starting execution monitor...', {
      config: this.config,
    }, LOG_CONTEXTS.MONITOR);

    this.isRunning = true;

    // Start the monitoring cycle
    this.scheduleNextCheck();

    logger.info('Execution monitor started successfully', {
      checkInterval: `${this.config.checkInterval}ms`,
      compilationCheckWindow: `${this.config.compilationCheckWindow}ms`,
    }, LOG_CONTEXTS.MONITOR);
  }

  /**
   * Stop the execution monitor
   */
  stop(): void {
    logger.info('Stopping execution monitor...', {}, LOG_CONTEXTS.MONITOR);
    this.isRunning = false;

    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    logger.info('Execution monitor stopped', {
      finalStats: this.getStats(),
    }, LOG_CONTEXTS.MONITOR);
  }

  /**
   * Get current monitor status
   */
  getStatus(): { isRunning: boolean; config: MonitorConfig } {
    return {
      isRunning: this.isRunning,
      config: this.config,
    };
  }

  /**
   * Get monitor statistics
   */
  getStats(): MonitorStats {
    return { ...this.stats, isProcessing: this.isProcessing };
  }

  /**
   * Schedule the next monitoring check
   */
  private scheduleNextCheck(): void {
    if (!this.isRunning) {
      return;
    }

    this.timer = setTimeout(() => {
      this.checkCycle().then(() => {
        this.scheduleNextCheck();
      });
    }, this.config.checkInterval);
  }

  /**
   * Execute one monitoring cycle
   */
  private async checkCycle(): Promise<void> {
    if (this.isProcessing) {
      logger.warn('Previous monitor cycle still running, skipping...', {}, LOG_CONTEXTS.MONITOR);
      return;
    }

    this.isProcessing = true;
    this.stats.isProcessing = true;
    const timer = createTimer();

    try {
      // 1. Get stuck executions from database
      const stuckExecutions = await this.getStuckExecutions();

      if (stuckExecutions.length === 0) {
        logger.debug('No stuck executions found', {
          checkWindow: `${this.config.compilationCheckWindow}ms`,
        }, LOG_CONTEXTS.MONITOR);
        return;
      }

      logger.debug('Monitor cycle started', {
        count: stuckExecutions.length,
        checkWindow: `${this.config.compilationCheckWindow}ms`,
      }, LOG_CONTEXTS.MONITOR);

      // 2. Process executions
      const results = {
        checked: stuckExecutions.length,
        updated: 0,
        failed: 0,
        compilationFailures: 0,
      };

      for (const execution of stuckExecutions) {
        try {
          const syncResult = await this.processSingleExecution(execution);

          if (syncResult.updated) {
            results.updated++;

            // Check if it's a compilation failure based on duration
            if (syncResult.jenkinsStatus === 'failed' && execution.durationSeconds && execution.durationSeconds < 30) {
              results.compilationFailures++;
            }
          }

          // Rate limiting: delay between Jenkins API calls
          await new Promise(resolve => setTimeout(resolve, this.config.rateLimitDelay));

        } catch (error) {
          results.failed++;
          logger.warn('Failed to process execution', {
            runId: execution.id,
            error: error instanceof Error ? error.message : String(error),
          }, LOG_CONTEXTS.MONITOR);
        }
      }

      // 3. Update statistics
      this.stats.cyclesRun++;
      this.stats.totalExecutionsChecked += results.checked;
      this.stats.totalExecutionsUpdated += results.updated;
      this.stats.totalCompilationFailures += results.compilationFailures;
      this.stats.totalErrors += results.failed;
      this.stats.lastCycleTime = new Date();
      this.stats.lastCycleDuration = timer();

      // 4. Log results
      logger.info('Monitor cycle completed', {
        ...results,
        durationMs: this.stats.lastCycleDuration,
      }, LOG_CONTEXTS.MONITOR);

    } catch (error) {
      this.stats.totalErrors++;
      logger.errorLog(error, 'Monitor cycle failed', {
        durationMs: timer(),
      });
    } finally {
      this.isProcessing = false;
      this.stats.isProcessing = false;
    }
  }

  /**
   * Get stuck executions from database
   */
  private async getStuckExecutions(): Promise<StuckExecution[]> {
    try {
      const thresholdSeconds = Math.floor(this.config.compilationCheckWindow / 1000);

      const executions = await this.executionRepository.getPotentiallyStuckExecutions(thresholdSeconds, this.config.batchSize);

      return executions;

    } catch (error) {
      logger.errorLog(error, 'Failed to query stuck executions', {});
      return [];
    }
  }

  /**
   * Process a single stuck execution
   */
  private async processSingleExecution(execution: StuckExecution): Promise<{
    updated: boolean;
    jenkinsStatus?: string;
  }> {
    const runId = execution.id;

    try {
      // Sync status from Jenkins (uses existing method with retries)
      const syncResult = await executionService.syncExecutionStatusFromJenkins(runId);

      if (syncResult.success && syncResult.updated) {
        logger.info(`Execution status updated via monitor (runId=${runId})`, {
          runId,
          previousStatus: syncResult.currentStatus,
          newStatus: syncResult.jenkinsStatus,
          durationSeconds: execution.durationSeconds,
          updateSource: 'monitor_poll',
        }, LOG_CONTEXTS.MONITOR);

        return {
          updated: true,
          jenkinsStatus: syncResult.jenkinsStatus,
        };
      }

      return {
        updated: false,
      };

    } catch (error) {
      logger.error('Error processing execution', {
        runId,
        error: error instanceof Error ? error.message : String(error),
      }, LOG_CONTEXTS.MONITOR);
      throw error;
    }
  }
}

// Export singleton instance
export const executionMonitorService = new ExecutionMonitorService();
