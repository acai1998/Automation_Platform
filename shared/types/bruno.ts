export type BrunoTargetType = 'collection' | 'folder' | 'request';
export type BrunoReporter = 'json' | 'junit' | 'html';

export interface BrunoRunConfig {
  repositoryId: number;
  collectionPath: string;
  targetType: BrunoTargetType;
  targetPath?: string;
  environmentName?: string;
  tags?: string[];
  envVars?: Record<string, string>;
  timeoutMs?: number;
  reporters?: BrunoReporter[];
}

export interface BrunoRunArtifactPaths {
  workspacePath: string;
  jsonReportPath: string;
  junitReportPath?: string;
  htmlReportPath?: string;
}

export interface BrunoRepositoryInput {
  name: string;
  projectId: number;
  gitUrl: string;
  defaultBranch: string;
  collectionRoot: string;
  authSecretRef?: string;
}

export interface BrunoRepositoryRecord extends BrunoRepositoryInput {
  id: number;
  lastSyncCommit: string | null;
  lastSyncStatus: 'never' | 'success' | 'failed';
  lastSyncError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BrunoRequestIndex {
  name: string;
  method: string;
  relativePath: string;
  folderPath: string | null;
  urlTemplate: string | null;
  tags: string[];
  hasTests: boolean;
  hasScripts: boolean;
}

export interface BrunoNormalizedResult {
  caseId?: number;
  caseName: string;
  status: 'passed' | 'failed' | 'skipped' | 'error';
  duration: number;
  errorMessage?: string;
  assertionsTotal?: number;
  assertionsPassed?: number;
  responseData?: string;
}
