import {
  BaseRunner,
  ExecutionResult,
  TestCaseConfig,
  ApiConfig,
  Assertion,
  AssertionResult,
} from './BaseRunner.js';

/**
 * HTTP API 执行器
 * 用于执行简单的 HTTP 接口测试
 */
export class HttpRunner extends BaseRunner {
  constructor() {
    super('HTTP Runner');
  }

  async isAvailable(): Promise<boolean> {
    return true; // 始终可用
  }

  async run(testCase: TestCaseConfig): Promise<ExecutionResult> {
    const startTime = Date.now();
    const config = testCase.config as ApiConfig;
    const env = this.mergeEnvironment(testCase.environment);
    const logs: string[] = [];

    try {
      // 构建完整 URL
      let url = config.url;
      if (env.baseUrl && !url.startsWith('http')) {
        url = `${env.baseUrl}${url}`;
      }
      url = this.replaceVariables(url, env.variables);

      // 处理查询参数
      if (config.params) {
        const params = new URLSearchParams();
        for (const [key, value] of Object.entries(config.params)) {
          params.append(key, this.replaceVariables(value, env.variables));
        }
        url += `?${params.toString()}`;
      }

      // 合并请求头
      const headers: Record<string, string> = {
        ...env.headers,
        ...config.headers,
      };
      for (const key of Object.keys(headers)) {
        headers[key] = this.replaceVariables(headers[key], env.variables);
      }

      // 处理请求体
      let body: string | undefined;
      if (config.body) {
        if (typeof config.body === 'string') {
          body = this.replaceVariables(config.body, env.variables);
        } else {
          body = JSON.stringify(config.body);
          if (!headers['Content-Type']) {
            headers['Content-Type'] = 'application/json';
          }
        }
      }

      logs.push(`[REQUEST] ${config.method} ${url}`);
      logs.push(`[HEADERS] ${JSON.stringify(headers)}`);
      if (body) {
        logs.push(`[BODY] ${body.substring(0, 500)}${body.length > 500 ? '...' : ''}`);
      }

      // 发送请求
      const controller = new AbortController();
      const timeout = config.timeout || 30000;
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const response = await fetch(url, {
        method: config.method,
        headers,
        body: config.method !== 'GET' && config.method !== 'HEAD' ? body : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const responseTime = Date.now() - startTime;

      // 获取响应数据
      const contentType = response.headers.get('content-type') || '';
      let responseData: any;
      const responseText = await response.text();

      try {
        if (contentType.includes('application/json')) {
          responseData = JSON.parse(responseText);
        } else {
          responseData = responseText;
        }
      } catch {
        responseData = responseText;
      }

      logs.push(`[RESPONSE] Status: ${response.status} (${responseTime}ms)`);
      logs.push(`[RESPONSE BODY] ${responseText.substring(0, 500)}${responseText.length > 500 ? '...' : ''}`);

      // 执行断言
      const assertionResults: AssertionResult[] = [];
      let allPassed = true;

      for (const assertion of config.assertions) {
        const result = this.executeAssertion(assertion, {
          status: response.status,
          headers: Object.fromEntries(response.headers.entries()),
          body: responseData,
          responseText,
          responseTime,
        });
        assertionResults.push(result);
        if (!result.passed) {
          allPassed = false;
          logs.push(`[ASSERTION FAILED] ${result.name}: Expected ${JSON.stringify(result.expected)}, got ${JSON.stringify(result.actual)}`);
        } else {
          logs.push(`[ASSERTION PASSED] ${result.name}`);
        }
      }

      return {
        success: allPassed,
        status: allPassed ? 'passed' : 'failed',
        duration: responseTime,
        assertions: assertionResults,
        responseData,
        logs,
        message: allPassed ? 'All assertions passed' : 'Some assertions failed',
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

  private executeAssertion(
    assertion: Assertion,
    response: {
      status: number;
      headers: Record<string, string>;
      body: any;
      responseText: string;
      responseTime: number;
    }
  ): AssertionResult {
    const { type, target, operator, expected, message } = assertion;
    let actual: any;
    let passed = false;

    try {
      // 获取实际值
      switch (type) {
        case 'status':
          actual = response.status;
          break;

        case 'header':
          actual = response.headers[target?.toLowerCase() || ''];
          break;

        case 'jsonPath':
          actual = this.getJsonPath(response.body, target || '');
          break;

        case 'contains':
          actual = response.responseText;
          break;

        case 'responseTime':
          actual = response.responseTime;
          break;

        default:
          actual = undefined;
      }

      // 执行比较
      switch (operator) {
        case 'eq':
          passed = actual === expected || JSON.stringify(actual) === JSON.stringify(expected);
          break;

        case 'ne':
          passed = actual !== expected;
          break;

        case 'gt':
          passed = actual > expected;
          break;

        case 'lt':
          passed = actual < expected;
          break;

        case 'gte':
          passed = actual >= expected;
          break;

        case 'lte':
          passed = actual <= expected;
          break;

        case 'contains':
          passed = String(actual).includes(String(expected));
          break;

        case 'notContains':
          passed = !String(actual).includes(String(expected));
          break;

        case 'regex':
          passed = new RegExp(expected).test(String(actual));
          break;

        case 'exists':
          passed = actual !== undefined && actual !== null;
          break;

        default:
          passed = false;
      }
    } catch (error: any) {
      return {
        name: message || `${type} ${operator} ${expected}`,
        passed: false,
        expected,
        actual: `Error: ${error.message}`,
      };
    }

    return {
      name: message || `${type}${target ? `(${target})` : ''} ${operator} ${expected}`,
      passed,
      expected,
      actual,
    };
  }

  /**
   * 简单的 JSONPath 实现
   * 支持: $.key, $.key.subkey, $.array[0], $.array[*].key
   */
  private getJsonPath(obj: any, path: string): any {
    if (!path || path === '$') return obj;

    const normalizedPath = path.startsWith('$.') ? path.slice(2) : path.startsWith('$') ? path.slice(1) : path;
    const parts = normalizedPath.split(/\.|\[|\]/).filter(Boolean);

    let current = obj;
    for (const part of parts) {
      if (current === undefined || current === null) return undefined;

      if (part === '*' && Array.isArray(current)) {
        // 处理数组通配符
        const remaining = parts.slice(parts.indexOf(part) + 1).join('.');
        return current.map((item) => (remaining ? this.getJsonPath(item, remaining) : item));
      }

      const index = parseInt(part, 10);
      if (!isNaN(index)) {
        current = current[index];
      } else {
        current = current[part];
      }
    }

    return current;
  }
}
