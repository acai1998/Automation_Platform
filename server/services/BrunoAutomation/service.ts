import fs from 'fs/promises';
import path from 'path';
import type { BrunoRunConfig } from '@shared/types/bruno';
import { executionService } from '../ExecutionService';
import { buildBrunoArtifactPaths } from './artifacts';
import { parseBrunoJsonReport } from './reportParser';
import { BrunoRunnerService } from './runner';

interface RunManualInput {
  projectId: number;
  triggeredBy: number | null;
  caseIds: number[];
  caseNameById: Map<number, string>;
  config: BrunoRunConfig;
}

interface BrunoAutomationServiceOptions {
  runner?: Pick<BrunoRunnerService, 'run'>;
  readJsonReport?: (filePath: string) => Promise<unknown>;
  resolveRepositoryCheckoutPath?: (repositoryId: number) => Promise<string>;
  artifactRoot?: string;
}

async function defaultReadJsonReport(filePath: string): Promise<unknown> {
  return JSON.parse(await fs.readFile(filePath, 'utf8'));
}

async function defaultResolveRepositoryCheckoutPath(repositoryId: number): Promise<string> {
  return path.resolve(process.env.BRUNO_REPOSITORY_ROOT ?? 'tmp/bruno-repositories', `repo-${repositoryId}`);
}

export class BrunoAutomationService {
  private readonly runner: Pick<BrunoRunnerService, 'run'>;
  private readonly readJsonReport: (filePath: string) => Promise<unknown>;
  private readonly resolveRepositoryCheckoutPath: (repositoryId: number) => Promise<string>;
  private readonly artifactRoot: string;

  constructor(options: BrunoAutomationServiceOptions = {}) {
    this.runner = options.runner ?? new BrunoRunnerService();
    this.readJsonReport = options.readJsonReport ?? defaultReadJsonReport;
    this.resolveRepositoryCheckoutPath = options.resolveRepositoryCheckoutPath ?? defaultResolveRepositoryCheckoutPath;
    this.artifactRoot = options.artifactRoot ?? path.resolve(process.env.BRUNO_ARTIFACT_ROOT ?? 'tmp/bruno-runs');
  }

  async runManual(input: RunManualInput): Promise<{ runId: number; executionId: number }> {
    const execution = await executionService.triggerTestExecution({
      caseIds: input.caseIds,
      projectId: input.projectId,
      triggeredBy: input.triggeredBy,
      triggerType: 'manual',
      runConfig: {
        engine: 'bruno',
        bruno: input.config,
      },
    });

    const checkoutPath = await this.resolveRepositoryCheckoutPath(input.config.repositoryId);
    const artifactPaths = buildBrunoArtifactPaths({
      repositoryCheckoutRoot: checkoutPath,
      artifactRoot: this.artifactRoot,
      runId: execution.runId,
    });

    await fs.mkdir(path.dirname(artifactPaths.jsonReportPath), { recursive: true });
    await this.runner.run({
      config: input.config,
      paths: artifactPaths,
    });

    const rawReport = await this.readJsonReport(artifactPaths.jsonReportPath);
    const caseIdByName = new Map(
      [...input.caseNameById.entries()].map(([caseId, caseName]) => [caseName, caseId]),
    );
    const parsed = parseBrunoJsonReport(rawReport, caseIdByName);

    await executionService.completeBatchExecution(execution.runId, {
      status: parsed.status,
      passedCases: parsed.passedCases,
      failedCases: parsed.failedCases,
      skippedCases: parsed.skippedCases,
      durationMs: parsed.durationMs,
      results: parsed.results,
    });

    return {
      runId: execution.runId,
      executionId: execution.executionId,
    };
  }
}

export const brunoAutomationService = new BrunoAutomationService();
