import { query, queryOne } from '../../config/database';
import type { ScheduledTask } from './types';

interface BaseTaskRow {
  id: number;
  name: string;
  cron_expression: string | null;
  case_ids: string | null;
  project_id: number | null;
  environment_id: number | null;
  status: 'active' | 'paused' | 'archived';
  max_retries: number | null;
  retry_delay_ms: number | null;
}

interface ScheduledTaskRow extends BaseTaskRow {
  last_run_at: string | null;
}

export interface TaskPollRow extends BaseTaskRow {
  trigger_type: string;
}

function parseCaseIds(caseIds: string | null): number[] {
  try {
    return JSON.parse(caseIds || '[]') as number[];
  } catch {
    return [];
  }
}

function mapRowToScheduledTask(row: ScheduledTaskRow): ScheduledTask {
  return {
    id: row.id,
    name: row.name,
    cronExpression: row.cron_expression || '',
    caseIds: parseCaseIds(row.case_ids),
    projectId: row.project_id || 1,
    environmentId: row.environment_id ?? undefined,
    status: row.status,
    maxRetries: row.max_retries ?? 1,
    retryDelayMs: row.retry_delay_ms ?? 30_000,
    lastRunAt: row.last_run_at ? new Date(row.last_run_at) : null,
  };
}

export async function loadAllScheduledTasks(): Promise<ScheduledTask[]> {
  const rows = await query<ScheduledTaskRow[]>(`
    SELECT t.id, t.name, t.cron_expression, t.case_ids, t.project_id,
           t.environment_id, t.status,
           t.max_retries, t.retry_delay_ms,
           (SELECT MAX(created_at) FROM Auto_TestCaseTaskExecutions WHERE task_id = t.id) as last_run_at
    FROM Auto_TestCaseTasks t
    WHERE t.trigger_type = 'scheduled'
      AND t.status IN ('active', 'paused')
  `);

  return rows
    .filter((row) => Boolean(row.cron_expression))
    .map(mapRowToScheduledTask);
}

export async function loadScheduledTaskById(taskId: number): Promise<ScheduledTask | null> {
  interface TaskByIdRow extends ScheduledTaskRow {
    trigger_type: string;
  }

  const row = await queryOne<TaskByIdRow>(
    `SELECT t.id, t.name, t.cron_expression, t.case_ids, t.project_id, t.environment_id,
            t.status, t.max_retries, t.retry_delay_ms, t.trigger_type,
            (SELECT MAX(created_at) FROM Auto_TestCaseTaskExecutions WHERE task_id = t.id) as last_run_at
     FROM Auto_TestCaseTasks t WHERE t.id = ?`,
    [taskId],
  );

  if (!row || row.trigger_type !== 'scheduled' || !row.cron_expression) {
    return null;
  }

  return mapRowToScheduledTask(row);
}

export async function loadScheduledTaskPollRows(): Promise<TaskPollRow[]> {
  return query<TaskPollRow[]>(`
    SELECT id, name, cron_expression, case_ids, project_id, environment_id, status, max_retries, retry_delay_ms, trigger_type
    FROM Auto_TestCaseTasks
    WHERE trigger_type = 'scheduled'
  `);
}

export async function loadLastRunAt(taskId: number): Promise<Date | null> {
  const row = await queryOne<{ last_run_at: string | null }>(
    `SELECT MAX(created_at) as last_run_at FROM Auto_TestCaseTaskExecutions WHERE task_id = ?`,
    [taskId],
  );

  return row?.last_run_at ? new Date(row.last_run_at) : null;
}

export function mapPollRowToScheduledTask(row: TaskPollRow, lastRunAt: Date | null): ScheduledTask | null {
  if (!row.cron_expression) {
    return null;
  }

  return {
    id: row.id,
    name: row.name,
    cronExpression: row.cron_expression,
    caseIds: parseCaseIds(row.case_ids),
    projectId: row.project_id || 1,
    environmentId: row.environment_id ?? undefined,
    status: row.status,
    maxRetries: row.max_retries ?? 1,
    retryDelayMs: row.retry_delay_ms ?? 30_000,
    lastRunAt,
  };
}
