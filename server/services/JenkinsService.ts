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

/**
 * Jenkins 触发结果
 */
export interface JenkinsTriggerResult {
  success: boolean;
  queueId?: number;
  buildUrl?: string;
  buildNumber?: number;
  message: string;
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

    this.config = {
      baseUrl: process.env.JENKINS_URL || 'http://jenkins.wiac.xyz:8080/',
      username: process.env.JENKINS_USER || 'root',
      token,
      jobs: {
        api: process.env.JENKINS_JOB_API || 'api-automation',
        ui: process.env.JENKINS_JOB_UI || 'ui-automation',
        performance: process.env.JENKINS_JOB_PERF || 'performance-automation',
      },
      testRepoUrl: configuredTestRepoUrl || undefined,
      testRepoBranch: (process.env.JENKINS_TEST_REPO_BRANCH || 'master').trim(),
    };

    logger.info('JenkinsService initialized', {
      baseUrl: this.config.baseUrl,
      username: this.config.username,
      jobs: this.config.jobs,
      hasTestRepoUrl: Boolean(this.config.testRepoUrl),
    }, 'JENKINS');
  }

  /**
   * 获取基础认证头
   */
  private getAuthHeader(): string {
    const credentials = Buffer.from(`${this.config.username}:${this.config.token}`).toString('base64');
    return `Basic ${credentials}`;
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
    if (!this.enabled) {
      return {
        success: false,
        message: 'Jenkins integration is not configured',
      };
    }

    const jobName = this.getJobName(type);
    const triggerUrl = `${this.config.baseUrl}/job/${jobName}/buildWithParameters`;

    // 构建参数
    const params = new URLSearchParams({
      SCRIPT_PATH: scriptPath,
      CASE_ID: caseId.toString(),
      CASE_TYPE: type,
    });

    if (callbackUrl) {
      params.append('CALLBACK_URL', callbackUrl);
    }
    if (this.config.testRepoUrl) {
      params.append('REPO_URL', this.config.testRepoUrl);
    }

    try {
      // 调用 Jenkins API
      const response = await fetch(`${triggerUrl}?${params.toString()}`, {
        method: 'POST',
        headers: {
          'Authorization': this.getAuthHeader(),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });

      if (response.status === 201 || response.status === 200) {
        // 从 Location header 获取 queue ID
        const location = response.headers.get('Location');
        const queueId = location ? this.extractQueueId(location) : undefined;

        return {
          success: true,
          queueId,
          buildUrl: `${this.config.baseUrl}/job/${jobName}/`,
          message: 'Job triggered successfully',
        };
      } else {
        return {
          success: false,
          message: `Failed to trigger job: ${response.status} ${response.statusText}`,
        };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        message: `Error triggering job: ${errorMessage}`,
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
      };
    }

    const jobName = this.config.jobs.api; // 使用默认API Job
    const triggerUrl = `${this.config.baseUrl}/job/${jobName}/buildWithParameters`;

    // 构建参数
    const params = new URLSearchParams({
      RUN_ID: runId.toString(),
      CASE_IDS: JSON.stringify(caseIds),
      SCRIPT_PATHS: scriptPaths.join(','),
    });

    if (callbackUrl) {
      params.append('CALLBACK_URL', callbackUrl);
    }
    if (this.config.testRepoUrl) {
      params.append('REPO_URL', this.config.testRepoUrl);
      params.append('REPO_BRANCH', this.config.testRepoBranch);
    }

    try {
      logger.debug('Starting batch job trigger', {
        runId,
        jobName,
        caseCount: caseIds.length,
        hasCallbackUrl: !!callbackUrl,
        hasTestRepoUrl: Boolean(this.config.testRepoUrl),
      }, 'JENKINS');

      // 调用 Jenkins API
      const fullUrl = `${triggerUrl}?${params.toString()}`;
      logger.debug('Making Jenkins API request', {
        runId,
        url: `${triggerUrl}?[PARAMS_REDACTED]`,
        method: 'POST',
      }, 'JENKINS');
      
      const response = await fetch(fullUrl, {
        method: 'POST',
        headers: {
          'Authorization': this.getAuthHeader(),
          'Content-Type': 'application/x-www-form-urlencoded',
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
        };
      } else {
        const errorText = await response.text().catch(() => 'Unable to read response');
        logger.warn('Jenkins API request failed', {
          runId,
          status: response.status,
          statusText: response.statusText,
          errorText: errorText.substring(0, 500), // Limit error text length
        }, 'JENKINS');
        
        return {
          success: false,
          message: `Failed to trigger batch job: ${response.status} ${response.statusText}`,
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

      return {
        success: false,
        message: `Error triggering batch job: ${detail}`,
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
    return url.replace(/http:\/\/www\.wiac\.xyz:8080/g, 'http://jenkins.wiac.xyz:8080')
              .replace(/https:\/\/www\.wiac\.xyz/g, 'https://jenkins.wiac.xyz');
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

  /**
   * 测试 Jenkins 连接
   */
  async testConnection(): Promise<{ connected: boolean; message: string }> {
    if (!this.enabled) {
      return { connected: false, message: 'Jenkins integration is not configured' };
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