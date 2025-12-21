import { HttpRunner } from './HttpRunner.js';
import { NewmanRunner } from './NewmanRunner.js';
import { PytestRunner } from './PytestRunner.js';
import { BaseRunner, TestCaseConfig, ExecutionResult } from './BaseRunner.js';

export * from './BaseRunner.js';
export * from './HttpRunner.js';
export * from './NewmanRunner.js';
export * from './PytestRunner.js';

/**
 * 执行器工厂
 */
export class RunnerFactory {
  private static runners: Map<string, BaseRunner> = new Map();

  static {
    // 注册默认执行器
    this.register('api', new HttpRunner());
    this.register('postman', new NewmanRunner());
    this.register('pytest', new PytestRunner());
  }

  /**
   * 注册执行器
   */
  static register(type: string, runner: BaseRunner): void {
    this.runners.set(type, runner);
  }

  /**
   * 获取执行器
   */
  static getRunner(type: string): BaseRunner | undefined {
    return this.runners.get(type);
  }

  /**
   * 获取所有可用的执行器类型
   */
  static async getAvailableRunners(): Promise<{ type: string; name: string; available: boolean }[]> {
    const results = [];
    for (const [type, runner] of this.runners) {
      results.push({
        type,
        name: runner.getName(),
        available: await runner.isAvailable(),
      });
    }
    return results;
  }

  /**
   * 执行测试用例
   */
  static async execute(testCase: TestCaseConfig): Promise<ExecutionResult> {
    const runner = this.getRunner(testCase.type);

    if (!runner) {
      return {
        success: false,
        status: 'error',
        duration: 0,
        errorMessage: `Unknown test case type: ${testCase.type}`,
      };
    }

    const available = await runner.isAvailable();
    if (!available) {
      return {
        success: false,
        status: 'error',
        duration: 0,
        errorMessage: `Runner "${runner.getName()}" is not available. Please install the required dependencies.`,
      };
    }

    return runner.run(testCase);
  }

  /**
   * 批量执行测试用例
   */
  static async executeBatch(
    testCases: TestCaseConfig[],
    options?: {
      parallel?: boolean;
      maxConcurrency?: number;
      onProgress?: (completed: number, total: number, result: ExecutionResult) => void;
    }
  ): Promise<Map<number, ExecutionResult>> {
    const results = new Map<number, ExecutionResult>();
    const { parallel = false, maxConcurrency = 5, onProgress } = options || {};

    if (parallel) {
      // 并行执行
      const batches: TestCaseConfig[][] = [];
      for (let i = 0; i < testCases.length; i += maxConcurrency) {
        batches.push(testCases.slice(i, i + maxConcurrency));
      }

      let completed = 0;
      for (const batch of batches) {
        const batchResults = await Promise.all(
          batch.map(async (testCase) => {
            const result = await this.execute(testCase);
            completed++;
            onProgress?.(completed, testCases.length, result);
            return { id: testCase.id, result };
          })
        );

        for (const { id, result } of batchResults) {
          results.set(id, result);
        }
      }
    } else {
      // 串行执行
      let completed = 0;
      for (const testCase of testCases) {
        const result = await this.execute(testCase);
        results.set(testCase.id, result);
        completed++;
        onProgress?.(completed, testCases.length, result);
      }
    }

    return results;
  }
}
