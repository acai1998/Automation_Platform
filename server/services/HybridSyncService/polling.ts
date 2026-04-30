import { HYBRID_SYNC_CONFIG } from '../../config/monitoring';

export function calculatePollInterval(
  attempt: number,
  defaultInterval: number,
): number {
  if (!HYBRID_SYNC_CONFIG.ADAPTIVE_POLLING_ENABLED) {
    return defaultInterval;
  }

  if (attempt <= HYBRID_SYNC_CONFIG.FAST_POLL_ATTEMPTS) {
    return HYBRID_SYNC_CONFIG.POLL_INTERVAL_FAST;
  }

  if (attempt <= HYBRID_SYNC_CONFIG.FAST_POLL_ATTEMPTS + HYBRID_SYNC_CONFIG.NORMAL_POLL_ATTEMPTS) {
    return HYBRID_SYNC_CONFIG.POLL_INTERVAL_NORMAL;
  }

  return HYBRID_SYNC_CONFIG.POLL_INTERVAL_SLOW;
}

export function calculateTotalPollingDuration(
  maxPollAttempts: number,
  pollInterval: number,
): number {
  if (!HYBRID_SYNC_CONFIG.ADAPTIVE_POLLING_ENABLED) {
    return maxPollAttempts * pollInterval;
  }

  const fastAttempts = Math.min(HYBRID_SYNC_CONFIG.FAST_POLL_ATTEMPTS, maxPollAttempts);
  const fastDuration = fastAttempts * HYBRID_SYNC_CONFIG.POLL_INTERVAL_FAST;

  const normalAttempts = Math.min(
    HYBRID_SYNC_CONFIG.NORMAL_POLL_ATTEMPTS,
    Math.max(0, maxPollAttempts - HYBRID_SYNC_CONFIG.FAST_POLL_ATTEMPTS),
  );
  const normalDuration = normalAttempts * HYBRID_SYNC_CONFIG.POLL_INTERVAL_NORMAL;

  const slowAttempts = Math.max(
    0,
    maxPollAttempts - HYBRID_SYNC_CONFIG.FAST_POLL_ATTEMPTS - HYBRID_SYNC_CONFIG.NORMAL_POLL_ATTEMPTS,
  );
  const slowDuration = slowAttempts * HYBRID_SYNC_CONFIG.POLL_INTERVAL_SLOW;

  return fastDuration + normalDuration + slowDuration;
}
