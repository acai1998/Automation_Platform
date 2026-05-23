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
