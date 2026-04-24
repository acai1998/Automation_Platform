import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

import logger from './logger';
import { LOG_CONTEXTS } from '../config/logging';

const DEFAULT_REPO_SYNC_TTL_MS = 30_000;
const REPO_SYNC_TTL_MS = Math.max(
  5_000,
  Number.parseInt(process.env.TEST_REPO_PREFLIGHT_CACHE_TTL_MS ?? String(DEFAULT_REPO_SYNC_TTL_MS), 10)
    || DEFAULT_REPO_SYNC_TTL_MS
);
const CACHE_ROOT = path.join(os.tmpdir(), 'automation-platform-test-repo-cache');

interface RepoCacheState {
  lastSyncedAt: number;
  localPath: string;
  inFlight?: Promise<string>;
}

const repoCache = new Map<string, RepoCacheState>();

function runGit(args: string[], cwd?: string): void {
  execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function getCacheKey(repoUrl: string, branch: string): string {
  return crypto.createHash('sha1').update(`${repoUrl}#${branch}`).digest('hex');
}

function getCachedRepoPath(repoUrl: string, branch: string): string {
  return path.join(CACHE_ROOT, getCacheKey(repoUrl, branch));
}

export function normalizeRequestedScriptPath(rawScriptPath: string): string {
  const trimmed = rawScriptPath.trim();
  if (!trimmed) return '';

  const filePath = trimmed.includes('::')
    ? trimmed.split(/::/, 2)[0].trim()
    : trimmed;

  return filePath.replace(/\\/g, '/').replace(/^\/+/, '');
}

export function findMissingScriptPaths(
  scriptPaths: string[],
  fileExists: (relativePath: string) => boolean
): string[] {
  const missingPaths: string[] = [];

  for (const scriptPath of scriptPaths) {
    const normalizedPath = normalizeRequestedScriptPath(scriptPath);
    if (!normalizedPath) continue;
    if (!fileExists(normalizedPath)) {
      missingPaths.push(scriptPath);
    }
  }

  return missingPaths;
}

async function ensureRepoSnapshot(repoUrl: string, branch: string): Promise<string> {
  const cacheKey = getCacheKey(repoUrl, branch);
  const localPath = getCachedRepoPath(repoUrl, branch);
  const current = repoCache.get(cacheKey);
  const hasUsableRepo = fs.existsSync(path.join(localPath, '.git'));
  const now = Date.now();

  if (current?.inFlight) {
    return current.inFlight;
  }

  if (current && hasUsableRepo && now - current.lastSyncedAt < REPO_SYNC_TTL_MS) {
    return current.localPath;
  }

  const inFlight = Promise.resolve().then(() => {
    fs.mkdirSync(CACHE_ROOT, { recursive: true });

    if (hasUsableRepo) {
      runGit(['fetch', '--depth=1', 'origin', branch], localPath);
      runGit(['reset', '--hard', `origin/${branch}`], localPath);
    } else {
      fs.rmSync(localPath, { recursive: true, force: true });
      runGit(['clone', '--depth=1', '-b', branch, repoUrl, localPath]);
    }

    repoCache.set(cacheKey, {
      localPath,
      lastSyncedAt: Date.now(),
    });

    return localPath;
  }).catch((error: unknown) => {
    repoCache.delete(cacheKey);
    throw error;
  });

  repoCache.set(cacheKey, {
    localPath,
    lastSyncedAt: current?.lastSyncedAt ?? 0,
    inFlight,
  });

  return inFlight;
}

export async function validateScriptPathsInTestRepo(input: {
  repoUrl?: string;
  branch: string;
  scriptPaths: string[];
}): Promise<{ missingPaths: string[] }> {
  const { repoUrl, branch, scriptPaths } = input;
  if (!repoUrl || scriptPaths.length === 0) {
    return { missingPaths: [] };
  }

  try {
    const repoPath = await ensureRepoSnapshot(repoUrl, branch);
    const missingPaths = findMissingScriptPaths(scriptPaths, (relativePath) =>
      fs.existsSync(path.join(repoPath, relativePath))
    );
    return { missingPaths };
  } catch (error) {
    logger.warn('Failed to preflight script paths against test repository; falling back to Jenkins-side validation', {
      repoUrl,
      branch,
      scriptCount: scriptPaths.length,
      error: error instanceof Error ? error.message : String(error),
    }, LOG_CONTEXTS.JENKINS);
    return { missingPaths: [] };
  }
}
