import { JenkinsConfig } from './JenkinsService';
import logger from '../utils/logger';
import { LOG_CONTEXTS } from '../config/logging';
import { getSecretOrEnv } from '../utils/secrets';

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
export interface MissingScriptPathDiagnostic {
  nodeId: string;
  filePath: string;
}

export interface JenkinsLogDiagnostics {
  missingScriptPaths: MissingScriptPathDiagnostic[];
  exitCode?: number;
  callbackStatus?: string;
  messages: string[];
  excerpt: string;
}

function trimForStorage(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength - 3)}...` : value;
}

export function extractCaseNameFromNodeId(nodeId: string): string {
  const cleanNodeId = nodeId.trim();
  if (!cleanNodeId) {
    return 'Jenkins diagnostic';
  }

  const parts = cleanNodeId.split('::').filter(Boolean);
  if (parts.length > 0) {
    return parts[parts.length - 1];
  }

  const filename = cleanNodeId.split(/[\\/]/).pop() ?? cleanNodeId;
  return filename.replace(/\.[^.]+$/, '') || cleanNodeId;
}

export function extractJenkinsLogDiagnostics(log: string): JenkinsLogDiagnostics {
  const lines = log.split(/\r?\n/);
  const missingScriptPaths: MissingScriptPathDiagnostic[] = [];
  const notableLineIndexes = new Set<number>();

  lines.forEach((line, index) => {
    if (
      line.includes('SCRIPT_PATHS') ||
      line.includes('exitCode=') ||
      line.includes('status=') ||
      line.includes('http_code=') ||
      line.includes('403 Forbidden') ||
      line.includes('crumb') ||
      line.includes('permission')
    ) {
      notableLineIndexes.add(index);
    }

    const missingPathMatch = line.match(/^\s*-\s+(.+?)\s+->\s+(.+?)\s*$/);
    if (missingPathMatch) {
      notableLineIndexes.add(index);
      missingScriptPaths.push({
        nodeId: missingPathMatch[1].trim(),
        filePath: missingPathMatch[2].trim(),
      });
    }
  });

  const exitCodeMatches = Array.from(log.matchAll(/exitCode=(\d+)/g));
  const lastExitCodeMatch = exitCodeMatches[exitCodeMatches.length - 1];
  const exitCode = lastExitCodeMatch ? Number.parseInt(lastExitCodeMatch[1], 10) : undefined;

  const callbackStatusMatch =
    log.match(/status=([^\s,\uFF0C]+)/) ??
    log.match(/callback[^.\n\r]*(?:HTTP|status)[^\d]*(\d{3})/i) ??
    log.match(/http_code=(\d{3})/);
  const callbackStatus = callbackStatusMatch?.[1];

  const messages: string[] = [];
  if (missingScriptPaths.length > 0) {
    const paths = missingScriptPaths
      .map((item) => `${item.filePath} (${item.nodeId})`)
      .join(', ');
    messages.push(`SCRIPT_PATHS validation failed: missing ${paths}`);
  }
  if (typeof exitCode === 'number' && exitCode !== 0) {
    messages.push(`Jenkins test runner exited with code ${exitCode}`);
  }
  if (callbackStatus) {
    messages.push(`Jenkins callback failed with status ${callbackStatus}`);
  }
  if (log.includes('403 Forbidden') && /crumb|permission/i.test(log)) {
    messages.push('Jenkins returned 403 Forbidden; check crumb, credentials, and Job/Build permission');
  }

  const excerptLines = Array.from(notableLineIndexes)
    .sort((a, b) => a - b)
    .flatMap((index) => {
      const start = Math.max(0, index - 2);
      const end = Math.min(lines.length, index + 3);
      return lines.slice(start, end);
    });
  const dedupedExcerpt = Array.from(new Set(excerptLines)).join('\n');

  return {
    missingScriptPaths,
    exitCode,
    callbackStatus,
    messages,
    excerpt: trimForStorage(dedupedExcerpt, 4000),
  };
}

export class JenkinsStatusService {
  private config: JenkinsConfig;

  constructor() {
    // 从 Docker Secrets 或环境变量加载 Jenkins 配置
    const token = getSecretOrEnv('JENKINS_TOKEN');
    if (!token) {
      logger.warn('JENKINS_TOKEN is required for Jenkins authentication', {
        event: 'JENKINS_TOKEN_MISSING',
      }, LOG_CONTEXTS.JENKINS);
    }

    this.config = {
      baseUrl: process.env.JENKINS_URL || 'http://jenkins.wiac.xyz',
      username: process.env.JENKINS_USER || 'root',
      token,
      testRepoBranch: (process.env.JENKINS_TEST_REPO_BRANCH || 'master').trim(),
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

        logger.debug('Querying Jenkins build status', {
          event: 'JENKINS_BUILD_STATUS_QUERY',
          attempt,
          retryCount,
          jobName,
          buildId,
          url,
        }, LOG_CONTEXTS.JENKINS);

        const response = await this.fetchWithTimeout(url, {
          method: 'GET',
          headers: {
            'Authorization': this.getAuthHeader(),
            'Accept': 'application/json',
          },
        }, 10000);

        if (!response.ok) {
          if (response.status === 404) {
            logger.warn('Jenkins build not found', {
              event: 'JENKINS_BUILD_NOT_FOUND',
              jobName,
              buildId,
            }, LOG_CONTEXTS.JENKINS);
            return null;
          }

          // For server errors (5xx), retry; for client errors (4xx), don't retry
          if (response.status >= 500 && attempt < retryCount) {
            logger.warn('Jenkins server error when querying build status, retrying', {
              event: 'JENKINS_BUILD_STATUS_SERVER_ERROR_RETRY',
              jobName,
              buildId,
              status: response.status,
              retryDelayMs: attempt * 1000,
              attempt,
              retryCount,
            }, LOG_CONTEXTS.JENKINS);
            await new Promise(resolve => setTimeout(resolve, attempt * 1000));
            continue;
          }

          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();

        // Validate essential fields
        if (typeof data.building !== 'boolean') {
          logger.warn('Invalid Jenkins building status, fallback to false', {
            event: 'JENKINS_BUILD_STATUS_INVALID_BUILDING',
            jobName,
            buildId,
            building: data.building,
          }, LOG_CONTEXTS.JENKINS);
          data.building = false; // Default to not building
        }

        // Log status for debugging
        logger.info('Jenkins build status fetched', {
          event: 'JENKINS_BUILD_STATUS_FETCHED',
          jobName,
          buildId,
          building: data.building,
          result: data.result,
          number: data.number,
          duration: data.duration,
        }, LOG_CONTEXTS.JENKINS);

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
        logger.error('Failed to get Jenkins build status', {
          event: 'JENKINS_BUILD_STATUS_FAILED',
          jobName,
          buildId,
          attempt,
          retryCount,
          error: lastError.message,
        }, LOG_CONTEXTS.JENKINS);

        // If this is not the last attempt, wait before retrying
        if (attempt < retryCount) {
          const delay = Math.min(attempt * 2000, 10000); // Exponential backoff, max 10s
          logger.debug('Retrying Jenkins build status query', {
            event: 'JENKINS_BUILD_STATUS_RETRY',
            jobName,
            buildId,
            delay,
            nextAttempt: attempt + 1,
            retryCount,
          }, LOG_CONTEXTS.JENKINS);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    logger.error('All attempts failed when querying Jenkins build status', {
      event: 'JENKINS_BUILD_STATUS_ALL_RETRIES_FAILED',
      jobName,
      buildId,
      retryCount,
      lastError: lastError?.message,
    }, LOG_CONTEXTS.JENKINS);
    return null;
  }

  /**
   * 查询队列状态
   */
  async getQueueStatus(queueId: number): Promise<QueueStatus | null> {
    try {
      const url = `${this.config.baseUrl}/queue/item/${queueId}/api/json`;

      logger.debug('Querying Jenkins queue status', {
        event: 'JENKINS_QUEUE_STATUS_QUERY',
        queueId,
        url,
      }, LOG_CONTEXTS.JENKINS);

      const response = await this.fetchWithTimeout(url, {
        method: 'GET',
        headers: {
          'Authorization': this.getAuthHeader(),
          'Accept': 'application/json',
        },
      }, 10000);

      if (!response.ok) {
        if (response.status === 404) {
          logger.warn('Jenkins queue item not found', {
            event: 'JENKINS_QUEUE_ITEM_NOT_FOUND',
            queueId,
          }, LOG_CONTEXTS.JENKINS);
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
      logger.errorLog(error, 'Failed to get Jenkins queue status', {
        event: 'JENKINS_QUEUE_STATUS_FAILED',
        queueId,
      });
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
      logger.errorLog(error, 'Failed to get latest Jenkins build number', {
        event: 'JENKINS_LATEST_BUILD_NUMBER_FAILED',
        jobName,
      });
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
      logger.errorLog(error, 'Failed to get Jenkins build log', {
        event: 'JENKINS_BUILD_LOG_FAILED',
        jobName,
        buildId,
        start,
      });
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
      logger.errorLog(error, 'Failed to parse Jenkins build results', {
        event: 'JENKINS_PARSE_BUILD_RESULTS_FAILED',
        jobName,
        buildId,
      });
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
      const logResults = await this.parseLogResults(jobName, buildId, buildStatus);
      if (logResults) {
        return logResults;
      }

      return null;
    } catch (error) {
      logger.errorLog(error, 'Failed to extract Jenkins test results', {
        event: 'JENKINS_EXTRACT_TEST_RESULTS_FAILED',
        jobName,
        buildId,
      });
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
      logger.errorLog(error, 'Failed to get Jenkins JUnit results', {
        event: 'JENKINS_JUNIT_RESULTS_FAILED',
        jobName,
        buildId,
      });
      return null;
    }
  }

  /**
   * 获取构建artifacts中的结果文件
   * 优先匹配 pytest-json-report 生成的 test-report.json
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

      // 优先级：test-report.json > junit.xml > test-results > results.json
      const ARTIFACT_PRIORITY = [
        (name: string) => name === 'test-report.json',
        (name: string) => name === 'junit.xml',
        (name: string) => name.includes('test-results') || name.includes('results.json'),
      ];

      let resultFile: any = null;
      for (const matcher of ARTIFACT_PRIORITY) {
        resultFile = data.artifacts?.find((artifact: any) => matcher(artifact.fileName ?? ''));
        if (resultFile) break;
      }

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
      logger.errorLog(error, 'Failed to get Jenkins artifact results', {
        event: 'JENKINS_ARTIFACT_RESULTS_FAILED',
        jobName,
        buildId,
      });
      return null;
    }
  }

  /**
   * 解析构建日志获取测试结果
   * 支持 pytest、JUnit 及自定义格式的日志输出
   */
  private async parseLogResults(jobName: string, buildId: string, buildStatus?: BuildStatus): Promise<TestResults | null> {
    try {
      const logData = await this.getBuildLog(jobName, buildId);
      if (!logData) {
        return null;
      }

      const log = logData.text;

      const diagnosticResults = this.buildDiagnosticResultsFromLog(jobName, buildId, log, buildStatus);
      if (diagnosticResults) {
        return diagnosticResults;
      }

      // ─── 优先级由高到低的匹配模式 ───────────────────────────────────
      const patterns: Array<{
        name: string;
        pattern: RegExp;
        extract: (match: RegExpMatchArray) => { passed: number; failed: number; skipped: number; total?: number };
      }> = [
        {
          // pytest 标准摘要行（最后一行）:
          // "5 passed, 2 failed, 1 error, 1 skipped in 12.34s"
          // "3 passed in 5.12s"
          // "1 failed in 1.01s"
          name: 'pytest-summary',
          pattern: /(\d+)\s+passed(?:,\s*(\d+)\s+failed)?(?:,\s*(\d+)\s+error)?(?:,\s*(\d+)\s+skipped)?\s+in\s+[\d.]+s/i,
          extract: (m) => ({
            passed: parseInt(m[1] ?? '0', 10),
            failed: (parseInt(m[2] ?? '0', 10)) + (parseInt(m[3] ?? '0', 10)),
            skipped: parseInt(m[4] ?? '0', 10),
          }),
        },
        {
          // pytest 仅有失败的情况: "2 failed in 3.45s" (无 passed 关键字)
          name: 'pytest-failed-only',
          pattern: /(\d+)\s+failed(?:,\s*(\d+)\s+error)?(?:,\s*(\d+)\s+skipped)?\s+in\s+[\d.]+s/i,
          extract: (m) => ({
            passed: 0,
            failed: (parseInt(m[1] ?? '0', 10)) + (parseInt(m[2] ?? '0', 10)),
            skipped: parseInt(m[3] ?? '0', 10),
          }),
        },
        {
          // pytest short test summary (=== short test summary info ===) 末尾行
          // "= 1 failed, 3 passed, 1 skipped in 8.00s ="
          name: 'pytest-equals-summary',
          pattern: /=+\s+(?:(\d+)\s+failed,\s*)?(?:(\d+)\s+passed,\s*)?(?:(\d+)\s+skipped,?\s*)?\d+.*in\s+[\d.]+s\s*=+/i,
          extract: (m) => ({
            failed: parseInt(m[1] ?? '0', 10),
            passed: parseInt(m[2] ?? '0', 10),
            skipped: parseInt(m[3] ?? '0', 10),
          }),
        },
        {
          // JUnit: "Tests run: 10, Failures: 2, Errors: 0, Skipped: 1"
          name: 'junit',
          pattern: /Tests run:\s*(\d+),\s*Failures:\s*(\d+),\s*Errors:\s*(\d+),\s*Skipped:\s*(\d+)/i,
          extract: (m) => {
            const total = parseInt(m[1], 10);
            const failed = parseInt(m[2], 10) + parseInt(m[3], 10);
            const skipped = parseInt(m[4], 10);
            return { passed: total - failed - skipped, failed, skipped, total };
          },
        },
        {
          // 自定义: "PASSED: 8, FAILED: 2, SKIPPED: 1"
          name: 'custom',
          pattern: /PASSED:\s*(\d+),\s*FAILED:\s*(\d+),\s*SKIPPED:\s*(\d+)/i,
          extract: (m) => ({
            passed: parseInt(m[1], 10),
            failed: parseInt(m[2], 10),
            skipped: parseInt(m[3], 10),
          }),
        },
        {
          // 总数格式: "Total: 10, Pass: 8, Fail: 2, Skip: 0"
          name: 'total',
          pattern: /Total:\s*(\d+),\s*Pass:\s*(\d+),\s*Fail:\s*(\d+),\s*Skip:\s*(\d+)/i,
          extract: (m) => ({
            total: parseInt(m[1], 10),
            passed: parseInt(m[2], 10),
            failed: parseInt(m[3], 10),
            skipped: parseInt(m[4], 10),
          }),
        },
      ];

      for (const { name, pattern, extract } of patterns) {
        const match = log.match(pattern);
        if (match) {
          const { passed, failed, skipped, total } = extract(match);
          const passedCases = isNaN(passed) ? 0 : passed;
          const failedCases = isNaN(failed) ? 0 : failed;
          const skippedCases = isNaN(skipped) ? 0 : skipped;
          const totalCases = total != null && !isNaN(total) ? total : passedCases + failedCases + skippedCases;

          logger.info('Parsed Jenkins test results from build log', {
            event: 'JENKINS_LOG_RESULTS_PARSED',
            pattern: name,
            totalCases,
            passedCases,
            failedCases,
            skippedCases,
            jobName,
            buildId,
          }, LOG_CONTEXTS.JENKINS);

          return {
            totalCases,
            passedCases,
            failedCases,
            skippedCases,
            duration: 0,
            results: [],
          };
        }
      }

      return null;
    } catch (error) {
      logger.errorLog(error, 'Failed to parse Jenkins log results', {
        event: 'JENKINS_PARSE_LOG_RESULTS_FAILED',
        jobName,
        buildId,
      });
      return null;
    }
  }

  private buildDiagnosticResultsFromLog(
    jobName: string,
    buildId: string,
    log: string,
    buildStatus?: BuildStatus
  ): TestResults | null {
    const diagnostics = extractJenkinsLogDiagnostics(log);
    if (diagnostics.messages.length === 0) {
      return null;
    }

    const firstMissingPath = diagnostics.missingScriptPaths[0];
    const caseName = firstMissingPath
      ? extractCaseNameFromNodeId(firstMissingPath.nodeId)
      : `Build ${buildStatus?.number ?? buildId}`;
    const duration = buildStatus?.duration ?? 0;
    const errorMessage = trimForStorage(diagnostics.messages.join('; '), 2000);
    const stackTrace = diagnostics.excerpt || errorMessage;

    logger.warn('Parsed Jenkins diagnostic failure from build log', {
      event: 'JENKINS_LOG_DIAGNOSTIC_PARSED',
      jobName,
      buildId,
      caseName,
      missingScriptPaths: diagnostics.missingScriptPaths,
      exitCode: diagnostics.exitCode,
      callbackStatus: diagnostics.callbackStatus,
    }, LOG_CONTEXTS.JENKINS);

    return {
      totalCases: 1,
      passedCases: 0,
      failedCases: 1,
      skippedCases: 0,
      duration,
      results: [{
        caseId: 0,
        caseName,
        status: 'failed',
        duration,
        errorMessage,
        stackTrace,
        logPath: `${this.config.baseUrl}/job/${encodeURIComponent(jobName)}/${encodeURIComponent(buildId)}/console`,
      }],
    };
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
   * 支持 pytest-json-report 格式（test-report.json）和自定义格式
   *
   * pytest-json-report 的 test-report.json 结构示例：
   * {
   *   "created": 1234567890,
   *   "duration": 12.34,
   *   "exitcode": 0,
   *   "root": "/path/to/tests",
   *   "environment": {},
   *   "summary": { "passed": 3, "failed": 1, "total": 4 },
   *   "tests": [
   *     {
   *       "nodeid": "D/test_xxx.py::TestClass::test_method",
   *       "outcome": "passed",  // "passed" | "failed" | "error" | "skipped"
   *       "duration": 1.23,
   *       "longrepr": "AssertionError: ..."  // 失败时存在
   *     }
   *   ]
   * }
   */
  private parseResultFile(data: any): TestResults | null {
    try {
      // ─── 格式1: pytest-json-report（test-report.json）─────────────
      if (data.summary && Array.isArray(data.tests)) {
        const summary = data.summary as Record<string, number>;
        const passedCases = summary['passed'] ?? 0;
        const failedCases = (summary['failed'] ?? 0) + (summary['error'] ?? 0);
        const skippedCases = summary['skipped'] ?? 0;
        const totalCases = summary['total'] ?? (passedCases + failedCases + skippedCases);
        const duration = typeof data.duration === 'number' ? Math.round(data.duration * 1000) : 0;

        const results: TestCaseResult[] = (data.tests as any[]).map((t) => {
          const outcome: string = String(t.outcome ?? '').toLowerCase();
          const status = this.mapPytestOutcome(outcome);
          const nodeId: string = String(t.nodeid ?? '');
          const caseName = nodeId || 'unknown';
          // pytest-json-report 不携带 caseId，用 0 作占位，
          // completeBatchExecution 会按 caseName 做二次匹配
          const caseId = this.extractCaseId(caseName) ?? 0;

          const errorMessage = typeof t.longrepr === 'string' && t.longrepr.trim()
            ? t.longrepr.trim().slice(0, 2000)
            : undefined;

          return {
            caseId,
            caseName,
            status,
            duration: typeof t.duration === 'number' ? Math.round(t.duration * 1000) : 0,
            errorMessage,
          };
        });

        const exitCode = typeof data.exitcode === 'number' ? data.exitcode : 0;
        if (totalCases === 0 && results.length === 0 && exitCode !== 0) {
          logger.warn('Jenkins artifact report had no test cases but non-zero exit code; falling back to console diagnostics', {
            event: 'JENKINS_ARTIFACT_EMPTY_WITH_EXIT_CODE',
            exitCode,
          }, LOG_CONTEXTS.JENKINS);
          return null;
        }

        return { totalCases, passedCases, failedCases, skippedCases, duration, results };
      }

      // ─── 格式2: 自定义格式 ────────────────────────────────────────
      if (data.testResults) {
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
      logger.errorLog(error, 'Failed to parse Jenkins result file', {
        event: 'JENKINS_PARSE_RESULT_FILE_FAILED',
      });
      return null;
    }
  }

  /**
   * 映射 pytest 的 outcome 到内部状态
   */
  private mapPytestOutcome(outcome: string): 'passed' | 'failed' | 'skipped' | 'error' {
    switch (outcome) {
      case 'passed':
        return 'passed';
      case 'failed':
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
