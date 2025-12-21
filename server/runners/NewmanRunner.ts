import { spawn } from 'child_process';
import { writeFile, unlink, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  BaseRunner,
  ExecutionResult,
  TestCaseConfig,
  PostmanConfig,
  AssertionResult,
} from './BaseRunner.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Newman (Postman) 执行器
 * 用于执行 Postman Collection
 */
export class NewmanRunner extends BaseRunner {
  private tempDir: string;

  constructor() {
    super('Newman Runner');
    this.tempDir = path.join(__dirname, '../../temp');
  }

  async isAvailable(): Promise<boolean> {
    return new Promise((resolve) => {
      const process = spawn('newman', ['--version'], { shell: true });
      process.on('close', (code) => resolve(code === 0));
      process.on('error', () => resolve(false));
    });
  }

  async run(testCase: TestCaseConfig): Promise<ExecutionResult> {
    const startTime = Date.now();
    const config = testCase.config as PostmanConfig;
    const env = this.mergeEnvironment(testCase.environment);
    const logs: string[] = [];

    // 确保临时目录存在
    if (!existsSync(this.tempDir)) {
      await mkdir(this.tempDir, { recursive: true });
    }

    const collectionPath = path.join(this.tempDir, `collection_${testCase.id}_${Date.now()}.json`);
    const environmentPath = path.join(this.tempDir, `environment_${testCase.id}_${Date.now()}.json`);
    const reportPath = path.join(this.tempDir, `report_${testCase.id}_${Date.now()}.json`);

    try {
      // 写入 Collection 文件
      await writeFile(collectionPath, JSON.stringify(config.collectionJson, null, 2));
      logs.push(`[INFO] Collection saved to ${collectionPath}`);

      // 构建 Newman 命令参数
      const args = [
        'run',
        collectionPath,
        '--reporters', 'json',
        '--reporter-json-export', reportPath,
      ];

      // 如果有环境配置
      if (config.environmentJson) {
        // 合并平台环境变量到 Postman 环境
        const postmanEnv = config.environmentJson as any;
        if (env.variables && postmanEnv.values) {
          for (const [key, value] of Object.entries(env.variables)) {
            const existing = postmanEnv.values.find((v: any) => v.key === key);
            if (existing) {
              existing.value = value;
            } else {
              postmanEnv.values.push({ key, value, enabled: true });
            }
          }
        }
        await writeFile(environmentPath, JSON.stringify(postmanEnv, null, 2));
        args.push('--environment', environmentPath);
        logs.push(`[INFO] Environment saved to ${environmentPath}`);
      }

      // 迭代次数
      if (config.iterationCount && config.iterationCount > 1) {
        args.push('--iteration-count', String(config.iterationCount));
      }

      // 请求延迟
      if (config.delayRequest) {
        args.push('--delay-request', String(config.delayRequest));
      }

      logs.push(`[CMD] newman ${args.join(' ')}`);

      // 执行 Newman
      const result = await this.executeNewman(args, logs);
      const duration = Date.now() - startTime;

      // 解析报告
      if (existsSync(reportPath)) {
        const reportData = await this.parseReport(reportPath);

        // 清理临时文件
        await this.cleanup([collectionPath, environmentPath, reportPath]);

        return {
          success: reportData.totalFailed === 0,
          status: reportData.totalFailed === 0 ? 'passed' : 'failed',
          duration,
          assertions: reportData.assertions,
          responseData: reportData.summary,
          logs,
          message: `Total: ${reportData.totalAssertions}, Passed: ${reportData.totalPassed}, Failed: ${reportData.totalFailed}`,
        };
      } else {
        await this.cleanup([collectionPath, environmentPath]);

        return {
          success: result.exitCode === 0,
          status: result.exitCode === 0 ? 'passed' : 'failed',
          duration,
          logs,
          errorMessage: result.stderr || undefined,
        };
      }
    } catch (error: any) {
      const duration = Date.now() - startTime;
      logs.push(`[ERROR] ${error.message}`);

      // 清理临时文件
      await this.cleanup([collectionPath, environmentPath, reportPath]);

      return {
        success: false,
        status: 'error',
        duration,
        errorMessage: error.message,
        errorStack: error.stack,
        logs,
      };
    }
  }

  private executeNewman(args: string[], logs: string[]): Promise<{ exitCode: number; stdout: string; stderr: string }> {
    return new Promise((resolve) => {
      const process = spawn('newman', args, { shell: true });
      let stdout = '';
      let stderr = '';

      process.stdout.on('data', (data) => {
        const text = data.toString();
        stdout += text;
        logs.push(`[STDOUT] ${text.trim()}`);
      });

      process.stderr.on('data', (data) => {
        const text = data.toString();
        stderr += text;
        logs.push(`[STDERR] ${text.trim()}`);
      });

      process.on('close', (code) => {
        resolve({ exitCode: code || 0, stdout, stderr });
      });

      process.on('error', (error) => {
        logs.push(`[ERROR] Process error: ${error.message}`);
        resolve({ exitCode: 1, stdout, stderr: error.message });
      });
    });
  }

  private async parseReport(reportPath: string): Promise<{
    totalAssertions: number;
    totalPassed: number;
    totalFailed: number;
    assertions: AssertionResult[];
    summary: any;
  }> {
    try {
      const { readFile } = await import('fs/promises');
      const content = await readFile(reportPath, 'utf-8');
      const report = JSON.parse(content);

      const assertions: AssertionResult[] = [];
      let totalPassed = 0;
      let totalFailed = 0;

      // 解析 Newman 报告格式
      if (report.run?.executions) {
        for (const execution of report.run.executions) {
          if (execution.assertions) {
            for (const assertion of execution.assertions) {
              const passed = !assertion.error;
              if (passed) totalPassed++;
              else totalFailed++;

              assertions.push({
                name: assertion.assertion || 'Unknown assertion',
                passed,
                expected: 'pass',
                actual: passed ? 'pass' : assertion.error?.message || 'failed',
                message: execution.item?.name,
              });
            }
          }
        }
      }

      return {
        totalAssertions: totalPassed + totalFailed,
        totalPassed,
        totalFailed,
        assertions,
        summary: {
          iterations: report.run?.stats?.iterations,
          requests: report.run?.stats?.requests,
          assertions: report.run?.stats?.assertions,
          timings: report.run?.timings,
        },
      };
    } catch {
      return {
        totalAssertions: 0,
        totalPassed: 0,
        totalFailed: 0,
        assertions: [],
        summary: null,
      };
    }
  }

  private async cleanup(files: string[]): Promise<void> {
    for (const file of files) {
      try {
        if (existsSync(file)) {
          await unlink(file);
        }
      } catch {
        // 忽略清理错误
      }
    }
  }
}
