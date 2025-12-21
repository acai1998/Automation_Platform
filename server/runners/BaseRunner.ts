/**
 * 执行结果接口
 */
export interface ExecutionResult {
  success: boolean;
  status: 'passed' | 'failed' | 'skipped' | 'error';
  duration: number;  // 毫秒
  message?: string;
  errorMessage?: string;
  errorStack?: string;
  assertions?: AssertionResult[];
  responseData?: any;
  logs?: string[];
}

export interface AssertionResult {
  name: string;
  passed: boolean;
  expected: any;
  actual: any;
  message?: string;
}

/**
 * 用例配置接口
 */
export interface TestCaseConfig {
  id: number;
  name: string;
  type: 'api' | 'postman' | 'pytest' | 'playwright';
  config: ApiConfig | PostmanConfig | PytestConfig | PlaywrightConfig;
  environment?: EnvironmentConfig;
}

export interface ApiConfig {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS';
  url: string;
  headers?: Record<string, string>;
  params?: Record<string, string>;
  body?: any;
  timeout?: number;
  assertions: Assertion[];
}

export interface Assertion {
  type: 'status' | 'jsonPath' | 'header' | 'contains' | 'responseTime' | 'schema';
  target?: string;
  operator: 'eq' | 'ne' | 'gt' | 'lt' | 'gte' | 'lte' | 'contains' | 'notContains' | 'regex' | 'exists';
  expected: any;
  message?: string;
}

export interface PostmanConfig {
  collectionJson: object;
  environmentJson?: object;
  iterationCount?: number;
  delayRequest?: number;
}

export interface PytestConfig {
  scriptPath: string;
  testFunction?: string;
  args?: string[];
  pythonPath?: string;
  timeout?: number;
}

export interface PlaywrightConfig {
  scriptPath: string;
  browser?: 'chromium' | 'firefox' | 'webkit';
  headless?: boolean;
  timeout?: number;
  viewport?: { width: number; height: number };
}

export interface EnvironmentConfig {
  baseUrl?: string;
  variables?: Record<string, string>;
  headers?: Record<string, string>;
}

/**
 * 基础执行器抽象类
 */
export abstract class BaseRunner {
  protected name: string;
  protected environment?: EnvironmentConfig;

  constructor(name: string) {
    this.name = name;
  }

  /**
   * 设置执行环境
   */
  setEnvironment(env: EnvironmentConfig) {
    this.environment = env;
  }

  /**
   * 执行测试用例
   */
  abstract run(config: TestCaseConfig): Promise<ExecutionResult>;

  /**
   * 检查执行器是否可用
   */
  abstract isAvailable(): Promise<boolean>;

  /**
   * 获取执行器名称
   */
  getName(): string {
    return this.name;
  }

  /**
   * 替换环境变量
   */
  protected replaceVariables(text: string, variables?: Record<string, string>): string {
    if (!variables) return text;

    let result = text;
    for (const [key, value] of Object.entries(variables)) {
      result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
      result = result.replace(new RegExp(`\\$\\{${key}\\}`, 'g'), value);
    }
    return result;
  }

  /**
   * 合并环境配置
   */
  protected mergeEnvironment(caseEnv?: EnvironmentConfig): EnvironmentConfig {
    return {
      baseUrl: caseEnv?.baseUrl || this.environment?.baseUrl,
      variables: { ...this.environment?.variables, ...caseEnv?.variables },
      headers: { ...this.environment?.headers, ...caseEnv?.headers },
    };
  }
}
