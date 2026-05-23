import path from 'path';
import type { BrunoRunArtifactPaths } from '@shared/types/bruno';

export interface BuildBrunoArtifactPathsInput {
  repositoryCheckoutRoot: string;
  artifactRoot: string;
  runId: number;
}

export function buildBrunoArtifactPaths(input: BuildBrunoArtifactPathsInput): BrunoRunArtifactPaths {
  const runRoot = path.join(input.artifactRoot, `run-${input.runId}`);

  return {
    workspacePath: input.repositoryCheckoutRoot,
    jsonReportPath: path.join(runRoot, 'results.json'),
    junitReportPath: path.join(runRoot, 'junit.xml'),
    htmlReportPath: path.join(runRoot, 'report.html'),
  };
}
