import { promises as fs } from 'fs';
import path from 'path';

import type { JenkinsTriggerResult } from '../services/JenkinsService';
import { buildJenkinsTriggerFailureDiagnostic } from './jenkinsTriggerDiagnostics';
import logger from './logger';

type TriggerFailureContext = {
  runId: number;
  source: 'scheduler' | 'run-case' | 'run-batch';
  traceId?: string;
  baseUrl?: string;
  jobName?: string;
  callbackUrl?: string;
  scriptPaths?: string[];
  caseIds?: number[];
};

type TriggerFailureResult = Pick<JenkinsTriggerResult, 'message' | 'errorCategory'>;

export interface PersistedJenkinsTriggerDiagnostic {
  absolutePath: string;
  publicPath: string;
  diagnostic: ReturnType<typeof buildJenkinsTriggerFailureDiagnostic>;
}

function resolveDiagnosticLogDir(): string {
  const configuredDir = process.env.RUNTIME_LOG_DIR?.trim();
  if (configuredDir) {
    return path.isAbsolute(configuredDir)
      ? configuredDir
      : path.resolve(process.cwd(), configuredDir);
  }

  return path.resolve(process.cwd(), 'public', 'runtime-logs', 'jenkins-trigger');
}

function buildFileTimestamp(now: Date): string {
  return now.toISOString().replace(/[:.]/g, '-');
}

function buildPublicPath(fileName: string): string {
  const basePath = process.env.RUNTIME_LOG_PUBLIC_BASE?.trim() || '/public/runtime-logs/jenkins-trigger';
  return `${basePath.replace(/\/+$/, '')}/${fileName}`;
}

function renderDiagnosticFile(
  triggerResult: TriggerFailureResult,
  context: TriggerFailureContext,
  diagnostic: ReturnType<typeof buildJenkinsTriggerFailureDiagnostic>,
  publicPath: string,
  absolutePath: string,
  createdAt: Date
): string {
  const lines = [
    '# Jenkins Trigger Failure Diagnostic',
    '',
    `[meta]`,
    `createdAt=${createdAt.toISOString()}`,
    `source=${context.source}`,
    `runId=${context.runId}`,
    context.traceId ? `traceId=${context.traceId}` : undefined,
    '',
    `[jenkins]`,
    context.baseUrl ? `baseUrl=${context.baseUrl}` : undefined,
    context.jobName ? `jobName=${context.jobName}` : undefined,
    context.callbackUrl ? `callbackUrl=${context.callbackUrl}` : undefined,
    diagnostic.logPath ? `jobUrl=${diagnostic.logPath}` : undefined,
    '',
    `[trigger]`,
    `errorCategory=${triggerResult.errorCategory}`,
    `message=${triggerResult.message}`,
    context.caseIds?.length ? `caseIds=${context.caseIds.join(',')}` : 'caseIds=',
    context.scriptPaths?.length ? `scriptPaths=${context.scriptPaths.join(',')}` : 'scriptPaths=',
    '',
    `[diagnostic]`,
    `kind=${diagnostic.kind}`,
    `errorMessage=${diagnostic.errorMessage}`,
    `abortReason=${diagnostic.abortReason}`,
    `artifactPublicPath=${publicPath}`,
    `artifactAbsolutePath=${absolutePath}`,
    '',
    `[stack]`,
    diagnostic.errorStack,
    '',
  ].filter((line): line is string => line !== undefined);

  return `${lines.join('\n')}\n`;
}

export async function persistJenkinsTriggerFailureDiagnostic(
  triggerResult: TriggerFailureResult,
  context: TriggerFailureContext
): Promise<PersistedJenkinsTriggerDiagnostic> {
  const diagnostic = buildJenkinsTriggerFailureDiagnostic(triggerResult, {
    baseUrl: context.baseUrl,
    jobName: context.jobName,
    callbackUrl: context.callbackUrl,
    scriptPaths: context.scriptPaths,
    caseIds: context.caseIds,
  });

  const createdAt = new Date();
  const logDir = resolveDiagnosticLogDir();
  const fileName = `run-${context.runId}-${buildFileTimestamp(createdAt)}.log`;
  const absolutePath = path.join(logDir, fileName);
  const publicPath = buildPublicPath(fileName);
  const body = renderDiagnosticFile(triggerResult, context, diagnostic, publicPath, absolutePath, createdAt);

  await fs.mkdir(logDir, { recursive: true });
  await fs.writeFile(absolutePath, body, 'utf8');

  logger.info('Persisted Jenkins trigger diagnostic artifact', {
    runId: context.runId,
    source: context.source,
    traceId: context.traceId,
    diagnosticKind: diagnostic.kind,
    absolutePath,
    publicPath,
  }, 'JENKINS');

  return {
    absolutePath,
    publicPath,
    diagnostic,
  };
}
