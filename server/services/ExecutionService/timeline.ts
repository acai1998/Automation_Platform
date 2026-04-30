import { AppDataSource } from '../../config/database';

export interface SchedulerTraceLogEntry {
  id: string;
  source: 'run' | 'audit';
  action: string;
  createdAt: string | null;
  operatorId: number | null;
  operatorName: string | null;
  message: string;
  metadata: Record<string, unknown>;
}

export async function getSchedulerTraceLogs(
  runId: number,
  buildBatchNotFoundMessage: (id: number) => string,
): Promise<SchedulerTraceLogEntry[]> {
  const runRows = await AppDataSource.query(
    `SELECT r.id AS runId,
            r.execution_id AS executionId,
            r.status AS runStatus,
            r.trigger_type AS triggerType,
            r.created_at AS runCreatedAt,
            te.task_id AS taskId,
            te.created_at AS executionCreatedAt,
            te.start_time AS executionStartTime,
            te.end_time AS executionEndTime
     FROM Auto_TestRun r
     LEFT JOIN Auto_TestCaseTaskExecutions te ON r.execution_id = te.id
     WHERE r.id = ?
     LIMIT 1`,
    [runId],
  ) as Array<{
    runId: number;
    executionId: number | null;
    runStatus: string;
    triggerType: string;
    runCreatedAt: string | null;
    taskId: number | null;
    executionCreatedAt: string | null;
    executionStartTime: string | null;
    executionEndTime: string | null;
  }>;

  const runRow = runRows[0];
  if (!runRow) {
    throw new Error(buildBatchNotFoundMessage(runId));
  }

  const timeline: SchedulerTraceLogEntry[] = [];

  timeline.push({
    id: `run-created-${runId}`,
    source: 'run',
    action: 'run_created',
    createdAt: runRow.runCreatedAt,
    operatorId: null,
    operatorName: null,
    message: '运行记录已创建',
    metadata: {
      runId,
      executionId: runRow.executionId,
      taskId: runRow.taskId,
      triggerType: runRow.triggerType,
      status: runRow.runStatus,
    },
  });

  if (runRow.executionStartTime) {
    timeline.push({
      id: `run-started-${runId}`,
      source: 'run',
      action: 'run_started',
      createdAt: runRow.executionStartTime,
      operatorId: null,
      operatorName: null,
      message: '任务进入运行中',
      metadata: {
        runId,
        executionId: runRow.executionId,
        taskId: runRow.taskId,
      },
    });
  }

  if (runRow.executionEndTime) {
    timeline.push({
      id: `run-ended-${runId}`,
      source: 'run',
      action: 'run_finished',
      createdAt: runRow.executionEndTime,
      operatorId: null,
      operatorName: null,
      message: `任务结束（${runRow.runStatus}）`,
      metadata: {
        runId,
        executionId: runRow.executionId,
        taskId: runRow.taskId,
        status: runRow.runStatus,
      },
    });
  }

  if (runRow.taskId) {
    const anchorTime = runRow.runCreatedAt ?? runRow.executionCreatedAt ?? new Date().toISOString();
    const logs = await AppDataSource.query(
      `SELECT a.id,
              a.action,
              a.operator_id AS operatorId,
              u.display_name AS operatorName,
              a.metadata,
              a.created_at AS createdAt
       FROM Auto_TaskAuditLogs a
       LEFT JOIN Auto_Users u ON a.operator_id = u.id
       WHERE a.task_id = ?
         AND (
           JSON_UNQUOTE(JSON_EXTRACT(a.metadata, '$.runId')) = ?
           OR JSON_UNQUOTE(JSON_EXTRACT(a.metadata, '$.executionId')) = ?
           OR a.created_at BETWEEN DATE_SUB(?, INTERVAL 15 MINUTE) AND DATE_ADD(?, INTERVAL 15 MINUTE)
         )
       ORDER BY a.created_at ASC
       LIMIT 200`,
      [
        runRow.taskId,
        String(runId),
        runRow.executionId != null ? String(runRow.executionId) : '-1',
        anchorTime,
        anchorTime,
      ],
    ) as Array<{
      id: number;
      action: string;
      operatorId: number | null;
      operatorName: string | null;
      metadata: string | null;
      createdAt: string | null;
    }>;

    const actionMessageMap: Record<string, string> = {
      compensated: '检测到漏触发并执行补偿',
      triggered: '调度触发执行',
      manually_triggered: '手动触发执行',
      retry_scheduled: '调度失败后进入重试队列',
      permanently_failed: '达到最大重试次数，任务失败',
      duplicate_scheduled_skipped: '同一 Cron 窗口重复触发，已跳过',
    };

    for (const row of logs) {
      let metadata: Record<string, unknown> = {};
      if (row.metadata) {
        try {
          const parsed = JSON.parse(row.metadata);
          if (parsed && typeof parsed === 'object') {
            metadata = parsed as Record<string, unknown>;
          }
        } catch {
          metadata = { raw: row.metadata };
        }
      }

      timeline.push({
        id: `audit-${row.id}`,
        source: 'audit',
        action: row.action,
        createdAt: row.createdAt,
        operatorId: row.operatorId,
        operatorName: row.operatorName,
        message: actionMessageMap[row.action] ?? row.action,
        metadata,
      });
    }
  }

  timeline.sort((a, b) => {
    const at = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const bt = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return at - bt;
  });

  return timeline;
}
