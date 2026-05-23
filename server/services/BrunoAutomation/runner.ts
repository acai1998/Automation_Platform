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
