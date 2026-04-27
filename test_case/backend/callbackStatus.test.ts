import { describe, expect, it } from 'vitest';

import {
  deriveCallbackTerminalStatus,
  normalizeCallbackTerminalStatus,
} from '../../server/services/ExecutionService/callbackStatus';

describe('callback status derivation', () => {
  it('treats mixed passed and failed case results as failed overall', () => {
    const status = deriveCallbackTerminalStatus({
      reportedStatus: normalizeCallbackTerminalStatus('failed'),
      passedCases: 2,
      failedCases: 1,
      skippedCases: 0,
    });

    expect(status).toBe('failed');
  });

  it('prefers real case counts over a failed pipeline status when all executed cases passed', () => {
    const status = deriveCallbackTerminalStatus({
      reportedStatus: normalizeCallbackTerminalStatus('failed'),
      passedCases: 2,
      failedCases: 0,
      skippedCases: 1,
    });

    expect(status).toBe('success');
  });

  it('keeps aborted callbacks as aborted when there are no executed case results', () => {
    const status = deriveCallbackTerminalStatus({
      reportedStatus: normalizeCallbackTerminalStatus('aborted'),
      passedCases: 0,
      failedCases: 0,
      skippedCases: 0,
    });

    expect(status).toBe('aborted');
  });
});
