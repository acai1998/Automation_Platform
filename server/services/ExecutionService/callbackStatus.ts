export const CALLBACK_TERMINAL_STATUSES = ['success', 'failed', 'aborted', 'cancelled'] as const;

export type CallbackTerminalStatus = (typeof CALLBACK_TERMINAL_STATUSES)[number];

interface NormalizeCallbackStatusOptions {
  fallbackStatus?: CallbackTerminalStatus;
}

interface DeriveCallbackStatusInput {
  reportedStatus: CallbackTerminalStatus;
  passedCases: number;
  failedCases: number;
  skippedCases: number;
}

export function isCallbackTerminalStatus(value: unknown): value is CallbackTerminalStatus {
  return CALLBACK_TERMINAL_STATUSES.includes(value as CallbackTerminalStatus);
}

export function normalizeCallbackTerminalStatus(
  value: unknown,
  options: NormalizeCallbackStatusOptions = {},
): CallbackTerminalStatus {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : value;
  if (isCallbackTerminalStatus(normalized)) {
    return normalized;
  }

  return options.fallbackStatus ?? 'failed';
}

export function deriveCallbackTerminalStatus({
  reportedStatus,
  passedCases,
  failedCases,
  skippedCases,
}: DeriveCallbackStatusInput): CallbackTerminalStatus {
  if (failedCases > 0) {
    return 'failed';
  }

  if (passedCases > 0) {
    return 'success';
  }

  if (skippedCases > 0) {
    return reportedStatus === 'aborted' || reportedStatus === 'cancelled' ? reportedStatus : 'success';
  }

  return reportedStatus;
}
