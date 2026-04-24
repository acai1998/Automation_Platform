import { isMisconfiguredTestRepoUrl, normalizeGitRemoteUrl } from '../utils/jenkinsRepoValidation';
import { normalizeConfiguredJenkinsBaseUrl } from '../utils/jenkinsUrl';

/**
 * Jenkins 配置接口
 */
export interface JenkinsConfig {
  baseUrl: string;
  username: string;
  token: string;
  jobs: {
    api: string;
    ui: string;
    performance: string;
  };
  testRepoUrl?: string;
  testRepoBranch: string;
}

function runGitCommand(command: string): string | undefined {
  try {
    const { execSync } = require('child_process') as typeof import('child_process');
    const output = execSync(command, {
      cwd: process.cwd(),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return output || undefined;
  } catch {
    return undefined;
  }
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, '');
}

/**
 * 错误分类：用于区分应重试的错误和不应重试的错误
 */
export type JenkinsErrorCategory =
  | 'none'           // 无错误（成功）
  | 'network'        // 网络不可达（DNS失败、连接拒绝、超时等），可重试
  | 'auth_failed'    // 认证失败（401/403），不应重试
  | 'not_found'      // 资源不存在（Job不存在，404），不应重试
  | 'bad_request'    // 参数错误（400），不应重试
  | 'rate_limited'   // 被限流（429），可重试
  | 'server_error';  // 服务端错误（5xx），可重试

/**
 * 判断某类错误是否应该触发重试
 */
export function isJenkinsErrorRetryable(category: JenkinsErrorCategory): boolean {
  return category === 'network' || category === 'rate_limited' || category === 'server_error';
}

/**
 * Jenkins 触发结果
 */
export interface JenkinsTriggerResult {
  success: boolean;
  queueId?: number;
  buildUrl?: string;
  buildNumber?: number;
  message: string;
  /** 错误分类，用于调度器判断是否需要重试 */
  errorCategory: JenkinsErrorCategory;
}

/**
 * Jenkins Queue Item（通过 queueId 轮询获取的结果）
 */
interface JenkinsQueueItem {
  id: number;
  why: string | null;
  cancelled: boolean;
  executable?: {
    number: number;
    url: string;
  };
}

interface JenkinsCrumb {
  field: string;
  value: string;
  fetchedAt: number;
}

/**
 * [dev-10] queueId → buildNumber 解析完成后的回调类型
 * 由调用方注入，异步回调中更新数据库
 * @param buildNumber  Jenkins 真实构建号
 * @param buildUrl     Jenkins 构建 URL
 * @param queueWaitMs  构建在 Jenkins 队列中等待的时长（毫秒）
 */
export type BuildResolvedCallback = (buildNumber: number, buildUrl: string, queueWaitMs: number) => Promise<void>;

/**
 * [dev-11] Jenkins 队列取消/超时时的回调类型
 * 当 pollQueueForBuild 返回 null（构建被取消或等待超时）时调用
 * @param reason  取消原因：'cancelled'（Jenkins 队列项被取消）或 'timeout'（轮询超时）
 */
export type BuildCancelledCallback = (reason: 'cancelled' | 'timeout') => Promise<void>;

/**
 * 用例类型
 */
export type CaseType = 'api' | 'ui' | 'performance';

/**
 * Jenkins Queue 指标（内存存储，进程重启后重置）
 */
export interface JenkinsQueueMetrics {
  /** queueId 轮询总次数 */
  totalPolls: number;
  /** 成功解析出 buildNumber 的次数 */
  resolvedCount: number;
  /** 轮询超时/取消次数 */
  timeoutCount: number;
  /** 所有成功解析的队列等待时长（ms）列表，保留最近 1000 条 */
  waitTimeSamples: number[];
  /** 队列等待时长总和（ms，仅成功解析） */
  totalWaitMs: number;
  /** 平均队列等待时长（ms） */
  avgWaitMs: number;
  /** 最大队列等待时长（ms） */
  maxWaitMs: number;
}

/**
 * Jenkins 服务类
 * 负责与 Jenkins 交互，触发 Job 执行
 */
export class JenkinsService {
  private config: JenkinsConfig;

  private enabled: boolean = true;

  private readonly platformRepoUrl?: string;

  private crumb: JenkinsCrumb | null = null;

  private readonly crumbTtlMs = 5 * 60 * 1000;

  /** 内存指标：queueId → buildNumber 映射统计 */
  private readonly queueMetrics: JenkinsQueueMetrics = {
    totalPolls: 0,
    resolvedCount: 0,
    timeoutCount: 0,
    waitTimeSamples: [],
    totalWaitMs: 0,
    avgWaitMs: 0,
    maxWaitMs: 0,
  };

  /**
   * 获取 Jenkins Queue 指标快照（用于 /metrics 接口）
   */
  getQueueMetrics(): Readonly<JenkinsQueueMetrics> {
    return { ...this.queueMetrics };
  }

  /**
   * 记录一次成功解析的队列等待时长
   */
  private recordQueueWait(waitMs: number): void {
    this.queueMetrics.resolvedCount++;
    this.queueMetrics.totalWaitMs += waitMs;
    this.queueMetrics.waitTimeSamples.push(waitMs);
    // 保留最近 1000 条样本
    if (this.queueMetrics.waitTimeSamples.length > 1000) {
      this.queueMetrics.waitTimeSamples.shift();
    }
    if (waitMs > this.queueMetrics.maxWaitMs) {
      this.queueMetrics.maxWaitMs = waitMs;
    }
    // 重新计算平均值（基于全量 totalWaitMs / resolvedCount，精确）
    this.queueMetrics.avgWaitMs = Math.round(
      this.queueMetrics.totalWaitMs / this.queueMetrics.resolvedCount
    );
  }

  constructor() {
    // 从 Docker Secrets 或环境变量加载 Jenkins 配置
    const { getSecretOrEnv } = require('../utils/secrets');
    const logger = require('../utils/logger').default;

    const token = getSecretOrEnv('JENKINS_TOKEN');
    if (!token) {
      logger.warn('JENKINS_TOKEN not set, Jenkins integration disabled', {}, 'JENKINS');
      this.enabled = false;
      return;
    }

    const configuredTestRepoUrl = (
      process.env.JENKINS_TEST_REPO_URL
      || process.env.TEST_CASE_REPO_URL
      || ''
    ).trim();

    const configuredTestRepoBranch = (
      process.env.JENKINS_TEST_REPO_BRANCH
      || process.env.TEST_CASE_REPO_BRANCH
      || ''
    ).trim();
    this.platformRepoUrl = normalizeGitRemoteUrl(runGitCommand('git config --get remote.origin.url'));
    this.config = {
      baseUrl: normalizeConfiguredJenkinsBaseUrl(process.env.JENKINS_URL || 'http://jenkins.wiac.xyz'),
      username: process.env.JENKINS_USER || 'root',
      token,
      jobs: {
        api: process.env.JENKINS_JOB_API || 'api-automation',
        ui: process.env.JENKINS_JOB_UI || 'ui-automation',
        performance: process.env.JENKINS_JOB_PERF || 'performance-automation',
      },
      testRepoUrl: configuredTestRepoUrl || undefined,
      testRepoBranch: configuredTestRepoBranch || 'master',
    };

    if (!this.config.testRepoUrl) {
      logger.warn('Jenkins test repo URL not configured; REPO_URL will be omitted', {
        testRepoBranch: this.config.testRepoBranch,
      }, 'JENKINS');
    }

    logger.info('JenkinsService initialized', {
      baseUrl: this.config.baseUrl,
      username: this.config.username,
      jobs: this.config.jobs,
      hasTestRepoUrl: Boolean(this.config.testRepoUrl),
      testRepoUrl: this.config.testRepoUrl,
      platformRepoUrl: this.platformRepoUrl,
    }, 'JENKINS');
  }

  /**
   * Public helper to check whether Jenkins integration is enabled/configured
   */
  public isEnabled(): boolean {
    return this.enabled;
  }

  public getTriggerConfigurationError(): string | null {
    if (!this.enabled || !this.config) {
      return null;
    }

    const validation = this.validateAndGetTestRepoUrl({
      jobName: this.config?.jobs.api ?? 'api-automation',
    });
    return validation.ok ? null : validation.message;
  }

  private validateAndGetTestRepoUrl(context: {
    jobName: string;
    runId?: number;
    caseId?: number;
  }): { ok: true; repoUrl?: string } | { ok: false; message: string } {
    const repoUrl = this.config.testRepoUrl;
    if (!repoUrl) {
      return { ok: true, repoUrl: undefined };
    }

    if (!isMisconfiguredTestRepoUrl(repoUrl, this.platformRepoUrl)) {
      return { ok: true, repoUrl };
    }

    const message = `Invalid Jenkins test repo configuration: REPO_URL points to the automation platform repository (${repoUrl}) instead of the test repository`;
    const logger = require('../utils/logger').default;

    logger.error(message, {
      ...context,
      repoUrl,
      platformRepoUrl: this.platformRepoUrl,
      testRepoBranch: this.config.testRepoBranch,
      suggestion: 'Fix JENKINS_TEST_REPO_URL / TEST_CASE_REPO_URL to point to the test repository before triggering Jenkins.',
    }, 'JENKINS');

    return { ok: false, message };
  }

  /**
   * 获取基础认证头
   */
  private getAuthHeader(): string {
    const credentials = Buffer.from(`${this.config.username}:${this.config.token}`).toString('base64');
    return `Basic ${credentials}`;
  }

  /**
   * Jenkins installations with CSRF protection require a crumb on POST requests.
   * API tokens often bypass this on some Jenkins versions, but not all.
   */
  private async getCrumbHeader(): Promise<Record<string, string>> {
    const logger = require('../utils/logger').default;
    const now = Date.now();

    if (this.crumb && now - this.crumb.fetchedAt < this.crumbTtlMs) {
      return { [this.crumb.field]: this.crumb.value };
    }

    const crumbUrl = `${this.config.baseUrl}/crumbIssuer/api/json`;

    try {
      const response = await fetch(crumbUrl, {
        method: 'GET',
        headers: {
          'Authorization': this.getAuthHeader(),
        },
      });

      if (response.status === 404) {
        logger.debug('Jenkins crumb issuer not available; continuing without crumb', {}, 'JENKINS');
        return {};
      }

      if (!response.ok) {
        logger.warn('Failed to fetch Jenkins crumb; continuing without crumb', {
          status: response.status,
          statusText: response.statusText,
        }, 'JENKINS');
        return {};
      }

      const body = await response.json() as Record<string, unknown>;
      const crumbRequestField = body.crumbRequestField;
      const crumb = body.crumb;

      if (typeof crumbRequestField !== 'string' || typeof crumb !== 'string') {
        logger.warn('Jenkins crumb response missing expected fields', {
          hasCrumbRequestField: typeof crumbRequestField === 'string',
          hasCrumb: typeof crumb === 'string',
        }, 'JENKINS');
        return {};
      }

      this.crumb = {
        field: crumbRequestField,
        value: crumb,
        fetchedAt: now,
      };

      return { [crumbRequestField]: crumb };
    } catch (error) {
      logger.warn('Exception while fetching Jenkins crumb; continuing without crumb', {
        error: error instanceof Error ? error.message : String(error),
      }, 'JENKINS');
      return {};
    }
  }

  /**
   * 根据用例类型获取对应的 Job 名称
   */
  private getJobName(type: CaseType): string {
    return this.config.jobs[type] || this.config.jobs.api;
  }

  /**
   * 触发 Jenkins Job 执行单个用例
   */
  async triggerJob(
    caseId: number,
    type: CaseType,
    scriptPath: string,
    callbackUrl?: string
  ): Promise<JenkinsTriggerResult> {
    const logger = require('../utils/logger').default;

    if (!this.enabled) {
      return {
        success: false,
        message: 'Jenkins integration is not configured',
        errorCategory: 'bad_request',
      };
    }

    const jobName = this.getJobName(type);
    const triggerUrl = `${this.config.baseUrl}/job/${jobName}/buildWithParameters`;
    const repoValidation = this.validateAndGetTestRepoUrl({ jobName, caseId });
    if (!repoValidation.ok) {
      return {
        success: false,
        message: repoValidation.message,
        errorCategory: 'bad_request',
      };
    }

    // 构建参数
    const params = new URLSearchParams({
      SCRIPT_PATH: scriptPath,
      CASE_ID: caseId.toString(),
      CASE_TYPE: type,
    });

    if (callbackUrl) {
      params.append('CALLBACK_URL', callbackUrl);
    }
    if (repoValidation.repoUrl) {
      params.append('REPO_URL', repoValidation.repoUrl);
    }

    try {
      logger.info('Triggering Jenkins case job', {
        caseId,
        caseType: type,
        jobName,
        repoUrl: repoValidation.repoUrl ?? null,
        callbackUrl: callbackUrl ?? null,
      }, 'JENKINS');

      // 调用 Jenkins API
      const crumbHeader = await this.getCrumbHeader();
      const response = await fetch(`${triggerUrl}?${params.toString()}`, {
        method: 'POST',
        headers: {
          'Authorization': this.getAuthHeader(),
          'Content-Type': 'application/x-www-form-urlencoded',
          ...crumbHeader,
        },
      });

      if (response.status === 201 || response.status === 200) {
        // 从 Location header 获取 queue ID
        const location = response.headers.get('Location');
        const queueId = location ? this.extractQueueId(location) : undefined;

        return {
          success: true,
          queueId,
          buildUrl: this.normalizeJenkinsUrl(`${this.config.baseUrl}/job/${jobName}/`),
          message: 'Job triggered successfully',
          errorCategory: 'none',
        };
      } else {
        const errorText = await response.text().catch(() => '');
        return {
          success: false,
          message: `Failed to trigger job: ${this.formatTriggerFailure(response.status, response.statusText, errorText)}`,
          errorCategory: this.classifyHttpError(response.status),
        };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        message: `Error triggering job: ${errorMessage}`,
        errorCategory: error instanceof Error ? this.classifyNetworkError(error) : 'server_error',
      };
    }
  }

  /**
   * 触发 Jenkins Job 执行批量用例
   *
   * [dev-10] 使用 queueId 可靠映射 buildId（非阻塞设计）：
   * 1. 立即触发 Jenkins 并从 Location header 获取 queueId
   * 2. 立即返回 success（不等待构建开始），避免长时间阻塞调用方
   * 3. 若提供了 onBuildResolved 回调，在后台异步轮询 Queue API，
   *    一旦 Jenkins 分配了真实 buildNumber，调用回调更新数据库
   * 注意：不再使用 lastBuild 推断（存在竞态条件，高并发时会拿到错误 build 号）
   */
  async triggerBatchJob(
    runId: number,
    caseIds: number[],
    scriptPaths: string[],
    callbackUrl?: string,
    onBuildResolved?: BuildResolvedCallback,
    onBuildCancelled?: BuildCancelledCallback
  ): Promise<JenkinsTriggerResult> {
    const logger = require('../utils/logger').default;

    if (!this.enabled) {
      logger.warn('Jenkins integration not enabled', {
        runId,
        caseCount: caseIds.length,
      }, 'JENKINS');
      return {
        success: false,
        message: 'Jenkins integration is not configured',
        errorCategory: 'bad_request',
      };
    }

    const jobName = this.config.jobs.api; // 使用默认API Job
    const triggerUrl = `${this.config.baseUrl}/job/${jobName}/buildWithParameters`;
    const repoValidation = this.validateAndGetTestRepoUrl({ jobName, runId });
    if (!repoValidation.ok) {
      return {
        success: false,
        message: repoValidation.message,
        errorCategory: 'bad_request',
      };
    }

    // 构建参数
    const params = new URLSearchParams({
      RUN_ID: runId.toString(),
      CASE_IDS: JSON.stringify(caseIds),
      SCRIPT_PATHS: scriptPaths.join(','),
    });

    if (callbackUrl) {
      params.append('CALLBACK_URL', callbackUrl);
    }
    if (repoValidation.repoUrl) {
      params.append('REPO_URL', repoValidation.repoUrl);
      params.append('REPO_BRANCH', this.config.testRepoBranch);
    }

    try {
      logger.debug('Starting batch job trigger', {
        runId,
        jobName,
        caseCount: caseIds.length,
        hasCallbackUrl: !!callbackUrl,
        hasTestRepoUrl: Boolean(repoValidation.repoUrl),
        repoUrl: repoValidation.repoUrl ?? null,
        repoBranch: repoValidation.repoUrl ? this.config.testRepoBranch : null,
      }, 'JENKINS');

      // 调用 Jenkins API
      const fullUrl = `${triggerUrl}?${params.toString()}`;
      logger.debug('Making Jenkins API request', {
        runId,
        url: `${triggerUrl}?[PARAMS_REDACTED]`,
        method: 'POST',
      }, 'JENKINS');
      
      const crumbHeader = await this.getCrumbHeader();
      const response = await fetch(fullUrl, {
        method: 'POST',
        headers: {
          'Authorization': this.getAuthHeader(),
          'Content-Type': 'application/x-www-form-urlencoded',
          ...crumbHeader,
        },
      });

      logger.debug('Jenkins API response received', {
        runId,
        status: response.status,
        statusText: response.statusText,
        location: response.headers.get('Location'),
      }, 'JENKINS');

      if (response.status === 201 || response.status === 200) {
        // [dev-10] 从 Location header 提取 queueId（形如 .../queue/item/123/）
        const location = response.headers.get('Location');
        const queueId = location ? this.extractQueueId(location) : undefined;

        logger.debug('Queue ID extracted from Location header', {
          runId,
          queueId,
          location,
        }, 'JENKINS');

        if (!queueId) {
          // 无 queueId 时：不再调用 lastBuild（竞态风险），直接返回成功但无 buildUrl
          logger.warn('No queueId in Location header, buildUrl will be unknown', {
            runId,
            location,
          }, 'JENKINS');
          return {
            success: true,
            queueId: undefined,
            buildUrl: undefined,
            buildNumber: undefined,
            message: 'Batch job triggered successfully (queueId unavailable)',
            errorCategory: 'none',
          };
        }

        logger.info('Batch job triggered successfully, resolving buildNumber in background', {
          runId,
          queueId,
        }, 'JENKINS');

        // [dev-10] 后台异步轮询 Queue API 解析真实 buildNumber，不阻塞当前请求
        if (onBuildResolved || onBuildCancelled) {
          this.pollQueueForBuild(queueId, runId).then(buildInfo => {
            if (buildInfo && 'buildNumber' in buildInfo) {
              // 构建成功启动：通知调用方更新 buildId/buildUrl
              if (onBuildResolved) {
                onBuildResolved(buildInfo.buildNumber, buildInfo.buildUrl, buildInfo.queueWaitMs).catch(err => {
                  logger.warn('onBuildResolved callback failed', {
                    runId,
                    queueId,
                    error: err instanceof Error ? err.message : String(err),
                  }, 'JENKINS');
                });
              }
            } else {
              // 构建被取消或轮询超时：通知调用方将平台执行状态更新为 aborted
              const reason = buildInfo && 'cancelled' in buildInfo ? 'cancelled' : 'timeout';
              logger.warn('pollQueueForBuild: build not started', {
                runId,
                queueId,
                reason,
              }, 'JENKINS');
              if (onBuildCancelled) {
                onBuildCancelled(reason).catch(err => {
                  logger.warn('onBuildCancelled callback failed', {
                    runId,
                    queueId,
                    reason,
                    error: err instanceof Error ? err.message : String(err),
                  }, 'JENKINS');
                });
              }
            }
          }).catch(err => {
            logger.warn('Background queue poll failed', {
              runId,
              queueId,
              error: err instanceof Error ? err.message : String(err),
            }, 'JENKINS');
          });
        }

        // 立即返回（不等待 poll 完成），调用方可用 queueId 做追踪
        return {
          success: true,
          queueId,
          buildUrl: undefined,   // 尚未解析，将由 onBuildResolved 回调更新
          buildNumber: undefined,
          message: 'Batch job triggered successfully',
          errorCategory: 'none',
        };
      } else {
        const errorText = await response.text().catch(() => 'Unable to read response');
        logger.warn('Jenkins API request failed', {
          runId,
          status: response.status,
          statusText: response.statusText,
          errorText: errorText.substring(0, 500), // Limit error text length
        }, 'JENKINS');

        // 根据 HTTP 状态码分类错误
        const category: JenkinsErrorCategory = this.classifyHttpError(response.status);

        return {
          success: false,
          message: `Failed to trigger batch job: ${this.formatTriggerFailure(response.status, response.statusText, errorText)}`,
          errorCategory: category,
        };
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      // 兼容当前 tsconfig：通过 unknown 中转读取 Error.cause
      const rawCause = (err as unknown as Record<string, unknown>).cause;
      const causeStr =
        rawCause instanceof Error
          ? `${rawCause.name}: ${rawCause.message}`
          : typeof rawCause === 'string'
            ? rawCause
            : String(rawCause ?? '');
      const detail = `[${err.name}] ${err.message}${causeStr ? ` | cause: ${causeStr}` : ''}`;
      logger.errorLog(err, 'Exception during batch job trigger', {
        runId,
        caseCount: caseIds.length,
        errorName: err.name,
        errorMessage: err.message,
        errorCause: causeStr || undefined,
        triggerUrlHint: `${this.config.baseUrl}/job/${this.config.jobs.api}/buildWithParameters`,
      });

      // 根据异常类型分类网络错误
      const category: JenkinsErrorCategory = this.classifyNetworkError(err);

      return {
        success: false,
        message: `Error triggering batch job: ${detail}`,
        errorCategory: category,
      };
    }
  }

  /**
   * [dev-10] 通过 queueId 轮询 Jenkins Queue API，等待构建真正分配 buildNumber
   *
   * Jenkins 在接受触发请求后，构建先进入队列（Queue），等待 executor 空闲后才真正开始。
   * Queue API: GET /queue/item/:queueId/api/json
   * 当构建开始后，响应中会出现 executable.number 和 executable.url。
   *
   * @param queueId Jenkins 队列项 ID
   * @param runId 平台运行记录 ID（仅用于日志）
   * @param maxWaitMs 最长等待时间（毫秒），默认 60 秒
   * @param pollIntervalMs 轮询间隔（毫秒），默认 3 秒
   * @returns 包含 buildNumber、buildUrl 和 queueWaitMs（队列等待时长）的对象，或 null（超时/取消）
   */
  private async pollQueueForBuild(
    queueId: number,
    runId: number,
    maxWaitMs = parseInt(process.env.JENKINS_QUEUE_POLL_TIMEOUT_MS || String(5 * 60_000), 10), // 默认等待 5 分钟（可通过环境变量调整）
    pollIntervalMs = 3_000
  ): Promise<{ buildNumber: number; buildUrl: string; queueWaitMs: number } | null | { cancelled: true } | { timeout: true }> {
    const logger = require('../utils/logger').default;

    // 规范化 Jenkins base URL（确保没有尾部斜杠）
    const base = this.config.baseUrl.replace(/\/+$/, '');
    const queueApiUrl = `${base}/queue/item/${queueId}/api/json`;

    const startMs = Date.now();
    const deadline = startMs + maxWaitMs;
    let attempt = 0;

    // 更新总轮询次数
    this.queueMetrics.totalPolls++;

    logger.debug('Starting queue poll for build resolution', {
      runId,
      queueId,
      queueApiUrl,
      maxWaitMs,
      pollIntervalMs,
    }, 'JENKINS');

    while (Date.now() < deadline) {
      attempt++;

      try {
        const response = await fetch(queueApiUrl, {
          method: 'GET',
          headers: {
            'Authorization': this.getAuthHeader(),
          },
        });

        if (!response.ok) {
          logger.warn('Queue poll HTTP error', {
            runId,
            queueId,
            attempt,
            status: response.status,
          }, 'JENKINS');
          // 非 200 时稍等再试（可能是瞬时网络问题）
          await this.sleep(pollIntervalMs);
          continue;
        }

        const item = await response.json() as JenkinsQueueItem;

        // 构建被取消
        if (item.cancelled) {
          this.queueMetrics.timeoutCount++;
          logger.warn('Jenkins queue item was cancelled', {
            runId,
            queueId,
            attempt,
          }, 'JENKINS');
          return { cancelled: true };
        }

        // 构建已经分配到 executor，可以取出 buildNumber 和 buildUrl
        if (item.executable) {
          const buildNumber = item.executable.number;
          const buildUrl = this.normalizeJenkinsUrl(item.executable.url);
          const queueWaitMs = Date.now() - startMs;

          // 记录成功解析的队列等待时长指标
          this.recordQueueWait(queueWaitMs);

          logger.info('Build started: resolved buildNumber via queueId', {
            runId,
            queueId,
            buildNumber,
            buildUrl,
            attempt,
            queueWaitMs,
          }, 'JENKINS');

          return { buildNumber, buildUrl, queueWaitMs };
        }

        // 仍在队列等待中（why 字段描述原因，如 "等待 executor"）
        logger.debug('Build still in queue, waiting...', {
          runId,
          queueId,
          attempt,
          why: item.why,
          remainingMs: deadline - Date.now(),
        }, 'JENKINS');

        await this.sleep(pollIntervalMs);
      } catch (err) {
        logger.warn('Queue poll exception', {
          runId,
          queueId,
          attempt,
          error: err instanceof Error ? err.message : String(err),
        }, 'JENKINS');
        await this.sleep(pollIntervalMs);
      }
    }

    // 超时仍未分配 buildNumber
    this.queueMetrics.timeoutCount++;
    logger.warn('Queue poll timed out: build did not start within time limit', {
      runId,
      queueId,
      maxWaitMs,
      attempts: attempt,
    }, 'JENKINS');
    return { timeout: true };
  }

  /**
   * 简单的 sleep 工具函数
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 从 Location header 中提取 Queue ID
   */
  private extractQueueId(location: string): number | undefined {
    const match = location.match(/\/queue\/item\/(\d+)/);
    return match ? parseInt(match[1], 10) : undefined;
  }

  /**
   * 标准化Jenkins URL，确保使用正确的域名
   */
  private normalizeJenkinsUrl(url: string): string {
    if (!url) return url;

    // 替换错误的域名为正确的域名
    const aliasedUrl = url
      .replace(/^(https?:\/\/)www\.wiac\.xyz(?::8080)?/i, '$1jenkins.wiac.xyz')
      .replace(/^(https?:\/\/jenkins\.wiac\.xyz):8080(?=\/|$)/i, '$1');

    try {
      const parsedUrl = new URL(aliasedUrl);
      if (parsedUrl.hostname === 'www.wiac.xyz') {
        parsedUrl.hostname = 'jenkins.wiac.xyz';
      }
      if (parsedUrl.hostname === 'jenkins.wiac.xyz' && parsedUrl.port === '8080') {
        parsedUrl.port = '';
      }
      return parsedUrl.toString();
    } catch {
      return aliasedUrl;
    }
  }

  private formatTriggerFailure(status: number, statusText: string, responseText: string): string {
    return `${status} ${statusText}${this.getTriggerFailureHint(status, responseText)}`;
  }

  private getTriggerFailureHint(status: number, responseText: string): string {
    if (status !== 403) {
      return '';
    }

    const normalized = responseText.replace(/\s+/g, ' ').toLowerCase();
    if (normalized.includes('no valid crumb') || normalized.includes('invalid crumb')) {
      return ' (Jenkins crumb rejected or missing)';
    }
    if (
      normalized.includes('permission') ||
      normalized.includes('access denied') ||
      normalized.includes('is missing the') ||
      normalized.includes('is missing overall/read') ||
      normalized.includes('is missing job/build')
    ) {
      return ' (Jenkins account lacks required Job/Build permission)';
    }

    return ' (check Jenkins crumb and Job/Build permission)';
  }

  /**
   * 获取 Jenkins 配置信息（不包含敏感信息）
   */
  getConfigInfo(): { baseUrl: string; jobs: JenkinsConfig['jobs'] } | null {
    if (!this.enabled) {
      return null;
    }
    return {
      baseUrl: this.config.baseUrl,
      jobs: this.config.jobs,
    };
  }

  getTestRepoConfig(): { repoUrl?: string; branch: string } | null {
    if (!this.enabled) {
      return null;
    }

    return {
      repoUrl: this.config.testRepoUrl,
      branch: this.config.testRepoBranch,
    };
  }

  /**
   * 根据 HTTP 状态码对 Jenkins API 错误进行分类
   *
   * 可重试（transient）: 429 (rate limited), 5xx (server error)
   * 不可重试（permanent）: 400 (bad request), 401/403 (auth), 404 (not found), etc.
   */
  private classifyHttpError(status: number): JenkinsErrorCategory {
    if (status === 401 || status === 403) return 'auth_failed';
    if (status === 404) return 'not_found';
    if (status >= 400 && status < 500 && status !== 429) return 'bad_request';
    if (status === 429) return 'rate_limited';
    if (status >= 500) return 'server_error';
    // fallback: unknown status, treat as retryable
    return 'network';
  }

  /**
   * 根据异常类型对网络错误进行分类
   *
   * 可重试: DNS失败、连接拒绝(ECONNREFUSED)、连接超时(ETIMEDOUT)、
   *         连接重置(ECONNRESET)、网络中断等
   */
  private classifyNetworkError(err: Error): JenkinsErrorCategory {
    const msg = err.message.toLowerCase();
    const code = (err as NodeJS.ErrnoException).code;

    // 网络层可重试错误码
    const RETRYABLE_ERRNO_CODES = new Set([
      'ECONNRESET',     // 连接被重置
      'ECONNREFUSED',   // 连接被拒绝
      'ETIMEDOUT',      // 操作超时
      'ENOTFOUND',      // DNS 解析失败
      'EHOSTUNREACH',   // 主机不可达
      'ENETDOWN',       // 网络接口关闭
      'ENETUNREACH',    // 网络不可达
      'EAI_AGAIN',      // DNS 临时失败
    ]);

    if (code && RETRYABLE_ERRNO_CODES.has(code)) {
      return 'network';
    }

    // 根据消息内容匹配常见网络错误模式
    const NETWORK_PATTERNS = [
      'network error',
      'fetch failed',
      'socket hang up',
      'connection refused',
      'connection reset',
      'timed out',
      'timeout',
      'dns',
      'enotfound',
      'econnrefused',
      'econnreset',
      'etimedout',
      'getaddrinfo',
      'abort',          // fetch abort
    ];

    for (const pattern of NETWORK_PATTERNS) {
      if (msg.includes(pattern)) {
        return 'network';
      }
    }

    // 默认归为 server_error（保守策略：未知异常倾向于重试）
    return 'server_error';
  }

  /**
   * 测试 Jenkins 连接
   */
  async testConnection(): Promise<{ connected: boolean; message: string }> {
    if (!this.enabled) {
      return { connected: false, message: 'Jenkins integration is not configured' };
    }

    const configError = this.getTriggerConfigurationError();
    if (configError) {
      return { connected: false, message: configError };
    }

    try {
      const response = await fetch(`${this.config.baseUrl}/api/json`, {
        method: 'GET',
        headers: {
          'Authorization': this.getAuthHeader(),
        },
      });

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
export const jenkinsService = new JenkinsService();
