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
