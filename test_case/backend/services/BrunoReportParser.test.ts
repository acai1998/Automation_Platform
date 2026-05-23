import { describe, expect, it } from 'vitest';
import { parseBrunoJsonReport } from '../../../server/services/BrunoAutomation/reportParser';

describe('parseBrunoJsonReport', () => {
  it('normalizes request results and assertion failures', () => {
    const normalized = parseBrunoJsonReport(
      {
        results: [
          {
            name: 'Create Order',
            status: 'passed',
            duration: 123,
            assertions: { total: 2, passed: 2, failed: 0 },
            request: { method: 'POST', url: 'https://example.test/orders' },
          },
          {
            name: 'Get Order',
            status: 'failed',
            duration: 80,
            error: 'expected 200 but got 500',
            assertions: { total: 1, passed: 0, failed: 1 },
          },
        ],
      },
      new Map([
        ['Create Order', 11],
        ['Get Order', 12],
      ]),
    );

    expect(normalized.status).toBe('failed');
    expect(normalized.passedCases).toBe(1);
    expect(normalized.failedCases).toBe(1);
    expect(normalized.results).toEqual([
      expect.objectContaining({
        caseId: 11,
        caseName: 'Create Order',
        status: 'passed',
        duration: 123,
        assertionsTotal: 2,
        assertionsPassed: 2,
      }),
      expect.objectContaining({
        caseId: 12,
        caseName: 'Get Order',
        status: 'failed',
        duration: 80,
        errorMessage: 'expected 200 but got 500',
      }),
    ]);
  });

  it('treats malformed report shapes as parser errors', () => {
    expect(() => parseBrunoJsonReport({ nope: [] }, new Map())).toThrow(
      'BRUNO_REPORT_PARSE_FAILED',
    );
  });
});
