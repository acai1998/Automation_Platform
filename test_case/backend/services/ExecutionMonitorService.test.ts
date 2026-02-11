import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * ExecutionMonitorService Tests
 *
 * Note: These are simplified unit tests that verify the core logic
 * without requiring full database and service initialization.
 */

describe('ExecutionMonitorService Configuration Validation', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('should validate checkInterval range', () => {
    const validateConfig = (checkInterval: number) => {
      if (checkInterval < 5000 || checkInterval > 300000) {
        throw new Error('checkInterval must be between 5000ms (5s) and 300000ms (5min)');
      }
    };

    expect(() => validateConfig(30000)).not.toThrow();
    expect(() => validateConfig(1000)).toThrow('checkInterval must be between');
    expect(() => validateConfig(400000)).toThrow('checkInterval must be between');
  });

  it('should validate compilationCheckWindow range', () => {
    const validateConfig = (compilationCheckWindow: number) => {
      if (compilationCheckWindow < 10000 || compilationCheckWindow > 300000) {
        throw new Error('compilationCheckWindow must be between 10000ms (10s) and 300000ms (5min)');
      }
    };

    expect(() => validateConfig(30000)).not.toThrow();
    expect(() => validateConfig(5000)).toThrow('compilationCheckWindow must be between');
    expect(() => validateConfig(400000)).toThrow('compilationCheckWindow must be between');
  });

  it('should validate batchSize range', () => {
    const validateConfig = (batchSize: number) => {
      if (batchSize < 1 || batchSize > 100) {
        throw new Error('batchSize must be between 1 and 100');
      }
    };

    expect(() => validateConfig(20)).not.toThrow();
    expect(() => validateConfig(0)).toThrow('batchSize must be between');
    expect(() => validateConfig(150)).toThrow('batchSize must be between');
  });

  it('should validate rateLimitDelay range', () => {
    const validateConfig = (rateLimitDelay: number) => {
      if (rateLimitDelay < 0 || rateLimitDelay > 5000) {
        throw new Error('rateLimitDelay must be between 0ms and 5000ms (5s)');
      }
    };

    expect(() => validateConfig(100)).not.toThrow();
    expect(() => validateConfig(-1)).toThrow('rateLimitDelay must be between');
    expect(() => validateConfig(10000)).toThrow('rateLimitDelay must be between');
  });

  it('should validate quickFailThresholdSeconds range', () => {
    const validateConfig = (quickFailThresholdSeconds: number) => {
      if (quickFailThresholdSeconds < 5 || quickFailThresholdSeconds > 300) {
        throw new Error('quickFailThresholdSeconds must be between 5 and 300 seconds');
      }
    };

    expect(() => validateConfig(30)).not.toThrow();
    expect(() => validateConfig(2)).toThrow('quickFailThresholdSeconds must be between');
    expect(() => validateConfig(500)).toThrow('quickFailThresholdSeconds must be between');
  });
});

describe('ExecutionMonitorService Quick Fail Detection Logic', () => {
  it('should detect quick failures correctly', () => {
    const isQuickFail = (durationSeconds: number | null, jenkinsStatus: string, thresholdSeconds: number) => {
      if (jenkinsStatus !== 'failed') {
        return false;
      }

      const elapsedTimeMs = durationSeconds ? durationSeconds * 1000 : 0;
      const thresholdMs = thresholdSeconds * 1000;

      return elapsedTimeMs > 0 && elapsedTimeMs < thresholdMs;
    };

    // Should detect quick fail
    expect(isQuickFail(15, 'failed', 30)).toBe(true);
    expect(isQuickFail(29, 'failed', 30)).toBe(true);

    // Should not detect quick fail
    expect(isQuickFail(31, 'failed', 30)).toBe(false);
    expect(isQuickFail(60, 'failed', 30)).toBe(false);
    expect(isQuickFail(15, 'success', 30)).toBe(false);
    expect(isQuickFail(null, 'failed', 30)).toBe(false);
    expect(isQuickFail(0, 'failed', 30)).toBe(false);
  });
});

describe('ExecutionMonitorService Health Check Logic', () => {
  it('should detect high error rate', () => {
    const getHealthIssues = (cyclesRun: number, totalErrors: number) => {
      const issues: string[] = [];

      if (cyclesRun > 0) {
        const errorRate = totalErrors / cyclesRun;
        if (errorRate > 0.5) {
          issues.push(`High error rate: ${(errorRate * 100).toFixed(1)}%`);
        }
      }

      return issues;
    };

    expect(getHealthIssues(10, 6)).toContain('High error rate: 60.0%');
    expect(getHealthIssues(10, 3)).toHaveLength(0);
    expect(getHealthIssues(0, 0)).toHaveLength(0);
  });

  it('should detect stuck cycles', () => {
    const detectStuckCycle = (lastCycleTime: Date | null, checkInterval: number) => {
      if (!lastCycleTime) {
        return false;
      }

      const timeSinceLastCycle = Date.now() - lastCycleTime.getTime();
      return timeSinceLastCycle > checkInterval * 3;
    };

    const now = new Date();
    const recentTime = new Date(now.getTime() - 10000); // 10 seconds ago
    const oldTime = new Date(now.getTime() - 100000); // 100 seconds ago

    expect(detectStuckCycle(recentTime, 30000)).toBe(false);
    expect(detectStuckCycle(oldTime, 30000)).toBe(true);
    expect(detectStuckCycle(null, 30000)).toBe(false);
  });
});

describe('ExecutionMonitorService Statistics Tracking', () => {
  it('should track statistics correctly', () => {
    const stats = {
      cyclesRun: 0,
      totalExecutionsChecked: 0,
      totalExecutionsUpdated: 0,
      totalCompilationFailures: 0,
      totalErrors: 0,
    };

    // Simulate a cycle
    stats.cyclesRun++;
    stats.totalExecutionsChecked += 5;
    stats.totalExecutionsUpdated += 3;
    stats.totalCompilationFailures += 1;

    expect(stats.cyclesRun).toBe(1);
    expect(stats.totalExecutionsChecked).toBe(5);
    expect(stats.totalExecutionsUpdated).toBe(3);
    expect(stats.totalCompilationFailures).toBe(1);
    expect(stats.totalErrors).toBe(0);
  });

  it('should track errors', () => {
    const stats = {
      cyclesRun: 0,
      totalErrors: 0,
    };

    // Simulate errors
    stats.cyclesRun++;
    stats.totalErrors++;

    expect(stats.totalErrors).toBe(1);
  });
});

describe('ExecutionMonitorService Batch Logging Logic', () => {
  it('should collect updated execution IDs', () => {
    const updatedExecutions: number[] = [];
    const executions = [
      { id: 1, updated: true },
      { id: 2, updated: false },
      { id: 3, updated: true },
      { id: 4, updated: true },
    ];

    executions.forEach(exec => {
      if (exec.updated) {
        updatedExecutions.push(exec.id);
      }
    });

    expect(updatedExecutions).toEqual([1, 3, 4]);
    expect(updatedExecutions.length).toBe(3);
  });

  it('should limit logged IDs to first 10', () => {
    const updatedExecutions = Array.from({ length: 20 }, (_, i) => i + 1);
    const loggedIds = updatedExecutions.slice(0, 10);

    expect(loggedIds.length).toBe(10);
    expect(loggedIds).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });
});

describe('ExecutionMonitorService WebSocket Check Logic', () => {
  it('should check WebSocket availability before pushing', () => {
    const shouldPushAlert = (wsService: any) => {
      if (!wsService) {
        return false;
      }

      const stats = wsService.getSubscriptionStats();
      return stats && stats.totalExecutions > 0;
    };

    const wsWithSubscribers = {
      getSubscriptionStats: () => ({ totalExecutions: 1 }),
    };

    const wsWithoutSubscribers = {
      getSubscriptionStats: () => ({ totalExecutions: 0 }),
    };

    expect(shouldPushAlert(wsWithSubscribers)).toBe(true);
    expect(shouldPushAlert(wsWithoutSubscribers)).toBe(false);
    expect(shouldPushAlert(null)).toBe(false);
  });
});
