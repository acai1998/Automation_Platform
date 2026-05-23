import type { BrunoNormalizedResult } from '@shared/types/bruno';

interface BrunoReportItem {
  name?: unknown;
  status?: unknown;
  duration?: unknown;
  error?: unknown;
  assertions?: {
    total?: unknown;
    passed?: unknown;
    failed?: unknown;
  };
  request?: {
    method?: unknown;
    url?: unknown;
  };
}

export interface BrunoParsedReport {
  status: 'success' | 'failed';
  passedCases: number;
  failedCases: number;
  skippedCases: number;
  durationMs: number;
  results: BrunoNormalizedResult[];
}

function asString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim().length > 0 ? value : fallback;
}

function asNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function normalizeStatus(status: unknown): BrunoNormalizedResult['status'] {
  if (status === 'passed' || status === 'success') return 'passed';
  if (status === 'skipped') return 'skipped';
  if (status === 'error') return 'error';
  return 'failed';
}

export function parseBrunoJsonReport(
  raw: unknown,
  caseIdByName: Map<string, number>,
): BrunoParsedReport {
  if (typeof raw !== 'object' || raw === null || !Array.isArray((raw as { results?: unknown }).results)) {
    throw new Error('BRUNO_REPORT_PARSE_FAILED: expected results array');
  }

  const results = ((raw as { results: BrunoReportItem[] }).results).map((item, index) => {
    const caseName = asString(item.name, `Bruno Request ${index + 1}`);
    const status = normalizeStatus(item.status);
    const assertionsTotal = asNumber(item.assertions?.total);
    const assertionsPassed = asNumber(item.assertions?.passed);
    const responseData = item.request
      ? JSON.stringify({
          method: item.request.method,
          url: item.request.url,
        })
      : undefined;

    return {
      caseId: caseIdByName.get(caseName),
      caseName,
      status,
      duration: asNumber(item.duration),
      errorMessage: typeof item.error === 'string' ? item.error : undefined,
      assertionsTotal,
      assertionsPassed,
      responseData,
    };
  });

  const passedCases = results.filter((item) => item.status === 'passed').length;
  const skippedCases = results.filter((item) => item.status === 'skipped').length;
  const failedCases = results.length - passedCases - skippedCases;
  const durationMs = results.reduce((total, item) => total + item.duration, 0);

  return {
    status: failedCases > 0 ? 'failed' : 'success',
    passedCases,
    failedCases,
    skippedCases,
    durationMs,
    results,
  };
}
