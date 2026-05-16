import logger from '../utils/logger';
import { LOG_CONTEXTS } from '../config/logging';
import type { DailySummaryData } from './DashboardRepositoryTypes';

export function parseSafeInt(
  value: string | number | null | undefined,
  defaultValue: number = 0
): number {
  if (value === null || value === undefined) {
    return defaultValue;
  }

  const parsed = typeof value === 'string' ? parseInt(value, 10) : value;
  return Number.isNaN(parsed) ? defaultValue : parsed;
}

export function parseSafeFloat(
  value: string | number | null | undefined,
  defaultValue: number = 0
): number {
  if (value === null || value === undefined) {
    return defaultValue;
  }

  const parsed = typeof value === 'string' ? parseFloat(value) : value;
  return Number.isNaN(parsed) ? defaultValue : parsed;
}

export function calculatePercentage(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return Math.round(((current - previous) / previous) * 10000) / 100;
}

export function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function* generateDateRange(days: number): Generator<string> {
  const today = new Date();
  for (let i = 1; i <= days; i++) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    yield formatLocalDate(date);
  }
}

export function parseStatsResult<T extends Record<string, string>>(
  result: T[],
  defaultValue: T
): T {
  return result[0] || defaultValue;
}

export function normalizeDailySummaryRows(
  rows: Array<{
    date: string;
    totalExecutions: string | number | null;
    passedCases: string | number | null;
    failedCases: string | number | null;
    skippedCases: string | number | null;
    successRate: string | number | null;
  }>
): DailySummaryData[] {
  return rows.map((row) => {
    const passedCases = parseSafeInt(row.passedCases, 0);
    const failedCases = parseSafeInt(row.failedCases, 0);
    const skippedCases = parseSafeInt(row.skippedCases, 0);
    const totalCases = passedCases + failedCases + skippedCases;
    const successRate = totalCases > 0
      ? Math.round((passedCases / totalCases) * 10000) / 100
      : 0;

    return {
      date: row.date,
      totalExecutions: parseSafeInt(row.totalExecutions, 0),
      passedCases,
      failedCases,
      skippedCases,
      successRate,
    };
  });
}

export function buildContinuousTrendData(days: number, rows: DailySummaryData[]): DailySummaryData[] {
  const rowMap = new Map(rows.map((row) => [row.date, row]));
  const continuousData: DailySummaryData[] = [];

  for (const date of generateDateRange(days)) {
    continuousData.push(
      rowMap.get(date) ?? {
        date,
        totalExecutions: 0,
        passedCases: 0,
        failedCases: 0,
        skippedCases: 0,
        successRate: 0,
      }
    );
  }

  return continuousData.reverse();
}

export function hasTrendExecutionData(rows: DailySummaryData[]): boolean {
  return rows.some((row) =>
    row.totalExecutions > 0 ||
    row.passedCases > 0 ||
    row.failedCases > 0 ||
    row.skippedCases > 0
  );
}

export function calculateSuccessRate(passed: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((passed / total) * 10000) / 100;
}

export function logDashboard(
  level: 'debug' | 'info' | 'warn' | 'error',
  message: string,
  data?: Record<string, unknown>,
  context: string = LOG_CONTEXTS.DASHBOARD,
  error?: unknown
): void {
  if (level === 'debug') {
    logger.debug(message, data, context);
  } else if (level === 'info') {
    logger.info(message, data, context);
  } else if (level === 'warn') {
    logger.warn(message, data, context);
  } else {
    logger.errorLog(error ?? new Error(message), message, {
      context,
      ...data,
    });
  }
}
