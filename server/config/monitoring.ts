/**
 * Centralized Monitoring Configuration
 *
 * This file consolidates all monitoring-related configuration values
 * to eliminate magic numbers and improve maintainability.
 *
 * All values can be overridden via environment variables.
 */

/**
 * Hybrid Sync Service Configuration
 * Controls callback and polling behavior for execution status synchronization
 */
export const HYBRID_SYNC_CONFIG = {
  /** Callback timeout in milliseconds (default: 20s, optimized for intranet) */
  CALLBACK_TIMEOUT: parseInt(process.env.CALLBACK_TIMEOUT || '20000', 10),

  /** Fast polling interval for initial attempts (default: 5s) */
  POLL_INTERVAL_FAST: parseInt(process.env.POLL_INTERVAL_FAST || '5000', 10),

  /** Normal polling interval for mid-range attempts (default: 10s) */
  POLL_INTERVAL_NORMAL: parseInt(process.env.POLL_INTERVAL_NORMAL || '10000', 10),

  /** Slow polling interval for later attempts (default: 15s) */
  POLL_INTERVAL_SLOW: parseInt(process.env.POLL_INTERVAL_SLOW || '15000', 10),

  /** Number of fast polling attempts (default: 3) */
  FAST_POLL_ATTEMPTS: parseInt(process.env.FAST_POLL_ATTEMPTS || '3', 10),

  /** Number of normal polling attempts (default: 5) */
  NORMAL_POLL_ATTEMPTS: parseInt(process.env.NORMAL_POLL_ATTEMPTS || '5', 10),

  /** Maximum total polling attempts (default: 42, ~6-7 min total) */
  MAX_POLL_ATTEMPTS: parseInt(process.env.MAX_POLL_ATTEMPTS || '42', 10),

  /** Enable adaptive polling strategy (default: true) */
  ADAPTIVE_POLLING_ENABLED: process.env.ADAPTIVE_POLLING_ENABLED !== 'false',

  /** Consistency check interval in milliseconds (default: 5 minutes) */
  CONSISTENCY_CHECK_INTERVAL: parseInt(process.env.CONSISTENCY_CHECK_INTERVAL || '300000', 10),
} as const;

/**
 * Execution Monitor Service Configuration
 * Controls background monitoring for stuck executions
 */
export const EXECUTION_MONITOR_CONFIG = {
  /** Monitor cycle interval in milliseconds (default: 20s) */
  CHECK_INTERVAL: parseInt(process.env.EXECUTION_MONITOR_INTERVAL || '20000', 10),

  /** Quick fail detection window in milliseconds (default: 20s) */
  COMPILATION_CHECK_WINDOW: parseInt(process.env.COMPILATION_CHECK_WINDOW || '20000', 10),

  /** Maximum executions to process per cycle (default: 20) */
  BATCH_SIZE: parseInt(process.env.EXECUTION_MONITOR_BATCH_SIZE || '20', 10),

  /** Enable execution monitor (default: true) */
  ENABLED: process.env.EXECUTION_MONITOR_ENABLED !== 'false',

  /** Delay between Jenkins API calls in milliseconds (default: 100ms) */
  RATE_LIMIT_DELAY: parseInt(process.env.EXECUTION_MONITOR_RATE_LIMIT || '100', 10),

  /** Quick fail threshold in seconds (default: 20s) */
  QUICK_FAIL_THRESHOLD_SECONDS: parseInt(process.env.QUICK_FAIL_THRESHOLD_SECONDS || '20', 10),

  /** Early stuck threshold in seconds (default: 2 minutes) */
  EARLY_STUCK_THRESHOLD_SECONDS: parseInt(process.env.EARLY_STUCK_THRESHOLD_SECONDS || '120', 10),

  /** Stuck threshold in seconds (default: 5 minutes) */
  STUCK_THRESHOLD_SECONDS: parseInt(process.env.STUCK_THRESHOLD_SECONDS || '300', 10),

  /** Cleanup interval in milliseconds (default: 1 hour) */
  CLEANUP_INTERVAL: parseInt(process.env.EXECUTION_CLEANUP_INTERVAL || '3600000', 10),

  /** Maximum age for stuck executions in hours (default: 24 hours) */
  MAX_AGE_HOURS: parseInt(process.env.EXECUTION_MONITOR_MAX_AGE_HOURS || '24', 10),
} as const;

/**
 * WebSocket Service Configuration
 * Controls real-time push notification behavior
 */
export const WEBSOCKET_CONFIG = {
  /** Enable WebSocket service (default: true) */
  ENABLED: process.env.WEBSOCKET_ENABLED !== 'false',

  /** WebSocket path (default: /api/ws) */
  PATH: process.env.WEBSOCKET_PATH || '/api/ws',

  /** Frontend URL for CORS (default: http://localhost:5173) */
  FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:5173',

  /** Ping timeout in milliseconds (default: 60s) */
  PING_TIMEOUT: parseInt(process.env.WEBSOCKET_PING_TIMEOUT || '60000', 10),

  /** Ping interval in milliseconds (default: 25s) */
  PING_INTERVAL: parseInt(process.env.WEBSOCKET_PING_INTERVAL || '25000', 10),

  /** Health check interval in milliseconds (default: 30s) */
  HEALTH_CHECK_INTERVAL: parseInt(process.env.WEBSOCKET_HEALTH_CHECK_INTERVAL || '30000', 10),

  /** Connection retry attempts (default: 5) */
  MAX_RETRY_ATTEMPTS: parseInt(process.env.WEBSOCKET_MAX_RETRY_ATTEMPTS || '5', 10),

  /** Initial retry delay in milliseconds (default: 1s) */
  INITIAL_RETRY_DELAY: parseInt(process.env.WEBSOCKET_INITIAL_RETRY_DELAY || '1000', 10),

  /** Maximum retry delay in milliseconds (default: 30s) */
  MAX_RETRY_DELAY: parseInt(process.env.WEBSOCKET_MAX_RETRY_DELAY || '30000', 10),
} as const;

/**
 * Unified Monitoring Configuration
 * Combines all monitoring configs for easy access
 */
export const MONITORING_CONFIG = {
  HYBRID_SYNC: HYBRID_SYNC_CONFIG,
  EXECUTION_MONITOR: EXECUTION_MONITOR_CONFIG,
  WEBSOCKET: WEBSOCKET_CONFIG,
} as const;

/**
 * Configuration Validation
 * Validates all configuration values are within acceptable ranges
 */
export function validateMonitoringConfig(): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // Validate Hybrid Sync Config
  if (HYBRID_SYNC_CONFIG.CALLBACK_TIMEOUT < 5000 || HYBRID_SYNC_CONFIG.CALLBACK_TIMEOUT > 60000) {
    errors.push('CALLBACK_TIMEOUT must be between 5000ms (5s) and 60000ms (60s)');
  }

  if (HYBRID_SYNC_CONFIG.POLL_INTERVAL_FAST < 1000 || HYBRID_SYNC_CONFIG.POLL_INTERVAL_FAST > 30000) {
    errors.push('POLL_INTERVAL_FAST must be between 1000ms (1s) and 30000ms (30s)');
  }

  if (HYBRID_SYNC_CONFIG.POLL_INTERVAL_NORMAL < 1000 || HYBRID_SYNC_CONFIG.POLL_INTERVAL_NORMAL > 60000) {
    errors.push('POLL_INTERVAL_NORMAL must be between 1000ms (1s) and 60000ms (60s)');
  }

  if (HYBRID_SYNC_CONFIG.POLL_INTERVAL_SLOW < 1000 || HYBRID_SYNC_CONFIG.POLL_INTERVAL_SLOW > 120000) {
    errors.push('POLL_INTERVAL_SLOW must be between 1000ms (1s) and 120000ms (2min)');
  }

  if (HYBRID_SYNC_CONFIG.MAX_POLL_ATTEMPTS < 1 || HYBRID_SYNC_CONFIG.MAX_POLL_ATTEMPTS > 200) {
    errors.push('MAX_POLL_ATTEMPTS must be between 1 and 200');
  }

  // Validate Execution Monitor Config
  if (EXECUTION_MONITOR_CONFIG.CHECK_INTERVAL < 5000 || EXECUTION_MONITOR_CONFIG.CHECK_INTERVAL > 300000) {
    errors.push('EXECUTION_MONITOR_INTERVAL must be between 5000ms (5s) and 300000ms (5min)');
  }

  if (EXECUTION_MONITOR_CONFIG.COMPILATION_CHECK_WINDOW < 10000 || EXECUTION_MONITOR_CONFIG.COMPILATION_CHECK_WINDOW > 300000) {
    errors.push('COMPILATION_CHECK_WINDOW must be between 10000ms (10s) and 300000ms (5min)');
  }

  if (EXECUTION_MONITOR_CONFIG.BATCH_SIZE < 1 || EXECUTION_MONITOR_CONFIG.BATCH_SIZE > 100) {
    errors.push('EXECUTION_MONITOR_BATCH_SIZE must be between 1 and 100');
  }

  if (EXECUTION_MONITOR_CONFIG.RATE_LIMIT_DELAY < 0 || EXECUTION_MONITOR_CONFIG.RATE_LIMIT_DELAY > 5000) {
    errors.push('EXECUTION_MONITOR_RATE_LIMIT must be between 0ms and 5000ms (5s)');
  }

  if (EXECUTION_MONITOR_CONFIG.QUICK_FAIL_THRESHOLD_SECONDS < 5 || EXECUTION_MONITOR_CONFIG.QUICK_FAIL_THRESHOLD_SECONDS > 300) {
    errors.push('QUICK_FAIL_THRESHOLD_SECONDS must be between 5 and 300 seconds');
  }

  if (EXECUTION_MONITOR_CONFIG.EARLY_STUCK_THRESHOLD_SECONDS < 30 || EXECUTION_MONITOR_CONFIG.EARLY_STUCK_THRESHOLD_SECONDS > 600) {
    errors.push('EARLY_STUCK_THRESHOLD_SECONDS must be between 30 and 600 seconds');
  }

  if (EXECUTION_MONITOR_CONFIG.STUCK_THRESHOLD_SECONDS < 60 || EXECUTION_MONITOR_CONFIG.STUCK_THRESHOLD_SECONDS > 1800) {
    errors.push('STUCK_THRESHOLD_SECONDS must be between 60 and 1800 seconds');
  }

  // Validate WebSocket Config
  if (WEBSOCKET_CONFIG.PING_TIMEOUT < 10000 || WEBSOCKET_CONFIG.PING_TIMEOUT > 300000) {
    errors.push('WEBSOCKET_PING_TIMEOUT must be between 10000ms (10s) and 300000ms (5min)');
  }

  if (WEBSOCKET_CONFIG.PING_INTERVAL < 5000 || WEBSOCKET_CONFIG.PING_INTERVAL > 120000) {
    errors.push('WEBSOCKET_PING_INTERVAL must be between 5000ms (5s) and 120000ms (2min)');
  }

  if (WEBSOCKET_CONFIG.HEALTH_CHECK_INTERVAL < 10000 || WEBSOCKET_CONFIG.HEALTH_CHECK_INTERVAL > 300000) {
    errors.push('WEBSOCKET_HEALTH_CHECK_INTERVAL must be between 10000ms (10s) and 300000ms (5min)');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Get human-readable configuration summary
 */
export function getConfigSummary(): string {
  return `
Monitoring Configuration Summary:
================================

Hybrid Sync:
  - Callback Timeout: ${HYBRID_SYNC_CONFIG.CALLBACK_TIMEOUT}ms
  - Fast Poll Interval: ${HYBRID_SYNC_CONFIG.POLL_INTERVAL_FAST}ms (${HYBRID_SYNC_CONFIG.FAST_POLL_ATTEMPTS} attempts)
  - Normal Poll Interval: ${HYBRID_SYNC_CONFIG.POLL_INTERVAL_NORMAL}ms (${HYBRID_SYNC_CONFIG.NORMAL_POLL_ATTEMPTS} attempts)
  - Slow Poll Interval: ${HYBRID_SYNC_CONFIG.POLL_INTERVAL_SLOW}ms
  - Max Poll Attempts: ${HYBRID_SYNC_CONFIG.MAX_POLL_ATTEMPTS}
  - Adaptive Polling: ${HYBRID_SYNC_CONFIG.ADAPTIVE_POLLING_ENABLED ? 'Enabled' : 'Disabled'}

Execution Monitor:
  - Check Interval: ${EXECUTION_MONITOR_CONFIG.CHECK_INTERVAL}ms
  - Batch Size: ${EXECUTION_MONITOR_CONFIG.BATCH_SIZE}
  - Quick Fail Threshold: ${EXECUTION_MONITOR_CONFIG.QUICK_FAIL_THRESHOLD_SECONDS}s
  - Early Stuck Threshold: ${EXECUTION_MONITOR_CONFIG.EARLY_STUCK_THRESHOLD_SECONDS}s
  - Stuck Threshold: ${EXECUTION_MONITOR_CONFIG.STUCK_THRESHOLD_SECONDS}s
  - Enabled: ${EXECUTION_MONITOR_CONFIG.ENABLED ? 'Yes' : 'No'}

WebSocket:
  - Enabled: ${WEBSOCKET_CONFIG.ENABLED ? 'Yes' : 'No'}
  - Path: ${WEBSOCKET_CONFIG.PATH}
  - Ping Timeout: ${WEBSOCKET_CONFIG.PING_TIMEOUT}ms
  - Ping Interval: ${WEBSOCKET_CONFIG.PING_INTERVAL}ms
  - Health Check: ${WEBSOCKET_CONFIG.HEALTH_CHECK_INTERVAL}ms
`;
}

// Export default for convenience
export default MONITORING_CONFIG;
