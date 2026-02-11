import logger from '../utils/logger';
import { LOG_CONTEXTS, createTimer } from '../config/logging';
import { executionService } from './ExecutionService';
import { ExecutionRepository } from '../repositories/ExecutionRepository';
import { AppDataSource } from '../config/database';
import { webSocketService } from './WebSocketService';
import { EXECUTION_MONITOR_CONFIG, validateMonitoringConfig } from '../config/monitoring';

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
  checkInterval: number;          // How often to scan (default: 30000ms = 30 sec)
  compilationCheckWindow: number; // Check compilation fails quickly (default: 30000ms = 30 sec)
  batchSize: number;              // Max executions to process per cycle (default: 20)
  enabled: boolean;               // Feature flag
  rateLimitDelay: number;         // Delay between Jenkins API calls (default: 100ms)
  quickFailThresholdSeconds: number; // Quick fail detection threshold in seconds (default: 30)
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
  private cleanupTimer: NodeJS.Timeout | null = null;
  private isRunning = false;
  private isProcessing = false;
  private config: MonitorConfig;
  private executionRepository: ExecutionRepository;
  private lastCleanupTime: Date | null = null;
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

    // Use centralized configuration
    this.config = {
      checkInterval: EXECUTION_MONITOR_CONFIG.CHECK_INTERVAL,
      compilationCheckWindow: EXECUTION_MONITOR_CONFIG.COMPILATION_CHECK_WINDOW,
      batchSize: EXECUTION_MONITOR_CONFIG.BATCH_SIZE,
      enabled: EXECUTION_MONITOR_CONFIG.ENABLED,
      rateLimitDelay: EXECUTION_MONITOR_CONFIG.RATE_LIMIT_DELAY,
      quickFailThresholdSeconds: EXECUTION_MONITOR_CONFIG.QUICK_FAIL_THRESHOLD_SECONDS,
    };

    // Validate configuration using centralized validator
    const validation = validateMonitoringConfig();
    if (!validation.valid) {
      logger.error('[ExecutionMonitorService] Invalid configuration:', {
        errors: validation.errors,
      }, LOG_CONTEXTS.MONITOR);
      throw new Error(`Invalid monitoring configuration: ${validation.errors.join(', ')}`);
    }

    // Additional validation for this service
    this.validateConfig(this.config);

    logger.info('[ExecutionMonitorService] Initialized with config:', {
      checkInterval: `${this.config.checkInterval}ms`,
      compilationCheckWindow: `${this.config.compilationCheckWindow}ms`,
      batchSize: this.config.batchSize,
      enabled: this.config.enabled,
      rateLimitDelay: `${this.config.rateLimitDelay}ms`,
      quickFailThresholdSeconds: `${this.config.quickFailThresholdSeconds}s`,
    }, LOG_CONTEXTS.MONITOR);
  }

  /**
   * Validate monitor configuration
   * Prevents injection attacks and ensures reasonable values
   */
  private validateConfig(config: MonitorConfig): void {
    // Validate checkInterval (5s to 5min)
    if (config.checkInterval < 5000 || config.checkInterval > 300000) {
      throw new Error('checkInterval must be between 5000ms (5s) and 300000ms (5min)');
    }

    // Validate compilationCheckWindow (10s to 5min)
    if (config.compilationCheckWindow < 10000 || config.compilationCheckWindow > 300000) {
      throw new Error('compilationCheckWindow must be between 10000ms (10s) and 300000ms (5min)');
    }

    // Validate batchSize (1 to 100)
    if (config.batchSize < 1 || config.batchSize > 100) {
      throw new Error('batchSize must be between 1 and 100');
    }

    // Validate rateLimitDelay (0 to 5s)
    if (config.rateLimitDelay < 0 || config.rateLimitDelay > 5000) {
      throw new Error('rateLimitDelay must be between 0ms and 5000ms (5s)');
    }

    // Validate quickFailThresholdSeconds (5s to 5min)
    if (config.quickFailThresholdSeconds < 5 || config.quickFailThresholdSeconds > 300) {
      throw new Error('quickFailThresholdSeconds must be between 5 and 300 seconds');
    }
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

    // Start periodic cleanup of old stuck executions (every 1 hour)
    this.scheduleCleanup();

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

    if (this.cleanupTimer) {
      clearTimeout(this.cleanupTimer);
      this.cleanupTimer = null;
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
   * Get monitor health status
   */
  getHealth(): {
    healthy: boolean;
    issues: string[];
    lastSuccessfulCycle?: Date;
    consecutiveFailures: number;
  } {
    const issues: string[] = [];

    // Check if monitor should be running but isn't
    if (!this.isRunning && this.config.enabled) {
      issues.push('Monitor is not running but should be enabled');
    }

    // Check if cycle is stuck
    if (this.isProcessing && this.stats.lastCycleTime) {
      const timeSinceLastCycle = Date.now() - this.stats.lastCycleTime.getTime();
      if (timeSinceLastCycle > this.config.checkInterval * 3) {
        issues.push(`Cycle stuck for ${timeSinceLastCycle}ms`);
      }
    }

    // Check error rate
    if (this.stats.cyclesRun > 0) {
      const errorRate = this.stats.totalErrors / this.stats.cyclesRun;
      if (errorRate > 0.5) {
        issues.push(`High error rate: ${(errorRate * 100).toFixed(1)}%`);
      }
    }

    return {
      healthy: issues.length === 0,
      issues,
      lastSuccessfulCycle: this.stats.lastCycleTime || undefined,
      consecutiveFailures: this.stats.totalErrors,
    };
  }

  /**
   * Check if execution is a quick failure
   * Quick failures typically indicate compilation or configuration errors
   */
  private isQuickFail(execution: StuckExecution, jenkinsStatus: string): boolean {
    if (jenkinsStatus !== 'failed') {
      return false;
    }

    const elapsedTimeMs = execution.durationSeconds ? execution.durationSeconds * 1000 : 0;
    const thresholdMs = this.config.quickFailThresholdSeconds * 1000;

    return elapsedTimeMs > 0 && elapsedTimeMs < thresholdMs;
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
      }).catch((error) => {
        logger.errorLog(error, 'Monitor cycle failed unexpectedly', { context: LOG_CONTEXTS.MONITOR });
        this.scheduleNextCheck(); // Continue monitoring even after error
      });
    }, this.config.checkInterval);
  }

  /**
   * Schedule periodic cleanup of old stuck executions
   */
  private scheduleCleanup(): void {
    if (!this.isRunning) {
      return;
    }

    // Clean up stuck executions older than configured max age (default: 24 hours)
    const cleanupInterval = EXECUTION_MONITOR_CONFIG.CLEANUP_INTERVAL;

    this.cleanupTimer = setTimeout(async () => {
      try {
        const maxAgeHours = EXECUTION_MONITOR_CONFIG.MAX_AGE_HOURS;
        const abandonedCount = await this.executionRepository.markOldStuckExecutionsAsAbandoned(maxAgeHours);

        if (abandonedCount > 0) {
          logger.info('Cleaned up old stuck executions', {
            abandonedCount,
            maxAgeHours,
          }, LOG_CONTEXTS.MONITOR);
        }

        this.lastCleanupTime = new Date();
      } catch (error) {
        logger.errorLog(error, 'Failed to cleanup old stuck executions', {});
      }

      // 继续调度下一次清理
      this.scheduleCleanup();
    }, cleanupInterval);
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

      // Track updated executions for batch logging
      const updatedExecutions: number[] = [];

      for (const execution of stuckExecutions) {
        try {
          const syncResult = await this.processSingleExecution(execution);

          if (syncResult.updated) {
            results.updated++;
            updatedExecutions.push(execution.id);

            // Check if it's a quick failure (compilation/config error)
            if (syncResult.jenkinsStatus && this.isQuickFail(execution, syncResult.jenkinsStatus)) {
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

      // Batch log updated executions
      if (updatedExecutions.length > 0) {
        logger.info('Batch updated executions', {
          count: updatedExecutions.length,
          runIds: updatedExecutions.slice(0, 10), // Log first 10 IDs
          totalCount: updatedExecutions.length,
        }, LOG_CONTEXTS.MONITOR);
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

        // Quick fail detection and WebSocket alert
        if (syncResult.jenkinsStatus && this.isQuickFail(execution, syncResult.jenkinsStatus)) {
          const elapsedTimeMs = execution.durationSeconds! * 1000;

          // Only push alert if WebSocket service is enabled and has subscribers
          if (webSocketService && webSocketService.getSubscriptionStats().totalExecutions > 0) {
            webSocketService.pushQuickFailAlert(runId, {
              message: 'Execution failed quickly, likely a compilation or configuration error',
              errorType: 'quick_fail',
              duration: elapsedTimeMs
            });

            logger.warn('Quick fail detected and alert pushed', {
              runId,
              duration: `${elapsedTimeMs}ms`,
              status: syncResult.jenkinsStatus,
            }, LOG_CONTEXTS.MONITOR);
          }
        }

        return {
          updated: true,
          jenkinsStatus: syncResult.jenkinsStatus,
        };
      }

      return {
        updated: false,
      };

    } catch (error) {
      // Log error but don't rethrow - let caller handle it uniformly
      logger.error('Error processing execution', {
        runId,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      }, LOG_CONTEXTS.MONITOR);

      // Return failure status instead of throwing
      return {
        updated: false,
      };
    }
  }
}

// Export singleton instance
export const executionMonitorService = new ExecutionMonitorService();
