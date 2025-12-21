import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import path from 'path';
import {
  BaseRunner,
  ExecutionResult,
  TestCaseConfig,
  PytestConfig,
  AssertionResult,
} from './BaseRunner.js';

/**
 * Pytest 执行器
 * 用于执行 Python pytest 测试脚本
 */
export class PytestRunner extends BaseRunner {
  constructor() {
    super('Pytest Runner');
  }

  async isAvailable(): Promise<boolean> {
    return new Promise((resolve) => {
      const process = spawn('pytest', ['--version'], { shell: true });
      process.on('close', (code) => resolve(code === 0));
      process.on('error', () => resolve(false));
    });
  }

  async run(testCase: TestCaseConfig): Promise<ExecutionResult> {
    const startTime = Date.now();
    const config = testCase.config as PytestConfig;
    const env = this.mergeEnvironment(testCase.environment);
    const logs: string[] = [];

    // 检查脚本文件是否存在
    const scriptPath = path.resolve(config.scriptPath);
    if (!existsSync(scriptPath)) {
      return {
        success: false,
        status: 'error',
        duration: Date.now() - startTime,
        errorMessage: `Script not found: ${scriptPath}`,
        logs: [`[ERROR] Script not found: ${scriptPath}`],
      };
    }

    try {
      // 构建报告输出路径
      const reportPath = path.join(path.dirname(scriptPath), `.pytest_report_${Date.now()}.json`);

      // 构建 pytest 命令参数
      const args = [
        scriptPath,
        '--json-report',
        `--json-report-file=${reportPath}`,
        '-v',
      ];

      // 添加特定测试函数
      if (config.testFunction) {
        args[0] = `${scriptPath}::${config.testFunction}`;
      }

      // 添加自定义参数
      if (config.args) {
        args.push(...config.args);
      }

      // 设置环境变量
      const processEnv: Record<string, string> = { ...process.env } as Record<string, string>;
      if (env.baseUrl) {
        processEnv['BASE_URL'] = env.baseUrl;
      }
      if (env.variables) {
        for (const [key, value] of Object.entries(env.variables)) {
          processEnv[key.toUpperCase()] = value;
        }
      }

      const pythonPath = config.pythonPath || 'pytest';
      logs.push(`[CMD] ${pythonPath} ${args.join(' ')}`);

      // 执行 pytest
      const result = await this.executePytest(pythonPath, args, processEnv, config.timeout || 300000, logs);
      const duration = Date.now() - startTime;

      // 解析报告
      if (existsSync(reportPath)) {
        const reportData = await this.parseReport(reportPath);

        // 删除临时报告文件
        try {
          const { unlink } = await import('fs/promises');
          await unlink(reportPath);
        } catch {
          // 忽略
        }

        return {
          success: reportData.totalFailed === 0 && result.exitCode === 0,
          status: reportData.totalFailed === 0 && result.exitCode === 0 ? 'passed' : 'failed',
          duration,
          assertions: reportData.assertions,
          responseData: reportData.summary,
          logs,
          message: `Total: ${reportData.totalTests}, Passed: ${reportData.totalPassed}, Failed: ${reportData.totalFailed}`,
        };
      }

      return {
        success: result.exitCode === 0,
        status: result.exitCode === 0 ? 'passed' : 'failed',
        duration,
        logs,
        errorMessage: result.exitCode !== 0 ? 'Pytest execution failed' : undefined,
      };
    } catch (error: any) {
      const duration = Date.now() - startTime;
      logs.push(`[ERROR] ${error.message}`);

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

  private executePytest(
    pythonPath: string,
    args: string[],
    env: Record<string, string>,
    timeout: number,
    logs: string[]
  ): Promise<{ exitCode: number; stdout: string; stderr: string }> {
    return new Promise((resolve) => {
      const process = spawn(pythonPath, args, {
        shell: true,
        env,
        timeout,
      });

      let stdout = '';
      let stderr = '';

      process.stdout.on('data', (data) => {
        const text = data.toString();
        stdout += text;
        // 只记录关键行
        for (const line of text.split('\n')) {
          if (line.trim() && (line.includes('PASSED') || line.includes('FAILED') || line.includes('ERROR') || line.includes('::'))) {
            logs.push(`[PYTEST] ${line.trim()}`);
          }
        }
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
    totalTests: number;
    totalPassed: number;
    totalFailed: number;
    assertions: AssertionResult[];
    summary: any;
  }> {
    try {
      const content = await readFile(reportPath, 'utf-8');
      const report = JSON.parse(content);

      const assertions: AssertionResult[] = [];
      let totalPassed = 0;
      let totalFailed = 0;

      // 解析 pytest-json-report 格式
      if (report.tests) {
        for (const test of report.tests) {
          const passed = test.outcome === 'passed';
          if (passed) totalPassed++;
          else totalFailed++;

          assertions.push({
            name: test.nodeid || test.name || 'Unknown test',
            passed,
            expected: 'pass',
            actual: test.outcome,
            message: test.call?.longrepr || undefined,
          });
        }
      }

      return {
        totalTests: totalPassed + totalFailed,
        totalPassed,
        totalFailed,
        assertions,
        summary: {
          duration: report.duration,
          created: report.created,
          exitcode: report.exitcode,
          environment: report.environment,
        },
      };
    } catch {
      return {
        totalTests: 0,
        totalPassed: 0,
        totalFailed: 0,
        assertions: [],
        summary: null,
      };
    }
  }
}
