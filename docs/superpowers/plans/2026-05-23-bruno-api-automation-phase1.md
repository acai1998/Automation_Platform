# Bruno API Automation Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the first native Bruno automation slice: register/sync Bruno collections, run a Bruno collection manually from the backend, and normalize Bruno reports into existing execution records.

**Architecture:** Keep Bruno as the Git-native collection format and CLI runner. Add a focused `BrunoAutomation` backend module with validation, collection parsing, report parsing, runner execution, repository persistence, and manual run orchestration. Phase 1 exposes Bruno-specific backend APIs and does not route existing scheduled tasks through Bruno yet.

**Tech Stack:** TypeScript, Express, Vitest, TypeORM repositories already present, MySQL through `server/config/database.ts`, `simple-git`, Node `child_process.spawn`, Bruno CLI (`bru run`).

---

## Scope
This plan implements Phase 1 from the approved design:

- Bruno repository registration API.
- Bruno collection sync from an already reachable Git URL.
- Bruno collection/request indexing into proposed `Auto_Bruno*` tables and `Auto_TestCase`.
- Manual Bruno run API.
- Bruno JSON/HTML artifact creation and JSON result normalization into existing execution tables.

Separate plans should cover:

- Phase 2 scheduler integration through `Auto_TestCaseTasks`.
- Phase 3 frontend Bruno workspace.
- Phase 4 GitLab webhook triggering.

## File Structure
- Create `shared/types/bruno.ts`: shared API contracts, engine config, sync/run DTOs, normalized result types.
- Create `server/services/BrunoAutomation/validation.ts`: strict input validation and CLI option allowlists.
- Create `server/services/BrunoAutomation/bruFileParser.ts`: parse `.bru` files for request metadata needed by sync.
- Create `server/services/BrunoAutomation/reportParser.ts`: parse Bruno JSON reporter output into platform results.
- Create `server/services/BrunoAutomation/artifacts.ts`: controlled checkout and report paths.
- Create `server/services/BrunoAutomation/runner.ts`: safe `bru run` argument construction and process execution.
- Create `server/services/BrunoAutomation/repository.ts`: DB operations through `query`, `queryOne`, and `getPool`.
- Create `server/services/BrunoAutomation/sync.ts`: clone/pull Bruno repositories and parse `.bru` files.
- Create `server/services/BrunoAutomation/service.ts`: orchestration for repository sync and manual run.
- Create `server/services/BrunoAutomation/index.ts`: module exports.
- Create `server/routes/bruno.ts`: REST API for repository sync, collection listing, run preview, and manual runs.
- Modify `server/index.ts`: mount `/api/bruno`.
- Create `scripts/migrate-v1.7.0-bruno.sql`: DBA-reviewable schema changes.
- Add backend tests under `test_case/backend/services/` and `test_case/backend/routes/`.

---

### Task 1: Shared Bruno Contracts And Validation

**Files:**
- Create: `shared/types/bruno.ts`
- Create: `server/services/BrunoAutomation/validation.ts`
- Test: `test_case/backend/services/BrunoValidation.test.ts`

- [ ] **Step 1: Write the failing validation tests**

Create `test_case/backend/services/BrunoValidation.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import {
  buildBruRunArguments,
  validateBrunoRunConfig,
} from '../../../server/services/BrunoAutomation/validation';

describe('BrunoAutomation validation', () => {
  it('accepts a collection run config with env, tags, and reporters', () => {
    const result = validateBrunoRunConfig({
      repositoryId: 1,
      collectionPath: 'collections/order-api',
      targetType: 'collection',
      environmentName: 'ci',
      tags: ['smoke', 'release-gate'],
      envVars: { build_id: '42' },
      timeoutMs: 300000,
      reporters: ['json', 'html'],
    });

    expect(result).toEqual({
      repositoryId: 1,
      collectionPath: 'collections/order-api',
      targetType: 'collection',
      targetPath: undefined,
      environmentName: 'ci',
      tags: ['smoke', 'release-gate'],
      envVars: { build_id: '42' },
      timeoutMs: 300000,
      reporters: ['json', 'html'],
    });
  });

  it('rejects path traversal in collection path', () => {
    expect(() =>
      validateBrunoRunConfig({
        repositoryId: 1,
        collectionPath: '../secrets',
        targetType: 'collection',
      }),
    ).toThrow('collectionPath must be a safe relative path');
  });

  it('rejects unsupported reporter names', () => {
    expect(() =>
      validateBrunoRunConfig({
        repositoryId: 1,
        collectionPath: 'collections/order-api',
        targetType: 'collection',
        reporters: ['json', 'shell' as 'json'],
      }),
    ).toThrow('reporters contains unsupported value');
  });

  it('builds bru run arguments without shell fragments', () => {
    const args = buildBruRunArguments(
      {
        repositoryId: 1,
        collectionPath: 'collections/order-api',
        targetType: 'folder',
        targetPath: 'orders',
        environmentName: 'ci',
        tags: ['smoke', 'release-gate'],
        envVars: { build_id: '42' },
        timeoutMs: 300000,
        reporters: ['json', 'junit', 'html'],
      },
      {
        jsonReportPath: 'D:/runs/1/results.json',
        junitReportPath: 'D:/runs/1/junit.xml',
        htmlReportPath: 'D:/runs/1/report.html',
        workspacePath: 'D:/repo',
      },
    );

    expect(args).toEqual([
      'run',
      'orders',
      '--env',
      'ci',
      '--workspace-path',
      'D:/repo',
      '--tags',
      'smoke,release-gate',
      '--env-var',
      'build_id=42',
      '--reporter-json',
      'D:/runs/1/results.json',
      '--reporter-junit',
      'D:/runs/1/junit.xml',
      '--reporter-html',
      'D:/runs/1/report.html',
    ]);
  });
});
```

- [ ] **Step 2: Run the validation tests and verify they fail**

Run: `npx vitest run test_case/backend/services/BrunoValidation.test.ts`

Expected: FAIL because `server/services/BrunoAutomation/validation.ts` does not exist.

- [ ] **Step 3: Add shared contracts**

Create `shared/types/bruno.ts`:

```typescript
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
```

- [ ] **Step 4: Add validation and CLI argument construction**

Create `server/services/BrunoAutomation/validation.ts`:

```typescript
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
```

- [ ] **Step 5: Run tests and commit**

Run: `npx vitest run test_case/backend/services/BrunoValidation.test.ts`

Expected: PASS.

Commit:

```bash
git add shared/types/bruno.ts server/services/BrunoAutomation/validation.ts test_case/backend/services/BrunoValidation.test.ts
git commit -m "feat: define Bruno run contracts"
```

---

### Task 2: Bruno File Parser

**Files:**
- Create: `server/services/BrunoAutomation/bruFileParser.ts`
- Test: `test_case/backend/services/BrunoFileParser.test.ts`

- [ ] **Step 1: Write the failing parser tests**

Create `test_case/backend/services/BrunoFileParser.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { parseBruRequestFile } from '../../../server/services/BrunoAutomation/bruFileParser';

describe('parseBruRequestFile', () => {
  it('extracts request metadata from a Bruno request file', () => {
    const parsed = parseBruRequestFile(
      'orders/create-order.bru',
      `meta {
  name: Create Order
  type: http
  seq: 1
}

post {
  url: {{baseUrl}}/orders
  body: json
  auth: inherit
}

tags {
  smoke
  release-gate
}

tests {
  test("returns 201", function() {
    expect(res.getStatus()).to.equal(201);
  });
}
`,
    );

    expect(parsed).toEqual({
      name: 'Create Order',
      method: 'POST',
      relativePath: 'orders/create-order.bru',
      folderPath: 'orders',
      urlTemplate: '{{baseUrl}}/orders',
      tags: ['smoke', 'release-gate'],
      hasTests: true,
      hasScripts: false,
    });
  });

  it('falls back to filename when meta name is absent', () => {
    const parsed = parseBruRequestFile(
      'health.bru',
      `get {
  url: {{baseUrl}}/health
}
`,
    );

    expect(parsed.name).toBe('health');
    expect(parsed.method).toBe('GET');
    expect(parsed.folderPath).toBeNull();
  });
});
```

- [ ] **Step 2: Run the parser tests and verify they fail**

Run: `npx vitest run test_case/backend/services/BrunoFileParser.test.ts`

Expected: FAIL because `bruFileParser.ts` does not exist.

- [ ] **Step 3: Add the parser**

Create `server/services/BrunoAutomation/bruFileParser.ts`:

```typescript
import path from 'path';
import type { BrunoRequestIndex } from '@shared/types/bruno';

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'] as const;

function getBlock(content: string, blockName: string): string | null {
  const pattern = new RegExp(`${blockName}\\s*\\{([\\s\\S]*?)\\n\\}`, 'm');
  const match = pattern.exec(content);
  return match ? match[1] : null;
}

function getKeyValue(block: string | null, key: string): string | null {
  if (!block) return null;
  const pattern = new RegExp(`^\\s*${key}\\s*:\\s*(.+?)\\s*$`, 'm');
  const match = pattern.exec(block);
  return match ? match[1].trim() : null;
}

function getTags(content: string): string[] {
  const block = getBlock(content, 'tags');
  if (!block) return [];
  return block
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.includes(':'));
}

function getMethodBlock(content: string): { method: string; block: string | null } {
  for (const method of HTTP_METHODS) {
    const block = getBlock(content, method);
    if (block) return { method: method.toUpperCase(), block };
  }
  return { method: 'GET', block: null };
}

function toFolderPath(relativePath: string): string | null {
  const normalized = relativePath.replace(/\\/g, '/');
  const dir = path.posix.dirname(normalized);
  return dir === '.' ? null : dir;
}

function filenameWithoutExtension(relativePath: string): string {
  return path.posix.basename(relativePath.replace(/\\/g, '/'), '.bru');
}

export function parseBruRequestFile(relativePath: string, content: string): BrunoRequestIndex {
  const metaBlock = getBlock(content, 'meta');
  const { method, block } = getMethodBlock(content);
  const name = getKeyValue(metaBlock, 'name') ?? filenameWithoutExtension(relativePath);
  const urlTemplate = getKeyValue(block, 'url');

  return {
    name,
    method,
    relativePath: relativePath.replace(/\\/g, '/'),
    folderPath: toFolderPath(relativePath),
    urlTemplate,
    tags: getTags(content),
    hasTests: Boolean(getBlock(content, 'tests')),
    hasScripts: Boolean(getBlock(content, 'script:pre-request') || getBlock(content, 'script:post-response')),
  };
}
```

- [ ] **Step 4: Run tests and commit**

Run: `npx vitest run test_case/backend/services/BrunoFileParser.test.ts`

Expected: PASS.

Commit:

```bash
git add server/services/BrunoAutomation/bruFileParser.ts test_case/backend/services/BrunoFileParser.test.ts
git commit -m "feat: parse Bruno request metadata"
```

---

### Task 3: Bruno JSON Report Parser

**Files:**
- Create: `server/services/BrunoAutomation/reportParser.ts`
- Test: `test_case/backend/services/BrunoReportParser.test.ts`

- [ ] **Step 1: Write the failing report parser tests**

Create `test_case/backend/services/BrunoReportParser.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { parseBrunoJsonReport } from '../../../server/services/BrunoAutomation/reportParser';

describe('parseBrunoJsonReport', () => {
  it('normalizes request results and assertion failures', () => {
    const normalized = parseBrunoJsonReport(
      {
        results: [
          {
            name: 'Create Order',
            status: 'passed',
            duration: 123,
            assertions: { total: 2, passed: 2, failed: 0 },
            request: { method: 'POST', url: 'https://example.test/orders' },
          },
          {
            name: 'Get Order',
            status: 'failed',
            duration: 80,
            error: 'expected 200 but got 500',
            assertions: { total: 1, passed: 0, failed: 1 },
          },
        ],
      },
      new Map([
        ['Create Order', 11],
        ['Get Order', 12],
      ]),
    );

    expect(normalized.status).toBe('failed');
    expect(normalized.passedCases).toBe(1);
    expect(normalized.failedCases).toBe(1);
    expect(normalized.results).toEqual([
      expect.objectContaining({
        caseId: 11,
        caseName: 'Create Order',
        status: 'passed',
        duration: 123,
        assertionsTotal: 2,
        assertionsPassed: 2,
      }),
      expect.objectContaining({
        caseId: 12,
        caseName: 'Get Order',
        status: 'failed',
        duration: 80,
        errorMessage: 'expected 200 but got 500',
      }),
    ]);
  });

  it('treats malformed report shapes as parser errors', () => {
    expect(() => parseBrunoJsonReport({ nope: [] }, new Map())).toThrow(
      'BRUNO_REPORT_PARSE_FAILED',
    );
  });
});
```

- [ ] **Step 2: Run the report parser tests and verify they fail**

Run: `npx vitest run test_case/backend/services/BrunoReportParser.test.ts`

Expected: FAIL because `reportParser.ts` does not exist.

- [ ] **Step 3: Add report parser**

Create `server/services/BrunoAutomation/reportParser.ts`:

```typescript
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
```

- [ ] **Step 4: Run tests and commit**

Run: `npx vitest run test_case/backend/services/BrunoReportParser.test.ts`

Expected: PASS.

Commit:

```bash
git add server/services/BrunoAutomation/reportParser.ts test_case/backend/services/BrunoReportParser.test.ts
git commit -m "feat: normalize Bruno JSON reports"
```

---

### Task 4: Artifact Paths And Safe Runner

**Files:**
- Create: `server/services/BrunoAutomation/artifacts.ts`
- Create: `server/services/BrunoAutomation/runner.ts`
- Test: `test_case/backend/services/BrunoRunner.test.ts`

- [ ] **Step 1: Write the failing runner tests**

Create `test_case/backend/services/BrunoRunner.test.ts`:

```typescript
import { describe, expect, it, vi } from 'vitest';
import { buildBrunoArtifactPaths } from '../../../server/services/BrunoAutomation/artifacts';
import { BrunoRunnerService } from '../../../server/services/BrunoAutomation/runner';

describe('Bruno artifact paths', () => {
  it('creates paths under platform controlled roots', () => {
    const paths = buildBrunoArtifactPaths({
      repositoryCheckoutRoot: 'D:/Automation/bruno-repos/repo-1',
      artifactRoot: 'D:/Automation/bruno-runs',
      runId: 99,
    });

    expect(paths.workspacePath).toBe('D:/Automation/bruno-repos/repo-1');
    expect(paths.jsonReportPath).toContain('bruno-runs');
    expect(paths.jsonReportPath).toContain('99');
    expect(paths.htmlReportPath).toContain('report.html');
  });
});

describe('BrunoRunnerService', () => {
  it('uses argument arrays when spawning bru', async () => {
    const spawnBru = vi.fn().mockResolvedValue({
      exitCode: 0,
      stdout: 'ok',
      stderr: '',
    });

    const runner = new BrunoRunnerService({ spawnBru });

    await runner.run({
      config: {
        repositoryId: 1,
        collectionPath: 'collections/order-api',
        targetType: 'collection',
        environmentName: 'ci',
        reporters: ['json', 'html'],
      },
      paths: {
        workspacePath: 'D:/repo',
        jsonReportPath: 'D:/runs/results.json',
        htmlReportPath: 'D:/runs/report.html',
      },
    });

    expect(spawnBru).toHaveBeenCalledWith([
      'run',
      '--env',
      'ci',
      '--workspace-path',
      'D:/repo',
      '--reporter-json',
      'D:/runs/results.json',
      '--reporter-html',
      'D:/runs/report.html',
    ], 600000);
  });

  it('throws a classified error when bru exits non-zero', async () => {
    const runner = new BrunoRunnerService({
      spawnBru: vi.fn().mockResolvedValue({
        exitCode: 1,
        stdout: '',
        stderr: 'collection failed',
      }),
    });

    await expect(
      runner.run({
        config: {
          repositoryId: 1,
          collectionPath: 'collections/order-api',
          targetType: 'collection',
          reporters: ['json'],
        },
        paths: {
          workspacePath: 'D:/repo',
          jsonReportPath: 'D:/runs/results.json',
        },
      }),
    ).rejects.toThrow('BRUNO_RUN_FAILED');
  });
});
```

- [ ] **Step 2: Run the runner tests and verify they fail**

Run: `npx vitest run test_case/backend/services/BrunoRunner.test.ts`

Expected: FAIL because `artifacts.ts` and `runner.ts` do not exist.

- [ ] **Step 3: Add artifact path builder**

Create `server/services/BrunoAutomation/artifacts.ts`:

```typescript
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
```

- [ ] **Step 4: Add runner implementation**

Create `server/services/BrunoAutomation/runner.ts`:

```typescript
import { spawn } from 'child_process';
import type { BrunoRunArtifactPaths, BrunoRunConfig } from '@shared/types/bruno';
import { buildBruRunArguments } from './validation';

export interface SpawnBruResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export type SpawnBru = (args: string[], timeoutMs: number) => Promise<SpawnBruResult>;

function defaultSpawnBru(args: string[], timeoutMs: number): Promise<SpawnBruResult> {
  return new Promise((resolve, reject) => {
    const child = spawn('bru', args, {
      shell: false,
      windowsHide: true,
    });

    let stdout = '';
    let stderr = '';

    const timeout = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error('BRUNO_RUN_FAILED: execution timed out'));
    }, timeoutMs);

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });
    child.on('error', (error) => {
      clearTimeout(timeout);
      reject(new Error(`BRUNO_CLI_NOT_FOUND: ${error.message}`));
    });
    child.on('close', (exitCode) => {
      clearTimeout(timeout);
      resolve({
        exitCode: exitCode ?? 1,
        stdout,
        stderr,
      });
    });
  });
}

export class BrunoRunnerService {
  private readonly spawnBru: SpawnBru;

  constructor(options: { spawnBru?: SpawnBru } = {}) {
    this.spawnBru = options.spawnBru ?? defaultSpawnBru;
  }

  async run(input: {
    config: BrunoRunConfig;
    paths: BrunoRunArtifactPaths;
  }): Promise<SpawnBruResult> {
    const timeoutMs = input.config.timeoutMs ?? 600000;
    const args = buildBruRunArguments(input.config, input.paths);
    const result = await this.spawnBru(args, timeoutMs);

    if (result.exitCode !== 0) {
      throw new Error(`BRUNO_RUN_FAILED: bru exited with code ${result.exitCode}; ${result.stderr}`);
    }

    return result;
  }
}
```

- [ ] **Step 5: Run tests and commit**

Run: `npx vitest run test_case/backend/services/BrunoRunner.test.ts`

Expected: PASS.

Commit:

```bash
git add server/services/BrunoAutomation/artifacts.ts server/services/BrunoAutomation/runner.ts test_case/backend/services/BrunoRunner.test.ts
git commit -m "feat: add safe Bruno CLI runner"
```

---

### Task 5: Bruno Persistence And Schema Script

**Files:**
- Create: `server/services/BrunoAutomation/repository.ts`
- Create: `scripts/migrate-v1.7.0-bruno.sql`
- Test: `test_case/backend/services/BrunoRepository.test.ts`

- [ ] **Step 1: Write repository tests with mocked DB helpers**

Create `test_case/backend/services/BrunoRepository.test.ts`:

```typescript
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BrunoAutomationRepository } from '../../../server/services/BrunoAutomation/repository';

const execute = vi.fn();

vi.mock('../../../server/config/database', () => ({
  query: vi.fn(),
  queryOne: vi.fn(),
  getPool: () => ({ execute }),
}));

describe('BrunoAutomationRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    execute.mockResolvedValue([{ insertId: 10 }]);
  });

  it('creates repository records using parameterized SQL', async () => {
    const repo = new BrunoAutomationRepository();

    const id = await repo.createRepository({
      name: 'Order API',
      projectId: 1,
      gitUrl: 'https://gitlab.example.com/qa/order-api.git',
      defaultBranch: 'main',
      collectionRoot: 'collections',
      authSecretRef: 'secret/gitlab/order-api',
    });

    expect(id).toBe(10);
    expect(execute).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO Auto_BrunoRepositories'),
      [
        'Order API',
        1,
        'https://gitlab.example.com/qa/order-api.git',
        'main',
        'collections',
        'secret/gitlab/order-api',
      ],
    );
  });
});
```

- [ ] **Step 2: Run tests and verify they fail**

Run: `npx vitest run test_case/backend/services/BrunoRepository.test.ts`

Expected: FAIL because `repository.ts` does not exist.

- [ ] **Step 3: Add repository implementation**

Create `server/services/BrunoAutomation/repository.ts`:

```typescript
import { getPool, query, queryOne } from '../../config/database';
import type {
  BrunoRepositoryInput,
  BrunoRepositoryRecord,
  BrunoRequestIndex,
} from '@shared/types/bruno';

interface InsertResult {
  insertId: number;
}

export class BrunoAutomationRepository {
  async createRepository(input: BrunoRepositoryInput): Promise<number> {
    const pool = getPool();
    const [result] = await pool.execute(
      `INSERT INTO Auto_BrunoRepositories
       (name, project_id, git_url, default_branch, collection_root, auth_secret_ref)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        input.name,
        input.projectId,
        input.gitUrl,
        input.defaultBranch,
        input.collectionRoot,
        input.authSecretRef ?? null,
      ],
    );

    return (result as InsertResult).insertId;
  }

  async listRepositories(projectId?: number): Promise<BrunoRepositoryRecord[]> {
    const params: Array<string | number> = [];
    let sql = `
      SELECT id, name, project_id as projectId, git_url as gitUrl,
             default_branch as defaultBranch, collection_root as collectionRoot,
             auth_secret_ref as authSecretRef,
             COALESCE(last_sync_status, 'never') as lastSyncStatus,
             last_sync_commit as lastSyncCommit,
             last_sync_error as lastSyncError,
             created_at as createdAt, updated_at as updatedAt
      FROM Auto_BrunoRepositories
      WHERE 1=1
    `;

    if (projectId !== undefined) {
      sql += ' AND project_id = ?';
      params.push(projectId);
    }

    sql += ' ORDER BY updated_at DESC';
    return query<BrunoRepositoryRecord[]>(sql, params);
  }

  async getRepository(id: number): Promise<BrunoRepositoryRecord | null> {
    return queryOne<BrunoRepositoryRecord>(
      `SELECT id, name, project_id as projectId, git_url as gitUrl,
              default_branch as defaultBranch, collection_root as collectionRoot,
              auth_secret_ref as authSecretRef,
              COALESCE(last_sync_status, 'never') as lastSyncStatus,
              last_sync_commit as lastSyncCommit,
              last_sync_error as lastSyncError,
              created_at as createdAt, updated_at as updatedAt
       FROM Auto_BrunoRepositories
       WHERE id = ?`,
      [id],
    );
  }

  async listCollections(filters: { repositoryId?: number; projectId?: number }): Promise<Array<{
    id: number;
    repositoryId: number;
    projectId: number;
    name: string;
    relativePath: string;
    requestCount: number;
    lastSyncCommit: string | null;
  }>> {
    const params: number[] = [];
    let sql = `
      SELECT id, repository_id as repositoryId, project_id as projectId,
             name, relative_path as relativePath, request_count as requestCount,
             last_sync_commit as lastSyncCommit
      FROM Auto_BrunoCollections
      WHERE 1=1
    `;

    if (filters.repositoryId !== undefined) {
      sql += ' AND repository_id = ?';
      params.push(filters.repositoryId);
    }
    if (filters.projectId !== undefined) {
      sql += ' AND project_id = ?';
      params.push(filters.projectId);
    }

    sql += ' ORDER BY updated_at DESC';
    return query(sql, params);
  }

  async replaceRequestIndex(input: {
    repositoryId: number;
    collectionName: string;
    collectionPath: string;
    projectId: number;
    syncCommit: string;
    requests: BrunoRequestIndex[];
  }): Promise<void> {
    const pool = getPool();
    await pool.execute('DELETE FROM Auto_BrunoRequests WHERE collection_id IN (SELECT id FROM Auto_BrunoCollections WHERE repository_id = ?)', [input.repositoryId]);
    await pool.execute('DELETE FROM Auto_BrunoCollections WHERE repository_id = ?', [input.repositoryId]);

    const [collectionResult] = await pool.execute(
      `INSERT INTO Auto_BrunoCollections
       (repository_id, project_id, name, relative_path, format, request_count, environment_count, tags_json, last_sync_commit)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        input.repositoryId,
        input.projectId,
        input.collectionName,
        input.collectionPath,
        'bru',
        input.requests.length,
        0,
        JSON.stringify([...new Set(input.requests.flatMap((request) => request.tags))]),
        input.syncCommit,
      ],
    );

    const collectionId = (collectionResult as InsertResult).insertId;
    for (const request of input.requests) {
      await pool.execute(
        `INSERT INTO Auto_BrunoRequests
         (collection_id, name, method, relative_path, folder_path, url_template, tags_json, has_tests, has_scripts)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          collectionId,
          request.name,
          request.method,
          request.relativePath,
          request.folderPath,
          request.urlTemplate,
          JSON.stringify(request.tags),
          request.hasTests ? 1 : 0,
          request.hasScripts ? 1 : 0,
        ],
      );
    }

    await pool.execute(
      `UPDATE Auto_BrunoRepositories
       SET last_sync_commit = ?, last_sync_status = 'success', last_sync_error = NULL
       WHERE id = ?`,
      [input.syncCommit, input.repositoryId],
    );
  }
}
```

- [ ] **Step 4: Add DBA-reviewable schema script**

Create `scripts/migrate-v1.7.0-bruno.sql`:

```sql
CREATE TABLE IF NOT EXISTS Auto_BrunoRepositories (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(200) NOT NULL,
  project_id INT NOT NULL,
  git_url VARCHAR(500) NOT NULL,
  default_branch VARCHAR(100) NOT NULL DEFAULT 'main',
  collection_root VARCHAR(500) NOT NULL DEFAULT '.',
  auth_secret_ref VARCHAR(255) NULL,
  last_sync_commit VARCHAR(100) NULL,
  last_sync_status ENUM('never', 'success', 'failed') NOT NULL DEFAULT 'never',
  last_sync_error TEXT NULL,
  created_by INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_bruno_repositories_project (project_id),
  INDEX idx_bruno_repositories_status (last_sync_status)
);

CREATE TABLE IF NOT EXISTS Auto_BrunoCollections (
  id INT PRIMARY KEY AUTO_INCREMENT,
  repository_id INT NOT NULL,
  project_id INT NOT NULL,
  name VARCHAR(255) NOT NULL,
  relative_path VARCHAR(500) NOT NULL,
  format VARCHAR(50) NOT NULL DEFAULT 'bru',
  request_count INT NOT NULL DEFAULT 0,
  environment_count INT NOT NULL DEFAULT 0,
  tags_json JSON NULL,
  last_sync_commit VARCHAR(100) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_bruno_collections_repository (repository_id),
  INDEX idx_bruno_collections_project (project_id)
);

CREATE TABLE IF NOT EXISTS Auto_BrunoRequests (
  id INT PRIMARY KEY AUTO_INCREMENT,
  collection_id INT NOT NULL,
  case_id INT NULL,
  name VARCHAR(255) NOT NULL,
  method VARCHAR(20) NOT NULL,
  relative_path VARCHAR(500) NOT NULL,
  folder_path VARCHAR(500) NULL,
  url_template VARCHAR(1000) NULL,
  tags_json JSON NULL,
  has_tests TINYINT(1) NOT NULL DEFAULT 0,
  has_scripts TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_bruno_requests_collection (collection_id),
  INDEX idx_bruno_requests_case (case_id),
  INDEX idx_bruno_requests_method (method)
);

ALTER TABLE Auto_TestCaseTasks
  ADD COLUMN execution_engine ENUM('jenkins', 'bruno') NOT NULL DEFAULT 'jenkins' AFTER trigger_type,
  ADD COLUMN engine_config_json JSON NULL AFTER environment_id;
```

- [ ] **Step 5: Run tests and commit**

Run: `npx vitest run test_case/backend/services/BrunoRepository.test.ts`

Expected: PASS.

Commit:

```bash
git add server/services/BrunoAutomation/repository.ts scripts/migrate-v1.7.0-bruno.sql test_case/backend/services/BrunoRepository.test.ts
git commit -m "feat: add Bruno persistence layer"
```

---

### Task 6: Bruno Repository Sync Service

**Files:**
- Create: `server/services/BrunoAutomation/sync.ts`
- Test: `test_case/backend/services/BrunoSyncService.test.ts`

- [ ] **Step 1: Write sync service tests**

Create `test_case/backend/services/BrunoSyncService.test.ts`:

```typescript
import { describe, expect, it, vi } from 'vitest';
import { BrunoSyncService } from '../../../server/services/BrunoAutomation/sync';

describe('BrunoSyncService', () => {
  it('parses .bru files and persists request index', async () => {
    const replaceRequestIndex = vi.fn().mockResolvedValue(undefined);
    const service = new BrunoSyncService({
      checkoutRepository: vi.fn().mockResolvedValue({
        checkoutPath: 'D:/repos/repo-1',
        commit: 'abc123',
      }),
      findBruFiles: vi.fn().mockResolvedValue([
        'orders/create-order.bru',
        'orders/get-order.bru',
      ]),
      readBruFile: vi.fn()
        .mockResolvedValueOnce(`meta {
  name: Create Order
}
post {
  url: {{baseUrl}}/orders
}
tests {
  test("returns 201", function() {});
}
`)
        .mockResolvedValueOnce(`meta {
  name: Get Order
}
get {
  url: {{baseUrl}}/orders/{{id}}
}
`),
      repository: {
        replaceRequestIndex,
      },
    });

    const result = await service.syncRepository({
      id: 1,
      name: 'Order API',
      projectId: 5,
      gitUrl: 'https://gitlab.example.com/qa/order-api.git',
      defaultBranch: 'main',
      collectionRoot: 'collections',
      lastSyncCommit: null,
      lastSyncStatus: 'never',
      lastSyncError: null,
      createdAt: '2026-05-23',
      updatedAt: '2026-05-23',
    });

    expect(result).toEqual({
      repositoryId: 1,
      commit: 'abc123',
      requestCount: 2,
    });
    expect(replaceRequestIndex).toHaveBeenCalledWith(
      expect.objectContaining({
        repositoryId: 1,
        collectionName: 'Order API',
        collectionPath: 'collections',
        projectId: 5,
        syncCommit: 'abc123',
        requests: [
          expect.objectContaining({ name: 'Create Order', method: 'POST' }),
          expect.objectContaining({ name: 'Get Order', method: 'GET' }),
        ],
      }),
    );
  });
});
```

- [ ] **Step 2: Run sync service tests and verify they fail**

Run: `npx vitest run test_case/backend/services/BrunoSyncService.test.ts`

Expected: FAIL because `sync.ts` does not exist.

- [ ] **Step 3: Add sync service implementation**

Create `server/services/BrunoAutomation/sync.ts`:

```typescript
import fs from 'fs/promises';
import path from 'path';
import simpleGit, { type SimpleGit } from 'simple-git';
import type { BrunoRepositoryRecord } from '@shared/types/bruno';
import { parseBruRequestFile } from './bruFileParser';
import { BrunoAutomationRepository } from './repository';

export interface BrunoSyncResult {
  repositoryId: number;
  commit: string;
  requestCount: number;
}

interface CheckoutResult {
  checkoutPath: string;
  commit: string;
}

type CheckoutRepository = (repo: BrunoRepositoryRecord) => Promise<CheckoutResult>;
type FindBruFiles = (root: string) => Promise<string[]>;
type ReadBruFile = (absolutePath: string) => Promise<string>;

interface BrunoSyncRepositoryPort {
  replaceRequestIndex(input: {
    repositoryId: number;
    collectionName: string;
    collectionPath: string;
    projectId: number;
    syncCommit: string;
    requests: ReturnType<typeof parseBruRequestFile>[];
  }): Promise<void>;
}

interface BrunoSyncServiceOptions {
  repository?: BrunoSyncRepositoryPort;
  checkoutRepository?: CheckoutRepository;
  findBruFiles?: FindBruFiles;
  readBruFile?: ReadBruFile;
  repositoryRoot?: string;
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function defaultFindBruFiles(root: string): Promise<string[]> {
  const output: string[] = [];

  async function walk(currentDir: string): Promise<void> {
    const entries = await fs.readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const absolutePath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        await walk(absolutePath);
      } else if (entry.isFile() && entry.name.endsWith('.bru')) {
        output.push(path.relative(root, absolutePath).replace(/\\/g, '/'));
      }
    }
  }

  await walk(root);
  return output.sort();
}

async function checkoutWithSimpleGit(repo: BrunoRepositoryRecord, repositoryRoot: string): Promise<CheckoutResult> {
  const checkoutPath = path.resolve(repositoryRoot, `repo-${repo.id}`);
  const exists = await pathExists(path.join(checkoutPath, '.git'));

  if (!exists) {
    await fs.mkdir(repositoryRoot, { recursive: true });
    await simpleGit().clone(repo.gitUrl, checkoutPath, ['--branch', repo.defaultBranch]);
  } else {
    const git: SimpleGit = simpleGit(checkoutPath);
    await git.fetch();
    await git.checkout(repo.defaultBranch);
    await git.pull('origin', repo.defaultBranch);
  }

  const git = simpleGit(checkoutPath);
  const commit = (await git.revparse(['HEAD'])).trim();
  return { checkoutPath, commit };
}

export class BrunoSyncService {
  private readonly repository: BrunoSyncRepositoryPort;
  private readonly checkoutRepository: CheckoutRepository;
  private readonly findBruFiles: FindBruFiles;
  private readonly readBruFile: ReadBruFile;

  constructor(options: BrunoSyncServiceOptions = {}) {
    const repositoryRoot = options.repositoryRoot ?? path.resolve(process.env.BRUNO_REPOSITORY_ROOT ?? 'tmp/bruno-repositories');
    this.repository = options.repository ?? new BrunoAutomationRepository();
    this.checkoutRepository = options.checkoutRepository ?? ((repo) => checkoutWithSimpleGit(repo, repositoryRoot));
    this.findBruFiles = options.findBruFiles ?? defaultFindBruFiles;
    this.readBruFile = options.readBruFile ?? ((absolutePath) => fs.readFile(absolutePath, 'utf8'));
  }

  async syncRepository(repo: BrunoRepositoryRecord): Promise<BrunoSyncResult> {
    const checkout = await this.checkoutRepository(repo);
    const collectionRoot = path.join(checkout.checkoutPath, repo.collectionRoot);
    const files = await this.findBruFiles(collectionRoot);
    const requests = [];

    for (const relativePath of files) {
      const content = await this.readBruFile(path.join(collectionRoot, relativePath));
      requests.push(parseBruRequestFile(relativePath, content));
    }

    await this.repository.replaceRequestIndex({
      repositoryId: repo.id,
      collectionName: repo.name,
      collectionPath: repo.collectionRoot,
      projectId: repo.projectId,
      syncCommit: checkout.commit,
      requests,
    });

    return {
      repositoryId: repo.id,
      commit: checkout.commit,
      requestCount: requests.length,
    };
  }
}
```

- [ ] **Step 4: Run sync tests**

Run: `npx vitest run test_case/backend/services/BrunoSyncService.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/services/BrunoAutomation/sync.ts test_case/backend/services/BrunoSyncService.test.ts
git commit -m "feat: sync Bruno collections from Git"
```

---

### Task 7: Bruno Manual Run Service

**Files:**
- Create: `server/services/BrunoAutomation/service.ts`
- Create: `server/services/BrunoAutomation/index.ts`
- Test: `test_case/backend/services/BrunoAutomationService.test.ts`

- [ ] **Step 1: Write orchestration tests**

Create `test_case/backend/services/BrunoAutomationService.test.ts`:

```typescript
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BrunoAutomationService } from '../../../server/services/BrunoAutomation/service';

const executionService = {
  triggerTestExecution: vi.fn(),
  completeBatchExecution: vi.fn(),
  recordTriggerFailureDiagnostics: vi.fn(),
};

vi.mock('../../../server/services/ExecutionService', () => ({
  executionService,
}));

describe('BrunoAutomationService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    executionService.triggerTestExecution.mockResolvedValue({
      runId: 100,
      executionId: 200,
      totalCases: 2,
      caseIds: [11, 12],
    });
  });

  it('runs Bruno and completes platform execution with parsed report', async () => {
    const runner = {
      run: vi.fn().mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' }),
    };
    const readJsonReport = vi.fn().mockResolvedValue({
      results: [
        { name: 'Create Order', status: 'passed', duration: 20 },
        { name: 'Get Order', status: 'failed', duration: 30, error: '500' },
      ],
    });

    const service = new BrunoAutomationService({
      runner,
      readJsonReport,
      resolveRepositoryCheckoutPath: vi.fn().mockResolvedValue('D:/repo'),
      artifactRoot: 'D:/artifacts',
    });

    const result = await service.runManual({
      projectId: 1,
      triggeredBy: 7,
      caseIds: [11, 12],
      caseNameById: new Map([
        [11, 'Create Order'],
        [12, 'Get Order'],
      ]),
      config: {
        repositoryId: 1,
        collectionPath: 'collections/order-api',
        targetType: 'collection',
        reporters: ['json', 'html'],
      },
    });

    expect(result).toEqual({ runId: 100, executionId: 200 });
    expect(runner.run).toHaveBeenCalled();
    expect(executionService.completeBatchExecution).toHaveBeenCalledWith(
      100,
      expect.objectContaining({
        status: 'failed',
        passedCases: 1,
        failedCases: 1,
        skippedCases: 0,
        durationMs: 50,
      }),
    );
  });
});
```

- [ ] **Step 2: Run test and verify it fails**

Run: `npx vitest run test_case/backend/services/BrunoAutomationService.test.ts`

Expected: FAIL because `service.ts` does not exist.

- [ ] **Step 3: Add service implementation**

Create `server/services/BrunoAutomation/service.ts`:

```typescript
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
```

Create `server/services/BrunoAutomation/index.ts`:

```typescript
export * from './artifacts';
export * from './bruFileParser';
export * from './reportParser';
export * from './repository';
export * from './runner';
export * from './service';
export * from './sync';
export * from './validation';
```

- [ ] **Step 4: Run tests and commit**

Run: `npx vitest run test_case/backend/services/BrunoAutomationService.test.ts`

Expected: PASS.

Commit:

```bash
git add server/services/BrunoAutomation/service.ts server/services/BrunoAutomation/index.ts test_case/backend/services/BrunoAutomationService.test.ts
git commit -m "feat: orchestrate manual Bruno runs"
```

---

### Task 8: Bruno REST Routes

**Files:**
- Create: `server/routes/bruno.ts`
- Modify: `server/index.ts`
- Test: `test_case/backend/routes/bruno.route.test.ts`

- [ ] **Step 1: Write route tests**

Create `test_case/backend/routes/bruno.route.test.ts`:

```typescript
import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import brunoRoutes from '../../../server/routes/bruno';

const createRepository = vi.fn();
const listRepositories = vi.fn();
const getRepository = vi.fn();
const listCollections = vi.fn();
const syncRepository = vi.fn();
const runManual = vi.fn();

vi.mock('../../../server/services/BrunoAutomation/repository', () => ({
  BrunoAutomationRepository: class {
    createRepository = createRepository;
    listRepositories = listRepositories;
    getRepository = getRepository;
    listCollections = listCollections;
  },
}));

vi.mock('../../../server/services/BrunoAutomation/sync', () => ({
  BrunoSyncService: class {
    syncRepository = syncRepository;
  },
}));

vi.mock('../../../server/services/BrunoAutomation/service', () => ({
  brunoAutomationService: {
    runManual,
  },
}));

vi.mock('../../../server/middleware/auth', () => ({
  authenticate: (req: Request, _res: Response, next: NextFunction) => {
    (req as Request & { user: { id: number } }).user = { id: 7 };
    next();
  },
}));

vi.mock('../../../server/middleware/authRateLimiter', () => ({
  generalAuthRateLimiter: (_req: Request, _res: Response, next: NextFunction) => next(),
}));

describe('bruno routes', () => {
  const app = express();
  app.use(express.json());
  app.use('/api/bruno', brunoRoutes);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a repository', async () => {
    createRepository.mockResolvedValue(9);

    const response = await request(app)
      .post('/api/bruno/repositories')
      .send({
        name: 'Order API',
        projectId: 1,
        gitUrl: 'https://gitlab.example.com/qa/order-api.git',
        defaultBranch: 'main',
        collectionRoot: 'collections',
      });

    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      success: true,
      data: { id: 9 },
    });
  });

  it('rejects invalid manual run config', async () => {
    const response = await request(app)
      .post('/api/bruno/runs')
      .send({
        projectId: 1,
        caseIds: [11],
        caseNameById: { '11': 'Create Order' },
        config: {
          repositoryId: 1,
          collectionPath: '../bad',
          targetType: 'collection',
        },
      });

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
  });

  it('syncs a registered repository', async () => {
    getRepository.mockResolvedValue({
      id: 9,
      name: 'Order API',
      projectId: 1,
      gitUrl: 'https://gitlab.example.com/qa/order-api.git',
      defaultBranch: 'main',
      collectionRoot: 'collections',
      lastSyncCommit: null,
      lastSyncStatus: 'never',
      lastSyncError: null,
      createdAt: '2026-05-23',
      updatedAt: '2026-05-23',
    });
    syncRepository.mockResolvedValue({
      repositoryId: 9,
      commit: 'abc123',
      requestCount: 2,
    });

    const response = await request(app).post('/api/bruno/repositories/9/sync').send({});

    expect(response.status).toBe(202);
    expect(response.body.data).toEqual({
      repositoryId: 9,
      commit: 'abc123',
      requestCount: 2,
    });
  });
});
```

- [ ] **Step 2: Run route tests and verify they fail**

Run: `npx vitest run test_case/backend/routes/bruno.route.test.ts`

Expected: FAIL because `server/routes/bruno.ts` does not exist.

- [ ] **Step 3: Add routes**

Create `server/routes/bruno.ts`:

```typescript
import { Router } from 'express';
import { generalAuthRateLimiter } from '../middleware/authRateLimiter';
import { authenticate } from '../middleware/auth';
import { BrunoAutomationRepository } from '../services/BrunoAutomation/repository';
import { brunoAutomationService } from '../services/BrunoAutomation/service';
import { BrunoSyncService } from '../services/BrunoAutomation/sync';
import { validateBrunoRunConfig } from '../services/BrunoAutomation/validation';

const router = Router();
const repository = new BrunoAutomationRepository();
const syncService = new BrunoSyncService();

function parsePositiveInt(value: unknown, fieldName: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${fieldName} must be a positive integer`);
  }
  return parsed;
}

router.get('/repositories', async (req, res) => {
  try {
    const projectId = req.query.projectId === undefined
      ? undefined
      : parsePositiveInt(req.query.projectId, 'projectId');
    const data = await repository.listRepositories(projectId);
    res.json({ success: true, data });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error instanceof Error ? error.message : 'Invalid request',
    });
  }
});

router.post('/repositories', generalAuthRateLimiter, authenticate, async (req, res) => {
  try {
    const id = await repository.createRepository({
      name: String(req.body.name ?? '').trim(),
      projectId: parsePositiveInt(req.body.projectId, 'projectId'),
      gitUrl: String(req.body.gitUrl ?? '').trim(),
      defaultBranch: String(req.body.defaultBranch ?? 'main').trim(),
      collectionRoot: String(req.body.collectionRoot ?? '.').trim(),
      authSecretRef: req.body.authSecretRef ? String(req.body.authSecretRef) : undefined,
    });

    res.status(201).json({ success: true, data: { id } });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error instanceof Error ? error.message : 'Invalid request',
    });
  }
});

router.post('/repositories/:id/sync', generalAuthRateLimiter, authenticate, async (req, res) => {
  try {
    const repositoryId = parsePositiveInt(req.params.id, 'repositoryId');
    const repo = await repository.getRepository(repositoryId);
    if (!repo) {
      return res.status(404).json({ success: false, message: 'Bruno repository not found' });
    }

    const data = await syncService.syncRepository(repo);
    res.status(202).json({ success: true, data });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error instanceof Error ? error.message : 'Bruno sync failed',
    });
  }
});

router.get('/collections', async (req, res) => {
  try {
    const repositoryId = req.query.repositoryId === undefined
      ? undefined
      : parsePositiveInt(req.query.repositoryId, 'repositoryId');
    const projectId = req.query.projectId === undefined
      ? undefined
      : parsePositiveInt(req.query.projectId, 'projectId');
    const data = await repository.listCollections({ repositoryId, projectId });
    res.json({ success: true, data });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error instanceof Error ? error.message : 'Invalid request',
    });
  }
});

router.post('/run-preview', (req, res) => {
  try {
    const config = validateBrunoRunConfig(req.body.config);
    res.json({
      success: true,
      data: {
        engine: 'bruno',
        config,
      },
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error instanceof Error ? error.message : 'Invalid Bruno run config',
    });
  }
});

router.post('/runs', generalAuthRateLimiter, authenticate, async (req, res) => {
  try {
    const config = validateBrunoRunConfig(req.body.config);
    const caseIds = Array.isArray(req.body.caseIds)
      ? req.body.caseIds.map((value: unknown) => parsePositiveInt(value, 'caseIds[]'))
      : [];

    if (caseIds.length === 0) {
      return res.status(400).json({ success: false, message: 'caseIds must not be empty' });
    }

    const rawCaseNameById = req.body.caseNameById ?? {};
    const caseNameById = new Map<number, string>(
      Object.entries(rawCaseNameById).map(([caseId, caseName]) => [
        Number(caseId),
        String(caseName),
      ]),
    );

    const result = await brunoAutomationService.runManual({
      projectId: parsePositiveInt(req.body.projectId, 'projectId'),
      triggeredBy: req.user!.id,
      caseIds,
      caseNameById,
      config,
    });

    res.status(202).json({ success: true, data: result });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error instanceof Error ? error.message : 'Invalid Bruno run request',
    });
  }
});

export default router;
```

- [ ] **Step 4: Mount routes in `server/index.ts`**

Modify imports near the existing route imports:

```typescript
import brunoRoutes from './routes/bruno';
```

Modify route registration near existing `app.use('/api/tasks', tasksRoutes);`:

```typescript
app.use('/api/bruno', brunoRoutes);
```

- [ ] **Step 5: Run tests and commit**

Run: `npx vitest run test_case/backend/routes/bruno.route.test.ts`

Expected: PASS.

Commit:

```bash
git add server/routes/bruno.ts server/index.ts test_case/backend/routes/bruno.route.test.ts
git commit -m "feat: expose Bruno automation APIs"
```

---

### Task 9: Final Verification

**Files:**
- Modify only if verification exposes a concrete defect.

- [ ] **Step 1: Run Bruno backend tests**

Run:

```bash
npx vitest run \
  test_case/backend/services/BrunoValidation.test.ts \
  test_case/backend/services/BrunoFileParser.test.ts \
  test_case/backend/services/BrunoReportParser.test.ts \
  test_case/backend/services/BrunoRunner.test.ts \
  test_case/backend/services/BrunoRepository.test.ts \
  test_case/backend/services/BrunoAutomationService.test.ts \
  test_case/backend/routes/bruno.route.test.ts
```

Expected: all listed Bruno tests pass.

- [ ] **Step 2: Run backend type check**

Run: `npx tsc --noEmit -p tsconfig.server.json`

Expected: no TypeScript errors.

- [ ] **Step 3: Run existing backend regression subset**

Run:

```bash
npx vitest run \
  test_case/backend/services/ExecutionService.test.ts \
  test_case/backend/services/TaskSchedulerService.test.ts \
  test_case/backend/routes/tasks.route.test.ts
```

Expected: existing execution and task scheduler tests still pass.

- [ ] **Step 4: Check git diff for scope**

Run: `git status --short`

Expected:

- Bruno service, route, shared type, migration, and test files are changed.
- No `dist`, `node_modules`, `.env`, or `.superpowers` files are staged.

- [ ] **Step 5: Commit verification fixes when needed**

If Step 1, 2, or 3 required corrections, commit the correction:

```bash
git add <fixed-files>
git commit -m "fix: stabilize Bruno phase 1 integration"
```

If no corrections were needed, do not create an empty commit.
