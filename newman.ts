import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const execAsync = promisify(exec);

/**
 * Newman 执行结果的核心数据结构
 */
export interface NewmanExecutionResult {
  status: 'success' | 'failed';
  stats: {
    totalRequests: number;
    passedRequests: number;
    failedRequests: number;
    totalTime: number; // 毫秒
    averageResponseTime: number; // 毫秒
  };
  runs: Array<{
    name: string;
    method: string;
    url: string;
    status: string;
    code: number;
    responseTime: number;
    testResults?: Array<{
      name: string;
      passed: boolean;
      error?: string;
    }>;
  }>;
  errors?: Array<{
    message: string;
    stack?: string;
  }>;
}

/**
 * 使用 Newman 执行 Postman Collection
 * @param collectionJson - Postman Collection JSON 对象
 * @param environmentJson - 环境变量 JSON 对象（可选）
 * @returns Newman 执行结果
 */
export async function runCollection(
  collectionJson: any,
  environmentJson?: any
): Promise<NewmanExecutionResult> {
  try {
    // 创建临时目录存储 Collection 和 Environment 文件
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'newman-'));
    const collectionPath = path.join(tempDir, 'collection.json');
    const environmentPath = path.join(tempDir, 'environment.json');
    const resultPath = path.join(tempDir, 'result.json');

    // 写入 Collection 文件
    fs.writeFileSync(collectionPath, JSON.stringify(collectionJson, null, 2));

    // 如果提供了环境变量，写入环境文件
    let environmentArg = '';
    if (environmentJson) {
      fs.writeFileSync(environmentPath, JSON.stringify(environmentJson, null, 2));
      environmentArg = `-e ${environmentPath}`;
    }

    // 执行 Newman 命令
    const command = `newman run ${collectionPath} ${environmentArg} --reporters json --reporter-json-export ${resultPath}`;
    
    try {
      await execAsync(command);
    } catch (error: any) {
      // Newman 在测试失败时会返回非零退出码，但我们仍然需要解析结果
      console.log('Newman execution completed with exit code:', error.code);
    }

    // 读取 Newman 输出结果
    const resultJson = JSON.parse(fs.readFileSync(resultPath, 'utf-8'));

    // 清理临时文件
    fs.rmSync(tempDir, { recursive: true, force: true });

    // 解析 Newman 结果
    return parseNewmanResult(resultJson);
  } catch (error: any) {
    console.error('Error running Newman:', error);
    throw new Error(`Failed to execute collection: ${error.message}`);
  }
}

/**
 * 解析 Newman 的 JSON 输出结果
 */
function parseNewmanResult(newmanOutput: any): NewmanExecutionResult {
  const stats = newmanOutput.run?.stats || {};
  const executions = newmanOutput.run?.executions || [];

  // 计算统计数据
  const totalRequests = stats.requests?.total || 0;
  const passedRequests = stats.tests?.total || 0;
  const failedRequests = (stats.testScripts?.failed || 0) + (stats.assertions?.failed || 0);
  const totalTime = stats.duration || 0;
  const averageResponseTime = totalRequests > 0 ? totalTime / totalRequests : 0;

  // 解析每个请求的执行结果
  const runs = executions.map((exec: any) => {
    const request = exec.item?.request || {};
    const response = exec.response || {};
    const assertions = exec.assertions || [];

    return {
      name: exec.item?.name || 'Unknown',
      method: request.method || 'GET',
      url: typeof request.url === 'string' ? request.url : request.url?.raw || '',
      status: response.status || 'Unknown',
      code: response.code || 0,
      responseTime: response.responseTime || 0,
      testResults: assertions.map((assertion: any) => ({
        name: assertion.assertion || '',
        passed: !assertion.error,
        error: assertion.error?.message || '',
      })),
    };
  });

  // 检查是否有错误
  const hasErrors = failedRequests > 0 || (newmanOutput.run?.failures?.length || 0) > 0;

  return {
    status: hasErrors ? 'failed' : 'success',
    stats: {
      totalRequests,
      passedRequests,
      failedRequests,
      totalTime,
      averageResponseTime,
    },
    runs,
    errors: newmanOutput.run?.failures?.map((failure: any) => ({
      message: failure.error?.message || 'Unknown error',
      stack: failure.error?.stack,
    })) || [],
  };
}

/**
 * 验证 Postman Collection JSON 的有效性
 */
export function validateCollection(collectionJson: any): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // 检查基本结构
  if (!collectionJson.info) {
    errors.push('Missing "info" property in collection');
  }

  if (!collectionJson.item && !Array.isArray(collectionJson.item)) {
    errors.push('"item" property must be an array');
  }

  // 检查 info 对象
  if (collectionJson.info) {
    if (!collectionJson.info.name) {
      errors.push('Collection name is required in "info" property');
    }
    if (!collectionJson.info.schema) {
      errors.push('Collection schema is required in "info" property');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
