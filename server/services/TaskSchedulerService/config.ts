export const CONCURRENCY_LIMIT = parseInt(process.env.TASK_CONCURRENCY_LIMIT || '3', 10);

export const SCHEDULER_USER_ID: null = null;

export const MAX_MISSED_WINDOW_MS = 24 * 60 * 60 * 1000;

export const MAX_QUEUE_DEPTH = parseInt(process.env.TASK_MAX_QUEUE_DEPTH || '50', 10);

export const QUEUE_ITEM_TIMEOUT_MS = parseInt(
  process.env.TASK_QUEUE_TIMEOUT_MS || String(10 * 60 * 1000),
  10,
);

export const SLOT_HOLD_TIMEOUT_MS = parseInt(
  process.env.TASK_SLOT_TIMEOUT_MS || String(30 * 60 * 1000),
  10,
);

export const SLOT_RECONCILE_INTERVAL_MS = parseInt(
  process.env.TASK_SLOT_RECONCILE_INTERVAL_MS || '5000',
  10,
);

export const PRIORITY_MANUAL = 1;
export const PRIORITY_SCHEDULED = 2;
export const PRIORITY_RETRY = 3;
