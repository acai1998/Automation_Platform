/**
 * Centralized Polling Configuration for Frontend
 *
 * This file consolidates all polling-related configuration values
 * to eliminate magic numbers and improve maintainability.
 *
 * All values are in milliseconds unless otherwise specified.
 */

/**
 * Polling Interval Configuration
 * Controls how frequently the frontend polls for execution status updates
 */
export const POLLING_INTERVALS = {
  /** Fast polling interval for pending state (3 seconds) */
  FAST: 3000,

  /** Normal polling interval for early execution phase (5 seconds) */
  NORMAL: 5000,

  /** Medium polling interval for mid execution phase (10 seconds) */
  MEDIUM: 10000,

  /** Slow polling interval for late execution phase (30 seconds) */
  SLOW: 30000,

  /** WebSocket backup polling interval when WS is connected (60 seconds) */
  WEBSOCKET_BACKUP: 60000,
} as const;

/**
 * Execution Time Windows
 * Defines time thresholds for different execution phases
 */
export const EXECUTION_WINDOWS = {
  /** Pending state fast polling window (30 seconds) */
  PENDING_FAST_POLL: 30 * 1000,

  /** Early execution phase window (2 minutes) */
  EARLY_EXECUTION: 2 * 60 * 1000,

  /** Mid execution phase window (5 minutes) */
  MID_EXECUTION: 5 * 60 * 1000,

  /** Maximum execution time before stopping polling (10 minutes) */
  MAX_EXECUTION_TIME: 10 * 60 * 1000,
} as const;

/**
 * Stuck Detection Configuration
 * Controls when to alert users about potentially stuck executions
 */
export const STUCK_DETECTION = {
  /** Early stuck detection threshold (2 minutes) - for early warning */
  EARLY_THRESHOLD: 2 * 60 * 1000,

  /** Critical stuck detection threshold (5 minutes) - for critical alerts */
  CRITICAL_THRESHOLD: 5 * 60 * 1000,

  /** Minimum interval between stuck alerts (1 minute) - prevents spam */
  ALERT_COOLDOWN: 60 * 1000,
} as const;

/**
 * WebSocket Configuration
 * Controls WebSocket connection and reconnection behavior
 */
export const WEBSOCKET_CONFIG = {
  /** WebSocket server URL */
  SERVER_URL: import.meta.env.VITE_API_URL || 'http://localhost:3000',

  /** WebSocket path */
  PATH: '/api/ws',

  /** Initial connection delay (1 second) - non-blocking page load */
  INITIAL_DELAY: 1000,

  /** Maximum reconnection attempts before giving up */
  MAX_RECONNECT_ATTEMPTS: 5,

  /** Initial reconnection delay (1 second) */
  INITIAL_RECONNECT_DELAY: 1000,

  /** Maximum reconnection delay (30 seconds) */
  MAX_RECONNECT_DELAY: 30000,

  /** Reconnection backoff multiplier */
  RECONNECT_BACKOFF_MULTIPLIER: 2,

  /** Connection timeout (10 seconds) */
  CONNECTION_TIMEOUT: 10000,

  /** Heartbeat interval (25 seconds) */
  HEARTBEAT_INTERVAL: 25000,
} as const;

/**
 * Retry Configuration
 * Controls retry behavior for failed operations
 */
export const RETRY_CONFIG = {
  /** Maximum retry attempts for failed API calls */
  MAX_ATTEMPTS: 3,

  /** Initial retry delay (1 second) */
  INITIAL_DELAY: 1000,

  /** Maximum retry delay (10 seconds) */
  MAX_DELAY: 10000,

  /** Retry backoff multiplier */
  BACKOFF_MULTIPLIER: 2,
} as const;

/**
 * Unified Polling Configuration
 * Combines all polling configs for easy access
 */
export const POLLING_CONFIG = {
  INTERVALS: POLLING_INTERVALS,
  WINDOWS: EXECUTION_WINDOWS,
  STUCK_DETECTION,
  WEBSOCKET: WEBSOCKET_CONFIG,
  RETRY: RETRY_CONFIG,
} as const;

/**
 * Helper Functions
 */

/**
 * Calculate dynamic polling interval based on execution state
 *
 * @param status - Current execution status
 * @param startTime - Execution start time
 * @param wsConnected - Whether WebSocket is connected
 * @returns Polling interval in milliseconds, or false to stop polling
 */
export function calculatePollingInterval(
  status: string,
  startTime: string | null | undefined,
  wsConnected: boolean
): number | false {
  // Stop polling if execution is complete
  if (['success', 'failed', 'aborted'].includes(status)) {
    return false;
  }

  // If WebSocket is connected, use slow backup polling
  if (wsConnected) {
    return POLLING_INTERVALS.WEBSOCKET_BACKUP;
  }

  // Calculate elapsed time
  let elapsedTime = 0;
  if (startTime) {
    elapsedTime = Date.now() - new Date(startTime).getTime();

    // Stop polling if max execution time exceeded
    if (elapsedTime > EXECUTION_WINDOWS.MAX_EXECUTION_TIME) {
      return false;
    }
  }

  // For pending status, use fast polling initially
  if (status === 'pending' && elapsedTime < EXECUTION_WINDOWS.PENDING_FAST_POLL) {
    return POLLING_INTERVALS.FAST;
  }

  // For running status, use adaptive intervals based on elapsed time
  if (status === 'running' || status === 'pending') {
    if (elapsedTime < EXECUTION_WINDOWS.EARLY_EXECUTION) {
      return POLLING_INTERVALS.NORMAL;
    }
    if (elapsedTime < EXECUTION_WINDOWS.MID_EXECUTION) {
      return POLLING_INTERVALS.MEDIUM;
    }
    return POLLING_INTERVALS.SLOW;
  }

  // Default to normal polling
  return POLLING_INTERVALS.NORMAL;
}

/**
 * Check if execution is potentially stuck
 *
 * @param status - Current execution status
 * @param startTime - Execution start time
 * @returns Object with stuck status and severity level
 */
export function checkStuckStatus(
  status: string,
  startTime: string | null | undefined
): {
  isStuck: boolean;
  isEarlyStuck: boolean;
  isCriticallyStuck: boolean;
  elapsedTime: number;
  severity: 'none' | 'early' | 'critical';
} {
  if (!startTime || !['running', 'pending'].includes(status)) {
    return {
      isStuck: false,
      isEarlyStuck: false,
      isCriticallyStuck: false,
      elapsedTime: 0,
      severity: 'none',
    };
  }

  const elapsedTime = Date.now() - new Date(startTime).getTime();

  const isEarlyStuck = elapsedTime > STUCK_DETECTION.EARLY_THRESHOLD;
  const isCriticallyStuck = elapsedTime > STUCK_DETECTION.CRITICAL_THRESHOLD;

  return {
    isStuck: isEarlyStuck || isCriticallyStuck,
    isEarlyStuck,
    isCriticallyStuck,
    elapsedTime,
    severity: isCriticallyStuck ? 'critical' : isEarlyStuck ? 'early' : 'none',
  };
}

/**
 * Calculate exponential backoff delay for retries
 *
 * @param attempt - Current attempt number (0-based)
 * @param config - Retry configuration (optional)
 * @returns Delay in milliseconds
 */
export function calculateBackoffDelay(
  attempt: number,
  config: typeof RETRY_CONFIG = RETRY_CONFIG
): number {
  const delay = config.INITIAL_DELAY * Math.pow(config.BACKOFF_MULTIPLIER, attempt);
  return Math.min(delay, config.MAX_DELAY);
}

/**
 * Format elapsed time as human-readable string
 *
 * @param milliseconds - Time in milliseconds
 * @returns Formatted string (e.g., "2m 30s", "5m", "45s")
 */
export function formatElapsedTime(milliseconds: number): string {
  const seconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  if (minutes > 0) {
    return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
  }
  return `${seconds}s`;
}

/**
 * Get user-friendly stuck execution message
 *
 * @param severity - Stuck severity level
 * @param elapsedTime - Elapsed time in milliseconds
 * @returns User-friendly message
 */
export function getStuckMessage(
  severity: 'none' | 'early' | 'critical',
  elapsedTime: number
): string {
  const timeStr = formatElapsedTime(elapsedTime);

  switch (severity) {
    case 'early':
      return `Execution has been running for ${timeStr}. This may indicate a configuration issue. You can try manual sync if needed.`;
    case 'critical':
      return `Execution has been stuck for ${timeStr}. This likely indicates a sync failure. Please try manual sync or contact support.`;
    default:
      return '';
  }
}

/**
 * Configuration Summary (for debugging)
 */
export function getConfigSummary(): string {
  return `
Polling Configuration Summary:
==============================

Polling Intervals:
  - Fast: ${POLLING_INTERVALS.FAST}ms (${POLLING_INTERVALS.FAST / 1000}s)
  - Normal: ${POLLING_INTERVALS.NORMAL}ms (${POLLING_INTERVALS.NORMAL / 1000}s)
  - Medium: ${POLLING_INTERVALS.MEDIUM}ms (${POLLING_INTERVALS.MEDIUM / 1000}s)
  - Slow: ${POLLING_INTERVALS.SLOW}ms (${POLLING_INTERVALS.SLOW / 1000}s)
  - WebSocket Backup: ${POLLING_INTERVALS.WEBSOCKET_BACKUP}ms (${POLLING_INTERVALS.WEBSOCKET_BACKUP / 1000}s)

Execution Windows:
  - Pending Fast Poll: ${EXECUTION_WINDOWS.PENDING_FAST_POLL / 1000}s
  - Early Execution: ${EXECUTION_WINDOWS.EARLY_EXECUTION / 1000}s
  - Mid Execution: ${EXECUTION_WINDOWS.MID_EXECUTION / 1000}s
  - Max Execution Time: ${EXECUTION_WINDOWS.MAX_EXECUTION_TIME / 1000}s

Stuck Detection:
  - Early Threshold: ${STUCK_DETECTION.EARLY_THRESHOLD / 1000}s
  - Critical Threshold: ${STUCK_DETECTION.CRITICAL_THRESHOLD / 1000}s
  - Alert Cooldown: ${STUCK_DETECTION.ALERT_COOLDOWN / 1000}s

WebSocket:
  - Server: ${WEBSOCKET_CONFIG.SERVER_URL}${WEBSOCKET_CONFIG.PATH}
  - Max Reconnect Attempts: ${WEBSOCKET_CONFIG.MAX_RECONNECT_ATTEMPTS}
  - Initial Reconnect Delay: ${WEBSOCKET_CONFIG.INITIAL_RECONNECT_DELAY}ms
  - Max Reconnect Delay: ${WEBSOCKET_CONFIG.MAX_RECONNECT_DELAY}ms
`;
}

// Export default for convenience
export default POLLING_CONFIG;
