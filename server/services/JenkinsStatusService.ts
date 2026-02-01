import { JenkinsConfig } from './JenkinsService';

/**
 * Jenkins构建状态
 */
export interface BuildStatus {
  building: boolean;
  result: 'SUCCESS' | 'FAILURE' | 'ABORTED' | 'UNSTABLE' | null;
  number: number;
  url: string;
  timestamp: number;
  duration: number;
  estimatedDuration: number;
  actions: any[];
  changeSet?: {
    items: any[];
    kind: string;
  };
}

/**
 * Jenkins队列状态
 */
export interface QueueStatus {
  id: number;
  task: {
    name: string;
    url: string;
  };
  stuck: boolean;
  blocked: boolean;
  buildable: boolean;
  pending: boolean;
  cancelled: boolean;
  why?: string;
  inQueueSince: number;
  params?: string;
}

/**
 * 测试结果解析接口
 */
export interface TestResults {
  totalCases: number;
  passedCases: number;
  failedCases: number;
  skippedCases: number;
  duration: number;
  results: TestCaseResult[];
}

/**
 * 单个测试用例结果
 */
export interface TestCaseResult {
  caseId: number;
  caseName: string;
  status: 'passed' | 'failed' | 'skipped' | 'error';
  duration: number;
  errorMessage?: string;
  stackTrace?: string;
  startTime?: number;
  endTime?: number;
  // New diagnostic fields for enhanced test result tracking
  screenshotPath?: string;      // Path to failure screenshot
  logPath?: string;             // Path to execution log file
  assertionsTotal?: number;     // Total number of assertions in the test
  assertionsPassed?: number;    // Number of assertions that passed
  responseData?: string;        // API response data as JSON string
}

/**
 * Jenkins状态查询服务
 * 提供主动查询Jenkins构建状态的能力，作为回调机制的备用方案
 */
export class JenkinsStatusService {
  private config: JenkinsConfig;

  constructor() {
    // 从 Docker Secrets 或环境变量加载 Jenkins 配置
    const { getSecretOrEnv } = require('../utils/secrets');

    const token = getSecretOrEnv('JENKINS_TOKEN');
    if (!token) {
      console.warn('JENKINS_TOKEN environment variable is required for Jenkins authentication. Jenkins integration may not work.');
    }

    this.config = {
      baseUrl: process.env.JENKINS_URL || 'http://jenkins.wiac.xyz:8080/',
      username: process.env.JENKINS_USER || 'root',
      token,
      jobs: {
        api: process.env.JENKINS_JOB_API || 'api-automation',
        ui: process.env.JENKINS_JOB_UI || 'ui-automation',
        performance: process.env.JENKINS_JOB_PERF || 'performance-automation',
      },
    };
  }

  /**
   * 获取基础认证头
   */
  private getAuthHeader(): string {
    const credentials = Buffer.from(`${this.config.username}:${this.config.token}`).toString('base64');
    return `Basic ${credentials}`;
  }

  /**
   * 创建带超时的 fetch 请求
   */
  private async fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number = 10000): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      return response;
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * 查询构建状态
   */
  async getBuildStatus(jobName: string, buildId: string, retryCount: number = 3): Promise<BuildStatus | null> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= retryCount; attempt++) {
      try {
        const url = `${this.config.baseUrl}/job/${jobName}/${buildId}/api/json`;

        console.log(`Querying build status (attempt ${attempt}/${retryCount}): ${url}`);

        const response = await this.fetchWithTimeout(url, {
          method: 'GET',
          headers: {
            'Authorization': this.getAuthHeader(),
            'Accept': 'application/json',
          },
        }, 10000);

        if (!response.ok) {
          if (response.status === 404) {
            console.warn(`Build not found: ${jobName}/${buildId}`);
            return null;
          }

          // For server errors (5xx), retry; for client errors (4xx), don't retry
          if (response.status >= 500 && attempt < retryCount) {
            console.warn(`Server error ${response.status}, retrying in ${attempt * 1000}ms...`);
            await new Promise(resolve => setTimeout(resolve, attempt * 1000));
            continue;
          }

          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();

        // Validate essential fields
        if (typeof data.building !== 'boolean') {
          console.warn(`Invalid building status for ${jobName}/${buildId}: ${data.building}`);
          data.building = false; // Default to not building
        }

        // Log status for debugging
        console.log(`Build status for ${jobName}/${buildId}:`, {
          building: data.building,
          result: data.result,
          number: data.number,
          duration: data.duration
        });

        return {
          building: data.building,
          result: data.result,
          number: data.number,
          url: data.url,
          timestamp: data.timestamp,
          duration: data.duration || 0,
          estimatedDuration: data.estimatedDuration || 0,
          actions: data.actions || [],
          changeSet: data.changeSet
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        console.error(`Failed to get build status for ${jobName}/${buildId} (attempt ${attempt}):`, lastError.message);

        // If this is not the last attempt, wait before retrying
        if (attempt < retryCount) {
          const delay = Math.min(attempt * 2000, 10000); // Exponential backoff, max 10s
          console.log(`Retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    console.error(`All ${retryCount} attempts failed for ${jobName}/${buildId}. Last error:`, lastError?.message);
    return null;
  }

  /**
   * 查询队列状态
   */
  async getQueueStatus(queueId: number): Promise<QueueStatus | null> {
    try {
      const url = `${this.config.baseUrl}/queue/item/${queueId}/api/json`;

      console.log(`Querying queue status: ${url}`);

      const response = await this.fetchWithTimeout(url, {
        method: 'GET',
        headers: {
          'Authorization': this.getAuthHeader(),
          'Accept': 'application/json',
        },
      }, 10000);

      if (!response.ok) {
        if (response.status === 404) {
          console.warn(`Queue item not found: ${queueId}`);
          return null;
        }
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      return {
        id: data.id,
        task: {
          name: data.task?.name || '',
          url: data.task?.url || ''
        },
        stuck: data.stuck || false,
        blocked: data.blocked || false,
        buildable: data.buildable || false,
        pending: data.pending || false,
        cancelled: data.cancelled || false,
        why: data.why,
        inQueueSince: data.inQueueSince,
        params: data.params
      };
    } catch (error) {
      console.error(`Failed to get queue status for ${queueId}:`, error);
      return null;
    }
  }

  /**
   * 获取最新构建号
   */
  async getLatestBuildNumber(jobName: string): Promise<number | null> {
    try {
      const url = `${this.config.baseUrl}/job/${jobName}/lastBuild/api/json`;

      const response = await this.fetchWithTimeout(url, {
        method: 'GET',
        headers: {
          'Authorization': this.getAuthHeader(),
          'Accept': 'application/json',
        },
      }, 10000);

      if (!response.ok) {
        return null;
      }

      const data = await response.json();
      return data.number || null;
    } catch (error) {
      console.error(`Failed to get latest build number for ${jobName}:`, error);
      return null;
    }
  }

  /**
   * 查询构建日志
   */
  async getBuildLog(jobName: string, buildId: string, start: number = 0): Promise<{
    text: string;
    hasMoreData: boolean;
    size: number;
  } | null> {
    try {
      const url = `${this.config.baseUrl}/job/${jobName}/${buildId}/logText/progressiveText?start=${start}`;

      const response = await this.fetchWithTimeout(url, {
        method: 'GET',
        headers: {
          'Authorization': this.getAuthHeader(),
        },
      }, 15000);

      if (!response.ok) {
        return null;
      }

      const text = await response.text();
      const hasMoreData = response.headers.get('X-More-Data') === 'true';
      const size = parseInt(response.headers.get('X-Text-Size') || '0', 10);

      return {
        text,
        hasMoreData,
        size
      };
    } catch (error) {
      console.error(`Failed to get build log for ${jobName}/${buildId}:`, error);
      return null;
    }
  }

  /**
   * 解析构建结果
   * 从Jenkins构建中提取测试用例执行结果
   */
  async parseBuildResults(jobName: string, buildId: string): Promise<TestResults | null> {
    try {
      // 1. 获取构建状态
      const buildStatus = await this.getBuildStatus(jobName, buildId);
      if (!buildStatus) {
        return null;
      }

      // 2. 尝试从多个来源获取测试结果
      const testResults = await this.extractTestResults(jobName, buildId, buildStatus);

      if (testResults) {
        return testResults;
      }

      // 3. 如果无法获取详细测试结果，基于构建状态生成基本结果
      return this.generateBasicResults(buildStatus);
    } catch (error) {
      console.error(`Failed to parse build results for ${jobName}/${buildId}:`, error);
      return null;
    }
  }

  /**
   * 从Jenkins构建中提取测试结果
   */
  private async extractTestResults(jobName: string, buildId: string, buildStatus: BuildStatus): Promise<TestResults | null> {
    try {
      // 方法1: 尝试获取JUnit测试结果
      const junitResults = await this.getJUnitResults(jobName, buildId);
      if (junitResults) {
        return junitResults;
      }

      // 方法2: 尝试从构建artifacts获取结果文件
      const artifactResults = await this.getArtifactResults(jobName, buildId);
      if (artifactResults) {
        return artifactResults;
      }

      // 方法3: 解析构建日志
      const logResults = await this.parseLogResults(jobName, buildId);
      if (logResults) {
        return logResults;
      }

      return null;
    } catch (error) {
      console.error('Failed to extract test results:', error);
      return null;
    }
  }

  /**
   * 获取JUnit测试结果
   */
  private async getJUnitResults(jobName: string, buildId: string): Promise<TestResults | null> {
    try {
      const url = `${this.config.baseUrl}/job/${jobName}/${buildId}/testReport/api/json`;

      const response = await this.fetchWithTimeout(url, {
        method: 'GET',
        headers: {
          'Authorization': this.getAuthHeader(),
          'Accept': 'application/json',
        },
      }, 10000);

      if (!response.ok) {
        return null;
      }

      const data = await response.json();

      const results: TestCaseResult[] = [];

      // 解析测试套件
      if (data.suites && Array.isArray(data.suites)) {
        for (const suite of data.suites) {
          if (suite.cases && Array.isArray(suite.cases)) {
            for (const testCase of suite.cases) {
              results.push({
                caseId: this.extractCaseId(testCase.name) || 0,
                caseName: testCase.name,
                status: this.mapJUnitStatus(testCase.status),
                duration: testCase.duration * 1000, // 转换为毫秒
                errorMessage: testCase.errorDetails || undefined,
                stackTrace: testCase.errorStackTrace || undefined
              });
            }
          }
        }
      }

      return {
        totalCases: data.totalCount || 0,
        passedCases: data.passCount || 0,
        failedCases: data.failCount || 0,
        skippedCases: data.skipCount || 0,
        duration: data.duration || 0,
        results
      };
    } catch (error) {
      console.error('Failed to get JUnit results:', error);
      return null;
    }
  }

  /**
   * 获取构建artifacts中的结果文件
   */
  private async getArtifactResults(jobName: string, buildId: string): Promise<TestResults | null> {
    try {
      // 获取artifacts列表
      const artifactsUrl = `${this.config.baseUrl}/job/${jobName}/${buildId}/api/json?tree=artifacts[*]`;

      const response = await this.fetchWithTimeout(artifactsUrl, {
        method: 'GET',
        headers: {
          'Authorization': this.getAuthHeader(),
          'Accept': 'application/json',
        },
      }, 10000);

      if (!response.ok) {
        return null;
      }

      const data = await response.json();

      // 查找测试结果文件
      const resultFile = data.artifacts?.find((artifact: any) =>
        artifact.fileName?.includes('test-results') ||
        artifact.fileName?.includes('results.json')
      );

      if (!resultFile) {
        return null;
      }

      // 下载结果文件
      const fileUrl = `${this.config.baseUrl}/job/${jobName}/${buildId}/artifact/${resultFile.relativePath}`;
      const fileResponse = await this.fetchWithTimeout(fileUrl, {
        method: 'GET',
        headers: {
          'Authorization': this.getAuthHeader(),
        },
      }, 15000);

      if (!fileResponse.ok) {
        return null;
      }

      const resultData = await fileResponse.json();

      // 根据文件格式解析结果
      return this.parseResultFile(resultData);
    } catch (error) {
      console.error('Failed to get artifact results:', error);
      return null;
    }
  }

  /**
   * 解析构建日志获取测试结果
   */
  private async parseLogResults(jobName: string, buildId: string): Promise<TestResults | null> {
    try {
      const logData = await this.getBuildLog(jobName, buildId);
      if (!logData) {
        return null;
      }

      const log = logData.text;

      // 使用正则表达式提取测试结果
      const patterns = {
        // 匹配 "Tests run: 10, Failures: 2, Errors: 0, Skipped: 1"
        junit: /Tests run:\s*(\d+),\s*Failures:\s*(\d+),\s*Errors:\s*(\d+),\s*Skipped:\s*(\d+)/i,

        // 匹配 "PASSED: 8, FAILED: 2, SKIPPED: 1"
        custom: /PASSED:\s*(\d+),\s*FAILED:\s*(\d+),\s*SKIPPED:\s*(\d+)/i,

        // 匹配总数格式
        total: /Total:\s*(\d+),\s*Pass:\s*(\d+),\s*Fail:\s*(\d+),\s*Skip:\s*(\d+)/i
      };

      for (const [name, pattern] of Object.entries(patterns)) {
        const match = log.match(pattern);
        if (match) {
          console.log(`Found test results using ${name} pattern:`, match);

          if (name === 'junit') {
            const [, total, failures, errors, skipped] = match;
            const totalCases = parseInt(total, 10);
            const failedCases = parseInt(failures, 10) + parseInt(errors, 10);
            const skippedCases = parseInt(skipped, 10);
            const passedCases = totalCases - failedCases - skippedCases;

            return {
              totalCases,
              passedCases,
              failedCases,
              skippedCases,
              duration: 0,
              results: []
            };
          } else {
            const [, passed, failed, skipped] = match;
            const passedCases = parseInt(passed, 10);
            const failedCases = parseInt(failed, 10);
            const skippedCases = parseInt(skipped, 10);
            const totalCases = passedCases + failedCases + skippedCases;

            return {
              totalCases,
              passedCases,
              failedCases,
              skippedCases,
              duration: 0,
              results: []
            };
          }
        }
      }

      return null;
    } catch (error) {
      console.error('Failed to parse log results:', error);
      return null;
    }
  }

  /**
   * 基于构建状态生成基本结果
   */
  private generateBasicResults(buildStatus: BuildStatus): TestResults {
    const isSuccess = buildStatus.result === 'SUCCESS';
    const isFailed = buildStatus.result === 'FAILURE' || buildStatus.result === 'UNSTABLE';
    const isAborted = buildStatus.result === 'ABORTED';

    return {
      totalCases: 1,
      passedCases: isSuccess ? 1 : 0,
      failedCases: isFailed ? 1 : 0,
      skippedCases: isAborted ? 1 : 0,
      duration: buildStatus.duration,
      results: [{
        caseId: 0,
        caseName: `Build ${buildStatus.number}`,
        status: isSuccess ? 'passed' : isFailed ? 'failed' : 'skipped',
        duration: buildStatus.duration
      }]
    };
  }

  /**
   * 解析结果文件
   */
  private parseResultFile(data: any): TestResults | null {
    try {
      // 支持多种结果文件格式
      if (data.testResults) {
        // 自定义格式
        return {
          totalCases: data.totalCases || 0,
          passedCases: data.passedCases || 0,
          failedCases: data.failedCases || 0,
          skippedCases: data.skippedCases || 0,
          duration: data.duration || 0,
          results: data.testResults || []
        };
      }

      return null;
    } catch (error) {
      console.error('Failed to parse result file:', error);
      return null;
    }
  }

  /**
   * 从测试用例名称中提取用例ID
   */
  private extractCaseId(caseName: string): number | null {
    const match = caseName.match(/case[_-]?(\d+)/i) || caseName.match(/(\d+)/);
    return match ? parseInt(match[1], 10) : null;
  }

  /**
   * 映射JUnit状态到内部状态
   */
  private mapJUnitStatus(status: string): 'passed' | 'failed' | 'skipped' | 'error' {
    switch (status?.toLowerCase()) {
      case 'passed':
      case 'success':
        return 'passed';
      case 'failed':
      case 'failure':
        return 'failed';
      case 'skipped':
        return 'skipped';
      case 'error':
        return 'error';
      default:
        return 'error';
    }
  }

  /**
   * 检查Jenkins连接状态
   */
  async checkConnection(): Promise<{ connected: boolean; message: string }> {
    try {
      const response = await this.fetchWithTimeout(`${this.config.baseUrl}/api/json`, {
        method: 'GET',
        headers: {
          'Authorization': this.getAuthHeader(),
        },
      }, 5000);

      if (response.ok) {
        return { connected: true, message: 'Jenkins connection successful' };
      } else {
        return { connected: false, message: `Connection failed: ${response.status}` };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return { connected: false, message: `Connection error: ${errorMessage}` };
    }
  }
}

// 导出单例
export const jenkinsStatusService = new JenkinsStatusService();