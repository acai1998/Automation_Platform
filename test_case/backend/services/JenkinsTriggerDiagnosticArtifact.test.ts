import fs from 'fs';
import os from 'os';
import path from 'path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { persistJenkinsTriggerFailureDiagnostic } from '../../../server/utils/jenkinsTriggerDiagnosticArtifact';

describe('persistJenkinsTriggerFailureDiagnostic', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jenkins-trigger-artifact-'));
    process.env.RUNTIME_LOG_DIR = tempDir;
    process.env.RUNTIME_LOG_PUBLIC_BASE = '/runtime-logs/jenkins-trigger';
  });

  afterEach(() => {
    delete process.env.RUNTIME_LOG_DIR;
    delete process.env.RUNTIME_LOG_PUBLIC_BASE;
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('writes a diagnostic artifact and returns a public path', async () => {
    const persisted = await persistJenkinsTriggerFailureDiagnostic(
      {
        message: 'Failed to trigger batch job: 400 Bad Request Body: <title>Error 400 SeleniumBaseCi-AutoTest is not parameterized</title>',
        errorCategory: 'bad_request',
      },
      {
        runId: 4903,
        source: 'scheduler',
        traceId: 'scheduler_trace',
        baseUrl: 'https://jenkins.example.com',
        jobName: 'SeleniumBaseCi-AutoTest',
        callbackUrl: 'https://platform.example.com/api/jenkins/callback',
        caseIds: [3032, 3033],
        scriptPaths: ['test_case/demo.py::TestDemo::test_example'],
      }
    );

    expect(persisted.publicPath).toMatch(/^\/runtime-logs\/jenkins-trigger\/run-4903-.*\.log$/);
    expect(fs.existsSync(persisted.absolutePath)).toBe(true);

    const body = fs.readFileSync(persisted.absolutePath, 'utf8');
    expect(body).toContain('source=scheduler');
    expect(body).toContain('runId=4903');
    expect(body).toContain('kind=not_parameterized');
    expect(body).toContain('artifactPublicPath=');
    expect(body).toContain('SeleniumBaseCi-AutoTest');
  });
});
