import type {
  BrunoReporter,
  BrunoRunArtifactPaths,
  BrunoRunConfig,
  BrunoTargetType,
} from '@shared/types/bruno';

const TARGET_TYPES = new Set<BrunoTargetType>(['collection', 'folder', 'request']);
const REPORTERS = new Set<BrunoReporter>(['json', 'junit', 'html']);
const SAFE_SEGMENT = /^[a-zA-Z0-9._@/ -]+$/;
const DEFAULT_TIMEOUT_MS = 600000;

function assertSafeRelativePath(value: string, fieldName: string): void {
  const normalized = value.replace(/\\/g, '/');
  if (
    normalized.length === 0 ||
    normalized.startsWith('/') ||
    normalized.includes('..') ||
    !SAFE_SEGMENT.test(normalized)
  ) {
    throw new Error(`${fieldName} must be a safe relative path`);
  }
}

function toPositiveInt(value: unknown, fieldName: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${fieldName} must be a positive integer`);
  }
  return parsed;
}

function toStringArray(value: unknown, fieldName: string): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw new Error(`${fieldName} must be an array`);
  return value.map((item) => {
    if (typeof item !== 'string' || item.trim().length === 0) {
      throw new Error(`${fieldName} must contain non-empty strings`);
    }
    return item.trim();
  });
}

function toEnvVars(value: unknown): Record<string, string> | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('envVars must be an object');
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, rawValue]) => {
      if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key)) {
        throw new Error(`envVars contains invalid key: ${key}`);
      }
      if (typeof rawValue !== 'string') {
        throw new Error(`envVars.${key} must be a string`);
      }
      return [key, rawValue];
    }),
  );
}

export function validateBrunoRunConfig(raw: unknown): BrunoRunConfig {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new Error('Bruno run config must be an object');
  }

  const input = raw as Record<string, unknown>;
  const repositoryId = toPositiveInt(input.repositoryId, 'repositoryId');

  if (typeof input.collectionPath !== 'string') {
    throw new Error('collectionPath must be a string');
  }
  assertSafeRelativePath(input.collectionPath, 'collectionPath');

  const targetType = input.targetType ?? 'collection';
  if (typeof targetType !== 'string' || !TARGET_TYPES.has(targetType as BrunoTargetType)) {
    throw new Error('targetType must be collection, folder, or request');
  }

  let targetPath: string | undefined;
  if (input.targetPath !== undefined) {
    if (typeof input.targetPath !== 'string') {
      throw new Error('targetPath must be a string');
    }
    assertSafeRelativePath(input.targetPath, 'targetPath');
    targetPath = input.targetPath;
  }

  if (targetType !== 'collection' && !targetPath) {
    throw new Error('targetPath is required for folder and request runs');
  }

  const tags = toStringArray(input.tags, 'tags');
  const reporters = toStringArray(input.reporters, 'reporters') as BrunoReporter[] | undefined;
  if (reporters) {
    for (const reporter of reporters) {
      if (!REPORTERS.has(reporter)) {
        throw new Error('reporters contains unsupported value');
      }
    }
  }

  if (input.environmentName !== undefined && typeof input.environmentName !== 'string') {
    throw new Error('environmentName must be a string');
  }

  const timeoutMs = input.timeoutMs === undefined
    ? DEFAULT_TIMEOUT_MS
    : toPositiveInt(input.timeoutMs, 'timeoutMs');

  return {
    repositoryId,
    collectionPath: input.collectionPath,
    targetType: targetType as BrunoTargetType,
    targetPath,
    environmentName: input.environmentName as string | undefined,
    tags,
    envVars: toEnvVars(input.envVars),
    timeoutMs,
    reporters: reporters ?? ['json', 'html'],
  };
}

export function buildBruRunArguments(
  config: BrunoRunConfig,
  paths: BrunoRunArtifactPaths,
): string[] {
  const args = ['run'];

  if (config.targetType !== 'collection' && config.targetPath) {
    args.push(config.targetPath);
  }

  if (config.environmentName) {
    args.push('--env', config.environmentName);
  }

  args.push('--workspace-path', paths.workspacePath);

  if (config.tags && config.tags.length > 0) {
    args.push('--tags', config.tags.join(','));
  }

  for (const [key, value] of Object.entries(config.envVars ?? {})) {
    args.push('--env-var', `${key}=${value}`);
  }

  if (config.reporters?.includes('json')) {
    args.push('--reporter-json', paths.jsonReportPath);
  }
  if (config.reporters?.includes('junit') && paths.junitReportPath) {
    args.push('--reporter-junit', paths.junitReportPath);
  }
  if (config.reporters?.includes('html') && paths.htmlReportPath) {
    args.push('--reporter-html', paths.htmlReportPath);
  }

  return args;
}
